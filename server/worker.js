require("dotenv").config();
const { Pool } = require("pg");
const Redis = require("ioredis");
const nodemailer = require("nodemailer");
const { v4: uuidv4 } = require("uuid");

// ── Config ───────────────────────────────────────────────────────────────────

const CONCURRENCY = parseInt(process.env.WORKER_CONCURRENCY || "5");
const BATCH_SIZE = parseInt(process.env.WORKER_BATCH_SIZE || "20");
const POLL_INTERVAL = parseInt(process.env.WORKER_POLL_INTERVAL_MS || "5000");
const SMTP_HOST = process.env.SMTP_HOST || "127.0.0.1";
const SMTP_PORT = parseInt(process.env.SMTP_PORT || "25");
const MAX_ATTEMPTS = 5;

const HARD_BOUNCE_CODES = new Set(["550", "551", "552", "553", "554", "555", "521", "556"]);
const SOFT_BOUNCE_CODES = new Set(["421", "450", "451", "452", "422"]);

const HARD_BOUNCE_PATTERNS = [
  /user unknown/i, /no such user/i, /mailbox not found/i, /recipient rejected/i,
  /address rejected/i, /does not exist/i, /invalid (?:mail)?box/i,
  /account disabled/i, /account suspended/i, /domain not found/i,
  /no mx record/i, /undeliverable/i, /permanent failure/i,
  /relay access denied/i, /5\.1\.[1236]/, /5\.7\.1/,
];

const SOFT_BOUNCE_PATTERNS = [
  /mailbox full/i, /quota exceeded/i, /over quota/i, /insufficient storage/i,
  /try again later/i, /temporarily/i, /greylist/i, /rate limit/i,
  /too many connections/i, /connection timed out/i, /4\.2\.[12]/, /4\.7\.1/,
];

// ── Connections ──────────────────────────────────────────────────────────────

const db = new Pool({ connectionString: process.env.DATABASE_URL });
const redis = new Redis({
  host: process.env.REDIS_HOST || "127.0.0.1",
  port: parseInt(process.env.REDIS_PORT || "6379"),
});

// ── SMTP Transport ───────────────────────────────────────────────────────────

function createTransport(server) {
  return nodemailer.createTransport({
    host: server ? server.ip_address || server.hostname : SMTP_HOST,
    port: server ? server.port : SMTP_PORT,
    secure: false,
    tls: { rejectUnauthorized: false },
    connectionTimeout: 30000,
    greetingTimeout: 15000,
    socketTimeout: 60000,
  });
}

// ── Suppression check ────────────────────────────────────────────────────────

async function isSuppressed(userId, email) {
  const { rows } = await db.query(
    "SELECT 1 FROM suppression_list WHERE user_id = $1 AND email = $2 LIMIT 1",
    [userId, email]
  );
  return rows.length > 0;
}

// ── Rate limiting ────────────────────────────────────────────────────────────

async function checkRateLimit(userId, domain) {
  // Check domain-specific limit first, then wildcard
  let { rows } = await db.query(
    "SELECT max_per_minute, max_per_hour FROM domain_rate_limits WHERE user_id = $1 AND domain = $2 AND is_active = true",
    [userId, domain]
  );
  if (rows.length === 0) {
    ({ rows } = await db.query(
      "SELECT max_per_minute, max_per_hour FROM domain_rate_limits WHERE user_id = $1 AND domain = '*' AND is_active = true",
      [userId]
    ));
  }
  if (rows.length === 0) return { allowed: true };

  const limit = rows[0];
  const now = new Date();

  // Check per-minute
  const oneMinAgo = new Date(now - 60000).toISOString();
  const minCount = await db.query(
    "SELECT COUNT(*) as c FROM domain_send_tracking WHERE user_id = $1 AND domain = $2 AND sent_at >= $3",
    [userId, domain, oneMinAgo]
  );
  if (parseInt(minCount.rows[0].c) >= limit.max_per_minute) {
    return { allowed: false, reason: `Per-minute limit (${limit.max_per_minute}) reached for ${domain}` };
  }

  // Check per-hour
  const oneHourAgo = new Date(now - 3600000).toISOString();
  const hourCount = await db.query(
    "SELECT COUNT(*) as c FROM domain_send_tracking WHERE user_id = $1 AND domain = $2 AND sent_at >= $3",
    [userId, domain, oneHourAgo]
  );
  if (parseInt(hourCount.rows[0].c) >= limit.max_per_hour) {
    return { allowed: false, reason: `Per-hour limit (${limit.max_per_hour}) reached for ${domain}` };
  }

  return { allowed: true };
}

