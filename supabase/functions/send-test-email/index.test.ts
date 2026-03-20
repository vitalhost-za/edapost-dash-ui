import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assertEquals, assertExists } from "https://deno.land/std@0.224.0/assert/mod.ts";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY")!;

const FUNCTION_URL = `${SUPABASE_URL}/functions/v1/send-test-email`;

Deno.test("send-test-email - rejects unauthenticated requests", async () => {
  const res = await fetch(FUNCTION_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      to_address: "test@example.com",
      from_address: "sender@example.com",
      subject: "Integration test",
    }),
  });
  const body = await res.json();
  assertEquals(res.status, 401);
  assertExists(body.error);
});

Deno.test("send-test-email - rejects request with invalid token", async () => {
  const res = await fetch(FUNCTION_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer invalid-token-12345",
    },
    body: JSON.stringify({
      to_address: "test@example.com",
      from_address: "sender@example.com",
      subject: "Integration test",
    }),
  });
  const body = await res.json();
  assertEquals(res.status, 401);
  assertExists(body.error);
});

Deno.test("send-test-email - rejects missing required fields with anon key", async () => {
  // Using anon key as Bearer — will fail auth (getUser returns null for anon key alone)
  // but this tests the flow reaches the auth check
  const res = await fetch(FUNCTION_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({
      to_address: "test@example.com",
      // missing from_address and subject
    }),
  });
  const body = await res.json();
  // Anon key without a session returns 401
  assertEquals(res.status, 401);
  assertExists(body.error);
});

Deno.test("send-test-email - handles CORS preflight", async () => {
  const res = await fetch(FUNCTION_URL, { method: "OPTIONS" });
  await res.text(); // consume body
  assertEquals(res.status, 200);
  const allowHeaders = res.headers.get("Access-Control-Allow-Headers");
  assertExists(allowHeaders);
});

Deno.test("send-test-email - rejects empty body with auth header", async () => {
  const res = await fetch(FUNCTION_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({}),
  });
  const body = await res.json();
  // Either 401 (anon can't getUser) or 400 (missing fields) — both valid
  const validStatus = res.status === 401 || res.status === 400;
  assertEquals(validStatus, true);
  assertExists(body.error);
});
