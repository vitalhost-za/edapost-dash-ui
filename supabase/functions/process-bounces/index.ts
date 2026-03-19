import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// ─── DSN Response Code Classification ──────────────────────────────────────────

// RFC 3463 Enhanced Status Codes + common SMTP response codes
const HARD_BOUNCE_CODES = new Set([
  "550", "551", "552", "553", "554", "555", // Standard SMTP permanent failures
  "521", // Domain does not accept mail
  "556", // Domain not found
]);

const SOFT_BOUNCE_CODES = new Set([
  "421", "450", "451", "452", // Temporary failures
  "422", // Mailbox full (some providers)
]);

// Pattern-based classification for SMTP response text
const HARD_BOUNCE_PATTERNS: RegExp[] = [
  /user unknown/i,
  /no such user/i,
  /mailbox not found/i,
  /recipient rejected/i,
  /address rejected/i,
  /does not exist/i,
  /invalid (mail)?box/i,
  /invalid recipient/i,
  /unknown recipient/i,
  /unknown user/i,
  /not a valid mailbox/i,
  /account disabled/i,
  /account has been disabled/i,
  /account suspended/i,
  /address does not exist/i,
  /relay not permitted/i,
  /relay access denied/i,
  /domain not found/i,
  /no mx record/i,
  /host not found/i,
  /undeliverable/i,
  /permanent failure/i,
  /rejected for policy reasons/i,
  /blocked.*spamhaus/i,
  /blocked.*blacklist/i,
  /5\.1\.1/,  // RFC 3463: bad destination mailbox
  /5\.1\.2/,  // RFC 3463: bad destination system
  /5\.1\.3/,  // RFC 3463: bad destination syntax
  /5\.1\.6/,  // RFC 3463: mailbox has moved
  /5\.7\.1/,  // RFC 3463: delivery not authorized
];

const SOFT_BOUNCE_PATTERNS: RegExp[] = [
  /mailbox full/i,
  /quota exceeded/i,
  /over quota/i,
  /insufficient storage/i,
  /too many connections/i,
  /too many recipients/i,
  /rate limit/i,
  /try again later/i,
  /temporarily rejected/i,
  /temporary.*failure/i,
  /temporarily deferred/i,
  /service.*unavailable/i,
  /connection timed out/i,
  /connection refused/i,
  /greylist/i,
  /gray.?list/i,
  /please retry/i,
  /4\.2\.1/,  // RFC 3463: mailbox disabled, not accepting messages
  /4\.2\.2/,  // RFC 3463: mailbox full
  /4\.7\.1/,  // RFC 3463: delivery not authorized, greylisting
];

// Default soft bounce threshold before auto-suppression
const SOFT_BOUNCE_SUPPRESSION_THRESHOLD = 5;

export interface BounceClassification {
  type: "hard" | "soft";
  code: string | null;
  reason: string;
  shouldSuppress: boolean;
}

/**
 * Parse a DSN (Delivery Status Notification) message body and extract
 * the relevant status information.
 */
export function parseDSN(rawMessage: string): {
  statusCode: string | null;
  diagnosticCode: string | null;
  action: string | null;
  recipientAddress: string | null;
} {
  const result = {
    statusCode: null as string | null,
    diagnosticCode: null as string | null,
    action: null as string | null,
    recipientAddress: null as string | null,
  };

  // Extract Status field (RFC 3464)
  const statusMatch = rawMessage.match(/Status:\s*(\d\.\d\.\d)/i);
  if (statusMatch) result.statusCode = statusMatch[1];

  // Extract Diagnostic-Code
  const diagMatch = rawMessage.match(/Diagnostic-Code:\s*smtp;\s*(.+?)(?:\r?\n(?!\s)|$)/is);
  if (diagMatch) result.diagnosticCode = diagMatch[1].trim();

  // Extract Action
  const actionMatch = rawMessage.match(/Action:\s*(\S+)/i);
  if (actionMatch) result.action = actionMatch[1].toLowerCase();

  // Extract Final-Recipient or Original-Recipient
  const recipientMatch = rawMessage.match(/(?:Final|Original)-Recipient:\s*(?:rfc822;)?\s*(\S+@\S+)/i);
  if (recipientMatch) result.recipientAddress = recipientMatch[1].toLowerCase().replace(/[<>]/g, "");

  return result;
}

/**
 * Classify a bounce based on SMTP response code and error text.
 */
