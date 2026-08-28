import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Applies performance-rating changes on the day they fall due.
 *
 * A rating decided during the month sits in pending_rating_changes until the
 * 2nd of the following month, once payroll has run. This is what moves it: it
 * writes the new rating onto the HR profile, emails the person the reason, and
 * stamps the row as applied.
 *
 * Runs daily rather than only on the 2nd. If the 2nd falls on a bad day — the
 * function is down, the cron is paused, the project is asleep — a change that
 * should have landed on the 2nd still lands on the 3rd instead of waiting a
 * month. That is why the query is `effective_date <= today` and not `=`.
 *
 * Applying is idempotent per row: applied_at is set in the same statement that
 * reads the row as unapplied, so a second run in the same day finds nothing.
 */
serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const json = (payload: unknown) =>
    // Always 200: supabase-js throws on a non-2xx without reading the body, so
    // a useful message would be replaced by "returned a non-2xx status code".
    new Response(JSON.stringify(payload), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const today = new Date().toISOString().slice(0, 10);

    const { data: due, error: dueError } = await supabase
      .from("pending_rating_changes")
      .select("id, user_id, previous_rating, new_rating, reason, effective_date")
      .is("applied_at", null)
      .is("cancelled_at", null)
      .lte("effective_date", today)
      .order("effective_date", { ascending: true });

    if (dueError) return json({ error: dueError.message });
    if (!due?.length) return json({ applied: 0, message: "Nothing due" });

    const ids = due.map((d) => d.user_id);
    const { data: profiles } = await supabase
      .from("profiles")
      .select("user_id, display_name, email")
      .in("user_id", ids);

    let applied = 0;
    const failures: string[] = [];

    for (const change of due) {
      // Claim the row first. If another run has already taken it, the update
      // matches nothing and this one moves on rather than emailing twice.
      const { data: claimed, error: claimError } = await supabase
        .from("pending_rating_changes")
        .update({ applied_at: new Date().toISOString() })
        .eq("id", change.id)
        .is("applied_at", null)
        .is("cancelled_at", null)
        .select("id");

      if (claimError || !claimed?.length) continue;

      const { error: rateError } = await supabase
        .from("hr_profiles")
        .update({ performance_rating: change.new_rating })
        .eq("user_id", change.user_id);

      if (rateError) {
        // Hand the row back so tomorrow's run tries again, rather than leaving
        // it marked applied against a rating that never moved.
        await supabase
          .from("pending_rating_changes")
          .update({ applied_at: null })
          .eq("id", change.id);
        failures.push(`${change.user_id}: ${rateError.message}`);
        continue;
      }

      applied += 1;

      // The email goes out only once the rating is actually live, so nobody is
      // told about a change that then fails to apply.
      const person = (profiles ?? []).find((p) => p.user_id === change.user_id);
      if (person?.email) {
        try {
          await supabase.functions.invoke("send-rank-change-email", {
            body: {
              recipientEmail: person.email,
              recipientName: person.display_name,
              oldRank: change.previous_rating,
              newRank: change.new_rating,
              reason: change.reason,
            },
          });
        } catch (e) {
          // A failed email does not un-apply the rating — the rating is the
          // record, the email is the courtesy.
          console.error("apply-pending-ratings — email failed", change.user_id, e);
        }
      }
    }

    console.log(`apply-pending-ratings — applied ${applied} of ${due.length}`);
    return json({ applied, due: due.length, failures });
  } catch (err) {
    console.error("apply-pending-ratings error", err);
    return json({ error: String((err as Error)?.message ?? err) });
  }
});
