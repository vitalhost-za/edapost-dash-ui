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

interface WebhookPayload {
  event_type: string;
  timestamp: string;
  data: Record<string, unknown>;
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

    // Validate caller: accept either service role key or authenticated user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // If calling with service role key (from pg_net), skip user validation
    const isServiceCall = token === SERVICE_ROLE_KEY;

    let userId: string;

    if (isServiceCall) {
      // Called from database trigger via pg_net — user_id comes in the body
      const body = await req.json();
      if (!body.user_id || !body.event_type) {
        return new Response(
          JSON.stringify({ error: "Missing user_id or event_type" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      userId = body.user_id;
      return await dispatchWebhooks(supabaseAdmin, userId, body.event_type, body.data ?? {});
    } else {
      // Called from frontend — validate JWT
      const supabaseUser = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: claims, error: claimsError } = await supabaseUser.auth.getClaims(token);
      if (claimsError || !claims?.claims?.sub) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      userId = claims.claims.sub as string;
      const body = await req.json();
      if (!body.event_type) {
        return new Response(
          JSON.stringify({ error: "Missing event_type" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      return await dispatchWebhooks(supabaseAdmin, userId, body.event_type, body.data ?? {});
    }
  } catch (error: unknown) {
    console.error("Webhook dispatch error:", error);
    const msg = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

async function dispatchWebhooks(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  eventType: string,
  eventData: Record<string, unknown>
) {
  // Fetch active webhooks subscribed to this event
  const { data: webhooks, error: fetchError } = await supabase
    .from("webhooks")
    .select("*")
    .eq("user_id", userId)
    .eq("is_active", true)
    .contains("events", [eventType]);

  if (fetchError) {
    console.error("Failed to fetch webhooks:", fetchError);
    return new Response(JSON.stringify({ error: "Failed to fetch webhooks" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (!webhooks || webhooks.length === 0) {
    return new Response(JSON.stringify({ dispatched: 0 }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const payload: WebhookPayload = {
    event_type: eventType,
    timestamp: new Date().toISOString(),
    data: eventData,
  };

  const payloadStr = JSON.stringify(payload);
  const results: Array<{ webhook_id: string; success: boolean; status_code: number | null }> = [];

  // Dispatch to each webhook endpoint
  await Promise.allSettled(
    webhooks.map(async (webhook: Record<string, unknown>) => {
      const webhookId = webhook.id as string;
      const url = webhook.url as string;
      const secret = webhook.secret as string | null;
      const failureCount = webhook.failure_count as number;

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "User-Agent": "EdaPost-Webhooks/1.0",
        "X-EdaPost-Event": eventType,
        "X-EdaPost-Delivery": crypto.randomUUID(),
      };

      // Add HMAC signature if secret is configured
      if (secret) {
        const signature = await hmacSign(secret, payloadStr);
        headers["X-EdaPost-Signature"] = `sha256=${signature}`;
      }

      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

        const response = await fetch(url, {
          method: "POST",
          headers,
          body: payloadStr,
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        // Consume response body
        await response.text();

        const statusCode = response.status;
        const success = statusCode >= 200 && statusCode < 300;

        // Update webhook status
        await supabase
          .from("webhooks")
          .update({
            last_triggered_at: new Date().toISOString(),
            last_status_code: statusCode,
            failure_count: success ? 0 : failureCount + 1,
            // Auto-disable after 10 consecutive failures
            ...(failureCount + 1 >= 10 && !success ? { is_active: false } : {}),
          })
          .eq("id", webhookId);

        results.push({ webhook_id: webhookId, success, status_code: statusCode });
      } catch (err: unknown) {
        console.error(`Webhook ${webhookId} delivery failed:`, err);

        await supabase
          .from("webhooks")
          .update({
            last_triggered_at: new Date().toISOString(),
            last_status_code: 0,
            failure_count: failureCount + 1,
            ...(failureCount + 1 >= 10 ? { is_active: false } : {}),
          })
          .eq("id", webhookId);

        results.push({ webhook_id: webhookId, success: false, status_code: null });
      }
    })
  );

  return new Response(
    JSON.stringify({ dispatched: results.length, results }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}
