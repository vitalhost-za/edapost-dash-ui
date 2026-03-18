import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface DnsCheckRequest {
  domain_id: string;
  domain: string;
  dkim_selector?: string;
}

interface RecordResult {
  status: "valid" | "invalid" | "missing";
  records: string[];
  details: string;
}

async function queryDns(name: string, type: string): Promise<string[]> {
  try {
    const resp = await fetch(
      `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(name)}&type=${type}`,
      { headers: { Accept: "application/dns-json" } }
    );
    const data = await resp.json();
    if (!data.Answer || data.Answer.length === 0) return [];
    return data.Answer.map((a: { data: string }) => a.data.replace(/^"|"$/g, ""));
  } catch {
    return [];
  }
}

async function checkSpf(domain: string): Promise<RecordResult> {
  const records = await queryDns(domain, "TXT");
  const spfRecords = records.filter((r) => r.startsWith("v=spf1"));

  if (spfRecords.length === 0) {
    return { status: "missing", records: [], details: "No SPF record found. Add a TXT record with v=spf1." };
  }
  if (spfRecords.length > 1) {
    return { status: "invalid", records: spfRecords, details: "Multiple SPF records found. Only one is allowed per domain." };
  }

  const spf = spfRecords[0];
  if (spf.endsWith("-all")) {
    return { status: "valid", records: spfRecords, details: "SPF record found with strict policy (-all)." };
  }
  if (spf.endsWith("~all")) {
    return { status: "valid", records: spfRecords, details: "SPF record found with soft-fail policy (~all). Consider -all for stricter enforcement." };
  }
  if (spf.endsWith("+all") || spf.endsWith("?all")) {
    return { status: "invalid", records: spfRecords, details: "SPF record uses a permissive policy. Use ~all or -all." };
  }
  return { status: "valid", records: spfRecords, details: "SPF record found." };
}

async function checkDkim(domain: string, selector: string): Promise<RecordResult> {
  const dkimDomain = `${selector}._domainkey.${domain}`;
  const records = await queryDns(dkimDomain, "TXT");
  const dkimRecords = records.filter((r) => r.includes("v=DKIM1") || r.includes("k=rsa") || r.includes("p="));

  if (dkimRecords.length === 0) {
    return {
      status: "missing",
      records: [],
      details: `No DKIM record found at ${dkimDomain}. Ensure a TXT record exists for the selector "${selector}".`,
    };
  }

  const rec = dkimRecords[0];
  if (rec.includes("p=") && !rec.includes("p=;") && !rec.endsWith("p=")) {
    return { status: "valid", records: dkimRecords, details: `DKIM record found at ${dkimDomain} with a valid public key.` };
  }
  return { status: "invalid", records: dkimRecords, details: "DKIM record found but the public key appears empty or revoked." };
}

async function checkDmarc(domain: string): Promise<RecordResult> {
  const records = await queryDns(`_dmarc.${domain}`, "TXT");
  const dmarcRecords = records.filter((r) => r.startsWith("v=DMARC1"));

  if (dmarcRecords.length === 0) {
    return { status: "missing", records: [], details: "No DMARC record found. Add a TXT record at _dmarc." + domain };
  }

  const rec = dmarcRecords[0];
  if (rec.includes("p=reject")) {
    return { status: "valid", records: dmarcRecords, details: "DMARC policy set to reject — strongest protection." };
  }
  if (rec.includes("p=quarantine")) {
    return { status: "valid", records: dmarcRecords, details: "DMARC policy set to quarantine. Consider p=reject for maximum protection." };
  }
  if (rec.includes("p=none")) {
    return { status: "invalid", records: dmarcRecords, details: "DMARC policy is p=none (monitoring only). Set p=quarantine or p=reject for enforcement." };
  }
  return { status: "valid", records: dmarcRecords, details: "DMARC record found." };
}

async function checkMx(domain: string): Promise<RecordResult> {
  const records = await queryDns(domain, "MX");

  if (records.length === 0) {
    return { status: "missing", records: [], details: "No MX records found for this domain." };
  }

  return {
    status: "valid",
    records,
    details: `${records.length} MX record(s) found.`,
  };
}

async function checkPtr(ipAddress: string): Promise<RecordResult> {
  // Build reverse DNS name
  const parts = ipAddress.split(".");
  if (parts.length !== 4) {
    return { status: "invalid", records: [], details: "PTR check only supports IPv4 addresses." };
  }
  const reverseName = parts.reverse().join(".") + ".in-addr.arpa";
  const records = await queryDns(reverseName, "PTR");

  if (records.length === 0) {
    return { status: "missing", records: [], details: `No PTR record found for ${ipAddress}. Contact your hosting provider to set reverse DNS.` };
  }

  return {
    status: "valid",
    records,
    details: `PTR record resolves to: ${records[0]}`,
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;
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

    const body: DnsCheckRequest = await req.json();
    const { domain_id, domain, dkim_selector = "default" } = body;

    if (!domain) {
      return new Response(JSON.stringify({ error: "Missing domain" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Run all DNS checks in parallel
    const [spf, dkim, dmarc, mx] = await Promise.all([
      checkSpf(domain),
      checkDkim(domain, dkim_selector),
      checkDmarc(domain),
      checkMx(domain),
    ]);

    // PTR check: look up the server IP if linked
    let ptr: RecordResult = { status: "missing", records: [], details: "No SMTP server linked to this domain for PTR check." };
    if (domain_id) {
      const adminClient = createClient(supabaseUrl, serviceRoleKey);
      const { data: domainData } = await adminClient
        .from("sending_domains")
        .select("smtp_server_id")
        .eq("id", domain_id)
        .eq("user_id", user.id)
        .single();

      if (domainData?.smtp_server_id) {
        const { data: serverData } = await adminClient
          .from("smtp_servers")
          .select("ip_address")
          .eq("id", domainData.smtp_server_id)
          .single();

        if (serverData?.ip_address) {
          ptr = await checkPtr(serverData.ip_address);
        }
      }
    }

    // Update domain statuses in the database
    if (domain_id) {
      const adminClient = createClient(supabaseUrl, serviceRoleKey);
      const allValid = [spf, dkim, dmarc, mx].every((r) => r.status === "valid");

      await adminClient
        .from("sending_domains")
        .update({
          spf_status: spf.status,
          dkim_status: dkim.status,
          dmarc_status: dmarc.status,
          mx_status: mx.status,
          ptr_status: ptr.status,
          verified: allValid,
        })
        .eq("id", domain_id)
        .eq("user_id", user.id);
    }

    const result = { spf, dkim, dmarc, mx, ptr, checked_at: new Date().toISOString() };

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
