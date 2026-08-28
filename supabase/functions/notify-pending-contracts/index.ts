import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Tells people about contracts waiting for them, and keeps reminding them.
 *
 * Sending a batch by firing every request at once does not work: the email
 * provider allows ten a second and rejects the rest, and because nothing
 * recorded who got through, the only recovery was to email everybody again.
 *
 * So this paces itself, and marks each contract the moment its email is
 * accepted. That makes the whole job resumable — run it again and it picks up
 * only the people who have still not been told, however it stopped last time.
 *
 * It does two jobs, in this order:
 *
 *   first notice — anyone never told their contract exists
 *   reminder     — anyone told, still unsigned, not chased in the last 20 hours
 *
 * The 20 hours rather than 24 is so a daily run does not skip a day when it
 * happens to start a few minutes late; the guard is against two in a morning,
 * not against one arriving slightly early. A signed contract drops out of both
 * queries, so reminders stop on their own.
 *
 * Once a contract has been waiting over a week, another identical email is not
 * going to be what finally does it. So the run also sends the admins a single
 * digest of everyone that far behind — the list you would want before having a
 * word with someone, rather than forty copies of their reminder.
 */

/** After this long, a reminder stops being the answer and a conversation is. */
const CHASE_AFTER_DAYS = 7;

const PER_SECOND = 4;                       // well inside the provider's ten
const GAP_MS = Math.ceil(1000 / PER_SECOND);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const json = (payload: unknown) =>
    new Response(JSON.stringify(payload), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    // A cap so a first run can be tried on a handful before committing to all.
    const limit = Number(body.limit) > 0 ? Number(body.limit) : 100;

    const cutoff = new Date(Date.now() - 20 * 60 * 60 * 1000).toISOString();

    const { data: firstTime, error } = await supabase
      .from("contracts")
      .select("id, title, recipient_name, recipient_email, sent_at")
      .eq("status", "sent")
      .is("notified_at", null)
      .not("recipient_email", "is", null)
      .order("recipient_name")
      .limit(limit);
    if (error) return json({ error: error.message });

    // Reminders fill whatever is left of this run's allowance.
    const room = Math.max(0, limit - (firstTime?.length ?? 0));
    let due: typeof firstTime = [];
    if (room > 0) {
      const { data: overdue, error: remindError } = await supabase
        .from("contracts")
        .select("id, title, recipient_name, recipient_email, sent_at")
        .in("status", ["sent", "viewed"])
        .is("signed_at", null)
        .not("notified_at", "is", null)
        .not("recipient_email", "is", null)
        .or(`last_reminded_at.is.null,last_reminded_at.lt.${cutoff}`)
        .order("last_reminded_at", { ascending: true, nullsFirst: true })
        .limit(room);
      if (remindError) return json({ error: remindError.message });
      due = overdue ?? [];
    }

    const work = [
      ...(firstTime ?? []).map((c) => ({ c, reminder: false })),
      ...due.map((c) => ({ c, reminder: true })),
    ];
    if (!work.length) return json({ sent: 0, message: "Nobody to chase" });

    let sent = 0;
    let reminders = 0;
    const failures: string[] = [];

    for (const { c, reminder } of work) {
      const daysWaiting = c.sent_at
        ? Math.floor((Date.now() - new Date(c.sent_at).getTime()) / 86_400_000)
        : 0;
      try {
        const { data, error: sendError } = await supabase.functions.invoke("send-contract-email", {
          body: {
            type: reminder ? "contract_reminder" : "contract_sent",
            contractId: c.id,
            contractTitle: c.title,
            recipientName: c.recipient_name,
            recipientEmail: c.recipient_email,
            daysWaiting,
          },
        });
        // send-contract-email answers 200 with an error field rather than a
        // non-2xx, so a failure has to be read out of the body.
        if (sendError || (data && (data as Record<string, unknown>).error)) {
          failures.push(`${c.recipient_email}: ${sendError?.message ?? (data as Record<string, unknown>).error}`);
        } else {
          // Stamped only once the provider has accepted it, so a crash here
          // means a retry rather than somebody silently never being told.
          const now = new Date().toISOString();
          if (reminder) {
            await supabase.rpc("bump_contract_reminder", { _contract_id: c.id });
            reminders += 1;
          } else {
            await supabase.from("contracts").update({ notified_at: now }).eq("id", c.id);
          }
          sent += 1;
        }
      } catch (e) {
        failures.push(`${c.recipient_email}: ${String((e as Error).message)}`);
      }
      await sleep(GAP_MS);
    }

    // Anyone a week behind, whether or not they were chased in this run.
    const overdueCutoff = new Date(Date.now() - CHASE_AFTER_DAYS * 86_400_000).toISOString();
    const { data: stale } = await supabase
      .from("contracts")
      .select("recipient_name, recipient_email, sent_at, viewed_at")
      .in("status", ["sent", "viewed"])
      .is("signed_at", null)
      .lt("sent_at", overdueCutoff);

    let digested = 0;
    if (stale?.length) {
      const overdue = stale.map((c) => ({
        name: c.recipient_name,
        email: c.recipient_email,
        days: Math.floor((Date.now() - new Date(c.sent_at).getTime()) / 86_400_000),
        opened: !!c.viewed_at,
      }));
      try {
        await supabase.functions.invoke("send-contract-email", {
          body: { type: "contract_overdue_digest", contractId: "", contractTitle: "", overdue },
        });
        digested = overdue.length;
      } catch (e) {
        console.error("overdue digest failed", e);
      }
    }

    console.log(`notify-pending-contracts — sent ${sent} (${reminders} reminders), overdue ${digested}, failed ${failures.length}`);
    return json({ sent, reminders, firstNotices: sent - reminders, overdue: digested, failed: failures.length, failures });
  } catch (err) {
    console.error("notify-pending-contracts error", err);
    return json({ error: String((err as Error)?.message ?? err) });
  }
});
