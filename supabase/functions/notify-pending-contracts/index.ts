import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Tells people about contracts that are waiting for them, one at a time.
 *
 * Sending a batch by firing every request at once does not work: the email
 * provider allows ten a second and rejects the rest, and because nothing
 * recorded who got through, the only recovery was to email everybody again.
 *
 * So this paces itself, and marks each contract the moment its email is
 * accepted. That makes the whole job resumable — run it again and it picks up
 * only the people who have still not been told, however it stopped last time.
 */

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

    const { data: waiting, error } = await supabase
      .from("contracts")
      .select("id, title, recipient_name, recipient_email")
      .eq("status", "sent")
      .is("notified_at", null)
      .not("recipient_email", "is", null)
      .order("recipient_name")
      .limit(limit);

    if (error) return json({ error: error.message });
    if (!waiting?.length) return json({ sent: 0, message: "Everyone has been told" });

    let sent = 0;
    const failures: string[] = [];

    for (const c of waiting) {
      try {
        const { data, error: sendError } = await supabase.functions.invoke("send-contract-email", {
          body: {
            type: "contract_sent",
            contractId: c.id,
            contractTitle: c.title,
            recipientName: c.recipient_name,
            recipientEmail: c.recipient_email,
          },
        });
        // send-contract-email answers 200 with an error field rather than a
        // non-2xx, so a failure has to be read out of the body.
        if (sendError || (data && (data as Record<string, unknown>).error)) {
          failures.push(`${c.recipient_email}: ${sendError?.message ?? (data as Record<string, unknown>).error}`);
        } else {
          // Marked only once the provider has accepted it, so a crash here
          // means a retry rather than somebody silently never being told.
          await supabase.from("contracts").update({ notified_at: new Date().toISOString() }).eq("id", c.id);
          sent += 1;
        }
      } catch (e) {
        failures.push(`${c.recipient_email}: ${String((e as Error).message)}`);
      }
      await sleep(GAP_MS);
    }

    console.log(`notify-pending-contracts — sent ${sent}, failed ${failures.length}`);
    return json({ sent, failed: failures.length, remaining: waiting.length - sent, failures });
  } catch (err) {
    console.error("notify-pending-contracts error", err);
    return json({ error: String((err as Error)?.message ?? err) });
  }
});