export function classifyBounce(
  responseCode: string | null,
  errorText: string,
  previousSoftBounceCount: number = 0
): BounceClassification {
  const code = responseCode?.trim() || null;

  // 1. Check response code first
  if (code && HARD_BOUNCE_CODES.has(code)) {
    return {
      type: "hard",
      code,
      reason: errorText || `Permanent failure (${code})`,
      shouldSuppress: true,
    };
  }

  if (code && SOFT_BOUNCE_CODES.has(code)) {
    const shouldSuppress = previousSoftBounceCount + 1 >= SOFT_BOUNCE_SUPPRESSION_THRESHOLD;
    return {
      type: "soft",
      code,
      reason: errorText || `Temporary failure (${code})`,
      shouldSuppress,
    };
  }

  // 2. Check error text patterns
  for (const pattern of HARD_BOUNCE_PATTERNS) {
    if (pattern.test(errorText)) {
      return {
        type: "hard",
        code: code || extractCodeFromText(errorText),
        reason: errorText,
        shouldSuppress: true,
      };
    }
  }

  for (const pattern of SOFT_BOUNCE_PATTERNS) {
    if (pattern.test(errorText)) {
      const shouldSuppress = previousSoftBounceCount + 1 >= SOFT_BOUNCE_SUPPRESSION_THRESHOLD;
      return {
        type: "soft",
        code: code || extractCodeFromText(errorText),
        reason: errorText,
        shouldSuppress,
      };
    }
  }

  // 3. Check DSN enhanced status codes in error text
  const enhancedMatch = errorText.match(/([245])\.\d\.\d/);
  if (enhancedMatch) {
    if (enhancedMatch[1] === "5") {
      return {
        type: "hard",
        code: code || extractCodeFromText(errorText),
        reason: errorText,
        shouldSuppress: true,
      };
    }
    if (enhancedMatch[1] === "4") {
      const shouldSuppress = previousSoftBounceCount + 1 >= SOFT_BOUNCE_SUPPRESSION_THRESHOLD;
      return {
        type: "soft",
        code: code || extractCodeFromText(errorText),
        reason: errorText,
        shouldSuppress,
      };
    }
  }

  // 4. Default: if code starts with 5, it's hard; 4 is soft; otherwise assume soft
  if (code) {
    if (code.startsWith("5")) {
      return { type: "hard", code, reason: errorText, shouldSuppress: true };
    }
    if (code.startsWith("4")) {
      const shouldSuppress = previousSoftBounceCount + 1 >= SOFT_BOUNCE_SUPPRESSION_THRESHOLD;
      return { type: "soft", code, reason: errorText, shouldSuppress };
    }
  }

  // Unknown — treat as soft bounce
  const shouldSuppress = previousSoftBounceCount + 1 >= SOFT_BOUNCE_SUPPRESSION_THRESHOLD;
  return {
    type: "soft",
    code: null,
    reason: errorText || "Unknown bounce reason",
    shouldSuppress,
  };
}

/** Extract a 3-digit SMTP code from text */
function extractCodeFromText(text: string): string | null {
  const match = text.match(/\b([245]\d{2})\b/);
  return match ? match[1] : null;
}

// ─── Edge Function Handler ────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) throw new Error("Missing env vars");

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const body = await req.json();
    const {
      user_id,
      email,
      response_code,
      error_text,
      smtp_server_id,
      dsn_message,
    } = body as {
      user_id: string;
      email: string;
      response_code?: string;
      error_text?: string;
      smtp_server_id?: string;
      dsn_message?: string;
    };

    if (!user_id || !email) {
      return new Response(JSON.stringify({ error: "user_id and email are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Parse DSN if provided
    let dsnInfo = { statusCode: null as string | null, diagnosticCode: null as string | null };
    if (dsn_message) {
      dsnInfo = parseDSN(dsn_message);
    }

    const effectiveCode = response_code || dsnInfo.statusCode || null;
    const effectiveError = error_text || dsnInfo.diagnosticCode || "";

    // Count previous soft bounces for this email
    const { count: previousSoftBounces } = await supabase
      .from("bounces")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user_id)
      .eq("email", email)
      .eq("bounce_type", "soft");

    // Classify
    const classification = classifyBounce(effectiveCode, effectiveError, previousSoftBounces ?? 0);

    // Record bounce
    await supabase.from("bounces").insert({
      user_id,
      email,
      bounce_type: classification.type,
      bounce_code: classification.code,
      reason: classification.reason,
      smtp_server_id: smtp_server_id || null,
      attempts: (previousSoftBounces ?? 0) + 1,
    });

    // Auto-suppress if needed
    if (classification.shouldSuppress) {
      const reason = classification.type === "hard"
        ? `Hard bounce: ${classification.reason.substring(0, 200)}`
        : `Soft bounce threshold exceeded (${SOFT_BOUNCE_SUPPRESSION_THRESHOLD} bounces)`;

      await supabase.from("suppression_list").upsert(
        {
          user_id,
          email,
          reason,
          added_by: "System (auto)",
        },
        { onConflict: "user_id,email" }
      );
    }

    return new Response(
      JSON.stringify({
        classification: classification.type,
        code: classification.code,
        suppressed: classification.shouldSuppress,
        previous_soft_bounces: previousSoftBounces ?? 0,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Process bounces error:", error);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
