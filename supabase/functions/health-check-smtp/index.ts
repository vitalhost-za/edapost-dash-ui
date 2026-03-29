// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ─── Failover Trigger Thresholds ───────────────────────────────────────────────

const FAILOVER_TRIGGERS = {
  MAX_CONSECUTIVE_FAILURES: 3,       // consecutive SMTP connection failures
  BOUNCE_RATE_THRESHOLD: 15,         // % bounce rate in last hour triggers failover
  HEARTBEAT_STALE_SECONDS: 300,      // 5 min without heartbeat = Postfix down
  BLACKLIST_KEYWORDS: ["blacklist", "blocked", "listed", "rbl", "dnsbl", "spamhaus", "barracuda"],
};

// ─── Health Check: TCP connect to SMTP server ──────────────────────────────────

async function checkSmtpConnectivity(
  host: string,
  port: number,
  timeoutMs = 10000
): Promise<{ healthy: boolean; responseTime: number; error?: string; banner?: string }> {
  const start = Date.now();
  let conn: Deno.Conn | null = null;

  try {
    conn = await Promise.race([
      Deno.connect({ hostname: host, port }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Connection timed out")), timeoutMs)
      ),
    ]);

    const buf = new Uint8Array(1024);
    const n = await conn.read(buf);
    const banner = n ? new TextDecoder().decode(buf.subarray(0, n)).trim() : "";
    const responseTime = Date.now() - start;

    if (!banner.startsWith("220")) {
      return { healthy: false, responseTime, error: `Unexpected banner: ${banner}`, banner };
    }

    // Send QUIT
    try {
      await conn.write(new TextEncoder().encode("QUIT\r\n"));
    } catch { /* ignore */ }

    return { healthy: true, responseTime, banner };
  } catch (err) {
    return { healthy: false, responseTime: Date.now() - start, error: (err as Error).message };
  } finally {
    try { conn?.close(); } catch { /* ignore */ }
  }
}

// ─── Check for IP Blacklisting indicators ──────────────────────────────────────

async function checkBlacklistIndicators(
  supabase: any,
  serverId: string,
  userId: string
): Promise<{ blacklisted: boolean; evidence: string[] }> {
  // Check recent bounce/failure logs for blacklist-related rejections
  const oneHourAgo = new Date(Date.now() - 3600000).toISOString();

  const { data: recentLogs } = await supabase
    .from("email_logs")
    .select("smtp_response, response_code")
    .eq("user_id", userId)
    .eq("smtp_server_id", serverId)
    .in("event_type", ["bounced", "failed"])
    .gte("created_at", oneHourAgo)
    .limit(50);

  const evidence: string[] = [];
  for (const log of recentLogs || []) {
    const resp = (log.smtp_response || "").toLowerCase();
    for (const kw of FAILOVER_TRIGGERS.BLACKLIST_KEYWORDS) {
      if (resp.includes(kw)) {
        evidence.push(log.smtp_response);
        break;
      }
    }
  }

  return { blacklisted: evidence.length >= 2, evidence };
}

// ─── Check Bounce Rate ─────────────────────────────────────────────────────────

async function getServerBounceRate(
  supabase: any,
  serverId: string,
  userId: string
): Promise<{ bounceRate: number; sent: number; bounced: number }> {
  const oneHourAgo = new Date(Date.now() - 3600000).toISOString();

  const { data: stats } = await supabase
    .from("delivery_stats")
    .select("sent, bounced")
    .eq("user_id", userId)
    .eq("smtp_server_id", serverId)
    .gte("hour", oneHourAgo);

  const totals = (stats || []).reduce(
    (acc: any, r: any) => ({ sent: acc.sent + (r.sent || 0), bounced: acc.bounced + (r.bounced || 0) }),
    { sent: 0, bounced: 0 }
  );

  return {
    bounceRate: totals.sent > 0 ? (totals.bounced / totals.sent) * 100 : 0,
    sent: totals.sent,
    bounced: totals.bounced,
  };
}

// ─── Perform Failover ──────────────────────────────────────────────────────────