// ── Warmup check ─────────────────────────────────────────────────────────────

async function checkWarmup(userId, smtpServerId) {
  const { rows } = await db.query(
    "SELECT * FROM ip_warmup WHERE user_id = $1 AND smtp_server_id = $2 AND status = 'active'",
    [userId, smtpServerId]
  );
  if (rows.length === 0) return { active: false, allowed: true };

  const warmup = rows[0];
  if (warmup.sent_today >= warmup.daily_limit) {
    return { active: true, allowed: false, reason: "Daily warmup limit reached" };
  }

  // Hourly cap: daily / 24 * 1.2
  const hourlyCap = Math.ceil((warmup.daily_limit / 24) * 1.2);
  const oneHourAgo = new Date(Date.now() - 3600000).toISOString();
  const { rows: hourRows } = await db.query(
    "SELECT COUNT(*) as c FROM domain_send_tracking WHERE user_id = $1 AND sent_at >= $2",
    [userId, oneHourAgo]
  );
  if (parseInt(hourRows[0].c) >= hourlyCap) {
    return { active: true, allowed: false, reason: "Hourly warmup cap reached" };
  }

  return { active: true, allowed: true, remaining: warmup.daily_limit - warmup.sent_today };
}

// ── Bounce classification ────────────────────────────────────────────────────

async function classifyBounce(userId, email, code, errorText) {
  const { rows } = await db.query(
    "SELECT COUNT(*) as c FROM bounces WHERE user_id = $1 AND email = $2 AND bounce_type = 'soft'",
    [userId, email]
  );
  const prevSoftCount = parseInt(rows[0].c);

  if (code && HARD_BOUNCE_CODES.has(code)) {
    return { type: "hard", shouldSuppress: true };
  }
  if (code && SOFT_BOUNCE_CODES.has(code)) {
    return { type: "soft", shouldSuppress: prevSoftCount + 1 >= 5 };
  }

  const text = errorText || "";
  if (HARD_BOUNCE_PATTERNS.some((p) => p.test(text))) {
    return { type: "hard", shouldSuppress: true };
  }
  if (SOFT_BOUNCE_PATTERNS.some((p) => p.test(text))) {
    return { type: "soft", shouldSuppress: prevSoftCount + 1 >= 5 };
  }

  if (code && code.startsWith("5")) return { type: "hard", shouldSuppress: true };
  if (code && code.startsWith("4")) return { type: "soft", shouldSuppress: prevSoftCount + 1 >= 5 };

  return { type: "soft", shouldSuppress: prevSoftCount + 1 >= 5 };
}

