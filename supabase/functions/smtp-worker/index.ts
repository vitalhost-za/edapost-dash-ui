// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  checkWarmupVolumeCap,
  incrementWarmupCounter,
  advanceWarmupDays,
  prioritizeByEngagement,
} from "./warmup.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ─── CSS Inliner (lightweight for edge function) ──────────────────────────────

function inlineCSSInHtml(html: string): string {
  const rules: { selector: string; declarations: string; specificity: number }[] = [];
  const styleRegex = /<style[^>]*>([\s\S]*?)<\/style>/gi;

  let m;
  while ((m = styleRegex.exec(html)) !== null) {
    const ruleRegex = /([^{]+)\{([^}]+)\}/g;
    let rm;
    while ((rm = ruleRegex.exec(m[1])) !== null) {
      for (const sel of rm[1].split(",")) {
        const s = sel.trim();
        if (s && !s.startsWith("@")) {
          const idC = (s.match(/#/g) || []).length;
          const clC = (s.match(/\./g) || []).length;
          const elC = (s.match(/(^|[\s>+~])[\w-]+/g) || []).length;
          rules.push({ selector: s, declarations: rm[2].trim(), specificity: idC * 100 + clC * 10 + elC });
        }
      }
    }
  }

  if (rules.length === 0) return html;
  rules.sort((a, b) => a.specificity - b.specificity);

  let result = html.replace(styleRegex, "");
  result = result.replace(/<([a-zA-Z][\w-]*)([^>]*)>/g, (full, tag: string, attrs: string) => {
    const cls = (attrs.match(/class\s*=\s*"([^"]*)"/i) || [])[1] || "";
    const id = (attrs.match(/id\s*=\s*"([^"]*)"/i) || [])[1] || "";
    const existing = (attrs.match(/style\s*=\s*"([^"]*)"/i) || [])[1] || "";
    const classes = cls.split(/\s+/);

    const matched: string[] = [];
    for (const r of rules) {
      const s = r.selector;
      let hit = false;
      if (s.startsWith("#")) hit = id === s.slice(1);
      else if (s.startsWith(".")) hit = classes.includes(s.slice(1));
      else if (/^[a-zA-Z][\w-]*$/.test(s)) hit = tag.toLowerCase() === s.toLowerCase();
      else {
        const tc = s.match(/^([a-zA-Z][\w-]*)\.([a-zA-Z][\w-]*)$/);
        if (tc) hit = tag.toLowerCase() === tc[1].toLowerCase() && classes.includes(tc[2]);
      }
      if (hit) matched.push(r.declarations);
    }

    if (matched.length === 0) return full;
    const inlined = (matched.join("; ") + (existing ? "; " + existing : "")).replace(/;\s*;/g, ";").replace(/;\s*$/, "");
    if (existing) return `<${tag}${attrs.replace(/style\s*=\s*"[^"]*"/i, `style="${inlined}"`)}>`;
    return `<${tag}${attrs} style="${inlined}">`;
  });

  return result;
}

// ─── MIME Construction ─────────────────────────────────────────────────────────

function generateBoundary(): string {
  return "----=_Part_" + crypto.randomUUID().replace(/-/g, "");
}

function buildMimeMessage(opts: {
  from: string;
  to: string;
  subject: string;
  htmlBody?: string | null;
  plainBody?: string | null;
  messageId: string;
  attachments?: { fileName: string; contentType: string; base64Data: string }[];
  extraHeaders?: Record<string, string>;
}): string {
  const boundary = generateBoundary();
  const altBoundary = generateBoundary();
  const hasAttachments = opts.attachments && opts.attachments.length > 0;
  const date = new Date().toUTCString();

  let mime = "";
  mime += `From: ${opts.from}\r\n`;
  mime += `To: ${opts.to}\r\n`;
  mime += `Subject: ${opts.subject}\r\n`;
  mime += `Date: ${date}\r\n`;
  mime += `Message-ID: <${opts.messageId}>\r\n`;
  mime += `MIME-Version: 1.0\r\n`;
  mime += `X-Mailer: EdaPost/1.0\r\n`;

  // Extra headers (List-Unsubscribe, etc.)
  if (opts.extraHeaders) {
    for (const [key, value] of Object.entries(opts.extraHeaders)) {
      mime += `${key}: ${value}\r\n`;
    }
  }

  if (hasAttachments) {
    mime += `Content-Type: multipart/mixed; boundary="${boundary}"\r\n\r\n`;
    mime += `--${boundary}\r\n`;
    mime += `Content-Type: multipart/alternative; boundary="${altBoundary}"\r\n\r\n`;
  } else {
    mime += `Content-Type: multipart/alternative; boundary="${altBoundary}"\r\n\r\n`;
  }

  // Plain text part
  if (opts.plainBody) {
    mime += `--${altBoundary}\r\n`;
    mime += `Content-Type: text/plain; charset="UTF-8"\r\n`;
    mime += `Content-Transfer-Encoding: quoted-printable\r\n\r\n`;
    mime += `${opts.plainBody}\r\n\r\n`;
  }

  // HTML part (with inlined CSS)
  if (opts.htmlBody) {
    const inlinedHtml = inlineCSSInHtml(opts.htmlBody);
    mime += `--${altBoundary}\r\n`;
    mime += `Content-Type: text/html; charset="UTF-8"\r\n`;
    mime += `Content-Transfer-Encoding: quoted-printable\r\n\r\n`;
    mime += `${inlinedHtml}\r\n\r\n`;
  }

  mime += `--${altBoundary}--\r\n`;

  // Attachments
  if (hasAttachments) {
    for (const att of opts.attachments!) {
      mime += `--${boundary}\r\n`;
      mime += `Content-Type: ${att.contentType}; name="${att.fileName}"\r\n`;
      mime += `Content-Disposition: attachment; filename="${att.fileName}"\r\n`;
      mime += `Content-Transfer-Encoding: base64\r\n\r\n`;
      // Split base64 into 76-char lines
      const lines = att.base64Data.match(/.{1,76}/g) || [];
      mime += lines.join("\r\n") + "\r\n\r\n";
    }
    mime += `--${boundary}--\r\n`;
  }

  return mime;
}

// ─── SMTP Client ───────────────────────────────────────────────────────────────

async function sendViaSMTP(opts: {
  host: string;
  port: number;
  tlsEnabled: boolean;
  from: string;
  to: string;
  mimeData: string;
  timeoutMs?: number;
}): Promise<{ success: boolean; response: string; error?: string }> {
  const { host, port, tlsEnabled, from, to, mimeData, timeoutMs = 30000 } = opts;
  let conn: Deno.Conn | null = null;

  try {
    conn = await Promise.race([
      Deno.connect({ hostname: host, port }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`Connection timed out after ${timeoutMs}ms`)), timeoutMs)
      ),
    ]);

    const decoder = new TextDecoder();
    const encoder = new TextEncoder();

    const readResponse = async (): Promise<string> => {
      const buf = new Uint8Array(4096);
      const n = await conn!.read(buf);
      if (n === null) throw new Error("Connection closed unexpectedly");
      return decoder.decode(buf.subarray(0, n)).trim();
    };

    const sendCommand = async (cmd: string): Promise<string> => {
      await conn!.write(encoder.encode(cmd + "\r\n"));
      return await readResponse();
    };

    // Read banner
    const banner = await readResponse();
    if (!banner.startsWith("220")) {
      return { success: false, response: banner, error: `Unexpected banner: ${banner}` };
    }

    // EHLO
    let ehloResp = await sendCommand("EHLO edapost-worker");
    if (!ehloResp.startsWith("250")) {
      return { success: false, response: ehloResp, error: "EHLO rejected" };
    }

    // STARTTLS if enabled
    if (tlsEnabled && ehloResp.includes("STARTTLS")) {
      const starttlsResp = await sendCommand("STARTTLS");
      if (starttlsResp.startsWith("220")) {
        try {
          conn = await Deno.startTls(conn as Deno.TcpConn, { hostname: host });
          // Re-EHLO after TLS
          ehloResp = await sendCommand("EHLO edapost-worker");
        } catch (tlsErr) {
          return { success: false, response: "", error: `TLS handshake failed: ${(tlsErr as Error).message}` };
        }
      }
    }

    // MAIL FROM
    const mailFromResp = await sendCommand(`MAIL FROM:<${from}>`);
    if (!mailFromResp.startsWith("250")) {
      return { success: false, response: mailFromResp, error: `MAIL FROM rejected: ${mailFromResp}` };
    }

    // RCPT TO
    const rcptToResp = await sendCommand(`RCPT TO:<${to}>`);
    if (!rcptToResp.startsWith("250")) {
      return { success: false, response: rcptToResp, error: `RCPT TO rejected: ${rcptToResp}` };
    }

    // DATA
    const dataResp = await sendCommand("DATA");
    if (!dataResp.startsWith("354")) {
      return { success: false, response: dataResp, error: `DATA rejected: ${dataResp}` };
    }

    // Send MIME content + terminator
    await conn.write(encoder.encode(mimeData + "\r\n.\r\n"));
    const endResp = await readResponse();

    if (!endResp.startsWith("250")) {
      return { success: false, response: endResp, error: `Message rejected: ${endResp}` };
    }

    // QUIT
    try {
      await sendCommand("QUIT");
    } catch {
      // Ignore QUIT errors
    }

    return { success: true, response: endResp };
  } catch (err) {
    return { success: false, response: "", error: (err as Error).message };
  } finally {
    try {
      conn?.close();
    } catch {
      // ignore
    }
  }
}

