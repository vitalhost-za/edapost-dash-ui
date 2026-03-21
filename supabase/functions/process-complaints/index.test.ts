import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assertEquals, assertExists } from "https://deno.land/std@0.224.0/assert/mod.ts";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY")!;

const FUNCTION_URL = `${SUPABASE_URL}/functions/v1/process-complaints`;

Deno.test("process-complaints - handles CORS preflight", async () => {
  const res = await fetch(FUNCTION_URL, { method: "OPTIONS" });
  await res.text();
  assertEquals(res.status, 200);
  const allowHeaders = res.headers.get("Access-Control-Allow-Headers");
  assertExists(allowHeaders);
});

Deno.test("process-complaints - rejects missing user_id", async () => {
  const res = await fetch(FUNCTION_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "test@example.com" }),
  });
  const body = await res.json();
  assertEquals(res.status, 400);
  assertExists(body.error);
});

Deno.test("process-complaints - rejects when no email can be determined", async () => {
  const res = await fetch(FUNCTION_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: "00000000-0000-0000-0000-000000000001" }),
  });
  const body = await res.json();
  assertEquals(res.status, 400);
  assertExists(body.error);
});

Deno.test("process-complaints - processes complaint with direct email", async () => {
  const res = await fetch(FUNCTION_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      user_id: "00000000-0000-0000-0000-000000000001",
      email: "complaint-test@example.invalid",
      feedback_type: "abuse",
    }),
  });
  const body = await res.json();
  assertEquals(res.status, 200);
  assertEquals(body.success, true);
  assertEquals(body.email, "complaint-test@example.invalid");
  assertEquals(body.suppressed, true);
  assertEquals(body.arf_parsed, false);
});

Deno.test("process-complaints - parses ARF report and extracts email", async () => {
  const arfMessage = [
    "Feedback-Type: abuse",
    "User-Agent: FBL/1.0",
    "Version: 1",
    "Original-Mail-From: sender@example.com",
    "Original-Rcpt-To: victim@example.invalid",
    "Reported-Domain: example.com",
    "Source-IP: 192.0.2.1",
    "",
    "From: sender@example.com",
    "To: victim@example.invalid",
    "Subject: Buy stuff now",
    "Message-ID: <abc123@example.com>",
  ].join("\r\n");

  const res = await fetch(FUNCTION_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      user_id: "00000000-0000-0000-0000-000000000001",
      raw_arf_message: arfMessage,
    }),
  });
  const body = await res.json();
  assertEquals(res.status, 200);
  assertEquals(body.success, true);
  assertEquals(body.email, "victim@example.invalid");
  assertEquals(body.feedback_type, "abuse");
  assertEquals(body.arf_parsed, true);
  assertEquals(body.suppressed, true);
});

Deno.test("process-complaints - uses direct email over ARF when both provided", async () => {
  const arfMessage = [
    "Feedback-Type: fraud",
    "Original-Rcpt-To: arf-victim@example.invalid",
  ].join("\r\n");

  const res = await fetch(FUNCTION_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      user_id: "00000000-0000-0000-0000-000000000001",
      email: "direct-email@example.invalid",
      raw_arf_message: arfMessage,
    }),
  });
  const body = await res.json();
  assertEquals(res.status, 200);
  assertEquals(body.email, "direct-email@example.invalid");
  assertEquals(body.feedback_type, "fraud");
});

Deno.test("process-complaints - rejects invalid JSON", async () => {
  const res = await fetch(FUNCTION_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "not-json",
  });
  const body = await res.json();
  assertEquals(res.status, 500);
  assertExists(body.error);
});