async function recordBounce(userId, email, classification, code, reason, smtpServerId) {
  const prevCount = await db.query(
    "SELECT COUNT(*) as c FROM bounces WHERE user_id = $1 AND email = $2 AND bounce_type = 'soft'",
    [userId, email]
  );

  await db.query(
    `INSERT INTO bounces (id, user_id, email, bounce_type, bounce_code, reason, attempts, smtp_server_id, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
    [uuidv4(), userId, email, classification.type, code, reason, parseInt(prevCount.rows[0].c) + 1, smtpServerId]
  );

  if (classification.shouldSuppress) {
    const suppressReason = classification.type === "hard"
      ? `Hard bounce: ${(reason || "").substring(0, 200)}`
      : "Soft bounce threshold exceeded (5 bounces)";
    await db.query(
      `INSERT INTO suppression_list (id, user_id, email, reason, added_by, created_at)
       VALUES ($1, $2, $3, $4, 'System (auto)', NOW())
       ON CONFLICT (user_id, email) DO UPDATE SET reason = EXCLUDED.reason`,
      [uuidv4(), userId, email, suppressReason]
    );
  }
}

// ── Process a single email ───────────────────────────────────────────────────

async function processEmail(email, smtpServer) {
  const userId = email.user_id;
  const toAddress = email.to_address;
  const domain = toAddress.split("@")[1].toLowerCase();

  // 1. Suppression check
  if (await isSuppressed(userId, toAddress)) {
    await db.query("UPDATE email_queue SET status = 'failed', error_message = 'Recipient is on suppression list' WHERE id = $1", [email.id]);
    await logEvent(userId, email.id, "suppressed", toAddress, email.from_address, email.subject);
    return "suppressed";
  }

  // 2. Warmup check
  if (smtpServer) {
    const warmup = await checkWarmup(userId, smtpServer.id);
    if (warmup.active && !warmup.allowed) {
      const retryAt = new Date(Date.now() + 15 * 60000).toISOString();
      await db.query("UPDATE email_queue SET status = 'deferred', error_message = $1, next_retry_at = $2 WHERE id = $3",
        [warmup.reason, retryAt, email.id]);
      return "warmup_deferred";
    }
  }

  // 3. Rate limit check
  const rateCheck = await checkRateLimit(userId, domain);
  if (!rateCheck.allowed) {
    const retryAt = new Date(Date.now() + 60000).toISOString();
    await db.query("UPDATE email_queue SET status = 'deferred', error_message = $1, next_retry_at = $2 WHERE id = $3",
      [rateCheck.reason, retryAt, email.id]);
    return "rate_limited";
  }

  // 4. Send via SMTP
  const transport = createTransport(smtpServer);
  const messageId = `<${uuidv4()}@edapost.net>`;

  try {
    const mailOptions = {
      from: email.from_address,
      to: toAddress,
      subject: email.subject,
      messageId,
      headers: {
        "X-Mailer": "EdaPost/1.0",
        "List-Unsubscribe": `<mailto:unsubscribe@edapost.net?subject=unsubscribe-${email.id}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
    };
    if (email.html_body) mailOptions.html = email.html_body;
    if (email.plain_body) mailOptions.text = email.plain_body;
    if (!mailOptions.text && mailOptions.html) {
      mailOptions.text = mailOptions.html.replace(/<[^>]+>/g, "");
    }

    const info = await transport.sendMail(mailOptions);

    // Success
    await db.query(
      "UPDATE email_queue SET status = 'sent', sent_at = NOW(), postfix_queue_id = $1, attempts = attempts + 1 WHERE id = $2",
      [info.messageId || null, email.id]
    );
    await logEvent(userId, email.id, "sent", toAddress, email.from_address, email.subject, info.response);

    // Track for rate limiting
    await db.query("INSERT INTO domain_send_tracking (id, user_id, domain, sent_at) VALUES ($1, $2, $3, NOW())",
      [uuidv4(), userId, domain]);

    // Increment warmup counter
    if (smtpServer) {
      await db.query(
        "UPDATE ip_warmup SET sent_today = sent_today + 1 WHERE user_id = $1 AND smtp_server_id = $2 AND status = 'active'",
        [userId, smtpServer.id]
      );
    }

    return "sent";
  } catch (err) {
    const errorMsg = err.message || String(err);
    const codeMatch = errorMsg.match(/\b([245]\d{2})\b/);
    const code = codeMatch ? codeMatch[1] : null;
    const newAttempts = (email.attempts || 0) + 1;

    const isHard = code && HARD_BOUNCE_CODES.has(code);

    if (isHard || newAttempts >= MAX_ATTEMPTS) {
      await db.query("UPDATE email_queue SET status = 'failed', error_message = $1, attempts = $2 WHERE id = $3",
        [errorMsg.substring(0, 500), newAttempts, email.id]);
      await logEvent(userId, email.id, isHard ? "bounced" : "failed", toAddress, email.from_address, email.subject, errorMsg);

      const classification = await classifyBounce(userId, toAddress, code, errorMsg);
      await recordBounce(userId, toAddress, classification, code, errorMsg.substring(0, 500), smtpServer?.id || null);
    } else {
      // Retry with exponential backoff: 30s * 2^attempts
      const delay = 30000 * Math.pow(2, newAttempts - 1);
      const retryAt = new Date(Date.now() + delay).toISOString();
      await db.query("UPDATE email_queue SET status = 'retrying', error_message = $1, attempts = $2, next_retry_at = $3 WHERE id = $4",
        [errorMsg.substring(0, 500), newAttempts, retryAt, email.id]);
      await logEvent(userId, email.id, "deferred", toAddress, email.from_address, email.subject, errorMsg);
    }

    return "failed";
  } finally {
    transport.close();
  }
}

// ── Event logging ────────────────────────────────────────────────────────────

