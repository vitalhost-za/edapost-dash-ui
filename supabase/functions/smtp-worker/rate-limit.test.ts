/**
 * Integration tests: rate limiting under load
 *
 * Verifies that the smtp-worker correctly defers emails when
 * per-domain rate limits (per-minute and per-hour) are exceeded,
 * and that wildcard (*) fallback limits are respected.
 *
 * These tests hit the live edge function and database.
 */

import "https://deno.land/std@0.224.0/dotenv/load.ts";
import {
  assertEquals,
  assertStringIncludes,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY")!;
const WORKER_URL = `${SUPABASE_URL}/functions/v1/smtp-worker`;

// ── Shared auth session (initialized once) ─────────────────────────────────────

let _cachedAuth: { supabase: any; user: any; token: string } | null = null;

async function getAuthenticatedClient() {
  if (_cachedAuth) return _cachedAuth;

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const email = "rate-limit-test@edapost.test";
  const password = "TestPassword123!";

  // Try sign in first, then sign up if needed
  const { data: signIn, error: signInError } = await supabase.auth.signInWithPassword({ email, password });
  if (!signInError && signIn.user) {
    _cachedAuth = { supabase, user: signIn.user, token: signIn.session!.access_token };
    return _cachedAuth;
  }

  const { error: signUpError } = await supabase.auth.signUp({ email, password });
  if (signUpError && !signUpError.message.includes("already registered")) {
    throw signUpError;
  }

  const { data: signIn2, error: signInError2 } = await supabase.auth.signInWithPassword({ email, password });
  if (signInError2) throw signInError2;

  _cachedAuth = { supabase, user: signIn2.user!, token: signIn2.session!.access_token };
  return _cachedAuth;
}

async function cleanupTestData(supabase: any, userId: string) {
  // Clean in order to avoid FK issues
  await supabase.from("domain_send_tracking").delete().eq("user_id", userId);
  await supabase.from("email_queue").delete().eq("user_id", userId);
  await supabase.from("domain_rate_limits").delete().eq("user_id", userId);
}

async function queueEmail(supabase: any, userId: string, toDomain: string, index: number) {
  const { data, error } = await supabase.from("email_queue").insert({
    user_id: userId,
    from_address: "test@edapost.test",
    to_address: `recipient${index}@${toDomain}`,
    subject: `Rate limit test #${index}`,
    html_body: `<p>Test email ${index}</p>`,
    status: "queued",
  }).select("id").single();

  if (error) throw error;
  return data.id as string;
}

async function invokeWorker(token: string): Promise<Response> {
  const res = await fetch(WORKER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({}),
  });
  return res;
}

async function getQueueItem(supabase: any, id: string) {
  const { data, error } = await supabase
    .from("email_queue")
    .select("id, status, error_message")
    .eq("id", id)
    .single();
  if (error) throw error;
  return data;
}

// ── Tests ──────────────────────────────────────────────────────────────────────