// ─── Rate Limit Checking ───────────────────────────────────────────────────────

async function checkDomainRateLimit(
  supabase: any,
  userId: string,
  recipientDomain: string
): Promise<{ allowed: boolean; reason?: string }> {
  // Get rate limit config for this domain
  const { data: limits } = await supabase
    .from("domain_rate_limits")
    .select("max_per_minute, max_per_hour, is_active")
    .eq("user_id", userId)
    .eq("domain", recipientDomain)
    .maybeSingle();

  if (!limits || !limits.is_active) {
    // Check for wildcard/default limit
    const { data: defaultLimit } = await supabase
      .from("domain_rate_limits")
      .select("max_per_minute, max_per_hour, is_active")
      .eq("user_id", userId)
      .eq("domain", "*")
      .maybeSingle();

    if (!defaultLimit || !defaultLimit.is_active) {
      return { allowed: true }; // No rate limits configured
    }

    return await enforceLimit(supabase, userId, recipientDomain, defaultLimit.max_per_minute as number, defaultLimit.max_per_hour as number);
  }

  return await enforceLimit(supabase, userId, recipientDomain, limits.max_per_minute as number, limits.max_per_hour as number);
}

async function enforceLimit(
  supabase: any,
  userId: string,
  domain: string,
  maxPerMinute: number,
  maxPerHour: number
): Promise<{ allowed: boolean; reason?: string }> {
  const now = new Date();
  const oneMinuteAgo = new Date(now.getTime() - 60 * 1000).toISOString();
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000).toISOString();

  // Count sends in last minute
  const { count: minuteCount } = await supabase
    .from("domain_send_tracking")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("domain", domain)
    .gte("sent_at", oneMinuteAgo);

  if ((minuteCount ?? 0) >= maxPerMinute) {
    return { allowed: false, reason: `Rate limit: ${maxPerMinute}/min exceeded for ${domain}` };
  }

  // Count sends in last hour
  const { count: hourCount } = await supabase
    .from("domain_send_tracking")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("domain", domain)
    .gte("sent_at", oneHourAgo);

  if ((hourCount ?? 0) >= maxPerHour) {
    return { allowed: false, reason: `Rate limit: ${maxPerHour}/hr exceeded for ${domain}` };
  }

  return { allowed: true };
}

