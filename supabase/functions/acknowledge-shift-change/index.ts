import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

// One-click acknowledgement from the shift-change email. The link carries an
// unguessable batch token; tapping it marks every change in that email as seen.
// Deliberately no login: acknowledgement rates live or die on friction, and the
// token grants nothing except the ability to say "seen".

const BRAND_COLOR = "#5F17EB";
const APP_URL = "https://www.care-cuddle-academy.co.uk";
const LOGO_URL =
  "https://care-cuddle.co.uk/wp-content/uploads/2023/03/Green-and-Beige-Bold-Typographic-Coffee-Products-Coffee-Logo-e1689542108718.png";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;


serve(async (req) => {
  const url = new URL(req.url);
  const rawToken = url.searchParams.get("token") ?? "";
  const wantsJson = url.searchParams.get("format") === "json";

  // Links in already-sent emails point here. The Supabase functions domain
  // refuses to serve HTML (it forces text/plain + a CSP sandbox), so the page
  // lives in the app — old links bounce there without acknowledging, and the
  // page calls back with format=json to record it.
  if (!wantsJson) {
    return new Response(null, {
      status: 302,
      headers: { Location: `${APP_URL}/acknowledge-shift-change?token=${encodeURIComponent(rawToken)}` },
    });
  }

  const jsonHeaders = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };
  if (req.method === "OPTIONS") return new Response(null, { headers: jsonHeaders });

  try {
    const tokens = rawToken.split(",").map((t) => t.trim()).filter((t) => UUID_RE.test(t));
    if (tokens.length === 0) {
      return new Response(JSON.stringify({ status: "unknown" }), { headers: jsonHeaders });
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: updated, error } = await admin
      .from("shift_change_acknowledgements")
      .update({ acknowledged_at: new Date().toISOString(), acknowledged_via: "email" })
      .in("ack_token", tokens)
      .is("acknowledged_at", null)
      .select("id");
    if (error) throw error;

    const n = updated?.length ?? 0;
    if (n > 0) {
      return new Response(JSON.stringify({ status: "acknowledged", count: n }), { headers: jsonHeaders });
    }

    const { count } = await admin
      .from("shift_change_acknowledgements")
      .select("id", { count: "exact", head: true })
      .in("ack_token", tokens);
    return new Response(JSON.stringify({ status: (count ?? 0) > 0 ? "already" : "unknown" }), { headers: jsonHeaders });
  } catch (err) {
    console.error("acknowledge-shift-change error:", err);
    return new Response(JSON.stringify({ status: "error" }), { status: 500, headers: jsonHeaders });
  }
});
