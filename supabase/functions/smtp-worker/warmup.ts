// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

// ─── Warmup Schedule ──────────────────────────────────────────────────────────
// Exponential curve from Day 1: 50 → Day 30: 10,000
// Formula: 50 * (10000/50)^((day-1)/29) ≈ 50 * 200^((day-1)/29)

const WARMUP_DAY_1 = 50;
const WARMUP_DAY_30 = 10000;
const WARMUP_TOTAL_DAYS = 30;

export function getWarmupDailyLimit(day: number): number {
  if (day <= 0) return WARMUP_DAY_1;
  if (day >= WARMUP_TOTAL_DAYS) return WARMUP_DAY_30;
  const ratio = WARMUP_DAY_30 / WARMUP_DAY_1;
  const exponent = (day - 1) / (WARMUP_TOTAL_DAYS - 1);
  return Math.round(WARMUP_DAY_1 * Math.pow(ratio, exponent));
}

// Generate the full 30-day schedule
export function getFullWarmupSchedule(): { day: number; limit: number }[] {
  return Array.from({ length: WARMUP_TOTAL_DAYS }, (_, i) => ({
    day: i + 1,
    limit: getWarmupDailyLimit(i + 1),
  }));
}

// ─── Hourly Send Cap (Spread Evenly) ─────────────────────────────────────────
// Divides daily limit into 24 hourly slots to prevent bursts
export function getHourlyCap(dailyLimit: number): number {
  // Add 20% buffer per hour to handle natural variance while still spreading
  return Math.max(1, Math.ceil((dailyLimit / 24) * 1.2));
}

// ─── Volume Cap Check ─────────────────────────────────────────────────────────

export interface WarmupStatus {
  isWarmingUp: boolean;
  dailyLimit: number;
  sentToday: number;
  hourlyCap: number;
  sentThisHour: number;
  allowed: boolean;
  remaining: number;
  reason?: string;
}

export async function checkWarmupVolumeCap(
  supabase: any,
  userId: string,
  smtpServerId: string
): Promise<WarmupStatus> {
  // Find active warmup for this server
  const { data: warmup } = await supabase
    .from("ip_warmup")
    .select("*")
    .eq("user_id", userId)
    .eq("smtp_server_id", smtpServerId)
    .eq("status", "active")
    .maybeSingle();

  if (!warmup) {
    return {
      isWarmingUp: false,
      dailyLimit: Infinity,
      sentToday: 0,
      hourlyCap: Infinity,
      sentThisHour: 0,
      allowed: true,
      remaining: Infinity,
    };
  }

  const dailyLimit = getWarmupDailyLimit(warmup.warmup_day as number);
  const hourlyCap = getHourlyCap(dailyLimit);
  const sentToday: number = (warmup.sent_today as number) || 0;

  // Count sends this hour from domain_send_tracking
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count: sentThisHour } = await supabase
    .from("domain_send_tracking")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("sent_at", oneHourAgo);

  const hourSent = sentThisHour ?? 0;

  if (sentToday >= dailyLimit) {
    return {
      isWarmingUp: true,
      dailyLimit,
      sentToday,
      hourlyCap,
      sentThisHour: hourSent,
      allowed: false,
      remaining: 0,
      reason: `Warmup daily limit reached: ${sentToday}/${dailyLimit} (Day ${warmup.warmup_day})`,
    };
  }

  if (hourSent >= hourlyCap) {
    return {
      isWarmingUp: true,
      dailyLimit,
      sentToday,
      hourlyCap,
      sentThisHour: hourSent,
      allowed: false,
      remaining: dailyLimit - sentToday,
      reason: `Warmup hourly cap reached: ${hourSent}/${hourlyCap} (spreading sends evenly)`,
    };
  }

  return {
    isWarmingUp: true,
    dailyLimit,
    sentToday,
    hourlyCap,
    sentThisHour: hourSent,
    allowed: true,
    remaining: Math.min(dailyLimit - sentToday, hourlyCap - hourSent),
  };
}

// ─── Increment Warmup Counter ─────────────────────────────────────────────────

export async function incrementWarmupCounter(
  supabase: any,
  userId: string,
  smtpServerId: string
): Promise<void> {
  const { data: warmup } = await supabase
    .from("ip_warmup")
    .select("id, sent_today, warmup_day")
    .eq("user_id", userId)
    .eq("smtp_server_id", smtpServerId)
    .eq("status", "active")
    .maybeSingle();

  if (!warmup) return;

  const newSentToday = ((warmup.sent_today as number) || 0) + 1;
  const dailyLimit = getWarmupDailyLimit(warmup.warmup_day as number);

  await supabase
    .from("ip_warmup")
    .update({
      sent_today: newSentToday,
      daily_limit: dailyLimit,
    })
    .eq("id", warmup.id);
}

// ─── Advance Warmup Day ───────────────────────────────────────────────────────
// Call this once per day (e.g., from a cron) to advance the warmup schedule

export async function advanceWarmupDays(
  supabase: any
): Promise<void> {
  const { data: activeWarmups } = await supabase
    .from("ip_warmup")
    .select("id, warmup_day, total_days, started_at")
    .eq("status", "active");

  for (const warmup of activeWarmups || []) {
    const startDate = new Date(warmup.started_at as string);
    const now = new Date();
    const daysSinceStart = Math.floor((now.getTime() - startDate.getTime()) / (24 * 60 * 60 * 1000)) + 1;
    const newDay = Math.min(daysSinceStart, warmup.total_days as number);

    const update: Record<string, unknown> = {
      warmup_day: newDay,
      sent_today: 0, // Reset daily counter
      daily_limit: getWarmupDailyLimit(newDay),
    };

    if (newDay >= (warmup.total_days as number)) {
      update.status = "completed";
    }

    await supabase.from("ip_warmup").update(update).eq("id", warmup.id);
  }
}

// ─── Prioritize Engaged Recipients ────────────────────────────────────────────
// During warmup, sort emails so engaged/active recipients go first.
// Engaged = recipients who have opens/clicks in recent logs.

export async function prioritizeByEngagement(
  supabase: any,
  emails: Record<string, unknown>[],
  userId: string
): Promise<Record<string, unknown>[]> {
  if (emails.length === 0) return emails;

  const toAddresses = emails.map((e) => e.to_address as string);

  // Find recipients who have opened or clicked in the last 30 days
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { data: engagedLogs } = await supabase
    .from("email_logs")
    .select("to_address")
    .eq("user_id", userId)
    .in("event_type", ["opened", "clicked"])
    .gte("created_at", thirtyDaysAgo)
    .in("to_address", toAddresses);

  const engagedSet = new Set((engagedLogs || []).map((l) => l.to_address));

  // Also check for recipients NOT on bounce list (clean recipients)
  const { data: bouncedLogs } = await supabase
    .from("bounces")
    .select("email")
    .eq("user_id", userId)
    .in("email", toAddresses);

  const bouncedSet = new Set((bouncedLogs || []).map((b) => b.email));

  // Score: engaged > never-bounced-unknown > previously-bounced
  return [...emails].sort((a, b) => {
    const aAddr = a.to_address as string;
    const bAddr = b.to_address as string;
    const aScore = engagedSet.has(aAddr) ? 2 : bouncedSet.has(bAddr) ? 0 : 1;
    const bScore = engagedSet.has(bAddr) ? 2 : bouncedSet.has(aAddr) ? 0 : 1;
    return bScore - aScore; // Higher score first
  });
}