// ─── Main Worker ───────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    if (!SUPABASE_URL) throw new Error("SUPABASE_URL is not configured");

    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!SERVICE_ROLE_KEY) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured");

    // Authenticate: only service role (from pg_cron or manual trigger)
    const authHeader = req.headers.get("Authorization");
    const token = authHeader?.replace("Bearer ", "");

    // Allow both service role and authenticated user calls
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // Parse optional config overrides from request body
    let configOverrides: { batchSize?: number; concurrency?: number } = {};
    try {
      const body = await req.json();
      configOverrides = body || {};
    } catch {
      // No body is fine
    }

    // Fetch worker config from user_settings (use first user's settings for now)
    const batchSize = configOverrides.batchSize || 20;
    const concurrency = configOverrides.concurrency || 5;

    // 1. Claim a batch of queued emails
    const { data: queuedEmails, error: fetchError } = await supabase
      .from("email_queue")
      .select("*")
      .eq("status", "queued")
      .order("created_at", { ascending: true })
      .limit(batchSize);

    if (fetchError) {
      console.error("Failed to fetch queued emails:", fetchError);
      return new Response(JSON.stringify({ error: "Failed to fetch queue" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!queuedEmails || queuedEmails.length === 0) {
      return new Response(JSON.stringify({ processed: 0, message: "Queue empty" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Mark all as processing
    const ids = queuedEmails.map((e) => e.id);
    await supabase
      .from("email_queue")
      .update({ status: "processing" })
      .in("id", ids);

    // 2. Group by user to fetch their SMTP server configs
    const userIds = [...new Set(queuedEmails.map((e) => e.user_id))];
    const smtpServerIds = [...new Set(queuedEmails.map((e) => e.smtp_server_id).filter(Boolean))];

    // Fetch SMTP servers
    const smtpServers: Record<string, { hostname: string; ip_address: string; port: number; tls_enabled: boolean }> = {};
    if (smtpServerIds.length > 0) {
      const { data: servers } = await supabase
        .from("smtp_servers")
        .select("id, hostname, ip_address, port, tls_enabled")
        .in("id", smtpServerIds);

      for (const s of servers || []) {
        smtpServers[s.id] = { hostname: s.hostname, ip_address: String(s.ip_address), port: s.port, tls_enabled: s.tls_enabled };
      }
    }

    // Fetch user settings for worker config
    const userSettings: Record<string, { worker_concurrency: number; worker_batch_size: number }> = {};
    if (userIds.length > 0) {
      const { data: settingsData } = await supabase
        .from("user_settings")
        .select("user_id, worker_concurrency, worker_batch_size")
        .in("user_id", userIds);

      for (const s of settingsData || []) {
        userSettings[s.user_id] = {
          worker_concurrency: s.worker_concurrency ?? concurrency,
          worker_batch_size: s.worker_batch_size ?? batchSize,
        };
      }
    }

    // 2b. Check warmup status per server and fetch engagement priority
    const warmupCache: Record<string, Awaited<ReturnType<typeof checkWarmupVolumeCap>>> = {};

    // Check if any user has warmup enabled
    const { data: warmupSettings } = await supabase
      .from("user_settings")
      .select("user_id, warmup_enabled")
      .in("user_id", userIds)
      .eq("warmup_enabled", true);

    const warmupUserIds = new Set((warmupSettings || []).map((s) => s.user_id));

    // For warmup users, prioritize engaged recipients
    let processableEmails = queuedEmails as Record<string, unknown>[];
    for (const uid of warmupUserIds) {
      const userEmails = processableEmails.filter((e) => e.user_id === uid);
      if (userEmails.length > 0) {
        const prioritized = await prioritizeByEngagement(supabase, userEmails, uid);
        const otherEmails = processableEmails.filter((e) => e.user_id !== uid);
        processableEmails = [...prioritized, ...otherEmails];
      }
    }

    // 3. Process emails with concurrency control + warmup volume caps
    const results = { sent: 0, failed: 0, deferred: 0, rateLimited: 0, warmupDeferred: 0 };

    // Process in chunks based on concurrency
    for (let i = 0; i < processableEmails.length; i += concurrency) {
      const chunk = processableEmails.slice(i, i + concurrency);
      const promises = chunk.map((email) =>
        processEmail(supabase, email, smtpServers, results, warmupUserIds, warmupCache)
      );
      await Promise.allSettled(promises);

      // Add inter-batch delay during warmup to spread sends (no bursts)
      if (warmupUserIds.size > 0 && i + concurrency < processableEmails.length) {
        const delayMs = Math.max(500, Math.floor(3600000 / (processableEmails.length * 2)));
        await new Promise((r) => setTimeout(r, Math.min(delayMs, 2000)));
      }
    }

    // 3b. Advance warmup days (reset daily counters if new day)
    if (warmupUserIds.size > 0) {
      await advanceWarmupDays(supabase);
    }

    // 4. Clean up old domain_send_tracking entries (older than 2 hours)
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    await supabase
      .from("domain_send_tracking")
      .delete()
      .lt("sent_at", twoHoursAgo);

    return new Response(
      JSON.stringify({
        processed: processableEmails.length,
        ...results,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("SMTP Worker error:", error);
    const msg = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

async function processEmail(
  supabase: any,
  email: Record<string, unknown>,
  smtpServers: Record<string, { hostname: string; ip_address: string; port: number; tls_enabled: boolean }>,
  results: { sent: number; failed: number; deferred: number; rateLimited: number; warmupDeferred: number },
  warmupUserIds: Set<string>,
  warmupCache: Record<string, Awaited<ReturnType<typeof checkWarmupVolumeCap>>>
): Promise<void> {
  const emailId = email.id as string;
  const userId = email.user_id as string;
  const fromAddress = email.from_address as string;
  const toAddress = email.to_address as string;
  const subject = email.subject as string;
  const htmlBody = email.html_body as string | null;
  const plainBody = email.plain_body as string | null;
  const smtpServerId = email.smtp_server_id as string | null;
  const attempts = (email.attempts as number) || 0;
  const maxAttempts = (email.max_attempts as number) || 5;

  try {
    // Check suppression list before sending
    const { count: suppressedCount } = await supabase
      .from("suppression_list")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("email", toAddress);

    if ((suppressedCount ?? 0) > 0) {
      await supabase
        .from("email_queue")
        .update({
          status: "failed",
          error_message: "Recipient is on suppression list",
          attempts: attempts + 1,
        })
        .eq("id", emailId);

      await supabase.from("email_logs").insert({
        user_id: userId,
        event_type: "suppressed",
        from_address: fromAddress,
        to_address: toAddress,
        subject,
        smtp_response: "Blocked by suppression list",
      });

      results.failed++;
      return;
    }

    // Extract recipient domain for rate limiting
    const recipientDomain = toAddress.split("@")[1]?.toLowerCase() || "unknown";

    // Check warmup volume cap (if warmup is active for this user)
    if (warmupUserIds.has(userId) && smtpServerId) {
      const cacheKey = `${userId}:${smtpServerId}`;
      if (!warmupCache[cacheKey]) {
        warmupCache[cacheKey] = await checkWarmupVolumeCap(supabase, userId, smtpServerId);
      }
      const warmupStatus = warmupCache[cacheKey];

      if (warmupStatus.isWarmingUp && !warmupStatus.allowed) {
        // Defer — retry later (spread throughout the day)
        const retryAt = new Date(Date.now() + 15 * 60 * 1000).toISOString(); // Retry in 15 min
        await supabase
          .from("email_queue")
          .update({
            status: "deferred",
            error_message: warmupStatus.reason || "Warmup volume cap reached",
            next_retry_at: retryAt,
          })
          .eq("id", emailId);

        results.warmupDeferred++;
        return;
      }
    }

    // Check domain rate limit
    const rateCheck = await checkDomainRateLimit(supabase, userId, recipientDomain);
    if (!rateCheck.allowed) {
      // Defer — retry later
      const retryAt = new Date(Date.now() + 60 * 1000).toISOString(); // Retry in 1 minute
      await supabase
        .from("email_queue")
        .update({
          status: "deferred",
          error_message: rateCheck.reason || "Rate limited",
          next_retry_at: retryAt,
        })
        .eq("id", emailId);

      results.rateLimited++;
      return;
    }

    // Get SMTP server config (with failover support)
    let server = smtpServerId ? smtpServers[smtpServerId] : null;
    let activeServerId = smtpServerId;
    if (!server) {
      // Try to find the user's primary online server first
      const { data: primaryServer } = await supabase
        .from("smtp_servers")
        .select("id, hostname, ip_address, port, tls_enabled")
        .eq("user_id", userId)
        .eq("status", "online")
        .eq("is_primary", true)
        .limit(1)
        .maybeSingle();

      if (primaryServer) {
        server = {
          hostname: primaryServer.hostname as string,
          ip_address: String(primaryServer.ip_address),
          port: primaryServer.port as number,
          tls_enabled: primaryServer.tls_enabled as boolean,
        };
        activeServerId = primaryServer.id;
      } else {
        // Fallback: any online server
        const { data: fallbackServer } = await supabase
          .from("smtp_servers")
          .select("id, hostname, ip_address, port, tls_enabled")
          .eq("user_id", userId)
          .eq("status", "online")
          .limit(1)
          .maybeSingle();

        if (fallbackServer) {
          server = {
            hostname: fallbackServer.hostname as string,
            ip_address: String(fallbackServer.ip_address),
            port: fallbackServer.port as number,
            tls_enabled: fallbackServer.tls_enabled as boolean,
          };
          activeServerId = fallbackServer.id;
        }
      }
    }

    if (!server) {
      await supabase
        .from("email_queue")
        .update({
          status: "failed",
          error_message: "No SMTP server available",
          attempts: attempts + 1,
        })
        .eq("id", emailId);

      results.failed++;
      return;
    }

    // Fetch attachments if this email came from a campaign
    const attachments: { fileName: string; contentType: string; base64Data: string }[] = [];

    // Check if there's a campaign with this email's characteristics
    // We look for campaign_attachments that match the user
    // For now, we skip attachment fetching for non-campaign emails (test emails)

    // Generate message ID
    const messageId = `${crypto.randomUUID()}@edapost`;

    // Build List-Unsubscribe headers for bulk emails
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
    const unsubParams = new URLSearchParams({ email: toAddress, uid: userId });
    const unsubUrl = `${SUPABASE_URL}/functions/v1/process-unsubscribe?${unsubParams}`;
    const extraHeaders: Record<string, string> = {
      "List-Unsubscribe": `<${unsubUrl}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    };

    // Build MIME message
    const mimeData = buildMimeMessage({
      from: fromAddress,
      to: toAddress,
      subject,
      htmlBody,
      plainBody,
      messageId,
      attachments: attachments.length > 0 ? attachments : undefined,
      extraHeaders,
    });

    // Send via SMTP
    const smtpResult = await sendViaSMTP({
      host: server.ip_address,
      port: server.port,
      tlsEnabled: server.tls_enabled,
      from: fromAddress,
      to: toAddress,
      mimeData,
    });

    if (smtpResult.success) {
      // Success: update queue status
      await supabase
        .from("email_queue")
        .update({
          status: "sent",
          sent_at: new Date().toISOString(),
          attempts: attempts + 1,
          error_message: null,
          postfix_queue_id: smtpResult.response.substring(0, 20),
        })
        .eq("id", emailId);

      // Record in email_logs
      await supabase.from("email_logs").insert({
        user_id: userId,
        event_type: "sent",
        from_address: fromAddress,
        to_address: toAddress,
        subject,
        message_id: `<${messageId}>`,
        smtp_response: smtpResult.response,
        response_code: "250",
        smtp_server_id: smtpServerId,
      });

      // Track for rate limiting
      await supabase.from("domain_send_tracking").insert({
        user_id: userId,
        domain: toAddress.split("@")[1]?.toLowerCase() || "unknown",
      });

      // Increment warmup counter if active
      if (warmupUserIds.has(userId) && smtpServerId) {
        await incrementWarmupCounter(supabase, userId, smtpServerId);
        // Invalidate warmup cache so next email rechecks
        delete warmupCache[`${userId}:${smtpServerId}`];
      }

      results.sent++;
    } else {
      // Failure: determine if retryable
      const newAttempts = attempts + 1;
      // Extract response code from error text
      const codeMatch = (smtpResult.error || smtpResult.response || "").match(/\b([245]\d{2})\b/);
      const responseCode = codeMatch ? codeMatch[1] : null;
      const isHardBounce = responseCode && ["550", "551", "552", "553", "554", "555", "521", "556"].includes(responseCode);

      // Detect FBL/complaint indicators in SMTP response
      const errorText = (smtpResult.error || smtpResult.response || "").toLowerCase();
      const isComplaint = /spam|complaint|abuse|unsolicited|junk|blocked.*policy|fbl|feedback.*loop|reported|unwanted/.test(errorText);

      if (isComplaint) {
        // Process as complaint via process-complaints
        try {
          await supabase.functions.invoke("process-complaints", {
            body: {
              user_id: userId,
              email: toAddress,
              from_address: fromAddress,
              feedback_type: "abuse",
              source: "smtp-response",
              original_message_id: `<${messageId}>`,
              smtp_response: smtpResult.error || smtpResult.response,
              smtp_server_id: smtpServerId,
            },
          });
        } catch (complaintErr) {
          console.error("Failed to invoke process-complaints:", complaintErr);
        }
      }

      if (isHardBounce || newAttempts >= maxAttempts) {
        // Permanent failure
        await supabase
          .from("email_queue")
          .update({
            status: "failed",
            error_message: smtpResult.error || smtpResult.response,
            attempts: newAttempts,
          })
          .eq("id", emailId);

        // Record bounce in email_logs
        await supabase.from("email_logs").insert({
          user_id: userId,
          event_type: isComplaint ? "complaint" : (isHardBounce ? "bounced" : "failed"),
          from_address: fromAddress,
          to_address: toAddress,
          subject,
          message_id: `<${messageId}>`,
          smtp_response: smtpResult.error || smtpResult.response,
          response_code: responseCode || "500",
          smtp_server_id: smtpServerId,
        });

        // Call process-bounces for classification & auto-suppression (non-complaint bounces)
        if (!isComplaint) {
          try {
            await supabase.functions.invoke("process-bounces", {
              body: {
                user_id: userId,
                email: toAddress,
                response_code: responseCode,
                error_text: smtpResult.error || smtpResult.response,
                smtp_server_id: smtpServerId,
              },
            });
          } catch (bounceErr) {
            console.error("Failed to invoke process-bounces:", bounceErr);
          }
        }

        results.failed++;
      } else {
        // Temporary failure: retry with exponential backoff
        const backoffSeconds = 30 * Math.pow(2, newAttempts - 1); // 30s, 60s, 120s, 240s
        const nextRetryAt = new Date(Date.now() + backoffSeconds * 1000).toISOString();

        await supabase
          .from("email_queue")
          .update({
            status: "retrying",
            error_message: smtpResult.error || smtpResult.response,
            attempts: newAttempts,
            next_retry_at: nextRetryAt,
          })
          .eq("id", emailId);

        // Record deferred event
        await supabase.from("email_logs").insert({
          user_id: userId,
          event_type: "deferred",
          from_address: fromAddress,
          to_address: toAddress,
          subject,
          message_id: `<${messageId}>`,
          smtp_response: smtpResult.error || smtpResult.response,
          smtp_server_id: smtpServerId,
        });

        results.deferred++;
      }
    }
  } catch (err) {
    console.error(`Error processing email ${emailId}:`, err);
    const newAttempts = attempts + 1;
    const backoffSeconds = 30 * Math.pow(2, newAttempts - 1);
    const nextRetryAt = new Date(Date.now() + backoffSeconds * 1000).toISOString();

    await supabase
      .from("email_queue")
      .update({
        status: newAttempts >= maxAttempts ? "failed" : "retrying",
        error_message: (err as Error).message,
        attempts: newAttempts,
        next_retry_at: newAttempts < maxAttempts ? nextRetryAt : null,
      })
      .eq("id", emailId);

    if (newAttempts >= maxAttempts) {
      results.failed++;
    } else {
      results.deferred++;
    }
  }
}
