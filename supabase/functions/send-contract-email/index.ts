import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "npm:resend@2.0.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ============================================================================
// CARE CUDDLE — CANONICAL EMAIL HELPERS
// Shared across every email-sending edge function so the whole inbox looks
// like it came from the same company on the same day. Do not restyle locally.
// ============================================================================

const EMAIL_SENDER = "Care Cuddle <hello@care-cuddle-academy.co.uk>";
const BRAND_COLOR = "#5F17EB";
const APP_URL = Deno.env.get("APP_URL") || "https://www.care-cuddle-academy.co.uk";
const LOGO_URL =
  "https://care-cuddle.co.uk/wp-content/uploads/2023/03/Green-and-Beige-Bold-Typographic-Coffee-Products-Coffee-Logo-e1689542108718.png";

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const DAYS = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];

/** "Monday 11 August" — year only when it isn't this year. */
function niceDate(input: string | Date): string {
  const d = typeof input === "string" ? new Date(input) : input;
  if (isNaN(d.getTime())) return "";
  const year = d.getFullYear() === new Date().getFullYear() ? "" : ` ${d.getFullYear()}`;
  return `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}${year}`;
}

/** "Monday 11 to Friday 15 August" (same date in and out → single niceDate). */
function niceDateRange(start: string, end: string): string {
  if (!start || !end || start === end) return niceDate(start || end);
  const s = new Date(start), e = new Date(end);
  if (isNaN(s.getTime()) || isNaN(e.getTime())) return "";
  if (s.getMonth() === e.getMonth() && s.getFullYear() === e.getFullYear()) {
    const year = e.getFullYear() === new Date().getFullYear() ? "" : ` ${e.getFullYear()}`;
    return `${DAYS[s.getDay()]} ${s.getDate()} to ${DAYS[e.getDay()]} ${e.getDate()} ${MONTHS[e.getMonth()]}${year}`;
  }
  return `${niceDate(s)} to ${niceDate(e)}`;
}

/** A readable list of dates: "Tuesday 11, Wednesday 12 and Thursday 13 August". */
function niceDateList(dates: string[]): string {
  const ds = dates.map((x) => new Date(x)).filter((d) => !isNaN(d.getTime()));
  if (ds.length === 0) return "";
  if (ds.length === 1) return niceDate(ds[0]);
  const sameMonth = ds.every((d) => d.getMonth() === ds[0].getMonth() && d.getFullYear() === ds[0].getFullYear());
  if (sameMonth) {
    const parts = ds.map((d) => `${DAYS[d.getDay()]} ${d.getDate()}`);
    const last = parts.pop();
    return `${parts.join(", ")} and ${last} ${MONTHS[ds[0].getMonth()]}`;
  }
  const parts = ds.map((d) => niceDate(d));
  const last = parts.pop();
  return `${parts.join(", ")} and ${last}`;
}

/** First name for greetings. Never returns "there". */
function firstName(name?: string | null): string {
  const n = (name ?? "").trim();
  if (!n || n.includes("@")) return "";
  return n.split(/\s+/)[0];
}

/** "Hi Sarah," — or just "Hi," when no usable name exists. */
function greeting(name?: string | null): string {
  const f = firstName(name);
  return `<p style="color:#374151;font-size:16px;line-height:1.6;margin:0 0 16px;">Hi${f ? ` ${f}` : ""},</p>`;
}

function paragraph(html: string): string {
  return `<p style="color:#374151;font-size:16px;line-height:1.6;margin:0 0 16px;">${html}</p>`;
}

function mutedParagraph(html: string): string {
  return `<p style="color:#6b7280;font-size:14px;line-height:1.6;margin:0 0 16px;">${html}</p>`;
}

/** One button per email. label = verb + what you'll see. url must be a real route. */
function button(label: string, url: string): string {
  return `<div style="text-align:center;margin:24px 0 8px;">
    <a href="${url}" style="display:inline-block;background-color:${BRAND_COLOR};color:#ffffff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;">${label}</a>
  </div>`;
}

/**
 * The shared shell. headerTitle is the outcome in plain words ("Your holiday is
 * approved"); reason is one line saying why the reader got this email.
 */
