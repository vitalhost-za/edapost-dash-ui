import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assertEquals, assertExists } from "https://deno.land/std@0.224.0/assert/mod.ts";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY")!;

const FUNCTION_URL = `${SUPABASE_URL}/functions/v1/process-unsubscribe`;

Deno.test("process-unsubscribe - CORS preflight returns 200", async () => {
  const res = await fetch(FUNCTION_URL, { method: "OPTIONS" });
  await res.text();
  assertEquals(res.status, 200);
});

Deno.test("process-unsubscribe - rejects missing email param", async () => {
  const res = await fetch(`${FUNCTION_URL}?uid=test-uid`, { method: "GET" });
  const body = await res.json();
  assertEquals(res.status, 400);
  assertEquals(body.error, "Missing email or user identifier");
});

Deno.test("process-unsubscribe - rejects missing uid param", async () => {
  const res = await fetch(`${FUNCTION_URL}?email=test@example.com`, { method: "GET" });
  const body = await res.json();
  assertEquals(res.status, 400);
  assertEquals(body.error, "Missing email or user identifier");
});

Deno.test("process-unsubscribe - GET with valid params returns HTML confirmation", async () => {
  const params = new URLSearchParams({
    email: "unsub-test@example.invalid",
    uid: "00000000-0000-0000-0000-000000000099",
  });
  const res = await fetch(`${FUNCTION_URL}?${params}`, { method: "GET" });
  const body = await res.text();
  assertEquals(res.status, 200);
  assertEquals(res.headers.get("content-type")?.includes("text/html"), true);
  assertEquals(body.includes("Unsubscribed"), true);
});

Deno.test("process-unsubscribe - POST JSON with valid params returns success", async () => {
  const res = await fetch(FUNCTION_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: "unsub-post@example.invalid",
      user_id: "00000000-0000-0000-0000-000000000099",
    }),
  });
  const body = await res.json();
  assertEquals(res.status, 200);
  assertEquals(body.success, true);
});

Deno.test("process-unsubscribe - POST form (RFC 8058) with query params returns success", async () => {
  const params = new URLSearchParams({
    email: "unsub-rfc@example.invalid",
    uid: "00000000-0000-0000-0000-000000000099",
  });
  const res = await fetch(`${FUNCTION_URL}?${params}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: "List-Unsubscribe=One-Click",
  });
  const body = await res.json();
  assertEquals(res.status, 200);
  assertEquals(body.success, true);
});
