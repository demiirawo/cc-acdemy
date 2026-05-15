// Partial-finalize endpoint for the candidate recruitment test.
// Called via navigator.sendBeacon on tab close so abandoned attempts
// still get a real submitted_at + computed score using the rows
// already saved in recruitment_answers.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const attemptId: string | undefined = body?.attempt_id;
    const partial: boolean = !!body?.partial;
    const integrityOverride: number | undefined = body?.integrity_score;

    if (!attemptId || typeof attemptId !== "string") {
      return new Response(JSON.stringify({ error: "attempt_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Skip if already submitted
    const { data: attempt } = await supabase
      .from("recruitment_attempts")
      .select("id, status, test_id, integrity_score")
      .eq("id", attemptId)
      .maybeSingle();
    if (!attempt) {
      return new Response(JSON.stringify({ error: "not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (attempt.status === "submitted") {
      return new Response(JSON.stringify({ ok: true, alreadySubmitted: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Compute total from recorded answers + max from test questions
    const [{ data: answers }, { data: questions }] = await Promise.all([
      supabase
        .from("recruitment_answers")
        .select("points_awarded")
        .eq("attempt_id", attemptId),
      supabase
        .from("recruitment_questions")
        .select("weight")
        .eq("test_id", attempt.test_id),
    ]);

    const total = (answers ?? []).reduce(
      (s: number, r: any) => s + Number(r.points_awarded ?? 0),
      0,
    );
    const max = (questions ?? []).reduce(
      (s: number, q: any) => s + Number(q.weight ?? 0),
      0,
    );

    const integrity =
      typeof integrityOverride === "number"
        ? integrityOverride
        : (attempt.integrity_score ?? 100);

    const { error: updErr } = await supabase
      .from("recruitment_attempts")
      .update({
        total_score: total,
        max_score: max,
        integrity_score: integrity,
        submitted_at: new Date().toISOString(),
        status: "submitted",
      })
      .eq("id", attemptId);

    if (updErr) {
      return new Response(JSON.stringify({ error: updErr.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Audit
    await supabase.from("recruitment_events").insert({
      attempt_id: attemptId,
      event_type: partial ? "auto_submit_partial" : "submitted",
      metadata: { total, max, integrity },
    });

    return new Response(JSON.stringify({ ok: true, total, max }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message ?? String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
