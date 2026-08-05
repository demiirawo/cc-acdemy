import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "npm:resend@2.0.0";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ============================================================================
// CARE CUDDLE — CANONICAL EMAIL HELPERS
// ============================================================================

const EMAIL_SENDER = "Care Cuddle <hello@care-cuddle-academy.co.uk>";
const BRAND_COLOR = "#5F17EB";
const ALERT_COLOR = "#d97706";
const APP_URL = "https://www.care-cuddle-academy.co.uk";
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

/** Escape user-controlled text before interpolating it into HTML. */
function esc(value: string | null | undefined): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
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
  return `<p style="color:#374151;font-size:16px;line-height:1.6;margin:0 0 16px;">Hi${f ? ` ${esc(f)}` : ""},</p>`;
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
      paragraph(`We couldn't email <strong>${esc(whoMissed)}</strong> about: <strong>${esc(what)}</strong>.`) +
      paragraph(`They don't know about this yet — please tell them another way, or fix their email address and resend.`) +
      button("Open Care Cuddle", APP_URL);
    const html = emailShell("Someone wasn't notified", body, "You're receiving this because you're an admin at Care Cuddle.", ALERT_COLOR);
    // Individual sends — never one email with every admin address visible.
    await Promise.all(emails.map((to) =>
      resend.emails.send({
        from: EMAIL_SENDER,
        to: [to],
        subject: `We couldn't notify ${whoMissed.split("(")[0].trim()} — action needed`,
        html,
      }).catch(() => {})
    ));
  } catch (_) { /* alerting must never break the main send */ }
}

// ============================================================================

/**
 * Cover-change notifications for a handover task.
 *  - type "removed":       tells the PREVIOUS assignee they're no longer covering it.
 *  - type "cover_changed": tells the person handing over (i.e. whose leave is being
 *                          covered) that a different person is now covering.
 * When a change leaves the task with no cover at all, admins also get an
 * immediate alert so someone with authority can assign a replacement.
 */
interface Payload {
  type: "removed" | "cover_changed";
  recipientEmail: string;
  recipientName?: string | null;
  clientName: string;
  taskName: string;
  previousAssignee?: string | null;
  newAssignee?: string | null;
  targetDate?: string | null;
}

/**
 * A change has left this handover task with nobody covering it. Routine
 * reassignments reach admins via the daily digest, but an uncovered task needs
 * someone with authority to act now — so email each admin individually.
 */
async function alertAdminsTaskUncovered(
  clientName: string,
  taskName: string,
  previousAssignee: string | null | undefined,
  due: string,
  trackerUrl: string,
): Promise<void> {
  try {
    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2.57.4");
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: admins } = await admin.from("profiles").select("email").eq("role", "admin").not("email", "is", null);
    const emails: string[] = (admins ?? []).map((a: { email: string }) => a.email).filter(Boolean);
    if (emails.length === 0) return;

    const opening = previousAssignee
      ? `<strong>${esc(previousAssignee)}</strong> has been taken off <strong>${esc(taskName)}</strong> for <strong>${esc(clientName)}</strong>, and nobody is covering it now.`
      : `Nobody is covering <strong>${esc(taskName)}</strong> for <strong>${esc(clientName)}</strong> — the previous cover person has been taken off it.`;
    const body =
      greeting(null) +
      paragraph(opening) +
      (due ? paragraph(`The task is needed by <strong>${due}</strong>.`) : "") +
      paragraph(`Please choose a new cover person in the Handover Tracker so this isn't missed.`) +
      button("Open the Handover Tracker", trackerUrl);
    const html = emailShell(
      "A handover task needs new cover",
      body,
      "You're receiving this because you're an admin at Care Cuddle.",
      ALERT_COLOR,
    );
    // Individual sends — never one email with every admin address visible.
    for (const to of emails) {
      await resend.emails.send({
        from: EMAIL_SENDER,
        to: [to],
        subject: `No one is covering ${taskName} for ${clientName}`,
        html,
      });
    }
  } catch (err) {
    console.error("send-handover-change-email: admin uncovered-task alert failed", err);
  }
}

/**
 * One clearing event makes the caller fire TWO requests (type "removed" to the
 * previous assignee and type "cover_changed" to the leave-taker), each with no
 * new assignee — without a guard, admins would get the same "no one is
 * covering" alert twice. Remember recently-alerted tasks per isolate; the two
 * requests arrive back-to-back, so a short window is enough.
 */
const recentUncoveredAlerts = new Map<string, number>();
const UNCOVERED_ALERT_TTL_MS = 60_000;

