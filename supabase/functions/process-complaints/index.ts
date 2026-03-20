import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// ─── ARF (Abuse Reporting Format) Parser ──────────────────────────────────────
// RFC 5965 — https://datatracker.ietf.org/doc/html/rfc5965

export interface ARFReport {
  feedbackType: string | null;
  userAgent: string | null;
  version: string | null;
  originalMailFrom: string | null;
  originalRcptTo: string | null;
  reportedDomain: string | null;
  sourceIp: string | null;
  authenticationResults: string | null;
  reportedUri: string[] ;
  removalRecipient: string | null;
  // Extracted from the original message part
  originalFrom: string | null;
  originalTo: string | null;
  originalSubject: string | null;
  originalMessageId: string | null;
}

/**
 * Parse an ARF (Abuse Reporting Format) report from a raw email body.
 * ARF reports are multipart/report messages with content-type report-type=feedback-report.
 * The second MIME part contains the machine-readable feedback report fields.
 */
export function parseARF(rawMessage: string): ARFReport {
  const report: ARFReport = {
    feedbackType: null,
    userAgent: null,
    version: null,
    originalMailFrom: null,
    originalRcptTo: null,
    reportedDomain: null,
    sourceIp: null,
    authenticationResults: null,
    reportedUri: [],
    removalRecipient: null,
    originalFrom: null,
    originalTo: null,
    originalSubject: null,
    originalMessageId: null,
  };

  // Extract Feedback-Type
  const feedbackTypeMatch = rawMessage.match(/Feedback-Type:\s*(.+)/i);
  if (feedbackTypeMatch) report.feedbackType = feedbackTypeMatch[1].trim();

  // Extract User-Agent
  const userAgentMatch = rawMessage.match(/User-Agent:\s*(.+)/i);
  if (userAgentMatch) report.userAgent = userAgentMatch[1].trim();

  // Extract Version
  const versionMatch = rawMessage.match(/Version:\s*(.+)/i);
  if (versionMatch) report.version = versionMatch[1].trim();

  // Extract Original-Mail-From
  const mailFromMatch = rawMessage.match(/Original-Mail-From:\s*(.+)/i);
  if (mailFromMatch) report.originalMailFrom = extractEmail(mailFromMatch[1].trim());

  // Extract Original-Rcpt-To
  const rcptToMatch = rawMessage.match(/Original-Rcpt-To:\s*(.+)/i);
  if (rcptToMatch) report.originalRcptTo = extractEmail(rcptToMatch[1].trim());

  // Extract Reported-Domain
  const reportedDomainMatch = rawMessage.match(/Reported-Domain:\s*(.+)/i);
  if (reportedDomainMatch) report.reportedDomain = reportedDomainMatch[1].trim();

  // Extract Source-IP
  const sourceIpMatch = rawMessage.match(/Source-IP:\s*(.+)/i);
  if (sourceIpMatch) report.sourceIp = sourceIpMatch[1].trim();

  // Extract Authentication-Results
  const authResultsMatch = rawMessage.match(/Authentication-Results:\s*(.+)/i);
  if (authResultsMatch) report.authenticationResults = authResultsMatch[1].trim();

  // Extract Reported-URI (can appear multiple times)
  const uriMatches = rawMessage.matchAll(/Reported-URI:\s*(.+)/gi);
  for (const m of uriMatches) {
    report.reportedUri.push(m[1].trim());
  }

  // Extract Removal-Recipient (for opt-out reports)
  const removalMatch = rawMessage.match(/Removal-Recipient:\s*(.+)/i);
  if (removalMatch) report.removalRecipient = extractEmail(removalMatch[1].trim());

  // Try to extract original message headers from the third MIME part
  const fromMatch = rawMessage.match(/^From:\s*(.+)/im);
  if (fromMatch) report.originalFrom = extractEmail(fromMatch[1].trim());

  const toMatch = rawMessage.match(/^To:\s*(.+)/im);
  if (toMatch) report.originalTo = extractEmail(toMatch[1].trim());

  const subjectMatch = rawMessage.match(/^Subject:\s*(.+)/im);
  if (subjectMatch) report.originalSubject = subjectMatch[1].trim();

  const messageIdMatch = rawMessage.match(/^Message-ID:\s*(.+)/im);
  if (messageIdMatch) report.originalMessageId = messageIdMatch[1].trim().replace(/[<>]/g, "");

  return report;
}

