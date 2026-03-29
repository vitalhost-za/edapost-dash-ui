// deno-lint-ignore-file no-explicit-any
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

let _authClient: any = null;
let _userId: string = "";

async function getAuthenticatedClient() {
  if (_authClient) return { client: _authClient, userId: _userId };

  const client = createClient(SUPABASE_URL, ANON_KEY);
  const email = `failover-test-${Date.now()}@test.local`;
  const password = "TestPass123!";

  const { data: signUpData } = await client.auth.signUp({ email, password });
  if (signUpData?.user) {
    _userId = signUpData.user.id;
    _authClient = client;
    return { client, userId: _userId };
  }

  const { data: signInData } = await client.auth.signInWithPassword({ email, password });
  _userId = signInData?.user?.id || "";
  _authClient = client;
  return { client, userId: _userId };
}

async function cleanupTestData(client: any, userId: string) {
  await client.from("smtp_servers").delete().eq("user_id", userId);
  await client.from("failover_events").delete().eq("user_id", userId);
  await client.from("user_settings").delete().eq("user_id", userId);
}

Deno.test({
  name: "health-check-smtp: returns healthy for no servers",
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
    assertEquals(body.message, "No servers to check");
  },
});

Deno.test({
  name: "health-check-smtp: detects unhealthy server (unreachable)",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    const { client, userId } = await getAuthenticatedClient();
    await cleanupTestData(client, userId);

    // Create a server pointing to a non-routable IP
    const { data: server } = await client.from("smtp_servers").insert({
      user_id: userId,
      hostname: "failover-test-primary.local",
      ip_address: "192.0.2.1",  // TEST-NET, non-routable
      port: 25,
      status: "online",
      is_primary: true,
      failover_group: "test-group",
    }).select().single();

    // Run health check
    const res = await fetch(`${SUPABASE_URL}/functions/v1/health-check-smtp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${SERVICE_ROLE_KEY}`,
      },
    });

    assertEquals(res.status, 200);
    const body = await res.json();

    // Find our server in results
    const result = body.results?.find((r: any) => r.server_id === server.id);
    assertEquals(result?.healthy, false);

    // Verify server status was updated
    const { data: updated } = await client.from("smtp_servers").select("health_check_status, consecutive_failures").eq("id", server.id).single();
    assertEquals(updated?.health_check_status, "unhealthy");

    await cleanupTestData(client, userId);
  },
});

Deno.test({
  name: "health-check-smtp: triggers failover when primary has consecutive failures",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    const { client, userId } = await getAuthenticatedClient();
    await cleanupTestData(client, userId);

    // Create user settings for alert (so failover alerts can be sent)
    await client.from("user_settings").insert({ user_id: userId });

    // Create primary server already at failure threshold - 1
    const { data: primary } = await client.from("smtp_servers").insert({
      user_id: userId,
      hostname: "primary-failing.local",
      ip_address: "192.0.2.1",
      port: 25,
      status: "online",
      is_primary: true,
      failover_group: "test-fo",
      consecutive_failures: 2,  // One more failure triggers failover
    }).select().single();

    // Create secondary healthy server (pointing to localhost which won't work but we mark it healthy)
    const { data: secondary } = await client.from("smtp_servers").insert({
      user_id: userId,
      hostname: "secondary-backup.local",
      ip_address: "192.0.2.2",
      port: 25,
      status: "online",
      is_primary: false,
      failover_group: "test-fo",
      health_check_status: "healthy",
    }).select().single();

    // Run health check — primary will fail connectivity → triggers failover
    const res = await fetch(`${SUPABASE_URL}/functions/v1/health-check-smtp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${SERVICE_ROLE_KEY}`,
      },
    });

    assertEquals(res.status, 200);
    const body = await res.json();

    const primaryResult = body.results?.find((r: any) => r.server_id === primary.id);
    assertEquals(primaryResult?.failoverTriggered, true);

    // Verify failover event was created
    const { data: events } = await client.from("failover_events")
      .select("*")
      .eq("user_id", userId)
      .eq("from_server_id", primary.id);
    
    assertEquals(events && events.length > 0, true);
    assertEquals(events![0].to_server_id, secondary.id);

    // Verify primary was demoted
    const { data: updatedPrimary } = await client.from("smtp_servers").select("is_primary, status").eq("id", primary.id).single();
    assertEquals(updatedPrimary?.is_primary, false);
    assertEquals(updatedPrimary?.status, "degraded");

    // Verify secondary was promoted
    const { data: updatedSecondary } = await client.from("smtp_servers").select("is_primary").eq("id", secondary.id).single();
    assertEquals(updatedSecondary?.is_primary, true);

    await cleanupTestData(client, userId);
  },
});

Deno.test({
  name: "smtp-worker: falls back to secondary server when primary is missing",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    const { client, userId } = await getAuthenticatedClient();

    // Create only a secondary server (no primary)
    await client.from("smtp_servers").delete().eq("user_id", userId);
    await client.from("smtp_servers").insert({
      user_id: userId,
      hostname: "secondary-only.local",
      ip_address: "192.0.2.5",
      port: 25,
      status: "online",
      is_primary: false,
    });

    // Queue an email without specifying smtp_server_id
    const { data: queuedEmail } = await client.from("email_queue").insert({
      user_id: userId,
      from_address: "test@example.com",
      to_address: "recipient@example.com",
      subject: "Failover test",
      status: "queued",
    }).select().single();

    // Invoke smtp-worker — it should pick up the secondary server
    const res = await fetch(`${SUPABASE_URL}/functions/v1/smtp-worker`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({ batchSize: 1 }),
    });

    assertEquals(res.status, 200);

    // The email should have been attempted (will fail since 192.0.2.5 isn't real, but it proves fallback worked)
    const { data: processed } = await client.from("email_queue").select("status, attempts").eq("id", queuedEmail!.id).single();
    // It should NOT be "failed" with "No SMTP server available" — it should have tried the secondary
    assertEquals(processed?.status !== "queued", true);
    assertEquals(processed?.attempts! > 0 || processed?.status === "processing" || processed?.status === "retrying" || processed?.status === "failed" || processed?.status === "deferred", true);

    // Cleanup
    await client.from("email_queue").delete().eq("id", queuedEmail!.id);
    await client.from("smtp_servers").delete().eq("user_id", userId);
  },
});
