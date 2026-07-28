// Begins the FreeAgent OAuth handshake. Admin-only: returns the URL the user
// visits to approve the app, having first stashed a one-time state value that
// the callback checks, so a stray callback can't plant tokens.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Production by default; set FREEAGENT_API_BASE to the sandbox host to rehearse
// the flow against dummy data instead.
const API_BASE = Deno.env.get("FREEAGENT_API_BASE") ?? "https://api.freeagent.com";
const CLIENT_ID = Deno.env.get("FREEAGENT_CLIENT_ID") ?? "";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const admin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Only an admin may connect the company's accounting system.
    const jwt = req.headers.get("Authorization")?.replace("Bearer ", "") ?? "";
    const { data: userData } = await admin.auth.getUser(jwt);
    const userId = userData?.user?.id;
    if (!userId) {
      return new Response(JSON.stringify({ error: "Not signed in" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data: profile } = await admin
      .from("profiles").select("role").eq("user_id", userId).maybeSingle();
    if (profile?.role !== "admin") {
      return new Response(JSON.stringify({ error: "Admins only" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!CLIENT_ID) {
      return new Response(JSON.stringify({ error: "FREEAGENT_CLIENT_ID is not set" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const state = crypto.randomUUID();
    await admin.from("freeagent_oauth")
      .update({ oauth_state: state, connected_by: userId, updated_at: new Date().toISOString() })
      .eq("id", true);

    const redirectUri = `${supabaseUrl}/functions/v1/freeagent-oauth-callback`;
    const url = new URL(`${API_BASE}/v2/approve_app`);
    url.searchParams.set("client_id", CLIENT_ID);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("state", state);

    return new Response(JSON.stringify({ authorizeUrl: url.toString(), redirectUri }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
