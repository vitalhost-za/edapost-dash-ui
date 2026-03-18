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

      // Get recipients
      const { data: recipients } = await supabase
        .from("campaign_recipients")
        .select("email")
        .eq("campaign_id", campaign.id)
        .eq("status", "pending");

      if (campaign.ab_test_enabled) {
        // A/B test: get variants and split recipients evenly
        const { data: variants } = await supabase
          .from("ab_test_variants")
          .select("*")
          .eq("campaign_id", campaign.id)
          .order("variant_label", { ascending: true });

        if (variants && variants.length > 0 && recipients && recipients.length > 0) {
          const shuffled = [...recipients].sort(() => Math.random() - 0.5);
          const chunkSize = Math.ceil(shuffled.length / variants.length);

          for (let vi = 0; vi < variants.length; vi++) {
            const variant = variants[vi];
            const chunk = shuffled.slice(vi * chunkSize, (vi + 1) * chunkSize);

            // Update variant recipient count
            await supabase
              .from("ab_test_variants")
              .update({ recipient_count: chunk.length })
              .eq("id", variant.id);

            // Queue emails with variant-specific fields
            const queueRows = chunk.map((r: { email: string }) => ({
              user_id: campaign.user_id,
              from_address: variant.from_address || campaign.from_address,
              to_address: r.email,
              subject: variant.subject || campaign.subject,
              smtp_server_id: campaign.smtp_server_id,
            }));
            await supabase.from("email_queue").insert(queueRows);
          }
        }

        results.push({ id: campaign.id, action: "ab_test_started" });
      } else {
        // Standard send (non-A/B)
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
      }

      // Handle recurring: create next occurrence
      if (campaign.recurrence_pattern && campaign.recurrence_pattern !== "none") {
        const shouldRecur = await checkRecurrenceEligible(supabase, campaign);
        if (shouldRecur) {
          const nextDate = computeNextDate(
            campaign.scheduled_at,
            campaign.recurrence_pattern
          );

          if (nextDate) {
            if (campaign.recurrence_end_at && nextDate > new Date(campaign.recurrence_end_at)) {
              results.push({ id: campaign.id, action: "recurrence_ended_by_date" });
              continue;
            }

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
                ab_test_enabled: campaign.ab_test_enabled,
              })
              .select("id")
              .single();

            if (newCampaign) {
              if (recipients && recipients.length > 0) {
                const newRecipientRows = recipients.map((r: { email: string }) => ({
                  campaign_id: newCampaign.id,
                  user_id: campaign.user_id,
                  email: r.email,
                  status: "pending",
                }));
                await supabase.from("campaign_recipients").insert(newRecipientRows);
              }

              if (campaign.ab_test_enabled) {
                const { data: origVariants } = await supabase
                  .from("ab_test_variants")
                  .select("*")
                  .eq("campaign_id", campaign.id);

                if (origVariants && origVariants.length > 0) {
                  const newVariants = origVariants.map((v: Record<string, unknown>) => ({
                    campaign_id: newCampaign.id,
                    user_id: campaign.user_id,
                    variant_label: v.variant_label,
                    subject: v.subject,
                    html_body: v.html_body,
                    plain_body: v.plain_body,
                    from_address: v.from_address,
                    scheduled_at: v.scheduled_at,
                  }));
                  await supabase.from("ab_test_variants").insert(newVariants);
                }
              }

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

          await supabase
            .from("campaigns")
            .update({ last_recurrence_at: now })
            .eq("id", campaign.id);
        }
      }
    }

    // 2. Auto-select A/B test winners for completed "sending" campaigns
    const winnerResults = await selectAbTestWinners(supabase);
    results.push(...winnerResults);

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

async function selectAbTestWinners(
  supabase: ReturnType<typeof createClient>
): Promise<{ id: string; action: string }[]> {
  const results: { id: string; action: string }[] = [];

  // Find A/B-enabled campaigns that are "sending" and have no winner yet
  const { data: abCampaigns, error } = await supabase
    .from("campaigns")
    .select("id, user_id")
    .eq("ab_test_enabled", true)
    .eq("status", "sending")
    .is("ab_test_winner_variant_id", null);

  if (error || !abCampaigns?.length) return results;

  for (const campaign of abCampaigns) {
    // Check if all queued emails for this campaign are done (no pending/queued)
    const { count: pendingCount } = await supabase
      .from("email_queue")
      .select("id", { count: "exact", head: true })
      .eq("user_id", campaign.user_id)
      .in("status", ["queued", "processing"]);

    // Only proceed if no emails are still in queue for this user
    // (simplified check — in production you'd filter by campaign)
    // More precise: check campaign_recipients
    const { count: pendingRecipients } = await supabase
      .from("campaign_recipients")
      .select("id", { count: "exact", head: true })
      .eq("campaign_id", campaign.id)
      .eq("status", "pending");

    if (pendingRecipients && pendingRecipients > 0) continue;

    // All recipients processed — pick winner by highest click rate
    const { data: variants } = await supabase
      .from("ab_test_variants")
      .select("id, variant_label, sent_count, clicked_count")
      .eq("campaign_id", campaign.id)
      .order("variant_label", { ascending: true });

    if (!variants || variants.length === 0) continue;

    // Calculate click rate for each variant
    let winnerId: string | null = null;
    let bestClickRate = -1;

    for (const v of variants) {
      const rate = v.sent_count > 0 ? v.clicked_count / v.sent_count : 0;
      if (rate > bestClickRate) {
        bestClickRate = rate;
        winnerId = v.id;
      }
    }

    if (winnerId) {
      // Mark winner
      await supabase
        .from("ab_test_variants")
        .update({ is_winner: true })
        .eq("id", winnerId);

      // Clear any previous winners for this campaign
      await supabase
        .from("ab_test_variants")
        .update({ is_winner: false })
        .eq("campaign_id", campaign.id)
        .neq("id", winnerId);

      // Update campaign with winner and mark as sent
      await supabase
        .from("campaigns")
        .update({
          ab_test_winner_variant_id: winnerId,
          status: "sent",
          completed_at: new Date().toISOString(),
        })
        .eq("id", campaign.id);

      results.push({ id: campaign.id, action: `ab_winner_selected:${winnerId}` });
    }
  }

  return results;
}

async function checkRecurrenceEligible(
  supabase: ReturnType<typeof createClient>,
  campaign: Record<string, unknown>
): Promise<boolean> {
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
