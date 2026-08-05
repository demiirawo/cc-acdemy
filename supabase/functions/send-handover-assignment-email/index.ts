import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "npm:resend@2.0.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const resend = new Resend(RESEND_API_KEY);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ============================================================================
// CARE CUDDLE — CANONICAL EMAIL HELPERS
// Shared across every email-sending edge function. Do not restyle per function.
// ============================================================================

const EMAIL_SENDER = "Care Cuddle <hello@care-cuddle-academy.co.uk>";
const BRAND_COLOR = "#5F17EB";
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
 * its own service-role client so any function can call it. Returns true only
 * when at least one admin alert was accepted by Resend.
 */
async function alertAdminsOfFailure(
  resendApiKey: string,
  what: string,      // "Cover assignment for Peace Jimoh"
  whoMissed: string, // "Oluwatosin (no email address on file)"
): Promise<boolean> {
  try {
    if (!resendApiKey) return false;
    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2.57.4");
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: admins } = await admin.from("profiles").select("email").eq("role", "admin").not("email", "is", null);
    const emails: string[] = (admins ?? []).map((a: { email: string }) => a.email);
    if (emails.length === 0) return false;
    const body =
      greeting(null) +
      paragraph(`We couldn't email <strong>${esc(whoMissed)}</strong> about: <strong>${esc(what)}</strong>.`) +
      paragraph(`They don't know about this yet — please tell them another way, or fix their email address and resend.`) +
      button("Open Care Cuddle", APP_URL);
    const results = await Promise.all(emails.map((to) =>
      fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${resendApiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: EMAIL_SENDER,
          to: [to],
          subject: `We couldn't notify ${clampName(whoMissed.split("(")[0].trim(), 25)} — action needed`,
          html: emailShell("Someone wasn't notified", body, "You're receiving this because you're an admin at Care Cuddle.", "#d97706"),
        }),
      }).catch(() => null)
    ));
    return results.some((r) => r !== null && r.ok);
  } catch (_) {
    /* alerting must never break the main send */
    return false;
  }
}

/** Trim long user-supplied names so subject lines stay near the ~60-char budget. */
function clampName(value: string, max: number): string {
  const v = value.trim();
  return v.length > max ? `${v.slice(0, max - 1).trimEnd()}…` : v;
}

