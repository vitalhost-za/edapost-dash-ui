// deno-lint-ignore-file no-explicit-any
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

let testUserId = "";

async function ensureTestUser() {
  if (testUserId) return testUserId;
  const email = `failover-${Date.now()}@test.local`;
  const { data } = await supabase.auth.admin.createUser({
    email,
    password: "TestPass123!",
    email_confirm: true,
  });
  testUserId = data.user!.id;
  return testUserId;
}

async function cleanup() {
  if (!testUserId) return;
  await supabase.from("failover_events").delete().eq("user_id", testUserId);
  await supabase.from("email_queue").delete().eq("user_id", testUserId);
  await supabase.from("smtp_servers").delete().eq("user_id", testUserId);
  await supabase.from("user_settings").delete().eq("user_id", testUserId);
}

Deno.test({
  name: "health-check-smtp: returns OK for no servers",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/health-check-smtp`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${SERVICE_ROLE_KEY}` },
    });
    assertEquals(res.status, 200);
    await res.json();
  },
});

Deno.test({
  name: "health-check-smtp: marks unreachable server unhealthy",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    const uid = await ensureTestUser();
    await cleanup();

    const { data: server, error } = await supabase.from("smtp_servers").insert({
      user_id: uid,
      hostname: "unreachable.local",
      ip_address: "127.0.0.1",
      port: 1,
      status: "online",
      is_primary: true,
    }).select().single();

    if (error) throw new Error(`Insert failed: ${error.message}`);

    const res = await fetch(`${SUPABASE_URL}/functions/v1/health-check-smtp`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${SERVICE_ROLE_KEY}` },
    });
    assertEquals(res.status, 200);
    const body = await res.json();

    const result = body.results?.find((r: any) => r.server_id === server.id);
    assertEquals(result?.healthy, false);

    const { data: updated } = await supabase.from("smtp_servers")
      .select("health_check_status, consecutive_failures")
      .eq("id", server.id).single();
    assertEquals(updated?.health_check_status, "unhealthy");

    await cleanup();
  },
});

Deno.test({
  name: "health-check-smtp: triggers failover from failed primary to healthy secondary",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    const uid = await ensureTestUser();
    await cleanup();

    await supabase.from("user_settings").insert({ user_id: uid });

    const { data: primary, error: pErr } = await supabase.from("smtp_servers").insert({
      user_id: uid,
      hostname: "primary-failing.local",
      ip_address: "127.0.0.1",
      port: 1,
      status: "online",
      is_primary: true,
      failover_group: "test-fo",
      consecutive_failures: 2,
    }).select().single();
    if (pErr) throw new Error(`Primary insert: ${pErr.message}`);

    const { data: secondary, error: sErr } = await supabase.from("smtp_servers").insert({
      user_id: uid,
      hostname: "secondary-ok.local",
      ip_address: "127.0.0.2",
      port: 25,
      status: "online",
      is_primary: false,
      failover_group: "test-fo",
      health_check_status: "healthy",
    }).select().single();
    if (sErr) throw new Error(`Secondary insert: ${sErr.message}`);

    const res = await fetch(`${SUPABASE_URL}/functions/v1/health-check-smtp`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${SERVICE_ROLE_KEY}` },
    });
    assertEquals(res.status, 200);
    const body = await res.json();

    const primaryResult = body.results?.find((r: any) => r.server_id === primary.id);
    assertEquals(primaryResult?.failoverTriggered, true);

    // Verify failover event logged
    const { data: events } = await supabase.from("failover_events")
      .select("*").eq("user_id", uid).eq("from_server_id", primary.id);
    assertEquals(events!.length > 0, true);
    assertEquals(events![0].to_server_id, secondary.id);

    // Verify primary demoted
    const { data: prim } = await supabase.from("smtp_servers").select("is_primary, status").eq("id", primary.id).single();
    assertEquals(prim?.is_primary, false);
    assertEquals(prim?.status, "degraded");

    // Verify secondary promoted
    const { data: sec } = await supabase.from("smtp_servers").select("is_primary").eq("id", secondary.id).single();
    assertEquals(sec?.is_primary, true);

    await cleanup();
  },
});

Deno.test({
  name: "health-check-smtp: re-routes queued emails on failover",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    const uid = await ensureTestUser();
    await cleanup();

    await supabase.from("user_settings").insert({ user_id: uid });

    const { data: primary } = await supabase.from("smtp_servers").insert({
      user_id: uid,
      hostname: "primary-rr.local",
      ip_address: "127.0.0.1",
      port: 1,
      status: "online",
      is_primary: true,
      failover_group: "rr-test",
      consecutive_failures: 2,
    }).select().single();

    const { data: secondary } = await supabase.from("smtp_servers").insert({
      user_id: uid,
      hostname: "secondary-rr.local",
      ip_address: "127.0.0.2",
      port: 25,
      status: "online",
      is_primary: false,
      failover_group: "rr-test",
      health_check_status: "healthy",
    }).select().single();

    // Queue emails on the primary
    await supabase.from("email_queue").insert([
      { user_id: uid, from_address: "a@t.com", to_address: "b@t.com", subject: "RR1", status: "queued", smtp_server_id: primary!.id },
      { user_id: uid, from_address: "a@t.com", to_address: "c@t.com", subject: "RR2", status: "retrying", smtp_server_id: primary!.id },
    ]);

    await fetch(`${SUPABASE_URL}/functions/v1/health-check-smtp`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${SERVICE_ROLE_KEY}` },
    });

    const { data: rerouted } = await supabase.from("email_queue")
      .select("smtp_server_id")
      .eq("user_id", uid)
      .in("status", ["queued", "retrying"]);

    for (const email of rerouted || []) {
      assertEquals(email.smtp_server_id, secondary!.id);
    }

    await cleanup();
  },
});