function shouldAlertUncovered(key: string): boolean {
  const now = Date.now();
  for (const [k, t] of recentUncoveredAlerts) {
    if (now - t > UNCOVERED_ALERT_TTL_MS) recentUncoveredAlerts.delete(k);
  }
  if (recentUncoveredAlerts.has(key)) return false;
  recentUncoveredAlerts.set(key, now);
  return true;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = (await req.json()) as Payload;
    const { type, recipientEmail, recipientName, clientName, taskName, previousAssignee, newAssignee, targetDate } = body;

    if (!clientName || !taskName || !type) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    if (!recipientEmail) {
      // Never fail silently: the person this change affects can't be emailed,
      // so tell the admins before returning.
      await alertAdminsOfFailure(
        `A cover change on the handover task "${taskName}" for ${clientName}`,
        `${recipientName || "a staff member"} (no email address on file)`,
      );
      return new Response(JSON.stringify({ error: "Missing required fields", adminsAlerted: true }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const due = targetDate ? niceDate(targetDate) : "";
    const trackerUrl = `${APP_URL}/public/schedule/${encodeURIComponent(clientName)}`;

    let subject: string;
    let html: string;

    if (type === "removed") {
      subject = `You're no longer covering ${taskName}`;
      const inner =
        greeting(recipientName) +
        paragraph(`You no longer need to cover <strong>${esc(taskName)}</strong> for <strong>${esc(clientName)}</strong> — there's nothing more for you to do on it.`) +
        (newAssignee
          ? paragraph(`<strong>${esc(newAssignee)}</strong> is taking it over.`)
          : paragraph(`The admin team has been told and is arranging a new cover person.`)) +
        (due ? paragraph(`For reference, the task was needed by ${due}.`) : "") +
        mutedParagraph(`If you think this is a mistake, email <a href="mailto:hello@care-cuddle.co.uk" style="color:#6b7280;">hello@care-cuddle.co.uk</a> and we'll put it right.`) +
        button("Open the Handover Tracker", trackerUrl);
      html = emailShell(
        "You're no longer covering this task",
        inner,
        "You're receiving this because you were covering a handover task at Care Cuddle.",
        ALERT_COLOR,
      );
    } else {
      if (newAssignee) {
        const newFirst = firstName(newAssignee) || newAssignee;
        subject = `${newFirst} is now covering ${taskName} for you`;
        const inner =
          greeting(recipientName) +
          paragraph(`<strong>${esc(newAssignee)}</strong> will now cover <strong>${esc(taskName)}</strong> for <strong>${esc(clientName)}</strong> while you're away${previousAssignee ? `, taking over from <strong>${esc(previousAssignee)}</strong>` : ""}.`) +
          (due ? paragraph(`The task is needed by ${due}.`) : "") +
          paragraph(`Please make sure ${esc(newFirst)} has everything they need to pick it up.`) +
          button("Open the Handover Tracker", trackerUrl);
        html = emailShell(
          "Your cover has changed",
          inner,
          "You're receiving this because the cover on one of your handover tasks at Care Cuddle changed.",
        );
      } else {
        subject = `We're arranging new cover for ${taskName}`;
        const inner =
          greeting(recipientName) +
          paragraph(`${previousAssignee ? `<strong>${esc(previousAssignee)}</strong> is no longer covering` : "Nobody is currently covering"} <strong>${esc(taskName)}</strong> for <strong>${esc(clientName)}</strong> while you're away.`) +
          paragraph(`The admin team has been told and is arranging a new cover person — they'll confirm who takes it on. You don't need to chase this yourself.`) +
          (due ? paragraph(`The task is needed by ${due}.`) : "") +
          button("Open the Handover Tracker", trackerUrl);
        html = emailShell(
          "We're arranging new cover",
          inner,
          "You're receiving this because the cover on one of your handover tasks at Care Cuddle changed.",
          ALERT_COLOR,
        );
      }
    }

    const result = await resend.emails.send({
      from: EMAIL_SENDER,
      to: [recipientEmail],
      subject,
      html,
    });

    // A change that leaves the task with no cover needs someone with authority
    // to hear about it immediately — not just the person who can't act on it.
    // The dedupe guard stops the caller's paired "removed" + "cover_changed"
    // requests for one clearing event from alerting the admins twice.
    if (!newAssignee && shouldAlertUncovered(`${clientName}|${taskName}|${targetDate ?? ""}`)) {
      await alertAdminsTaskUncovered(clientName, taskName, previousAssignee, due, trackerUrl);
    }

    return new Response(JSON.stringify({ success: true, result }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: unknown) {
    console.error("send-handover-change-email error", error);
    const msg = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
};

serve(handler);
