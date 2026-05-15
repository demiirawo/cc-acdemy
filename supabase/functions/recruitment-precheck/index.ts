// Pre-checks if a candidate is allowed to start a test (no duplicates by email or IP).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function getClientIp(req: Request): string | null {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("cf-connecting-ip") || req.headers.get("x-real-ip");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { test_id, email } = await req.json();
    if (!test_id || !email) {
      return new Response(JSON.stringify({ error: "Missing test_id or email" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const ip = getClientIp(req);
    const normEmail = String(email).trim().toLowerCase();

    // Whitelisted test emails bypass duplicate checks
    const BYPASS_EMAILS = new Set(["ronaldirawo@gmail.com"]);
    if (BYPASS_EMAILS.has(normEmail)) {
      return new Response(JSON.stringify({ allowed: true, ip, bypass: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Check email duplicate for this test
    const { data: emailMatch, error: emailErr } = await supabase
      .from("recruitment_attempts")
      .select("id, status")
      .eq("test_id", test_id)
      .ilike("email", normEmail)
      .limit(1);

    if (emailErr) throw emailErr;
    if (emailMatch && emailMatch.length > 0) {
      return new Response(
        JSON.stringify({
          allowed: false,
          reason: "email",
          message: "This email address has already been used to take this test.",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check IP duplicate for this test
    if (ip) {
      const { data: ipMatch, error: ipErr } = await supabase
        .from("recruitment_attempts")
        .select("id")
        .eq("test_id", test_id)
        .eq("ip_address", ip)
        .limit(1);

      if (ipErr) throw ipErr;
      if (ipMatch && ipMatch.length > 0) {
        return new Response(
          JSON.stringify({
            allowed: false,
            reason: "ip",
            message: "A test has already been submitted from this device/network.",
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    return new Response(JSON.stringify({ allowed: true, ip }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
