import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const now = new Date().toISOString();

    // 1. Find scheduled campaigns that are due
    const { data: dueCampaigns, error: fetchErr } = await supabase
      .from("campaigns")
      .select("*")
      .eq("status", "scheduled")
      .lte("scheduled_at", now);

    if (fetchErr) throw fetchErr;

    const results: { id: string; action: string }[] = [];

    for (const campaign of dueCampaigns || []) {
      // Transition to "sending"
      await supabase
        .from("campaigns")
        .update({ status: "sending", sent_at: now })
        .eq("id", campaign.id);

      // Queue emails for recipients
      const { data: recipients } = await supabase
        .from("campaign_recipients")
        .select("email")
        .eq("campaign_id", campaign.id)
        .eq("status", "pending");

      if (recipients && recipients.length > 0) {
        const queueRows = recipients.map((r: { email: string }) => ({
          user_id: campaign.user_id,
          from_address: campaign.from_address,
          to_address: r.email,
          subject: campaign.subject,
          smtp_server_id: campaign.smtp_server_id,
        }));
        await supabase.from("email_queue").insert(queueRows);
      }

      results.push({ id: campaign.id, action: "started_sending" });

      // Handle recurring: create next occurrence
      if (campaign.recurrence_pattern && campaign.recurrence_pattern !== "none") {
        const shouldRecur = await checkRecurrenceEligible(supabase, campaign);
        if (shouldRecur) {
          const nextDate = computeNextDate(
            campaign.scheduled_at,
            campaign.recurrence_pattern
          );

          if (nextDate) {
            // Check end date
            if (campaign.recurrence_end_at && nextDate > new Date(campaign.recurrence_end_at)) {
              results.push({ id: campaign.id, action: "recurrence_ended_by_date" });
              continue;
            }

            // Clone campaign as scheduled for next occurrence
            const { data: newCampaign } = await supabase
              .from("campaigns")
              .insert({
                user_id: campaign.user_id,
                name: campaign.name,
                subject: campaign.subject,
                from_address: campaign.from_address,
                reply_to: campaign.reply_to,
                html_body: campaign.html_body,
                plain_body: campaign.plain_body,
                status: "scheduled",
                open_tracking: campaign.open_tracking,
                click_tracking: campaign.click_tracking,
                custom_headers: campaign.custom_headers,
                scheduled_at: nextDate.toISOString(),
                timezone: campaign.timezone,
                recurrence_pattern: campaign.recurrence_pattern,
                recurrence_end_at: campaign.recurrence_end_at,
                recurrence_count: campaign.recurrence_count
                  ? campaign.recurrence_count - 1
                  : null,
                parent_campaign_id: campaign.parent_campaign_id || campaign.id,
                smtp_server_id: campaign.smtp_server_id,
                sending_domain_id: campaign.sending_domain_id,
              })
              .select("id")
              .single();

            if (newCampaign) {
              // Clone recipients for the new campaign
              if (recipients && recipients.length > 0) {
                const newRecipientRows = recipients.map((r: { email: string }) => ({
                  campaign_id: newCampaign.id,
                  user_id: campaign.user_id,
                  email: r.email,
                  status: "pending",
                }));
                await supabase.from("campaign_recipients").insert(newRecipientRows);
              }

              // Update recipient_count
              await supabase
                .from("campaigns")
                .update({ recipient_count: recipients?.length || 0 })
                .eq("id", newCampaign.id);

              results.push({
                id: campaign.id,
                action: `next_occurrence_created:${newCampaign.id}`,
              });
            }
          }

          // Mark last recurrence on original
          await supabase
            .from("campaigns")
            .update({ last_recurrence_at: now })
            .eq("id", campaign.id);
        }
      }
    }

    return new Response(
      JSON.stringify({ processed: results.length, results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

async function checkRecurrenceEligible(
  supabase: ReturnType<typeof createClient>,
  campaign: Record<string, unknown>
): Promise<boolean> {
  // Check recurrence_count
  if (
    typeof campaign.recurrence_count === "number" &&
    campaign.recurrence_count <= 0
  ) {
    return false;
  }
  return true;
}

function computeNextDate(
  currentScheduled: string,
  pattern: string
): Date | null {
  const d = new Date(currentScheduled);
  switch (pattern) {
    case "daily":
      d.setDate(d.getDate() + 1);
      break;
    case "weekly":
      d.setDate(d.getDate() + 7);
      break;
    case "biweekly":
      d.setDate(d.getDate() + 14);
      break;
    case "monthly":
      d.setMonth(d.getMonth() + 1);
      break;
    default:
      return null;
  }
  return d;
}
