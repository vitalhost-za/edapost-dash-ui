import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function hmacSign(secret: string, payload: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    if (!SUPABASE_URL) throw new Error("SUPABASE_URL is not configured");

    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!SERVICE_ROLE_KEY) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured");

    // Only accept service role calls (from pg_cron)
    const authHeader = req.headers.get("Authorization");
    const token = authHeader?.replace("Bearer ", "");
    if (token !== SERVICE_ROLE_KEY) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // Fetch failed deliveries due for retry
    const now = new Date().toISOString();
    const { data: pendingRetries, error: fetchError } = await supabase
      .from("webhook_deliveries")
      .select("*, webhooks!inner(url, secret, is_active, failure_count)")
      .eq("success", false)
      .not("next_retry_at", "is", null)
      .lte("next_retry_at", now)
      .lt("attempt_number", 5)
      .order("next_retry_at", { ascending: true })
      .limit(20);

    if (fetchError) {
      console.error("Failed to fetch retries:", fetchError);
      return new Response(JSON.stringify({ error: "Failed to fetch retries" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!pendingRetries || pendingRetries.length === 0) {
      return new Response(JSON.stringify({ retried: 0 }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let retriedCount = 0;

    for (const delivery of pendingRetries) {
      const webhook = delivery.webhooks as Record<string, unknown>;
      if (!webhook || !(webhook.is_active as boolean)) {
        // Webhook disabled — clear retry
        await supabase
          .from("webhook_deliveries")
          .update({ next_retry_at: null })
          .eq("id", delivery.id);
        continue;
      }

      const url = webhook.url as string;
      const secret = webhook.secret as string | null;
      const webhookFailureCount = webhook.failure_count as number;
      const payload = delivery.payload as Record<string, unknown>;
      const payloadStr = JSON.stringify(payload);
      const nextAttempt = delivery.attempt_number + 1;

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "User-Agent": "EdaPost-Webhooks/1.0",
        "X-EdaPost-Event": delivery.event_type,
        "X-EdaPost-Delivery": delivery.delivery_id,
        "X-EdaPost-Retry": String(nextAttempt),
      };

      if (secret) {
        const signature = await hmacSign(secret, payloadStr);
        headers["X-EdaPost-Signature"] = `sha256=${signature}`;
      }

      const startTime = Date.now();
      let statusCode: number | null = null;
      let responseBody = "";
      let success = false;
      let errorMessage: string | null = null;

      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);

        const response = await fetch(url, {
          method: "POST",
          headers,
          body: payloadStr,
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        responseBody = await response.text();
        statusCode = response.status;
        success = statusCode >= 200 && statusCode < 300;

        if (responseBody.length > 2000) {
          responseBody = responseBody.substring(0, 2000) + "...[truncated]";
        }
      } catch (err: unknown) {
        console.error(`Retry for delivery ${delivery.id} failed:`, err);
        errorMessage = err instanceof Error ? err.message : "Unknown error";
      }

      const durationMs = Date.now() - startTime;

      // Calculate next retry with exponential backoff
      let nextRetryAt: string | null = null;
      if (!success && nextAttempt < 5) {
        const backoffSeconds = 10 * Math.pow(3, nextAttempt - 1);
        nextRetryAt = new Date(Date.now() + backoffSeconds * 1000).toISOString();
      }

      // Clear retry on original delivery
      await supabase
        .from("webhook_deliveries")
        .update({ next_retry_at: null })
        .eq("id", delivery.id);

      // Insert new delivery log for this retry attempt
      await supabase.from("webhook_deliveries").insert({
        webhook_id: delivery.webhook_id,
        user_id: delivery.user_id,
        event_type: delivery.event_type,
        payload,
        status_code: statusCode,
        response_body: responseBody || null,
        duration_ms: durationMs,
        success,
        error_message: errorMessage,
        attempt_number: nextAttempt,
        delivery_id: delivery.delivery_id,
        max_attempts: 5,
        next_retry_at: nextRetryAt,
      });

      // Update webhook status
      await supabase
        .from("webhooks")
        .update({
          last_triggered_at: new Date().toISOString(),
          last_status_code: statusCode ?? 0,
          failure_count: success ? 0 : webhookFailureCount + 1,
          ...(webhookFailureCount + 1 >= 10 && !success ? { is_active: false } : {}),
        })
        .eq("id", delivery.webhook_id);

      retriedCount++;
    }

    return new Response(
      JSON.stringify({ retried: retriedCount }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Retry webhooks error:", error);
    const msg = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