async function performFailover(
  supabase: any,
  failedServer: any,
  reason: string,
  details: Record<string, unknown>
): Promise<{ success: boolean; newPrimary?: any; message: string }> {
  const userId = failedServer.user_id;
  const failoverGroup = failedServer.failover_group;

  // Find a healthy secondary server in the same failover group (or any secondary)
  let query = supabase
    .from("smtp_servers")
    .select("*")
    .eq("user_id", userId)
    .neq("id", failedServer.id)
    .eq("health_check_status", "healthy");

  if (failoverGroup) {
    query = query.eq("failover_group", failoverGroup);
  }

  const { data: candidates } = await query.order("is_primary", { ascending: false }).limit(1);

  if (!candidates || candidates.length === 0) {
    return { success: false, message: "No healthy failover server available" };
  }

  const newPrimary = candidates[0];

  // Demote failed server, promote new primary
  await supabase
    .from("smtp_servers")
    .update({ is_primary: false, status: "degraded" })
    .eq("id", failedServer.id);

  await supabase
    .from("smtp_servers")
    .update({ is_primary: true })
    .eq("id", newPrimary.id);

  // Re-route queued emails from failed server to new primary
  await supabase
    .from("email_queue")
    .update({ smtp_server_id: newPrimary.id })
    .eq("smtp_server_id", failedServer.id)
    .in("status", ["queued", "retrying", "deferred"]);

  // Log failover event
  await supabase.from("failover_events").insert({
    user_id: userId,
    from_server_id: failedServer.id,
    to_server_id: newPrimary.id,
    trigger_reason: reason,
    trigger_details: details,
  });

  return { success: true, newPrimary, message: `Failover: ${failedServer.hostname} → ${newPrimary.hostname}` };
}

// ─── Send Failover Alert ───────────────────────────────────────────────────────

async function sendFailoverAlert(
  supabase: any,
  userId: string,
  failedServer: any,
  newPrimary: any,
  reason: string,
  details: Record<string, unknown>
) {
  // Get user settings for notification channels
  const { data: settings } = await supabase
    .from("user_settings")
    .select("slack_webhook_url, pagerduty_routing_key, alert_email")
    .eq("user_id", userId)
    .maybeSingle();

  if (!settings) return;

  const alertMessage = `🔄 **SMTP Failover Triggered**\n` +
    `**Reason:** ${reason}\n` +
    `**From:** ${failedServer.hostname} (${failedServer.ip_address})\n` +
    `**To:** ${newPrimary?.hostname || "No backup available"} (${newPrimary?.ip_address || "N/A"})\n` +
    `**Time:** ${new Date().toISOString()}`;

  // Slack notification
  if (settings.slack_webhook_url) {
    try {
      await fetch(settings.slack_webhook_url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: `🔄 SMTP Failover Alert`,
          blocks: [
            { type: "header", text: { type: "plain_text", text: "🔄 SMTP Failover Alert" } },
            {
              type: "section",
              text: {
                type: "mrkdwn",
                text: alertMessage,
              },
            },
            {
              type: "context",
              elements: [{ type: "mrkdwn", text: `Details: \`${JSON.stringify(details)}\`` }],
            },
          ],
        }),
      });
    } catch (e) {
      console.error("Slack failover alert failed:", e);
    }
  }

  // PagerDuty notification
  if (settings.pagerduty_routing_key) {
    try {
      await fetch("https://events.pagerduty.com/v2/enqueue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          routing_key: settings.pagerduty_routing_key,
          event_action: "trigger",
          payload: {
            summary: `SMTP Failover: ${failedServer.hostname} → ${newPrimary?.hostname || "NONE"}. Reason: ${reason}`,
            severity: "critical",
            source: "EdaPost",
            component: "SMTP Failover",
            custom_details: { from_server: failedServer.hostname, to_server: newPrimary?.hostname, reason, ...details },
          },
        }),
      });
    } catch (e) {
      console.error("PagerDuty failover alert failed:", e);
    }
  }

  // Email notification
  if (settings.alert_email) {
    try {
      await supabase.from("email_queue").insert({
        user_id: userId,
        from_address: "alerts@edapost.local",
        to_address: settings.alert_email,
        subject: `🔄 SMTP Failover: ${failedServer.hostname} → ${newPrimary?.hostname || "NONE"}`,
        html_body: `
          <h2>🔄 SMTP Failover Triggered</h2>
          <table style="border-collapse:collapse;width:100%;">
            <tr><td style="padding:8px;border:1px solid #ddd;font-weight:bold;">Reason</td><td style="padding:8px;border:1px solid #ddd;">${reason}</td></tr>
            <tr><td style="padding:8px;border:1px solid #ddd;font-weight:bold;">Failed Server</td><td style="padding:8px;border:1px solid #ddd;">${failedServer.hostname} (${failedServer.ip_address})</td></tr>
            <tr><td style="padding:8px;border:1px solid #ddd;font-weight:bold;">New Primary</td><td style="padding:8px;border:1px solid #ddd;">${newPrimary?.hostname || "No backup available"} (${newPrimary?.ip_address || "N/A"})</td></tr>
            <tr><td style="padding:8px;border:1px solid #ddd;font-weight:bold;">Time</td><td style="padding:8px;border:1px solid #ddd;">${new Date().toISOString()}</td></tr>
          </table>
          <h3>Details</h3>
          <pre>${JSON.stringify(details, null, 2)}</pre>
        `,
        status: "queued",
        smtp_server_id: newPrimary?.id || null,
      });
    } catch (e) {
      console.error("Email failover alert failed:", e);
    }
  }
}