async function logEvent(userId, emailQueueId, eventType, toAddress, fromAddress, subject, smtpResponse) {
  await db.query(
    `INSERT INTO email_logs (id, user_id, email_queue_id, event_type, to_address, from_address, subject, smtp_response, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
    [uuidv4(), userId, emailQueueId, eventType, toAddress, fromAddress, subject, smtpResponse || null]
  );
}

// ── Resolve SMTP server ──────────────────────────────────────────────────────

async function resolveSmtpServer(userId, smtpServerId) {
  if (smtpServerId) {
    const { rows } = await db.query(
      "SELECT * FROM smtp_servers WHERE id = $1 AND user_id = $2 AND status = 'online'",
      [smtpServerId, userId]
    );
    if (rows.length > 0) return rows[0];
  }

  // Fallback: primary online server
  const { rows: primary } = await db.query(
    "SELECT * FROM smtp_servers WHERE user_id = $1 AND is_primary = true AND status = 'online' LIMIT 1",
    [userId]
  );
  if (primary.length > 0) return primary[0];

  // Fallback: any online server
  const { rows: any } = await db.query(
    "SELECT * FROM smtp_servers WHERE user_id = $1 AND status = 'online' LIMIT 1",
    [userId]
  );
  return any.length > 0 ? any[0] : null;
}

// ── Main batch processing loop ───────────────────────────────────────────────

async function processBatch() {
  // Fetch queued emails (including retries that are due)
  const { rows: emails } = await db.query(
    `SELECT * FROM email_queue
     WHERE status IN ('queued', 'retrying')
       AND (next_retry_at IS NULL OR next_retry_at <= NOW())
     ORDER BY created_at ASC
     LIMIT $1`,
    [BATCH_SIZE]
  );

  if (emails.length === 0) return 0;

  // Also pick up deferred emails that are due
  const { rows: deferred } = await db.query(
    `SELECT * FROM email_queue
     WHERE status = 'deferred' AND next_retry_at <= NOW()
     ORDER BY created_at ASC
     LIMIT $1`,
    [Math.max(BATCH_SIZE - emails.length, 0)]
  );

  const batch = [...emails, ...deferred];
  if (batch.length === 0) return 0;

  // Mark as processing
  const ids = batch.map((e) => e.id);
  await db.query("UPDATE email_queue SET status = 'processing' WHERE id = ANY($1)", [ids]);

  // Group by user to resolve SMTP servers
  const results = { sent: 0, failed: 0, deferred: 0, suppressed: 0 };

  // Process in chunks of CONCURRENCY
  for (let i = 0; i < batch.length; i += CONCURRENCY) {
    const chunk = batch.slice(i, i + CONCURRENCY);
    const settled = await Promise.allSettled(
      chunk.map(async (email) => {
        const server = await resolveSmtpServer(email.user_id, email.smtp_server_id);
        return processEmail(email, server);
      })
    );

    for (const result of settled) {
      if (result.status === "fulfilled") {
        if (result.value === "sent") results.sent++;
        else if (result.value === "suppressed") results.suppressed++;
        else results.deferred++;
      } else {
        results.failed++;
      }
    }
  }

  // Cleanup old tracking entries
  await db.query("DELETE FROM domain_send_tracking WHERE sent_at < NOW() - INTERVAL '2 hours'");

  return batch.length;
}

// ── Worker loop ──────────────────────────────────────────────────────────────

let running = true;

async function runLoop() {
  console.log(`EdaPost SMTP Worker started (concurrency=${CONCURRENCY}, batch=${BATCH_SIZE}, poll=${POLL_INTERVAL}ms)`);

  // Subscribe to Redis for immediate notifications
  const sub = new Redis({ host: process.env.REDIS_HOST || "127.0.0.1", port: parseInt(process.env.REDIS_PORT || "6379") });
  sub.subscribe("edapost:new-email");

  let wakeup = false;
  sub.on("message", () => { wakeup = true; });

  while (running) {
    try {
      const processed = await processBatch();
      if (processed > 0) {
        console.log(`Processed ${processed} emails`);
        continue; // Immediately check for more
      }
    } catch (err) {
      console.error("Batch processing error:", err);
    }

    // Wait for poll interval or Redis notification
    wakeup = false;
    await new Promise((resolve) => {
      const timer = setTimeout(resolve, POLL_INTERVAL);
      const check = setInterval(() => {
        if (wakeup) { clearTimeout(timer); clearInterval(check); resolve(); }
      }, 100);
    });
  }
}

runLoop();

// Graceful shutdown
process.on("SIGTERM", async () => {
  console.log("Shutting down worker...");
  running = false;
  await db.end();
  redis.disconnect();
  process.exit(0);
});

process.on("SIGINT", async () => {
  console.log("Worker interrupted, shutting down...");
  running = false;
  await db.end();
  redis.disconnect();
  process.exit(0);
});