Deno.test({ name: "Rate limiting - per-minute limit defers excess emails", sanitizeResources: false, sanitizeOps: false, fn: async () => {
  const { supabase, user, token } = await getAuthenticatedClient();
  const userId = user.id;

  try {
    await cleanupTestData(supabase, userId);

    const testDomain = "ratelimit-test-min.example";

    // Set a very low per-minute limit
    await supabase.from("domain_rate_limits").insert({
      user_id: userId,
      domain: testDomain,
      max_per_minute: 2,
      max_per_hour: 1000,
      is_active: true,
    });

    // Pre-populate tracking records to simulate 2 already sent in the last minute
    const now = new Date();
    for (let i = 0; i < 2; i++) {
      await supabase.from("domain_send_tracking").insert({
        user_id: userId,
        domain: testDomain,
        sent_at: new Date(now.getTime() - (i * 5000)).toISOString(),
      });
    }

    // Queue one more email to this domain — should be deferred
    const queueId = await queueEmail(supabase, userId, testDomain, 1);

    // Invoke the worker
    const res = await invokeWorker(token);
    await res.text(); // consume body

    // Check that the queued email was deferred
    const item = await getQueueItem(supabase, queueId);
    assertEquals(item.status, "deferred", "Email should be deferred when per-minute limit exceeded");
    assertStringIncludes(item.error_message || "", "Rate limit", "Error message should mention rate limit");
  } finally {
    await cleanupTestData(supabase, userId);
  }
});

Deno.test("Rate limiting - per-hour limit defers excess emails", async () => {
  const { supabase, user, token } = await getAuthenticatedClient();
  const userId = user.id;

  try {
    await cleanupTestData(supabase, userId);

    const testDomain = "ratelimit-test-hr.example";

    // Set low per-hour limit, generous per-minute
    await supabase.from("domain_rate_limits").insert({
      user_id: userId,
      domain: testDomain,
      max_per_minute: 100,
      max_per_hour: 3,
      is_active: true,
    });

    // Pre-populate 3 tracking records spread across the last hour
    const now = new Date();
    for (let i = 0; i < 3; i++) {
      await supabase.from("domain_send_tracking").insert({
        user_id: userId,
        domain: testDomain,
        sent_at: new Date(now.getTime() - (i * 10 * 60 * 1000)).toISOString(), // every 10 min
      });
    }

    const queueId = await queueEmail(supabase, userId, testDomain, 1);

    const res = await invokeWorker(token);
    await res.text();

    const item = await getQueueItem(supabase, queueId);
    assertEquals(item.status, "deferred", "Email should be deferred when per-hour limit exceeded");
    assertStringIncludes(item.error_message || "", "Rate limit", "Error message should mention rate limit");
  } finally {
    await cleanupTestData(supabase, userId);
  }
});

Deno.test("Rate limiting - wildcard (*) fallback limit applies", async () => {
  const { supabase, user, token } = await getAuthenticatedClient();
  const userId = user.id;

  try {
    await cleanupTestData(supabase, userId);

    const testDomain = "wildcard-test.example";

    // Set a wildcard limit only — no domain-specific rule
    await supabase.from("domain_rate_limits").insert({
      user_id: userId,
      domain: "*",
      max_per_minute: 1,
      max_per_hour: 1000,
      is_active: true,
    });

    // Pre-populate 1 tracking record for the domain
    await supabase.from("domain_send_tracking").insert({
      user_id: userId,
      domain: testDomain,
      sent_at: new Date().toISOString(),
    });

    const queueId = await queueEmail(supabase, userId, testDomain, 1);

    const res = await invokeWorker(token);
    await res.text();

    const item = await getQueueItem(supabase, queueId);
    assertEquals(item.status, "deferred", "Email should be deferred via wildcard rate limit");
    assertStringIncludes(item.error_message || "", "Rate limit");
  } finally {
    await cleanupTestData(supabase, userId);
  }
});

Deno.test("Rate limiting - emails allowed when under limit", async () => {
  const { supabase, user, token } = await getAuthenticatedClient();
  const userId = user.id;

  try {
    await cleanupTestData(supabase, userId);

    const testDomain = "allowed-test.example";

    // Set generous limits
    await supabase.from("domain_rate_limits").insert({
      user_id: userId,
      domain: testDomain,
      max_per_minute: 100,
      max_per_hour: 1000,
      is_active: true,
    });

    // No pre-existing tracking records — well under limit
    const queueId = await queueEmail(supabase, userId, testDomain, 1);

    const res = await invokeWorker(token);
    await res.text();

    const item = await getQueueItem(supabase, queueId);
    // Should NOT be deferred — it may be "sending", "sent", or "failed" (due to fake SMTP)
    // but definitely not "deferred" for rate limiting
    const nonDeferredStatuses = ["queued", "sending", "sent", "delivered", "failed"];
    assertEquals(
      nonDeferredStatuses.includes(item.status) || item.status !== "deferred",
      true,
      `Email should not be deferred when under limit, got: ${item.status}`
    );
  } finally {
    await cleanupTestData(supabase, userId);
  }
});

Deno.test("Rate limiting - inactive rule does not block sends", async () => {
  const { supabase, user, token } = await getAuthenticatedClient();
  const userId = user.id;

  try {
    await cleanupTestData(supabase, userId);

    const testDomain = "inactive-rule.example";

    // Set a strict limit but mark it inactive
    await supabase.from("domain_rate_limits").insert({
      user_id: userId,
      domain: testDomain,
      max_per_minute: 1,
      max_per_hour: 1,
      is_active: false,
    });

    // Pre-populate tracking to exceed the (inactive) limit
    for (let i = 0; i < 5; i++) {
      await supabase.from("domain_send_tracking").insert({
        user_id: userId,
        domain: testDomain,
        sent_at: new Date().toISOString(),
      });
    }

    const queueId = await queueEmail(supabase, userId, testDomain, 1);

    const res = await invokeWorker(token);
    await res.text();

    const item = await getQueueItem(supabase, queueId);
    // Should not be deferred since the rule is inactive
    assertEquals(
      item.status !== "deferred" || !(item.error_message || "").includes("Rate limit"),
      true,
      `Inactive rule should not defer emails, got status: ${item.status}`
    );
  } finally {
    await cleanupTestData(supabase, userId);
  }
});

Deno.test("Rate limiting - burst of emails under load", async () => {
  const { supabase, user, token } = await getAuthenticatedClient();
  const userId = user.id;

  try {
    await cleanupTestData(supabase, userId);

    const testDomain = "burst-test.example";

    // Allow 3 per minute
    await supabase.from("domain_rate_limits").insert({
      user_id: userId,
      domain: testDomain,
      max_per_minute: 3,
      max_per_hour: 1000,
      is_active: true,
    });

    // Queue 6 emails — first 3 should process, last 3 should be deferred
    const queueIds: string[] = [];
    for (let i = 0; i < 6; i++) {
      queueIds.push(await queueEmail(supabase, userId, testDomain, i));
    }

    // Invoke worker to process the batch
    const res = await invokeWorker(token);
    await res.text();

    // Check results
    let deferredCount = 0;
    let processedCount = 0;
    for (const id of queueIds) {
      const item = await getQueueItem(supabase, id);
      if (item.status === "deferred" && (item.error_message || "").includes("Rate limit")) {
        deferredCount++;
      } else {
        processedCount++;
      }
    }

    // At least some should be deferred (the ones beyond the limit)
    assertEquals(deferredCount >= 3, true, `Expected at least 3 deferred, got ${deferredCount}`);
    // At least some should have been processed or attempted
    assertEquals(processedCount >= 1, true, `Expected at least 1 processed, got ${processedCount}`);
  } finally {
    await cleanupTestData(supabase, userId);
  }
});
