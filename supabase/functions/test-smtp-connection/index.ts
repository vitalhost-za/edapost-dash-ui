import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface TestRequest {
  server_id: string;
  hostname: string;
  ip_address: string;
  port: number;
  tls_enabled: boolean;
}

/** Low-level SMTP connection test using Deno.connect (TCP) */
async function testSmtpConnection(
  host: string,
  port: number,
  tlsEnabled: boolean,
  tlsHostname?: string,
  timeoutMs = 10_000
): Promise<{ success: boolean; banner: string | null; tls_ok: boolean; latency_ms: number; error: string | null }> {
  const start = Date.now();
  let conn: Deno.Conn | null = null;

  try {
    // Open a plain TCP connection with a timeout
    conn = await Promise.race([
      Deno.connect({ hostname: host, port }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`Connection timed out after ${timeoutMs}ms`)), timeoutMs)
      ),
    ]);

    const decoder = new TextDecoder();
    const encoder = new TextEncoder();

    // Helper: read until we get a complete SMTP response line
    const readResponse = async (): Promise<string> => {
      const buf = new Uint8Array(1024);
      const n = await conn!.read(buf);
      if (n === null) throw new Error("Connection closed unexpectedly");
      return decoder.decode(buf.subarray(0, n)).trim();
    };

    // 1) Read the SMTP banner (220 greeting)
    const banner = await readResponse();
    if (!banner.startsWith("220")) {
      return {
        success: false,
        banner,
        tls_ok: false,
        latency_ms: Date.now() - start,
        error: `Unexpected banner: ${banner.substring(0, 200)}`,
      };
    }

    // 2) Send EHLO to discover capabilities
    await conn.write(encoder.encode("EHLO edapost-test\r\n"));
    const ehloResponse = await readResponse();

    // 3) Check STARTTLS support if TLS is expected
    let tls_ok = false;
    if (tlsEnabled) {
      if (ehloResponse.includes("STARTTLS")) {
        // Send STARTTLS command
        await conn.write(encoder.encode("STARTTLS\r\n"));
        const starttlsResponse = await readResponse();
        if (starttlsResponse.startsWith("220")) {
          // Upgrade to TLS
          try {
            conn = await Deno.startTls(conn as Deno.TcpConn, { hostname: tlsHostname || host });
            tls_ok = true;
          } catch (tlsErr) {
            return {
              success: true,
              banner,
              tls_ok: false,
              latency_ms: Date.now() - start,
              error: `TLS handshake failed: ${(tlsErr as Error).message}`,
            };
          }
        }
      } else {
        // STARTTLS not advertised
        tls_ok = false;
      }
    }

    // 4) Send QUIT
    const writer = conn;
    await writer.write(encoder.encode("QUIT\r\n"));

    return {
      success: true,
      banner: banner.substring(4).trim(), // Strip "220 " prefix
      tls_ok,
      latency_ms: Date.now() - start,
      error: null,
    };
  } catch (err) {
    return {
      success: false,
      banner: null,
      tls_ok: false,
      latency_ms: Date.now() - start,
      error: (err as Error).message,
    };
  } finally {
    try {
      conn?.close();
    } catch {
      // ignore close errors
    }
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Authenticate the user
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabaseClient = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body: TestRequest = await req.json();
    const { server_id, hostname, ip_address, port, tls_enabled } = body;

    if (!hostname || !ip_address || !port) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Perform the SMTP connection test (connect via IP, use hostname for TLS verification)
    const result = await testSmtpConnection(ip_address, port, tls_enabled, hostname);

    // Update server status in the database using service role
    if (server_id) {
      const adminClient = createClient(supabaseUrl, serviceRoleKey);
      const newStatus = result.success ? "online" : "offline";
      await adminClient
        .from("smtp_servers")
        .update({
          status: newStatus,
          last_heartbeat: new Date().toISOString(),
        })
        .eq("id", server_id)
        .eq("user_id", user.id);
    }

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