/** Extract an email address from a header value that may contain angle brackets or display name */
function extractEmail(value: string): string {
  const angleMatch = value.match(/<([^>]+@[^>]+)>/);
  if (angleMatch) return angleMatch[1].toLowerCase();
  const bareMatch = value.match(/(\S+@\S+)/);
  if (bareMatch) return bareMatch[1].toLowerCase();
  return value.toLowerCase();
}

/**
 * Determine the complaining email address from the ARF report.
 * Priority: Original-Rcpt-To > Removal-Recipient > To header
 */
function getComplainantEmail(report: ARFReport): string | null {
  return report.originalRcptTo || report.removalRecipient || report.originalTo || null;
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
      raw_arf_message,
      email,
      feedback_type,
      source_ip,
      smtp_server_id,
    } = body as {
      user_id: string;
      raw_arf_message?: string;
      email?: string;
      feedback_type?: string;
      source_ip?: string;
      smtp_server_id?: string;
    };

    if (!user_id) {
      return new Response(
        JSON.stringify({ error: "user_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let complainantEmail: string | null = email || null;
    let effectiveFeedbackType = feedback_type || "abuse";
    let arfReport: ARFReport | null = null;

    // Parse ARF report if provided
    if (raw_arf_message) {
      arfReport = parseARF(raw_arf_message);
      complainantEmail = complainantEmail || getComplainantEmail(arfReport);
      effectiveFeedbackType = arfReport.feedbackType || effectiveFeedbackType;
    }

    if (!complainantEmail) {
      return new Response(
        JSON.stringify({ error: "Could not determine complainant email. Provide email or raw_arf_message." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 1. Log the complaint in email_logs for analytics
    await supabase.from("email_logs").insert({
      user_id,
      event_type: "complaint",
      from_address: arfReport?.originalFrom || "unknown",
      to_address: complainantEmail,
      subject: arfReport?.originalSubject || null,
      message_id: arfReport?.originalMessageId || null,
      smtp_server_id: smtp_server_id || null,
      ip_address: source_ip || arfReport?.sourceIp || null,
      response_code: null,
      smtp_response: null,
      metadata: {
        feedback_type: effectiveFeedbackType,
        user_agent: arfReport?.userAgent || null,
        reported_domain: arfReport?.reportedDomain || null,
        authentication_results: arfReport?.authenticationResults || null,
        reported_uri: arfReport?.reportedUri || [],
      },
    });

    // 2. Auto-suppress the complaining address
    const suppressionReason = `Complaint (${effectiveFeedbackType}): ${
      arfReport?.reportedDomain
        ? `reported domain ${arfReport.reportedDomain}`
        : "spam complaint received"
    }`;

    await supabase.from("suppression_list").upsert(
      {
        user_id,
        email: complainantEmail,
        reason: suppressionReason.substring(0, 500),
        added_by: "System (FBL)",
      },
      { onConflict: "user_id,email" }
    );

    // 3. Increment complaint count in delivery_stats for the current hour
    const currentHour = new Date();
    currentHour.setMinutes(0, 0, 0);
    const hourStr = currentHour.toISOString();

    const { data: existingStat } = await supabase
      .from("delivery_stats")
      .select("id, complaints")
      .eq("user_id", user_id)
      .eq("hour", hourStr)
      .maybeSingle();

    if (existingStat) {
      await supabase
        .from("delivery_stats")
        .update({ complaints: (existingStat.complaints || 0) + 1 })
        .eq("id", existingStat.id);
    } else {
      await supabase.from("delivery_stats").insert({
        user_id,
        hour: hourStr,
        smtp_server_id: smtp_server_id || null,
        complaints: 1,
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        email: complainantEmail,
        feedback_type: effectiveFeedbackType,
        suppressed: true,
        arf_parsed: !!arfReport,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Process complaints error:", error);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
