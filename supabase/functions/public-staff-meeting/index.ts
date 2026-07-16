import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const tenureYears = (start: string | null): number | null => {
  if (!start) return null;
  return Math.max(0, Math.floor((Date.now() - new Date(start).getTime()) / (365.25 * 24 * 60 * 60 * 1000)));
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    let token = url.searchParams.get("token") || "";
    if (!token && req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      token = body?.token || "";
    }
    if (!token) {
      return new Response(JSON.stringify({ error: "missing token" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { data: settings } = await supabase
      .from("meeting_settings").select("vision, public_token").eq("id", true).maybeSingle();

    if (!settings?.public_token || settings.public_token !== token) {
      return new Response(JSON.stringify({ error: "not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const [{ data: objectives }, { data: actions }, { data: spots }, { data: updates }] = await Promise.all([
      supabase.from("meeting_objectives").select("title, target_date, is_done, sort_order").order("sort_order", { ascending: true }).order("created_at", { ascending: true }),
      supabase.from("meeting_actions").select("title, detail, owner_name, due_date, status, priority, on_agenda, sort_order").order("sort_order", { ascending: true }).order("created_at", { ascending: true }),
      supabase.from("meeting_spotlights").select("user_id, note").order("created_at", { ascending: false }),
      supabase.from("meeting_updates").select("title, body, category, created_at").order("created_at", { ascending: false }),
    ]);

    // Enrich spotlights with name, rank, tenure and a signed photo URL.
    const userIds = [...new Set((spots ?? []).map((s: any) => s.user_id))];
    const [{ data: profiles }, { data: hr }, { data: docs }] = await Promise.all([
      supabase.from("profiles").select("user_id, display_name, email").in("user_id", userIds),
      supabase.from("hr_profiles").select("user_id, performance_rating, start_date, created_at").in("user_id", userIds),
      supabase.from("staff_onboarding_documents").select("user_id, photograph_path").in("user_id", userIds),
    ]);
    const nameMap = new Map((profiles ?? []).map((p: any) => [p.user_id, p.display_name || p.email || "Staff member"]));
    const hrMap = new Map((hr ?? []).map((h: any) => [h.user_id, h]));

    // Sign renderable photos.
    const photoMap = new Map<string, string>();
    const photoDocs = (docs ?? []).filter((d: any) => d.photograph_path && /\.(jpe?g|png|webp|gif)$/i.test(d.photograph_path));
    if (photoDocs.length) {
      const { data: signed } = await supabase.storage.from("onboarding-documents").createSignedUrls(photoDocs.map((d: any) => d.photograph_path), 3600);
      const byPath = new Map((signed ?? []).filter((r: any) => r.signedUrl && !r.error).map((r: any) => [r.path, r.signedUrl]));
      photoDocs.forEach((d: any) => { const u = byPath.get(d.photograph_path); if (u) photoMap.set(d.user_id, u as string); });
    }

    const spotlights = (spots ?? []).map((s: any) => {
      const h: any = hrMap.get(s.user_id);
      const rank = h?.performance_rating && ["S", "A", "B", "C", "D"].includes(h.performance_rating) ? h.performance_rating : null;
      return {
        name: nameMap.get(s.user_id) || "Staff member",
        note: s.note,
        rank,
        years: tenureYears(h?.start_date || h?.created_at || null),
        photo: photoMap.get(s.user_id) || null,
      };
    });

    return new Response(JSON.stringify({
      vision: settings.vision || "",
      objectives: objectives ?? [],
      updates: updates ?? [],
      actions: actions ?? [],
      spotlights,
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("public-staff-meeting error", err);
    return new Response(JSON.stringify({ error: String(err?.message ?? err) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
