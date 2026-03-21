import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface AlertResult {
  alert_type: string;
  severity: "warning" | "critical";
  message: string;
  value: string;
  threshold: string;
}

async function sendSlackNotification(webhookUrl: string, alerts: AlertResult[]) {
  const blocks = alerts.map((a) => ({
    type: "section",
    text: {
      type: "mrkdwn",
      text: `${a.severity === "critical" ? "🔴" : "🟡"} *${a.alert_type}*\n${a.message}\nCurrent: \`${a.value}\` | Threshold: \`${a.threshold}\``,
    },
  }));

  await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text: `⚠️ EdaPost Alert: ${alerts.length} issue(s) detected`,
      blocks: [
        { type: "header", text: { type: "plain_text", text: "⚠️ EdaPost Alert" } },
        ...blocks,
      ],
    }),
  });
}

async function sendPagerDutyAlert(routingKey: string, alerts: AlertResult[]) {
  for (const alert of alerts) {
    await fetch("https://events.pagerduty.com/v2/enqueue", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        routing_key: routingKey,
        event_action: "trigger",
        payload: {
          summary: `${alert.alert_type}: ${alert.message}`,
          severity: alert.severity,
          source: "EdaPost",
          component: alert.alert_type,
          custom_details: {
            current_value: alert.value,
            threshold: alert.threshold,
          },
        },
      }),
    });
  }
}

