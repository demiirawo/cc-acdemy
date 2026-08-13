import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

// Checks the access password for a client's public "all info" page. Runs with
// the service role so the passwords table needs no anonymous read access at
// all — the public page can only ask "is this right?", never "what is it?".

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

// New clients that haven't had a custom password set yet are still protected.
const DEFAULT_PAGE_PASSWORD = "Compliance4210";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { clientName, password } = await req.json().catch(() => ({}));
    if (typeof clientName !== "string" || typeof password !== "string" || !clientName.trim()) {
      return new Response(JSON.stringify({ valid: false }), { headers: corsHeaders });
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data } = await admin
      .from("client_page_access")
      .select("password")
      .eq("client_name", clientName.trim())
      .maybeSingle();

    const expected = (data?.password ?? DEFAULT_PAGE_PASSWORD).trim();

    // A small fixed delay keeps rapid guessing slow without hurting real users.
    await new Promise((r) => setTimeout(r, 300));

    return new Response(JSON.stringify({ valid: password.trim() === expected }), {
      headers: corsHeaders,
    });
  } catch (err) {
    console.error("verify-client-page-password error:", err);
    return new Response(JSON.stringify({ valid: false }), { status: 500, headers: corsHeaders });
  }
});
