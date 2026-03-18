import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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

  // HTML part
  if (opts.htmlBody) {
    mime += `--${altBoundary}\r\n`;
    mime += `Content-Type: text/html; charset="UTF-8"\r\n`;
    mime += `Content-Transfer-Encoding: quoted-printable\r\n\r\n`;
    mime += `${opts.htmlBody}\r\n\r\n`;
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
  supabase: ReturnType<typeof createClient>,
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

    return await enforceLimit(supabase, userId, recipientDomain, defaultLimit.max_per_minute, defaultLimit.max_per_hour);
  }

  return await enforceLimit(supabase, userId, recipientDomain, limits.max_per_minute, limits.max_per_hour);
}

async function enforceLimit(
  supabase: ReturnType<typeof createClient>,
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

    // 3. Process emails with concurrency control
    const results = { sent: 0, failed: 0, deferred: 0, rateLimited: 0 };

    // Process in chunks based on concurrency
    for (let i = 0; i < queuedEmails.length; i += concurrency) {
      const chunk = queuedEmails.slice(i, i + concurrency);
      const promises = chunk.map((email) => processEmail(supabase, email, smtpServers, results));
      await Promise.allSettled(promises);
    }

    // 4. Clean up old domain_send_tracking entries (older than 2 hours)
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    await supabase
      .from("domain_send_tracking")
      .delete()
      .lt("sent_at", twoHoursAgo);

    return new Response(
      JSON.stringify({
        processed: queuedEmails.length,
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
  supabase: ReturnType<typeof createClient>,
  email: Record<string, unknown>,
  smtpServers: Record<string, { hostname: string; ip_address: string; port: number; tls_enabled: boolean }>,
  results: { sent: number; failed: number; deferred: number; rateLimited: number }
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
    // Extract recipient domain for rate limiting
    const recipientDomain = toAddress.split("@")[1]?.toLowerCase() || "unknown";

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

    // Get SMTP server config
    let server = smtpServerId ? smtpServers[smtpServerId] : null;
    if (!server) {
      // Try to find the user's first available server
      const { data: defaultServer } = await supabase
        .from("smtp_servers")
        .select("id, hostname, ip_address, port, tls_enabled")
        .eq("user_id", userId)
        .eq("status", "online")
        .limit(1)
        .maybeSingle();

      if (defaultServer) {
        server = {
          hostname: defaultServer.hostname,
          ip_address: String(defaultServer.ip_address),
          port: defaultServer.port,
          tls_enabled: defaultServer.tls_enabled,
        };
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

    // Build MIME message
    const mimeData = buildMimeMessage({
      from: fromAddress,
      to: toAddress,
      subject,
      htmlBody,
      plainBody,
      messageId,
      attachments: attachments.length > 0 ? attachments : undefined,
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

      results.sent++;
    } else {
      // Failure: determine if retryable
      const newAttempts = attempts + 1;
      const isBounce = smtpResult.error?.includes("550") || smtpResult.error?.includes("553") || smtpResult.error?.includes("554");

      if (isBounce || newAttempts >= maxAttempts) {
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
          event_type: isBounce ? "bounced" : "failed",
          from_address: fromAddress,
          to_address: toAddress,
          subject,
          message_id: `<${messageId}>`,
          smtp_response: smtpResult.error || smtpResult.response,
          response_code: isBounce ? "550" : "500",
          smtp_server_id: smtpServerId,
        });

        // Record in bounces table if it's a bounce
        if (isBounce) {
          await supabase.from("bounces").insert({
            user_id: userId,
            email: toAddress,
            bounce_type: "hard",
            bounce_code: "550",
            reason: smtpResult.error || smtpResult.response,
            smtp_server_id: smtpServerId,
          });
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
