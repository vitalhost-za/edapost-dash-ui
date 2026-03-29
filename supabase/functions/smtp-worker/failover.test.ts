// deno-lint-ignore-file no-explicit-any
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function getServiceClient() {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
}

const TEST_USER_ID = "00000000-0000-0000-0000-000000failov";

async function cleanupTestData(client: any) {
  await client.from("failover_events").delete().eq("user_id", TEST_USER_ID);
  await client.from("email_queue").delete().eq("user_id", TEST_USER_ID);
  await client.from("smtp_servers").delete().eq("user_id", TEST_USER_ID);
  await client.from("user_settings").delete().eq("user_id", TEST_USER_ID);
}

Deno.test({
  name: "health-check-smtp: returns OK when no servers exist",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/health-check-smtp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${SERVICE_ROLE_KEY}`,
      },
    });
    assertEquals(res.status, 200);
    const body = await res.json();
    // Should either say "No servers to check" or return results
    assertEquals(typeof body, "object");
  },
});

Deno.test({
  name: "health-check-smtp: marks unreachable server as unhealthy",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    const client = getServiceClient();
    await cleanupTestData(client);

    // Insert a server pointing to TEST-NET (non-routable)
    const { data: server } = await client.from("smtp_servers").insert({
      user_id: TEST_USER_ID,
      hostname: "failover-test.local",
      ip_address: "192.0.2.1",
      port: 25,
      status: "online",
      is_primary: true,
    }).select().single();

    const res = await fetch(`${SUPABASE_URL}/functions/v1/health-check-smtp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${SERVICE_ROLE_KEY}`,
      },
    });
    assertEquals(res.status, 200);
    const body = await res.json();

    const result = body.results?.find((r: any) => r.server_id === server!.id);
    assertEquals(result?.healthy, false);

    // Verify status updated in DB
    const { data: updated } = await client.from("smtp_servers")
      .select("health_check_status, consecutive_failures")
      .eq("id", server!.id).single();
    assertEquals(updated?.health_check_status, "unhealthy");

    await cleanupTestData(client);
  },
});

Deno.test({
  name: "health-check-smtp: triggers failover from failed primary to healthy secondary",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    const client = getServiceClient();
    await cleanupTestData(client);

    // Settings needed for alert dispatch
    await client.from("user_settings").insert({ user_id: TEST_USER_ID });

    // Primary at threshold-1 consecutive failures → one more triggers failover
    // Use 127.0.0.1 port 1 — fails fast (connection refused instead of timeout)
    const { data: primary } = await client.from("smtp_servers").insert({
      user_id: TEST_USER_ID,
      hostname: "primary-fail.local",
      ip_address: "127.0.0.1",
      port: 1,
      status: "online",
      is_primary: true,
      failover_group: "fo-test",
      consecutive_failures: 2,
    }).select().single();

    // Healthy secondary
    const { data: secondary } = await client.from("smtp_servers").insert({
      user_id: TEST_USER_ID,
      hostname: "secondary-ok.local",
      ip_address: "192.0.2.11",
      port: 25,
      status: "online",
      is_primary: false,
      failover_group: "fo-test",
      health_check_status: "healthy",
    }).select().single();

    const res = await fetch(`${SUPABASE_URL}/functions/v1/health-check-smtp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${SERVICE_ROLE_KEY}`,
      },
    });
    assertEquals(res.status, 200);
    const body = await res.json();

    const primaryResult = body.results?.find((r: any) => r.server_id === primary!.id);
    assertEquals(primaryResult?.failoverTriggered, true);

    // Verify failover event logged
    const { data: events } = await client.from("failover_events")
      .select("*")
      .eq("user_id", TEST_USER_ID)
      .eq("from_server_id", primary!.id);
    assertEquals(events!.length > 0, true);
    assertEquals(events![0].to_server_id, secondary!.id);

    // Verify primary demoted
    const { data: prim } = await client.from("smtp_servers").select("is_primary, status").eq("id", primary!.id).single();
    assertEquals(prim?.is_primary, false);
    assertEquals(prim?.status, "degraded");

    // Verify secondary promoted
    const { data: sec } = await client.from("smtp_servers").select("is_primary").eq("id", secondary!.id).single();
    assertEquals(sec?.is_primary, true);

    await cleanupTestData(client);
  },
});

Deno.test({
  name: "health-check-smtp: re-routes queued emails on failover",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    const client = getServiceClient();
    await cleanupTestData(client);

    await client.from("user_settings").insert({ user_id: TEST_USER_ID });

    const { data: primary } = await client.from("smtp_servers").insert({
      user_id: TEST_USER_ID,
      hostname: "primary-reroute.local",
      ip_address: "192.0.2.20",
      port: 25,
      status: "online",
      is_primary: true,
      failover_group: "reroute-test",
      consecutive_failures: 2,
    }).select().single();

    const { data: secondary } = await client.from("smtp_servers").insert({
      user_id: TEST_USER_ID,
      hostname: "secondary-reroute.local",
      ip_address: "192.0.2.21",
      port: 25,
      status: "online",
      is_primary: false,
      failover_group: "reroute-test",
      health_check_status: "healthy",
    }).select().single();

    // Queue emails assigned to the primary
    await client.from("email_queue").insert([
      { user_id: TEST_USER_ID, from_address: "a@test.com", to_address: "b@test.com", subject: "Re-route 1", status: "queued", smtp_server_id: primary!.id },
      { user_id: TEST_USER_ID, from_address: "a@test.com", to_address: "c@test.com", subject: "Re-route 2", status: "retrying", smtp_server_id: primary!.id },
    ]);

    // Run health check → triggers failover → should re-route emails
    await fetch(`${SUPABASE_URL}/functions/v1/health-check-smtp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${SERVICE_ROLE_KEY}`,
      },
    });

    // Check that queued emails now point to secondary
    const { data: rerouted } = await client.from("email_queue")
      .select("smtp_server_id")
      .eq("user_id", TEST_USER_ID)
      .in("status", ["queued", "retrying"]);

    for (const email of rerouted || []) {
      assertEquals(email.smtp_server_id, secondary!.id);
    }

    await cleanupTestData(client);
  },
});
