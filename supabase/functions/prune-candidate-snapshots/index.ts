import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Delete candidate assessment snapshots that are no longer needed.
 *
 * The proctoring camera writes a photograph of the candidate every minute of
 * their assessment. Nothing ever deleted one, so 6,275 attempts had accumulated
 * 633,717 photographs and 72 GB — around ninety per cent of everything the
 * Academy stores — almost all of it images of people who were never hired.
 *
 * Two rules, both deletions:
 *
 *   1. Anything older than RETENTION_DAYS. A snapshot exists to defend a
 *      hiring decision at the time it is made; a month is long enough for that
 *      and short enough to be proportionate for people who did not get the job.
 *
 *   2. Anything belonging to a rejected candidate, once the rejection has
 *      settled. Not the moment reject is clicked: the rejection email is queued
 *      for twelve hours and cancelled if the stage moves back, so a rejection is
 *      reversible for half a day. Deleting inside that window would destroy the
 *      evidence for a decision that can still be undone, so a grace period runs
 *      past it.
 *
 * Resumable by design. The backlog is far too large for one invocation, so each
 * run deletes up to BATCH_LIMIT and reports what is left; the daily schedule
 * drains it and then keeps it flat.
 */

const RETENTION_DAYS = 30;
const REJECTED_GRACE_HOURS = 24;   // comfortably past the 12-hour undo window
const BATCH_LIMIT = 20_000;        // per invocation
const REMOVE_CHUNK = 500;          // paths per storage delete call
const BUCKET = "candidate-snapshots";

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const json = (payload: unknown) =>
    new Response(JSON.stringify(payload), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const cutoff = new Date(Date.now() - RETENTION_DAYS * 86_400_000).toISOString();
    const rejectedCutoff = new Date(Date.now() - REJECTED_GRACE_HOURS * 3_600_000).toISOString();

    // Rejected attempts whose rejection has settled.
    //
    // Dated from when the rejection happened, not from when the candidate
    // applied — recruitment_attempts.created_at is the application. Using it
    // would have deleted the snapshots of anyone who applied over a day ago the
    // moment they were rejected, which is exactly the case the grace period is
    // there to protect.
    const { data: rejectionEvents } = await supabase
      .from("recruitment_events")
      .select("attempt_id, occurred_at, metadata")
      .eq("event_type", "stage_changed")
      .lt("occurred_at", rejectedCutoff);

    const settledRejections = new Set(
      (rejectionEvents ?? [])
        .filter((e: { metadata: { stage?: string } | null }) => e.metadata?.stage === "rejected")
        .map((e: { attempt_id: string }) => e.attempt_id));

    // ...and still rejected now. Somebody moved back to interview keeps theirs.
    let rejectedIds = new Set<string>();
    if (settledRejections.size > 0) {
      const { data: stillRejected } = await supabase
        .from("recruitment_attempts")
        .select("id")
        .eq("status", "rejected")
        .in("id", [...settledRejections].slice(0, 1000));
      rejectedIds = new Set((stillRejected ?? []).map((r: { id: string }) => r.id));
    }

    // Old snapshots first — that is the bulk — then rejected candidates'.
    //
    // Fetched a page at a time. PostgREST caps a response at its db-max-rows
    // setting, which is 1000 here, so a bare .limit(20000) silently returns a
    // fortieth of what was asked for: the first fourteen runs of this job
    // deleted about 940 files each instead of 20,000, which would have taken
    // twenty-six days to clear the backlog rather than one.
    const PAGE = 1000;

    const page = async (
      apply: (q: ReturnType<typeof buildBase>) => ReturnType<typeof buildBase>,
      want: number,
    ) => {
      const out: Array<{ id: string; storage_path: string; attempt_id: string }> = [];
      while (out.length < want) {
        const from = out.length;
        const { data, error } = await apply(buildBase()).range(from, from + PAGE - 1);
        if (error) throw new Error(error.message);
        const batch = data ?? [];
        out.push(...batch);
        if (batch.length < PAGE) break;   // exhausted
      }
      return out.slice(0, want);
    };
    const buildBase = () =>
      supabase.from("recruitment_snapshots").select("id, storage_path, attempt_id");

    let rows = await page(q => q.lt("taken_at", cutoff), BATCH_LIMIT);

    if (rows.length < BATCH_LIMIT && rejectedIds.size > 0) {
      const room = BATCH_LIMIT - rows.length;
      const ids = [...rejectedIds].slice(0, 200);
      const rejRows = await page(q => q.gte("taken_at", cutoff).in("attempt_id", ids), room);
      rows = rows.concat(rejRows);
    }

    if (rows.length === 0) {
      return json({ deleted: 0, message: "Nothing to prune", retentionDays: RETENTION_DAYS });
    }

    // Storage first. A row removed while its file survives is an orphan nothing
    // will ever find again; a file removed while its row survives is picked up
    // by the next run, so this order fails safe.
    let removed = 0;
    const failures: string[] = [];
    for (let i = 0; i < rows.length; i += REMOVE_CHUNK) {
      const chunk = rows.slice(i, i + REMOVE_CHUNK);
      const paths = chunk.map((r: { storage_path: string }) => r.storage_path).filter(Boolean);
      if (paths.length === 0) continue;
      const { error } = await supabase.storage.from(BUCKET).remove(paths);
      if (error) { failures.push(error.message); continue; }
      const { error: rowErr } = await supabase
        .from("recruitment_snapshots")
        .delete()
        .in("id", chunk.map((r: { id: string }) => r.id));
      if (rowErr) { failures.push(rowErr.message); continue; }
      removed += paths.length;
    }

    const { count: remaining } = await supabase
      .from("recruitment_snapshots")
      .select("id", { count: "exact", head: true })
      .lt("taken_at", cutoff);

    console.log(`prune-candidate-snapshots — removed ${removed}, ${remaining ?? 0} older-than-${RETENTION_DAYS}d remaining`);
    return json({
      deleted: removed,
      remainingOverRetention: remaining ?? 0,
      rejectedAttemptsConsidered: rejectedIds.size,
      retentionDays: RETENTION_DAYS,
      failures,
    });
  } catch (err) {
    console.error("prune-candidate-snapshots error", err);
    return json({ error: String((err as Error)?.message ?? err) });
  }
});
