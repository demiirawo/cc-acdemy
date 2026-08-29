import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Moves salary changes onto the profile on the day they fall due.
 *
 * A change decided during the month sits in pending_salary_changes until the
 * 2nd — the day after payday — so the run it must not disturb has already been
 * and gone. This is what finally writes it to staff_salaries, at which point
 * payroll, the bonus pot and the person's own profile all start using it.
 *
 * The person was emailed when the change was entered, not now: they have known
 * about this for weeks, and an email on the morning it lands would be the
 * second one about the same thing.
 *
 * Runs daily rather than only on the 2nd. If the 2nd goes badly — the function
 * is down, the cron is paused — the change lands on the 3rd instead of waiting
 * a month, which is why the query is `effective_date <= today` and not `=`.
 */
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

    const today = new Date().toISOString().slice(0, 10);

    const { data: due, error } = await supabase
      .from("pending_salary_changes")
      .select("id, user_id, new_salary, new_currency, effective_date")
      .is("applied_at", null)
      .is("cancelled_at", null)
      .lte("effective_date", today)
      .order("effective_date", { ascending: true });

    if (error) return json({ error: error.message });
    if (!due?.length) return json({ applied: 0, message: "Nothing due" });

    let applied = 0;
    const failures: string[] = [];

    for (const change of due) {
      // Claim the row first. If another run has already taken it, this update
      // matches nothing and we move on rather than writing the salary twice.
      const { data: claimed, error: claimError } = await supabase
        .from("pending_salary_changes")
        .update({ applied_at: new Date().toISOString() })
        .eq("id", change.id)
        .is("applied_at", null)
        .is("cancelled_at", null)
        .select("id");

      if (claimError || !claimed?.length) continue;

      const { error: payError } = await supabase
        .from("staff_salaries")
        .upsert({
          user_id: change.user_id,
          base_salary: change.new_salary,
          base_currency: change.new_currency,
          updated_at: new Date().toISOString(),
        }, { onConflict: "user_id" });

      if (payError) {
        // Hand the row back so tomorrow's run tries again, rather than leaving
        // it marked applied against a salary that never moved.
        await supabase
          .from("pending_salary_changes")
          .update({ applied_at: null })
          .eq("id", change.id);
        failures.push(`${change.user_id}: ${payError.message}`);
        continue;
      }

      applied += 1;
    }

    console.log(`apply-pending-salaries — applied ${applied} of ${due.length}`);
    return json({ applied, due: due.length, failures });
  } catch (err) {
    console.error("apply-pending-salaries error", err);
    return json({ error: String((err as Error)?.message ?? err) });
  }
});
