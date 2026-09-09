import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Delete candidate assessment snapshots that are no longer needed.
 *
 * The proctoring camera photographs the candidate once a minute. Nothing ever
 * deleted one, so the bucket had grown to 72 GB — around ninety per cent of
 * everything the Academy stores.
 *
 * The first version of this job deleted anything older than thirty days, and
 * that was the wrong rule. It assumed applications get reviewed within thirty
 * days; they do not. 580 candidates sit in Pending Review and the oldest are
 * from July, so the job destroyed the evidence for decisions nobody had made
 * yet — and, because it never looked at stage, for 19 of 22 candidates at
 * interview and 7 of the 8 people who were hired. A snapshot exists to defend a
 * hiring decision, so those were the last images that should have gone.
 *
 * Retention now follows the candidate, not the calendar. The rules live in
 * public.snapshots_to_prune() so they can be read and dry-run in SQL rather than
 * inferred from this file; each returned row carries the rule that condemned it.
 * Space is reclaimed by thinning kept attempts to ten evenly spaced frames past
 * thirty days rather than by deleting them outright.
 *
 * Resumable: each run takes up to BATCH_LIMIT and reports what is left.
 */

const BATCH_LIMIT = 20_000;   // per invocation
const REMOVE_CHUNK = 500;     // paths per storage delete call
const BUCKET = "candidate-snapshots";

type Doomed = { id: string; storage_path: string; reason: string };

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

    // `dryRun` reports what would go without touching anything. The schedule
    // never sets it; it is here so a change to the rules can be inspected
    // against live data before it deletes a single photograph.
    let dryRun = false;
    if (req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      dryRun = body?.dryRun === true;
    }

    const { data, error } = await supabase.rpc("snapshots_to_prune", { p_limit: BATCH_LIMIT });
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as Doomed[];

    const byReason = rows.reduce<Record<string, number>>((acc, r) => {
      acc[r.reason] = (acc[r.reason] ?? 0) + 1;
      return acc;
    }, {});

    if (dryRun) {
      return json({ dryRun: true, wouldDelete: rows.length, byReason });
    }
    if (rows.length === 0) {
      return json({ deleted: 0, message: "Nothing to prune" });
    }

    // Storage first, then the row. A row removed while its file survives is an
    // orphan nothing will ever find again; a file removed while its row survives
    // is picked up by the next run, so this order fails safe.
    let removed = 0;
    const failures: string[] = [];
    for (let i = 0; i < rows.length; i += REMOVE_CHUNK) {
      const chunk = rows.slice(i, i + REMOVE_CHUNK);
      const paths = chunk.map(r => r.storage_path).filter(Boolean);
      if (paths.length === 0) continue;

      const { error: rmErr } = await supabase.storage.from(BUCKET).remove(paths);
      if (rmErr) { failures.push(rmErr.message); continue; }

      const { error: rowErr } = await supabase
        .from("recruitment_snapshots").delete().in("id", chunk.map(r => r.id));
      if (rowErr) { failures.push(rowErr.message); continue; }

      removed += paths.length;
    }

    const { data: left } = await supabase.rpc("snapshots_to_prune", { p_limit: BATCH_LIMIT });
    const remaining = (left ?? []).length;

    console.log(
      `prune-candidate-snapshots — removed ${removed} ` +
      `(${Object.entries(byReason).map(([k, v]) => `${k}:${v}`).join(", ")}), ` +
      `${remaining}${remaining === BATCH_LIMIT ? "+" : ""} still eligible`,
    );
    return json({ deleted: removed, byReason, remaining, failures });
  } catch (err) {
    console.error("prune-candidate-snapshots error", err);
    return json({ error: String((err as Error)?.message ?? err) });
  }
});