function emailShell(headerTitle: string, bodyHtml: string, reason: string, accent: string = BRAND_COLOR): string {
  return `<!DOCTYPE html>
<html><body style="margin:0;padding:0;background-color:#f4f4f5;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background-color:#ffffff;border-radius:12px;overflow:hidden;font-family:Arial,Helvetica,sans-serif;">
        <tr><td style="background-color:${accent};padding:28px 32px;text-align:center;">
          <img src="${LOGO_URL}" alt="Care Cuddle" width="120" style="margin-bottom:12px;" />
          <h1 style="color:#ffffff;font-size:22px;margin:0;font-weight:700;">${headerTitle}</h1>
        </td></tr>
        <tr><td style="padding:32px;">
          ${bodyHtml}
          <p style="color:#374151;font-size:16px;line-height:1.6;margin:24px 0 0;">Best wishes,<br/>The Care Cuddle team</p>
        </td></tr>
        <tr><td style="padding:20px 32px;background-color:#f9fafb;border-top:1px solid #e5e7eb;">
          <p style="color:#9ca3af;font-size:12px;line-height:1.6;margin:0;">${reason}</p>
          <p style="color:#9ca3af;font-size:12px;line-height:1.6;margin:6px 0 0;">Care Cuddle · Questions? Email <a href="mailto:hello@care-cuddle.co.uk" style="color:#9ca3af;">hello@care-cuddle.co.uk</a> · © ${new Date().getFullYear()} Care Cuddle</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

/**
 * When an email can't be sent to someone who needed it (missing address, lookup
 * failure), tell the admins instead of returning success-shaped silence. Creates
 * its own service-role client so any function can call it.
 */
async function alertAdminsOfFailure(
  resendApiKey: string,
  what: string,      // "Cover assignment for Peace Jimoh"
  whoMissed: string, // "Oluwatosin (no email address on file)"
): Promise<void> {
  try {
    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2.57.4");
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: admins } = await admin.from("profiles").select("email").eq("role", "admin").not("email", "is", null);
    const emails: string[] = (admins ?? []).map((a: { email: string }) => a.email);
    if (emails.length === 0) return;
    const body =
      greeting(null) +
      paragraph(`We couldn't email <strong>${whoMissed}</strong> about: <strong>${what}</strong>.`) +
      paragraph(`They don't know about this yet — please tell them another way, or fix their email address and resend.`) +
      button("Open Care Cuddle", APP_URL);
    await Promise.all(emails.map((to) =>
      fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${resendApiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: EMAIL_SENDER,
          to: [to],
          subject: `We couldn't notify ${whoMissed.split("(")[0].trim()} — action needed`,
          html: emailShell("Someone wasn't notified", body, "You're receiving this because you're an admin at Care Cuddle.", "#d97706"),
        }),
      }).catch(() => {})
    ));
  } catch (_) { /* alerting must never break the main send */ }
}

// ============================================================================
// Contract emails
// ============================================================================

interface ContractEmailRequest {
  type: "contract_sent" | "contract_reminder" | "contract_signed" | "contract_overdue_digest";
  contractId: string;
  contractTitle: string;
  recipientName?: string | null;
  recipientEmail?: string | null;
  /** Reminders only: whole days the contract has been waiting. */
  daysWaiting?: number | null;
  /** Digest only: everyone who has been sitting on a contract for over a week. */
  overdue?: Array<{ name: string | null; email: string | null; days: number; opened: boolean }>;
}