async function sendEmailAlert(supabase: any, alertEmail: string, alerts: AlertResult[]) {
  const rows = alerts
    .map((a) => `<tr><td style="padding:8px;border:1px solid #ddd;">${a.severity === "critical" ? "🔴" : "🟡"} ${a.alert_type}</td><td style="padding:8px;border:1px solid #ddd;">${a.message}</td><td style="padding:8px;border:1px solid #ddd;">${a.value}</td><td style="padding:8px;border:1px solid #ddd;">${a.threshold}</td></tr>`)
    .join("");

  const html = `
    <h2>⚠️ EdaPost Alert</h2>
    <p>${alerts.length} alert(s) triggered:</p>
    <table style="border-collapse:collapse;width:100%;">
      <tr style="background:#f5f5f5;"><th style="padding:8px;border:1px solid #ddd;text-align:left;">Alert</th><th style="padding:8px;border:1px solid #ddd;text-align:left;">Details</th><th style="padding:8px;border:1px solid #ddd;text-align:left;">Value</th><th style="padding:8px;border:1px solid #ddd;text-align:left;">Threshold</th></tr>
      ${rows}
    </table>
  `;

  // Queue a notification email
  await supabase.from("email_queue").insert({
    user_id: "system",
    from_address: "alerts@edapost.local",
    to_address: alertEmail,
    subject: `⚠️ EdaPost Alert: ${alerts.length} issue(s) detected`,
    html_body: html,
    status: "queued",
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) throw new Error("Missing env vars");

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // Get all users with settings
    const { data: allSettings, error: settingsError } = await supabase
      .from("user_settings")
      .select("*");
    if (settingsError) throw settingsError;

    const results: { user_id: string; alerts: AlertResult[] }[] = [];

    for (const settings of (allSettings ?? [])) {
      const userId = settings.user_id;
      const alerts: AlertResult[] = [];

      // Get delivery stats for the last hour
      const oneHourAgo = new Date();
      oneHourAgo.setHours(oneHourAgo.getHours() - 1);

      const { data: recentStats } = await supabase
        .from("delivery_stats")
        .select("sent, delivered, bounced, complaints")
        .eq("user_id", userId)
        .gte("hour", oneHourAgo.toISOString());

      const totals = (recentStats ?? []).reduce(
        (acc, r) => ({
          sent: acc.sent + (r.sent || 0),
          delivered: acc.delivered + (r.delivered || 0),
          bounced: acc.bounced + (r.bounced || 0),
          complaints: acc.complaints + (r.complaints || 0),
        }),
        { sent: 0, delivered: 0, bounced: 0, complaints: 0 }
      );

      // Check delivery rate
      if (totals.sent > 0 && settings.notify_delivery_rate !== false) {
        const deliveryRate = (totals.delivered / totals.sent) * 100;
        const threshold = settings.alert_delivery_rate ?? 95;
        if (deliveryRate < threshold) {
          alerts.push({
            alert_type: "Delivery Rate",
            severity: deliveryRate < threshold - 10 ? "critical" : "warning",
            message: `Delivery rate dropped to ${deliveryRate.toFixed(1)}%`,
            value: `${deliveryRate.toFixed(1)}%`,
            threshold: `< ${threshold}%`,
          });
        }
      }

      // Check bounce rate
      if (totals.sent > 0 && settings.notify_bounces) {
        const bounceRate = (totals.bounced / totals.sent) * 100;
        const threshold = settings.alert_bounce_rate ?? 2;
        if (bounceRate > threshold) {
          alerts.push({
            alert_type: "Bounce Rate",
            severity: bounceRate > threshold * 2 ? "critical" : "warning",
            message: `Bounce rate at ${bounceRate.toFixed(1)}%`,
            value: `${bounceRate.toFixed(1)}%`,
            threshold: `> ${threshold}%`,
          });
        }
      }

      // Check complaint rate
      if (totals.sent > 0 && settings.notify_complaints) {
        const complaintRate = (totals.complaints / totals.sent) * 100;
        const threshold = settings.alert_complaint_rate ?? 0.1;
        if (complaintRate > threshold) {
          alerts.push({
            alert_type: "Complaint Rate",
            severity: complaintRate > threshold * 2 ? "critical" : "warning",
            message: `Complaint rate at ${complaintRate.toFixed(2)}%`,
            value: `${complaintRate.toFixed(2)}%`,
            threshold: `> ${threshold}%`,
          });
        }
      }

      // Check queue depth
      if (settings.notify_queue_full) {
        const { data: servers } = await supabase
          .from("smtp_servers")
          .select("queue_size, status, hostname, tls_cert_expiry, tls_enabled, last_heartbeat")
          .eq("user_id", userId);

        const totalQueue = (servers ?? []).reduce((s, srv) => s + srv.queue_size, 0);
        const queueThreshold = settings.alert_queue_depth ?? 10000;
        if (totalQueue > queueThreshold) {
          alerts.push({
            alert_type: "Queue Depth",
            severity: totalQueue > queueThreshold * 2 ? "critical" : "warning",
            message: `Queue depth at ${totalQueue.toLocaleString()} messages`,
            value: totalQueue.toLocaleString(),
            threshold: `> ${queueThreshold.toLocaleString()}`,
          });
        }

        // Check TLS cert expiry
        if (settings.notify_tls_expiry !== false) {
          const tlsDaysThreshold = settings.alert_tls_expiry_days ?? 14;
          for (const srv of (servers ?? [])) {
            if (srv.tls_cert_expiry) {
              const daysLeft = Math.floor(
                (new Date(srv.tls_cert_expiry).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
              );
              if (daysLeft < tlsDaysThreshold) {
                alerts.push({
                  alert_type: "TLS Cert Expiry",
                  severity: daysLeft < 3 ? "critical" : "warning",
                  message: `TLS cert for ${srv.hostname} expires in ${daysLeft} days`,
                  value: `${daysLeft} days`,
                  threshold: `< ${tlsDaysThreshold} days`,
                });
              }
            }
          }

          // Check Postfix process (server down)
          if (settings.notify_server_down) {
            const offlineServers = (servers ?? []).filter((s) => s.status !== "online");
            for (const srv of offlineServers) {
              alerts.push({
                alert_type: "Postfix Process Down",
                severity: "critical",
                message: `Server ${srv.hostname} is ${srv.status}`,
                value: srv.status,
                threshold: "Any server offline",
              });
            }
          }
        }
      }

      if (alerts.length > 0) {
        // Send notifications
        if (settings.slack_webhook_url) {
          try {
            await sendSlackNotification(settings.slack_webhook_url, alerts);
          } catch (e) {
            console.error("Slack notification failed:", e);
          }
        }

        if (settings.pagerduty_routing_key) {
          try {
            await sendPagerDutyAlert(settings.pagerduty_routing_key, alerts);
          } catch (e) {
            console.error("PagerDuty notification failed:", e);
          }
        }

        if (settings.alert_email) {
          try {
            await sendEmailAlert(supabase, settings.alert_email, alerts);
          } catch (e) {
            console.error("Email notification failed:", e);
          }
        }

        results.push({ user_id: userId, alerts });
      }
    }

    return new Response(
      JSON.stringify({ checked: allSettings?.length ?? 0, alerts_triggered: results.length, results }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Check alerts error:", error);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
