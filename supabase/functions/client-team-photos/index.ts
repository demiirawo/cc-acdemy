import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

// Photographs for the team on a client's page.
//
// The pictures are the ones staff supplied when they onboarded, and they live
// in a private bucket with everything else from that form — proof of ID, proof
// of address, bank details. So the browser never gets a path or a key: it asks
// for a client's team, and gets back short-lived signed URLs for those people's
// photographs and nothing else.
//
// Who may ask: a signed-in member of staff, or a visitor who knows the client
// page password — the same gate the page itself uses, checked the same way.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

const SIGNED_URL_SECONDS = 60 * 60;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { clientName, password } = await req.json().catch(() => ({}));
    if (typeof clientName !== "string" || !clientName.trim()) {
      return new Response(JSON.stringify({ photos: [] }), { headers: corsHeaders });
    }
    const client = clientName.trim();

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Signed-in staff are allowed through on their own token. An anonymous
    // caller sends the publishable key here, which is not a user token, so
    // getUser rejects it and the password is what decides.
    let allowed = false;
    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
    if (token) {
      const { data } = await admin.auth.getUser(token);
      if (data?.user) allowed = true;
    }
    if (!allowed) {
      if (typeof password !== "string" || !password.trim()) {
        return new Response(JSON.stringify({ photos: [] }), { status: 401, headers: corsHeaders });
      }
      // Asked of verify-client-page-password rather than checked here, so the
      // gate keeps one definition — including what a client with no password
      // set yet falls back to, and the delay that slows down guessing.
      const gate = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/verify-client-page-password`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
        },
        body: JSON.stringify({ clientName: client, password }),
      });
      const verdict = await gate.json().catch(() => ({ valid: false }));
      if (!verdict?.valid) {
        return new Response(JSON.stringify({ photos: [] }), { status: 401, headers: corsHeaders });
      }
      allowed = true;
    }

    const today = new Date().toISOString().slice(0, 10);

    // The team is worked out here rather than taken from the caller, so asking
    // for one client can only ever return that client's people.
    const [{ data: patternStaff }, { data: assigned }] = await Promise.all([
      admin.from("recurring_shift_patterns").select("user_id, end_date").eq("client_name", client),
      admin.from("staff_client_assignments").select("staff_user_id").eq("client_name", client),
    ]);

    const ids = new Set<string>();
    for (const row of patternStaff ?? []) {
      if (!row.user_id) continue;
      if (row.end_date && row.end_date < today) continue;
      ids.add(row.user_id);
    }
    for (const row of assigned ?? []) {
      if (row.staff_user_id) ids.add(row.staff_user_id);
    }
    if (ids.size === 0) {
      return new Response(JSON.stringify({ photos: [] }), { headers: corsHeaders });
    }

    // A leaver's picture comes down with the rest of them.
    const { data: hr } = await admin
      .from("hr_profiles")
      .select("user_id, start_date, employment_end_date")
      .in("user_id", [...ids]);

    const employed = new Set<string>();
    for (const row of hr ?? []) {
      if (row.start_date && row.start_date > today) continue;
      if (row.employment_end_date && row.employment_end_date < today) continue;
      employed.add(row.user_id);
    }

    const { data: docs } = await admin
      .from("staff_onboarding_documents")
      .select("user_id, photograph_path, updated_at")
      .in("user_id", [...employed])
      .not("photograph_path", "is", null)
      .order("updated_at", { ascending: false });

    const latest = new Map<string, string>();
    for (const row of docs ?? []) {
      const path = (row.photograph_path ?? "").trim();
      if (!path || latest.has(row.user_id)) continue;
      latest.set(row.user_id, path);
    }

    const photos: { user_id: string; url: string }[] = [];
    for (const [userId, path] of latest) {
      const { data: signed } = await admin.storage
        .from("onboarding-documents")
        .createSignedUrl(path, SIGNED_URL_SECONDS);
      if (signed?.signedUrl) photos.push({ user_id: userId, url: signed.signedUrl });
    }

    return new Response(JSON.stringify({ photos, expiresIn: SIGNED_URL_SECONDS }), { headers: corsHeaders });
  } catch (err) {
    console.error("client-team-photos error:", err);
    return new Response(JSON.stringify({ photos: [] }), { status: 500, headers: corsHeaders });
  }
});
