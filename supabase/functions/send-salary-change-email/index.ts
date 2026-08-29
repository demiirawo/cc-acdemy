import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "npm:resend@2.0.0";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

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

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
   .replace(/"/g, "&quot;").replace(/'/g, "&#39;");

/** First name for greetings. Never returns "there". */
function firstName(name?: string | null): string {
  const n = (name ?? "").trim();
  if (!n || n.includes("@")) return "";
  return n.split(/\s+/)[0];
}

/** "Hi Sarah," — or just "Hi," when no usable name exists. */
function greeting(name?: string | null): string {
  const f = firstName(name);
  return `<p style="color:#374151;font-size:16px;line-height:1.6;margin:0 0 16px;">Hi${f ? ` ${escapeHtml(f)}` : ""},</p>`;
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
      paragraph(`We couldn't email <strong>${escapeHtml(whoMissed)}</strong> about: <strong>${escapeHtml(what)}</strong>.`) +
      paragraph(`They don't know about this yet — please tell them another way, or fix their email address and resend.`) +
      button("Open Care Cuddle", APP_URL);
    await Promise.all(emails.map((to) =>
      fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${resendApiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: EMAIL_SENDER,
          to: [to],
          subject: "Someone wasn't notified — action needed",
          html: emailShell("Someone wasn't notified", body, "You're receiving this because you're an admin at Care Cuddle.", "#d97706"),
        }),
      }).catch(() => {})
    ));
  } catch (_) { /* alerting must never break the main send */ }
}

// ============================================================================
// Rank-change email
// ============================================================================

// Plain-English rating words — internal S/A/B/C/D codes never reach the reader.

// ============================================================================
// Function-specific
// ============================================================================

const CURRENCY_SYMBOL: Record<string, string> = {
  GBP: "£", EUR: "€", USD: "$", NGN: "₦", INR: "₹", AED: "AED ",
  AUD: "A$", CAD: "C$", PHP: "₱", ZAR: "R",
};

function money(amount: number, currency: string | null): string {
  const code = (currency || "GBP").toUpperCase();
  const symbol = CURRENCY_SYMBOL[code];
  const figure = amount.toLocaleString("en-GB", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  return symbol ? `${symbol}${figure}` : `${figure} ${code}`;
}

interface Body {
  recipientEmail?: string | null;
  recipientName?: string | null;
  previousSalary?: number | null;
  previousCurrency?: string | null;
  newSalary: number;
  newCurrency: string;
  /** ISO date the new figure starts applying. */
  effectiveDate: string;
  reason?: string | null;
}

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const json = (payload: unknown) =>
    // Always 200: supabase-js throws on a non-2xx without reading the body, so a
    // useful message would be replaced by "returned a non-2xx status code".
    new Response(JSON.stringify(payload), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const apiKey = Deno.env.get("RESEND_API_KEY");
    if (!apiKey) return json({ error: "Email isn't configured — RESEND_API_KEY is missing." });

    const body: Body = await req.json().catch(() => ({} as Body));
    const { recipientEmail, recipientName, previousSalary, previousCurrency, newSalary, newCurrency, effectiveDate, reason } = body;

    if (!newSalary || !effectiveDate) return json({ error: "Missing the new salary or its start date." });
    if (!recipientEmail) {
      // Their pay is changing and they will not hear about it — that is an
      // admin's problem to fix, not something to fail quietly on.
      await alertAdminsOfFailure(
        apiKey,
        `a change to their pay, starting ${niceDate(effectiveDate)}`,
        `${recipientName || "a staff member"} (no email address on file)`,
      );
      return json({ skipped: "no recipient email", adminsAlerted: true });
    }

    const now = money(newSalary, newCurrency);
    const was = previousSalary && previousSalary > 0 ? money(previousSalary, previousCurrency ?? newCurrency) : null;
    const rising = was !== null && newSalary > (previousSalary as number);
    const starts = niceDate(effectiveDate);

    // The two questions somebody has on reading this are "how much" and "from
    // when", so both are in the first sentence rather than under a heading.
    const content =
      greeting(recipientName) +
      paragraph(
        was
          ? `Your pay is changing from <strong>${was}</strong> to <strong>${now}</strong> a month, starting <strong>${starts}</strong>.`
          : `Your pay has been set at <strong>${now}</strong> a month, starting <strong>${starts}</strong>.`
      ) +
      paragraph(
        `Until then you'll be paid at your current rate, so the payroll run before that date is unaffected. Your profile will show the new figure from ${starts}.`
      ) +
      (reason ? paragraph(`<strong>Why:</strong> ${escapeHtml(reason)}`) : "") +
      button("Open my profile", `${APP_URL}/view/hr?tab=my-profile`) +
      mutedParagraph(`If this doesn't match what you were told, reply to this email and we'll look into it.`);

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: EMAIL_SENDER,
        to: [recipientEmail],
        subject: rising ? "Your pay is going up" : "A change to your pay",
        html: emailShell(
          rising ? "Your pay is going up" : "A change to your pay",
          content,
          "You're receiving this because your pay has been updated at Care Cuddle.",
        ),
      }),
    });

    const result = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error("send-salary-change-email — Resend rejected", result);
      return json({ error: result?.message || "The email provider rejected the message." });
    }
    return json({ sent: true, id: result?.id ?? null });
  } catch (err) {
    console.error("send-salary-change-email error", err);
    return json({ error: String((err as Error)?.message ?? err) });
  }
});