// ─── Main Health Check Loop ────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) throw new Error("Missing env vars");

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // Get all SMTP servers
    const { data: servers, error: srvErr } = await supabase
      .from("smtp_servers")
      .select("*")
      .order("is_primary", { ascending: false });

    if (srvErr) throw srvErr;
    if (!servers || servers.length === 0) {
      return new Response(JSON.stringify({ message: "No servers to check" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const results: Array<{
      server_id: string;
      hostname: string;
      healthy: boolean;
      responseTime?: number;
      failoverTriggered: boolean;
      failoverReason?: string;
    }> = [];

    for (const server of servers) {
      const serverId = server.id;
      const userId = server.user_id;

      // 1. TCP Health Check
      const healthResult = await checkSmtpConnectivity(
        String(server.ip_address),
        server.port
      );

      // 2. Check stale heartbeat (Postfix down)
      const heartbeatStale = server.last_heartbeat
        ? (Date.now() - new Date(server.last_heartbeat).getTime()) / 1000 > FAILOVER_TRIGGERS.HEARTBEAT_STALE_SECONDS
        : true;

      // 3. Check bounce rate
      const bounceInfo = await getServerBounceRate(supabase, serverId, userId);

      // 4. Check blacklist indicators
      const blacklistInfo = await checkBlacklistIndicators(supabase, serverId, userId);

      // Determine overall health
      const isHealthy = healthResult.healthy && !heartbeatStale && bounceInfo.bounceRate < FAILOVER_TRIGGERS.BOUNCE_RATE_THRESHOLD && !blacklistInfo.blacklisted;
      const newConsecutiveFailures = healthResult.healthy ? 0 : (server.consecutive_failures || 0) + 1;

      // Update server health status
      await supabase
        .from("smtp_servers")
        .update({
          health_check_status: isHealthy ? "healthy" : "unhealthy",
          last_health_check: new Date().toISOString(),
          consecutive_failures: newConsecutiveFailures,
          status: isHealthy ? "online" : (healthResult.healthy ? "degraded" : "offline"),
        })
        .eq("id", serverId);

      // Determine if failover is needed
      let failoverTriggered = false;
      let failoverReason = "";
      const failoverDetails: Record<string, unknown> = {};

      if (server.is_primary && !isHealthy) {
        // Check failover triggers
        if (newConsecutiveFailures >= FAILOVER_TRIGGERS.MAX_CONSECUTIVE_FAILURES) {
          failoverReason = "Postfix down — consecutive connection failures";
          failoverDetails.consecutive_failures = newConsecutiveFailures;
          failoverDetails.last_error = healthResult.error;
        } else if (bounceInfo.bounceRate >= FAILOVER_TRIGGERS.BOUNCE_RATE_THRESHOLD) {
          failoverReason = `High bounce rate: ${bounceInfo.bounceRate.toFixed(1)}%`;
          failoverDetails.bounce_rate = bounceInfo.bounceRate;
          failoverDetails.sent = bounceInfo.sent;
          failoverDetails.bounced = bounceInfo.bounced;
        } else if (blacklistInfo.blacklisted) {
          failoverReason = "IP blacklisted — multiple RBL/DNSBL rejections detected";
          failoverDetails.evidence = blacklistInfo.evidence.slice(0, 5);
        } else if (heartbeatStale && !healthResult.healthy) {
          failoverReason = "Postfix down — no heartbeat and connection failed";
          failoverDetails.last_heartbeat = server.last_heartbeat;
          failoverDetails.connection_error = healthResult.error;
        }

        if (failoverReason) {
          const failoverResult = await performFailover(supabase, server, failoverReason, failoverDetails);
          failoverTriggered = failoverResult.success;

          // Alert team
          await sendFailoverAlert(supabase, userId, server, failoverResult.newPrimary, failoverReason, failoverDetails);
        }
      }

      results.push({
        server_id: serverId,
        hostname: server.hostname,
        healthy: isHealthy,
        responseTime: healthResult.responseTime,
        failoverTriggered,
        failoverReason: failoverReason || undefined,
      });
    }

    return new Response(
      JSON.stringify({ checked: results.length, results }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Health check error:", error);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