/** Escape user-supplied text before it goes into email HTML. */
function esc(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ============================================================================

interface Payload {
  assigneeEmail: string;
  assigneeName?: string;
  clientName: string;
  taskName: string;
  taskDescription?: string | null;
  link?: string | null;
  handedOverBy?: string | null;
  targetDate?: string | null;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = (await req.json()) as Payload;
    const {
      assigneeEmail,
      assigneeName,
      clientName,
      taskName,
      taskDescription,
      link,
      handedOverBy,
      targetDate,
    } = body;

    if (!assigneeEmail || !clientName || !taskName) {
      // A real task with no reachable assignee must never fail silently:
      // tell the admins so someone passes the message on another way.
      let adminsAlerted = false;
      if (!assigneeEmail && clientName && taskName) {
        adminsAlerted = await alertAdminsOfFailure(
          RESEND_API_KEY,
          `The handover task "${taskName}" for ${clientName}`,
          `${(assigneeName ?? "").trim() || "the person assigned"} (no email address on file)`,
        );
      }
      return new Response(
        JSON.stringify({ error: "Missing required fields", adminsAlerted }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } },
      );
    }

    const assigneeLabel = (assigneeName ?? "").trim();
    const hbName = (handedOverBy ?? "").trim();
    const hbFirst = firstName(hbName);
    const dueNice = targetDate ? niceDate(targetDate) : "";

    const safeClient = esc(clientName);
    const safeTask = esc(taskName);
    const safeHb = esc(hbName);
    const safeAssignee = esc(assigneeLabel);

    const dueClause = dueNice
      ? `, and it needs to be finished by <strong>${dueNice}</strong>`
      : "";

    // ---- Email 1: the assignee -------------------------------------------
    const assigneeBody =
      greeting(assigneeName) +
      paragraph(
        hbName
          ? `<strong>${safeHb}</strong> has handed the task "${safeTask}" for <strong>${safeClient}</strong> over to you${dueClause}.`
          : `The handover task "${safeTask}" for <strong>${safeClient}</strong> is now yours${dueClause}.`,
      ) +
      (taskDescription
        ? paragraph(`Here's what needs doing${hbFirst ? `, in ${esc(hbFirst)}'s words` : ""}: "${esc(taskDescription)}"`)
        : "") +
      (link
        ? paragraph(`There's a link with more detail to help you — <a href="${esc(link)}" style="color:${BRAND_COLOR};">open the task's link</a>.`)
        : "") +
      paragraph(
        `When you've finished, please tick the task off in the Handover Tracker. ` +
          (hbFirst
            ? `If anything is unclear, ${esc(hbFirst)} is the person to ask.`
            : `If anything is unclear, ask the admin team.`),
      ) +
      button("Open the Handover Tracker", `${APP_URL}/view/clients`);

    const html = emailShell(
      "You have a new handover task",
      assigneeBody,
      "You're receiving this because a handover task at Care Cuddle was assigned to you.",
    );

    const result = await resend.emails.send({
      from: EMAIL_SENDER,
      to: [assigneeEmail],
      subject: `You have a new handover task for ${clampName(clientName, 25)}`,
      html,
    });

    if ((result as { error?: { message?: string } | null }).error) {
      const adminsAlerted = await alertAdminsOfFailure(
        RESEND_API_KEY,
        `The handover task "${taskName}" for ${clientName}`,
        `${assigneeLabel || assigneeEmail} (the email failed to send)`,
      );
      return new Response(
        JSON.stringify({ error: "Failed to send assignment email", adminsAlerted }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } },
      );
    }

    // ---- Email 2: confirmation to the person who handed the task over ----
    // Best-effort: the person is directly affected (their work is moving to
    // someone else), so they get an immediate confirmation the handover
    // reached its new owner. If we can't resolve their address, the main
    // send above has still succeeded.
    let handedOverByNotified = false;
    if (hbName) {
      try {
        const admin = createClient(
          Deno.env.get("SUPABASE_URL")!,
          Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
        );
        const { data: hbProfile } = await admin
          .from("profiles")
          .select("email, display_name")
          .ilike("display_name", hbName.replace(/[\\%_]/g, "\\$&"))
          .limit(1)
          .maybeSingle();
        const hbEmail: string | null = hbProfile?.email ?? null;
        if (hbEmail && hbEmail.toLowerCase() !== assigneeEmail.toLowerCase()) {
          const confirmBody =
            greeting(hbName) +
            paragraph(
              assigneeLabel
                ? `<strong>${safeAssignee}</strong> is now looking after your handover task "${safeTask}" for <strong>${safeClient}</strong> — we've emailed them the details${dueNice ? `, including the deadline of <strong>${dueNice}</strong>` : ""}.`
                : `Your handover task "${safeTask}" for <strong>${safeClient}</strong> has been passed on, and the person taking it over has been emailed the details${dueNice ? `, including the deadline of <strong>${dueNice}</strong>` : ""}.`,
            ) +
            paragraph(`Nothing more for you to do — this is just so you know the handover reached them.`) +
            button("Open the Handover Tracker", `${APP_URL}/view/clients`);
          const confirmResult = await resend.emails.send({
            from: EMAIL_SENDER,
            to: [hbEmail],
            subject: assigneeLabel
              ? `Your handover task is now with ${clampName(assigneeLabel, 25)}`
              : `Your handover task has been passed on`,
            html: emailShell(
              "Your handover task has been passed on",
              confirmBody,
              "You're receiving this because you handed a task over in the Care Cuddle Handover Tracker.",
            ),
          });
          handedOverByNotified = !(confirmResult as { error?: unknown }).error;
        }
      } catch (confirmError) {
        console.warn("Handover confirmation email failed", confirmError);
      }
    }

    return new Response(JSON.stringify({ success: true, result, handedOverByNotified }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: unknown) {
    console.error("send-handover-assignment-email error", error);
    const msg = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
};

serve(handler);
