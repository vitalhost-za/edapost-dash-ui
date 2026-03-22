import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
      throw new Error("Missing environment configuration");
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // Support both GET (one-click List-Unsubscribe) and POST (List-Unsubscribe-Post)
    let email: string | null = null;
    let userId: string | null = null;
    let listId: string | null = null;

    if (req.method === "GET") {
      const url = new URL(req.url);
      email = url.searchParams.get("email");
      userId = url.searchParams.get("uid");
      listId = url.searchParams.get("list");
    } else if (req.method === "POST") {
      const contentType = req.headers.get("content-type") || "";

      if (contentType.includes("application/x-www-form-urlencoded")) {
        // RFC 8058 List-Unsubscribe-Post: List-Unsubscribe=One-Click
        const formData = await req.text();
        const params = new URLSearchParams(formData);
        // The actual email/uid come from the URL query params
        const url = new URL(req.url);
        email = url.searchParams.get("email") || params.get("email");
        userId = url.searchParams.get("uid") || params.get("uid");
        listId = url.searchParams.get("list") || params.get("list");
      } else {
        const body = await req.json();
        email = body.email || null;
        userId = body.user_id || null;
        listId = body.list_id || null;
      }
    }

    if (!email || !userId) {
      return new Response(
        JSON.stringify({ error: "Missing email or user identifier" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Check if already suppressed
    const { count } = await supabase
      .from("suppression_list")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("email", normalizedEmail);

    if ((count ?? 0) === 0) {
      // Add to suppression list
      await supabase.from("suppression_list").insert({
        user_id: userId,
        email: normalizedEmail,
        reason: "unsubscribe",
        added_by: "List-Unsubscribe",
      });
    }

    // Remove from contact list if list_id provided
    if (listId) {
      await supabase
        .from("contact_list_members")
        .delete()
        .eq("list_id", listId)
        .eq("email", normalizedEmail)
        .eq("user_id", userId);
    }

    // Log the unsubscribe event
    await supabase.from("email_logs").insert({
      user_id: userId,
      event_type: "unsubscribed",
      from_address: "system@edapost",
      to_address: normalizedEmail,
      subject: "Unsubscribe request processed",
      metadata: { source: "list-unsubscribe", list_id: listId },
    });

    // Return a simple confirmation page for browser-based unsubscribes
    if (req.method === "GET") {
      const html = `<!DOCTYPE html><html><head><title>Unsubscribed</title>
        <style>body{font-family:system-ui,sans-serif;display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0;background:#f8f9fa}
        .card{background:#fff;padding:3rem;border-radius:12px;box-shadow:0 2px 12px rgba(0,0,0,.08);text-align:center;max-width:400px}
        h1{color:#1a1a2e;margin:0 0 .5rem}p{color:#666;margin:0}</style></head>
        <body><div class="card"><h1>✓ Unsubscribed</h1><p>You have been successfully unsubscribed from future emails.</p></div></body></html>`;
      return new Response(html, {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "text/html; charset=utf-8" },
      });
    }

    return new Response(
      JSON.stringify({ success: true, message: `${normalizedEmail} unsubscribed` }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Unsubscribe error:", error);
    const msg = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