const CONTRACTS_LINK = `${APP_URL}/view/hr?tab=my-contracts`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body: ContractEmailRequest = await req.json();
    const { type, contractTitle, recipientName } = body;

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    if (type === "contract_sent") {
      const to = body.recipientEmail;
      if (!to) {
        // The staff member can never learn a contract is waiting for them —
        // tell the admins instead of failing silently.
        await alertAdminsOfFailure(
          RESEND_API_KEY,
          `A new contract to read and sign — ${contractTitle}`,
          `${recipientName || "the contract recipient"} (no email address on file)`,
        );
        return new Response(
          JSON.stringify({ skipped: "no recipient email", adminsAlerted: true }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const content =
        greeting(recipientName) +
        paragraph(
          `The Care Cuddle team has sent you a new contract to read and sign — <strong>${contractTitle}</strong>.`
        ) +
        paragraph(
          `Once you log in, you'll find it on your My Contracts page. Please read it carefully, and sign it when you're happy with everything.`
        ) +
        button("Read and sign your contract", CONTRACTS_LINK) +
        mutedParagraph(
          `If the button doesn't work, copy this link into your browser:<br/>${CONTRACTS_LINK}`
        );

      const { error } = await resend.emails.send({
        from: EMAIL_SENDER,
        to: [to],
        subject: "Your new contract is ready to sign",
        html: emailShell(
          "Your contract is ready to sign",
          content,
          "You're receiving this because a contract was sent to you to sign at Care Cuddle.",
        ),
      });
      if (error) throw error;
    }

    if (type === "contract_reminder") {
      const to = body.recipientEmail;
      if (!to) {
        return new Response(JSON.stringify({ skipped: "no recipient email" }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // A reminder that repeats the first email word for word reads like a
      // broken robot by day four. This one says how long it has been waiting,
      // which is the only new information there is.
      const days = Number(body.daysWaiting) || 0;
      const waited =
        days <= 0 ? "since yesterday"
        : days === 1 ? "since yesterday"
        : days < 7 ? `for ${days} days`
        : days < 14 ? "for over a week"
        : `for ${Math.floor(days / 7)} weeks`;

      const content =
        greeting(recipientName) +
        paragraph(
          `Your contract — <strong>${contractTitle}</strong> — has been waiting for your signature ${waited}.`
        ) +
        paragraph(
          `It only takes a minute: read it through, type your name and draw your signature at the bottom. If something in it doesn't look right, reply to this email rather than signing.`
        ) +
        button("Read and sign your contract", CONTRACTS_LINK) +
        mutedParagraph(
          `If the button doesn't work, copy this link into your browser:<br/>${CONTRACTS_LINK}<br/><br/>You'll stop receiving these as soon as it's signed.`
        );

      const { error } = await resend.emails.send({
        from: EMAIL_SENDER,
        to: [to],
        subject: days >= 7
          ? `Still waiting: please sign your contract`
          : `A reminder to sign your contract`,
        html: emailShell(
          "Your contract is still waiting",
          content,
          "You're receiving this because a contract sent to you at Care Cuddle hasn't been signed yet.",
        ),
      });
      if (error) throw error;
    }

    if (type === "contract_overdue_digest") {
      // One summary to the admins, not a copy of every chaser. The point is to
      // know who to have a word with, which is a list, not forty emails.
      const rows = (body.overdue ?? []).slice().sort((a, b) => b.days - a.days);
      if (rows.length === 0) {
        return new Response(JSON.stringify({ skipped: "nobody overdue" }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: admins } = await supabase
        .from("profiles").select("email").eq("role", "admin").not("email", "is", null);
      const to: string[] = (admins ?? []).map((a: { email: string }) => a.email);
      if (to.length === 0) {
        return new Response(JSON.stringify({ skipped: "no admin address on file" }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const list = rows.map((r) => `
        <tr>
          <td style="padding:6px 12px 6px 0;color:#111827;font-size:14px;">${r.name ?? r.email ?? "Unknown"}</td>
          <td style="padding:6px 12px 6px 0;color:#6b7280;font-size:14px;white-space:nowrap;">${r.days} days</td>
          <td style="padding:6px 0;color:#6b7280;font-size:14px;">${r.opened ? "opened, not signed" : "never opened"}</td>
        </tr>`).join("");

      const neverOpened = rows.filter((r) => !r.opened).length;

      const content =
        greeting(null) +
        paragraph(
          `${rows.length} ${rows.length === 1 ? "person has" : "people have"} had a contract waiting for over a week. They are being reminded every morning, but at this point a conversation will probably do more than another email.`
        ) +
        `<table role="presentation" style="border-collapse:collapse;margin:8px 0 16px;">${list}</table>` +
        (neverOpened > 0
          ? paragraph(`${neverOpened} of them ${neverOpened === 1 ? "has" : "have"} never opened it — worth checking the reminders are reaching them at all.`)
          : "") +
        button("Open contracts", `${APP_URL}/view/hr?tab=my-contracts`);

      const { error } = await resend.emails.send({
        from: EMAIL_SENDER,
        to,
        subject: `${rows.length} contract${rows.length === 1 ? "" : "s"} unsigned for over a week`,
        html: emailShell(
          "Contracts still unsigned",
          content,
          "You're receiving this because you're an admin at Care Cuddle.",
          "#d97706",
        ),
      });
      if (error) throw error;
    }

    if (type === "contract_signed") {
      // Look up the contract so the signer gets their own confirmation copy.
      const { data: contract, error: contractError } = await supabase
        .from("contracts")
        .select("recipient_email, recipient_name")
        .eq("id", body.contractId)
        .maybeSingle();

      const signerName = contract?.recipient_name || recipientName || "";
      const signerEmail = contract?.recipient_email || null;

      // 1) Confirm to the signer — they just signed a legally binding document.
      if (signerEmail) {
        const signerContent =
          greeting(signerName) +
          paragraph(
            `Thank you — you've signed your contract, <strong>${contractTitle}</strong>, and your signed copy is safely saved.`
          ) +
          paragraph(`You can read it again any time on your My Contracts page.`) +
          button("See your signed contract", CONTRACTS_LINK);

        const { error: signerError } = await resend.emails.send({
          from: EMAIL_SENDER,
          to: [signerEmail],
          subject: "Your contract is signed and saved",
          html: emailShell(
            "Your contract is signed",
            signerContent,
            "You're receiving this because you signed a contract at Care Cuddle.",
          ),
        });
        if (signerError) {
          console.error("send-contract-email: signer confirmation failed", signerError);
          await alertAdminsOfFailure(
            RESEND_API_KEY,
            `Confirmation of the signed contract — ${contractTitle}`,
            `${signerName || "the person who signed"} (their confirmation email failed to send)`,
          );
        }
      } else {
        if (contractError) {
          console.error("send-contract-email: contract lookup failed", contractError);
        }
        // Word the alert honestly: a lookup failure doesn't mean the address is missing.
        await alertAdminsOfFailure(
          RESEND_API_KEY,
          `Confirmation of the signed contract — ${contractTitle}`,
          `${signerName || "the person who signed"} (${
            contractError
              ? "we couldn't look up their email address — please check and resend"
              : "no email address on file"
          })`,
        );
      }

      // 2) Tell the admins — one email each, never a shared visible to: list.
      const { data: admins, error: adminsError } = await supabase
        .from("profiles")
        .select("email, display_name")
        .eq("role", "admin")
        .not("email", "is", null);

      const allAdmins = (admins ?? []).filter(
        (a: { email: string | null }): a is { email: string; display_name: string | null } => !!a.email
      );

      // The signer already got their own confirmation above — don't send them
      // a second "nothing is waiting on you" copy if they're also an admin.
      const adminRecipients = signerEmail
        ? allAdmins.filter((a) => a.email !== signerEmail)
        : allAdmins;

      if (allAdmins.length === 0) {
        if (adminsError) {
          console.error("send-contract-email: admin lookup failed", adminsError);
        } else {
          console.error("send-contract-email: no admin email addresses on file — nobody to notify of the signature");
        }
        // Nobody in the office would hear about the signature — raise it rather
        // than reporting success in silence. (If the lookup only failed
        // transiently, the helper retries with a fresh client and may still
        // reach the admins; if there truly are none, nothing more we can do.)
        await alertAdminsOfFailure(
          RESEND_API_KEY,
          `A signed contract — ${contractTitle}`,
          "the admin team (no admin email addresses on file)",
        );
      } else if (adminRecipients.length > 0) {
        const subject = signerName
          ? `${signerName} has signed their contract`
          : "A contract has been signed";
        const sendResults = await Promise.all(
          adminRecipients.map(async (adminRecipient) => {
            const adminContent =
              greeting(adminRecipient.display_name) +
              paragraph(
                signerName
                  ? `<strong>${signerName}</strong> has just signed their contract, <strong>${contractTitle}</strong> — nothing is waiting on you.`
                  : `The contract <strong>${contractTitle}</strong> has just been signed — nothing is waiting on you.`
              ) +
              paragraph(`The signed copy is saved in Care Cuddle if you'd like to read it.`) +
              button("See the signed contract", `${APP_URL}/view/hr?tab=contracts`);

            const { error: adminError } = await resend.emails.send({
              from: EMAIL_SENDER,
              to: [adminRecipient.email],
              subject,
              html: emailShell(
                "A contract has been signed",
                adminContent,
                "You're receiving this because you're an admin at Care Cuddle.",
              ),
            });
            if (adminError) {
              console.error("send-contract-email: admin copy failed", adminRecipient.email, adminError);
              return false;
            }
            return true;
          }),
        );

        // Every admin copy failed — don't let the signature pass in silence.
        // The helper sends via raw fetch with a fresh client, so it can still
        // get through when the SDK path above hit a transient fault.
        if (sendResults.every((ok) => !ok)) {
          await alertAdminsOfFailure(
            RESEND_API_KEY,
            `A signed contract — ${contractTitle}`,
            "the admin team (every admin notification email failed to send)",
          );
        }
      }
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("send-contract-email error", err);
    return new Response(JSON.stringify({ error: String(err?.message ?? err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
