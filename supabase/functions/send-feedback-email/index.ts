import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "npm:resend@2.0.0";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ============================================================================
// CARE CUDDLE — CANONICAL EMAIL HELPERS
// Shared copy of the canonical template. Do not restyle per function: every
// email in a staff member's inbox should look like it came from the same
// company on the same day.
// ============================================================================

const EMAIL_SENDER = "Care Cuddle <hello@care-cuddle-academy.co.uk>";
const BRAND_COLOR = "#5F17EB";
const APP_URL = Deno.env.get("APP_URL") || "https://www.care-cuddle-academy.co.uk";
// Existing hosted logo — keep until a first-party asset exists.
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
          subject: `We couldn't notify ${whoMissed.split("(")[0].trim()} — action needed`,
          html: emailShell("Someone wasn't notified", body, "You're receiving this because you're an admin at Care Cuddle.", "#d97706"),
        }),
      }).catch(() => {})
    ));
  } catch (_) { /* alerting must never break the main send */ }
}

// ============================================================================
// Function-specific helpers
// ============================================================================

/** Escape user-entered text (names, categories, free-text reasons) before it lands in HTML. */
function escapeHtml(value?: string | null): string {
  return (value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Turn a stored category into plain prose: "Attention to Detail" → "attention to detail". */
function niceCategory(category?: string | null): string {
  const v = (category ?? "").trim();
  if (!v) return "";
  return escapeHtml(v.replace(/[_-]+/g, " ").toLowerCase());
}

/** Emails of every admin, for the immediate copy of formal warnings. */
async function fetchAdminEmails(): Promise<string[]> {
  try {
    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2.57.4");
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data } = await admin.from("profiles").select("email").eq("role", "admin").not("email", "is", null);
    return (data ?? []).map((a: { email: string }) => a.email).filter(Boolean);
  } catch (_) {
    return [];
  }
}

interface FeedbackEmailRequest {
  recipientEmail?: string | null;
  recipientName?: string | null;
  kind?: "praise" | "development" | "warning" | null;
  category?: string | null;
  reason: string;
  severity?: string | null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body: FeedbackEmailRequest = await req.json();
    const { recipientEmail, recipientName, kind, category, reason, severity } = body;

    const cat = niceCategory(category);
    const safeReason = escapeHtml(reason);
    const sevWord = severity === "major" || severity === "final" ? severity : "minor";
    // Raw name for plain-text contexts (email subjects); escaped name for HTML.
    const staffNameRaw = (recipientName ?? "").trim() || "A staff member";
    const staffName = escapeHtml(staffNameRaw);
    const staffFirst = escapeHtml(firstName(recipientName)) || "They";

    if (!recipientEmail) {
      // No silent failure: the feedback is logged in the system, so admins must
      // hear that the person it's about was never emailed.
      const what =
        kind === "development"
          ? "A development point from their manager"
          : kind === "praise"
            ? "Praise from their manager"
            : `A ${sevWord} warning from their manager`;
      await alertAdminsOfFailure(
        Deno.env.get("RESEND_API_KEY") ?? "",
        what,
        `${staffNameRaw} (no email address on file)`,
      );
      return new Response(JSON.stringify({ skipped: "no recipient email", adminAlerted: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let subject: string;
    let headerTitle: string;
    let bodyHtml: string;
    let footerReason: string;

    if (kind === "development") {
      // Coaching, not a sanction — the wording matters, because this lands in the
      // same inbox as warnings and shouldn't read like one.
      subject = "Your manager has shared a development point with you";
      headerTitle = "A development point for you";
      footerReason = "You're receiving this because your manager shared feedback with you on Care Cuddle.";
      bodyHtml =
        greeting(escapeHtml(recipientName)) +
        paragraph(`Your manager has shared a development point with you — something to work on. This is not a warning, and nothing has gone wrong.`) +
        (cat ? paragraph(`It's about your ${cat}.`) : "") +
        paragraph(`In your manager's words: &ldquo;${safeReason}&rdquo;`) +
        paragraph(`Working on this helps your performance rating over time. Your rating can affect your monthly bonus.`) +
        paragraph(`If anything is unclear, please ask your manager.`) +
        button("See your performance rating", `${APP_URL}/view/hr`);
    } else if (kind === "praise") {
      subject = "Well done — your manager has praised your work";
      headerTitle = "Well done";
      footerReason = "You're receiving this because your manager shared feedback with you on Care Cuddle.";
      bodyHtml =
        greeting(escapeHtml(recipientName)) +
        paragraph(`Your manager has praised your work — well done.`) +
        (cat ? paragraph(`It's about your ${cat}.`) : "") +
        paragraph(`In your manager's words: &ldquo;${safeReason}&rdquo;`) +
        paragraph(`Praise like this helps your performance rating. A higher rating can mean a bigger monthly bonus. Keep it up.`) +
        button("See your performance rating", `${APP_URL}/view/hr`);
    } else {
      subject = `You've been given a ${sevWord} warning`;
      headerTitle = `A ${sevWord} warning`;
      footerReason = "You're receiving this because a formal warning was issued to you at Care Cuddle.";
      const severityMeaning =
        sevWord === "final"
          ? `A final warning is the most serious step before further action. Please treat this as urgent.`
          : sevWord === "major"
            ? `A major warning is a serious formal step. Please give this your full attention.`
            : `A minor warning is the first formal step. It means this needs your attention now.`;
      bodyHtml =
        greeting(escapeHtml(recipientName)) +
        paragraph(`Your manager has given you a ${sevWord} warning${cat ? ` about your ${cat}` : ""}.`) +
        paragraph(`In your manager's words: &ldquo;${safeReason}&rdquo;`) +
        paragraph(severityMeaning) +
        paragraph(`You can respond to this — please arrange a chat with your manager this week. They can explain what needs to change and how to put it right.`) +
        paragraph(`Warnings can lower your performance rating. Your rating can affect your monthly bonus. Steady improvement can raise it again.`) +
        button("Open your HR profile", `${APP_URL}/view/hr`);
    }

    const { error } = await resend.emails.send({
      from: EMAIL_SENDER,
      to: [recipientEmail],
      subject,
      html: emailShell(headerTitle, bodyHtml, footerReason),
    });
    if (error) throw error;

    // Formal warnings: admins get an immediate individual copy, so the only
    // emailed record of a disciplinary step doesn't live solely in the inbox
    // of the person being disciplined. Praise and development points reach
    // admins through the daily digest instead.
    if (kind !== "development" && kind !== "praise") {
      try {
        const adminEmails = (await fetchAdminEmails()).filter(
          (e) => e.toLowerCase() !== recipientEmail.toLowerCase(),
        );
        // Subjects are plain text — use the raw name, never the HTML-escaped one.
        const adminSubject = `${staffNameRaw} has been given a ${sevWord} warning`;
        const adminBody =
          greeting(null) +
          paragraph(`${staffName} has been given a ${sevWord} warning${cat ? ` about their ${cat}` : ""}.`) +
          paragraph(`In the manager's words: &ldquo;${safeReason}&rdquo;`) +
          paragraph(`We've emailed ${staffFirst === "They" ? "them" : staffFirst} directly. This copy is so admins know a formal warning has been issued.`) +
          button("Open the HR area", `${APP_URL}/view/hr`);
        const adminHtml = emailShell(
          "Copy of a formal warning",
          adminBody,
          "You're receiving this because you're an admin at Care Cuddle.",
        );
        // Individual sends — never one email with every admin address visible.
        await Promise.all(adminEmails.map((to) =>
          resend.emails.send({
            from: EMAIL_SENDER,
            to: [to],
            subject: adminSubject,
            html: adminHtml,
          }).catch((e: unknown) => console.error("send-feedback-email admin copy failed", e))
        ));
      } catch (copyErr) {
        // The staff member was emailed; a failed admin copy must not fail the request.
        console.error("send-feedback-email admin copies failed", copyErr);
      }
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("send-feedback-email error", err);
    return new Response(JSON.stringify({ error: String(err?.message ?? err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
