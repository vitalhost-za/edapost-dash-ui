import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assertEquals, assertExists } from "https://deno.land/std@0.224.0/assert/mod.ts";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY")!;

const FUNCTION_URL = `${SUPABASE_URL}/functions/v1/process-bounces`;

Deno.test("process-bounces - handles CORS preflight", async () => {
  const res = await fetch(FUNCTION_URL, { method: "OPTIONS" });
  await res.text();
  assertEquals(res.status, 200);
  const allowHeaders = res.headers.get("Access-Control-Allow-Headers");
  assertExists(allowHeaders);
});

Deno.test("process-bounces - rejects missing user_id and email", async () => {
  const res = await fetch(FUNCTION_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  const body = await res.json();
  assertEquals(res.status, 400);
  assertExists(body.error);
});

Deno.test("process-bounces - rejects missing email", async () => {
  const res = await fetch(FUNCTION_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: "00000000-0000-0000-0000-000000000000" }),
  });
  const body = await res.json();
  assertEquals(res.status, 400);
  assertExists(body.error);
});

Deno.test("process-bounces - classifies hard bounce with 550 code", async () => {
  const res = await fetch(FUNCTION_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      user_id: "00000000-0000-0000-0000-000000000001",
      email: "hardbounce-test@example.invalid",
      response_code: "550",
      error_text: "User unknown",
    }),
  });
  const body = await res.json();
  assertEquals(res.status, 200);
  assertEquals(body.classification, "hard");
  assertEquals(body.suppressed, true);
});

Deno.test("process-bounces - classifies soft bounce with 450 code", async () => {
  const res = await fetch(FUNCTION_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      user_id: "00000000-0000-0000-0000-000000000001",
      email: "softbounce-test@example.invalid",
      response_code: "450",
      error_text: "Try again later",
    }),
  });
  const body = await res.json();
  assertEquals(res.status, 200);
  assertEquals(body.classification, "soft");
});

Deno.test("process-bounces - parses DSN message when provided", async () => {
  const dsnMessage = [
    "Status: 5.1.1",
    "Diagnostic-Code: smtp; 550 User unknown",
    "Action: failed",
    "Final-Recipient: rfc822; dsn-test@example.invalid",
  ].join("\r\n");

  const res = await fetch(FUNCTION_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      user_id: "00000000-0000-0000-0000-000000000001",
      email: "dsn-test@example.invalid",
      dsn_message: dsnMessage,
    }),
  });
  const body = await res.json();
  assertEquals(res.status, 200);
  assertEquals(body.classification, "hard");
});

Deno.test("process-bounces - rejects invalid JSON", async () => {
  const res = await fetch(FUNCTION_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "not-json",
  });
  const body = await res.json();
  assertEquals(res.status, 500);
  assertExists(body.error);
});
