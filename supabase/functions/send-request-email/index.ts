import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "npm:resend@2.0.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const resend = new Resend(RESEND_API_KEY);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ============================================================================
// CARE CUDDLE — CANONICAL EMAIL HELPERS
// Inlined from the shared template. Do not restyle per function: every email in
// a staff member's inbox should look like it came from the same company on the
// same day.
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

/** "10 to 14 August" — compact range for subject lines, which stay near 60 chars. */
function shortDateRange(start: string, end: string): string {
  const s = new Date(start || end), e = new Date(end || start);
  if (isNaN(s.getTime()) || isNaN(e.getTime())) return "";
  const year = e.getFullYear() === new Date().getFullYear() ? "" : ` ${e.getFullYear()}`;
  if (s.getFullYear() === e.getFullYear() && s.getMonth() === e.getMonth()) {
    if (s.getDate() === e.getDate()) return `${e.getDate()} ${MONTHS[e.getMonth()]}${year}`;
    return `${s.getDate()} to ${e.getDate()} ${MONTHS[e.getMonth()]}${year}`;
  }
  return `${s.getDate()} ${MONTHS[s.getMonth()]} to ${e.getDate()} ${MONTHS[e.getMonth()]}${year}`;
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

/** Escape user-supplied text before interpolating it into HTML. */
function esc(text?: string | null): string {
  return (text ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
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
 * its own service-role client so any function can call it. Pass `opts.advice`
 * when the default "fix their email address" line doesn't fit the failure, and
 * `opts.buttonUrl` to deep-link the most useful page (never the homepage).
 */
async function alertAdminsOfFailure(
  resendApiKey: string,
  what: string,      // "Cover assignment for Peace Jimoh"
  whoMissed: string, // "Oluwatosin (no email address on file)"
  opts?: { advice?: string; buttonLabel?: string; buttonUrl?: string },
): Promise<void> {
  try {
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: admins } = await admin.from("profiles").select("email").eq("role", "admin").not("email", "is", null);
    const emails: string[] = (admins ?? []).map((a: { email: string }) => a.email);
    if (emails.length === 0) return;
    const body =
      greeting(null) +
      paragraph(`We couldn't email <strong>${esc(whoMissed)}</strong> about: <strong>${esc(what)}</strong>.`) +
      paragraph(opts?.advice ?? `They don't know about this yet — please tell them another way, or fix their email address and resend.`) +
      button(opts?.buttonLabel ?? "See staff requests", opts?.buttonUrl ?? `${APP_URL}/view/hr`);
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
// Function-specific bits
// ============================================================================

const AMBER = "#d97706";
const HANDOVER_VIDEO_URL = "https://www.youtube.com/watch?v=VGzR7cR1npA";

interface EmailRequest {
  type: "new_request" | "request_approved" | "request_rejected" | "cover_assigned" | "cover_confirmed" | "cover_removed";
  requestId?: string;
  /** Who the request is for — lets us check the rest of their team for clashes. */
  requesterUserId?: string;
  requestType?: string;
  requesterName?: string;
  requesterEmail?: string;
  startDate?: string;
  endDate?: string;
  daysRequested?: number;
  details?: string;
  reviewNotes?: string;
  reviewerName?: string;
  // Handover / cover fields
  impactedClients?: string[];
  assigneeName?: string;
  assigneeEmail?: string;
  coveredForName?: string;
  coveredForEmail?: string;
  coveredDates?: string[];
  /** Set when cover moves between people, so the wording says "changed". */
  previousAssigneeName?: string;
  newAssigneeName?: string;
}

/**
 * Anyone on the requester's team already off over the same dates. Computed here
 * rather than trusted from the caller, so the reviewer's warning is right no
 * matter where the request came from. Shares one definition with the request
 * form — the team_leave_clashes function in the database.
 */
async function fetchTeamClashes(
  userId: string,
  start: string,
  end: string,
  excludeRequestId?: string,
): Promise<Array<{ display_name: string; start_date: string; end_date: string; status: string; shared_clients: string[] }>> {
  try {
    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2.49.1");
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data, error } = await admin.rpc("team_leave_clashes", {
      p_user_id: userId,
      p_start: start,
      p_end: end,
      p_exclude_request_id: excludeRequestId ?? null,
    });
    if (error) throw error;
    return (data ?? []) as Array<{ display_name: string; start_date: string; end_date: string; status: string; shared_clients: string[] }>;
  } catch (e) {
    console.error("fetchTeamClashes failed", e);
    return [];
  }
}

const isHolidayType = (rt: string | undefined): boolean =>
  ["holiday", "holiday_paid", "holiday_unpaid"].includes(rt || "");

const isOvertimeType = (rt: string | undefined): boolean =>
  ["overtime", "overtime_standard", "overtime_double_up"].includes(rt || "");

/** Plain-English noun for prose ("5 days of paid holiday"). Empty for unknown codes — never echo raw codes to readers. */
const requestTypeNoun = (rt: string | undefined): string => {
  const nouns: Record<string, string> = {
    holiday_paid: "paid holiday",
    holiday_unpaid: "unpaid holiday",
    holiday: "holiday",
    shift_swap: "shift cover",
    overtime: "overtime",
    overtime_standard: "overtime",
    overtime_double_up: "double-up overtime",
  };
  return nouns[rt || ""] || "";
};

/** "one day" / "5 days" — never "undefined days" or "3 day(s)". */
const daysText = (n: number | undefined): string => {
  if (typeof n !== "number" || !isFinite(n) || n <= 0) return "";
  return n === 1 ? "one day" : `${n} days`;
};

/** "Sunrise Care, Hopewell and Rosewood" */
const listWithAnd = (items: string[]): string => {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0];
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
};

const handoverLink = (client: string): string =>
  `<a href="${APP_URL}/public/schedule/${encodeURIComponent(client)}" style="color:${BRAND_COLOR};font-weight:600;">${esc(client)}</a>`;

/** Inline handover links (the email's one button stays elsewhere). */
const handoverParagraphs = (intro: string, clients: string[]): string =>
  clients.length === 0
    ? ""
    : paragraph(`${intro} Open the Handover Tracker for ${listWithAnd(clients.map(handoverLink))}.`) +
      mutedParagraph(`New to the Handover Tracker? <a href="${HANDOVER_VIDEO_URL}" style="color:${BRAND_COLOR};font-weight:600;">Watch this short guide</a>.`);

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const emailRequest: EmailRequest = await req.json();
    const {
      type,
      requestId,
      requesterUserId,
      requestType,
      requesterName,
      requesterEmail,
      startDate,
      endDate,
      daysRequested,
      details,
      reviewNotes,
      reviewerName,
      impactedClients,
      assigneeName,
      assigneeEmail,
      coveredForName,
      coveredForEmail,
      coveredDates,
      previousAssigneeName,
      newAssigneeName,
    } = emailRequest;

    // Reviewers get taken to the request itself. Without an id we still send
    // them to the requests list rather than the HR page, which lands whoever
    // clicks it on their own profile.
    const reviewLink = requestId
      ? `${APP_URL}/view/schedule?request=${encodeURIComponent(requestId)}`
      : `${APP_URL}/view/schedule`;

    const noun = requestTypeNoun(requestType);
    const range = niceDateRange(startDate ?? "", endDate ?? "");
    const shortRange = shortDateRange(startDate ?? "", endDate ?? "");
    const days = daysText(daysRequested);

    const sendOne = (to: string, subject: string, html: string) =>
      resend.emails.send({ from: EMAIL_SENDER, to: [to], subject, html });

    let emailResult;

    if (type === "new_request") {
      const requesterFirst = firstName(requesterName) || requesterName || "A staff member";

      // What was asked for, as one plain sentence for the admin email.
      const requesterHtml = esc(requesterName || "A staff member");
      let storySentence: string;
      if (isHolidayType(requestType)) {
        storySentence = `<strong>${requesterHtml}</strong> has asked for ${range ? `<strong>${range}</strong> off` : "time off"}${days ? ` — ${days} of ${noun}` : ""}.`;
      } else if (requestType === "shift_swap") {
        storySentence = `<strong>${requesterHtml}</strong> has asked for cover for their shifts${range ? ` on <strong>${range}</strong>` : ""}.`;
      } else if (isOvertimeType(requestType)) {
        storySentence = `<strong>${requesterHtml}</strong> has asked to work ${noun}${range ? ` on <strong>${range}</strong>` : ""}${days ? ` — ${days}` : ""}.`;
      } else {
        storySentence = `<strong>${requesterHtml}</strong> has sent a new request${range ? ` for <strong>${range}</strong>` : ""}.`;
      }

      // Confirm receipt to the requester, so silence can be chased. Sent only
      // once the reviewer lookup has succeeded (or been skipped), so a failed
      // lookup and retry can't duplicate the receipt.
      const sendReceipt = async () => {
        if (!requesterEmail) return;
        const confirmBody =
          greeting(requesterName) +
          paragraph(`We've received your ${noun || "request"}${noun ? " request" : ""}${range ? ` for <strong>${range}</strong>` : ""}${days && isHolidayType(requestType) ? ` — ${days} of ${noun}` : ""}, and the admin team will review it soon.`) +
          paragraph(`You'll get another email as soon as it's decided.`) +
          button("See your requests", `${APP_URL}/view/hr`);
        await sendOne(
          requesterEmail,
          `We've received your ${noun || ""}${noun ? " " : ""}request`,
          emailShell("We've received your request", confirmBody, "You're receiving this because you sent a request on Care Cuddle.")
        );
      };

      // Recipients are role-configured in notification_settings ("new_request"),
      // defaulting to admins + HR who manage holiday/shift requests.
      const { data: reqSetting } = await supabaseClient
        .from("notification_settings")
        .select("is_enabled, recipient_roles")
        .eq("notification_type", "new_request")
        .maybeSingle();

      if (reqSetting && reqSetting.is_enabled === false) {
        console.log("new_request notifications disabled — no reviewer was emailed; alerting admins");
        await sendReceipt();
        await alertAdminsOfFailure(
          RESEND_API_KEY,
          `A new ${noun || "staff"} request from ${requesterName || "a staff member"}${range ? ` (${range})` : ""}`,
          "the admin team",
          {
            advice: "New-request notifications are turned off in the settings, so no reviewer was emailed automatically. Please review this request in the portal, and turn the notification back on if that isn't intended.",
            buttonLabel: "Review staff requests",
            buttonUrl: `${APP_URL}/view/hr`,
          }
        );
        return new Response(
          JSON.stringify({ success: true, skipped: true, message: "New request notifications disabled" }),
          { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }

      const recipientRoles: string[] = Array.isArray(reqSetting?.recipient_roles) && reqSetting.recipient_roles.length > 0
        ? reqSetting.recipient_roles
        : ["admin", "human_resources"];

      const { data: adminProfiles, error: adminError } = await supabaseClient
        .from("profiles")
        .select("user_id, email, display_name")
        .in("role", recipientRoles);

      if (adminError) {
        console.error("Error fetching admin profiles:", adminError);
        await alertAdminsOfFailure(
          RESEND_API_KEY,
          `A new ${noun || "staff"} request from ${requesterName || "a staff member"}${range ? ` (${range})` : ""}`,
          "the admin team",
          {
            advice: "The lookup of reviewer accounts failed, so no reviewer was emailed. Please review this request in the portal.",
            buttonLabel: "Review staff requests",
            buttonUrl: `${APP_URL}/view/hr`,
          }
        );
        throw new Error("Failed to fetch admin emails");
      }

      // Someone who has left keeps their account until it is closed, but they
      // are no longer a reviewer. The leaving date is inclusive.
      const { data: reviewerHr } = await supabaseClient
        .from("hr_profiles")
        .select("user_id, employment_end_date");
      const todayIso = new Date().toISOString().slice(0, 10);
      const leftAlready = new Set(
        (reviewerHr || [])
          .filter((h: { employment_end_date: string | null }) =>
            h.employment_end_date && h.employment_end_date < todayIso)
          .map((h: { user_id: string }) => h.user_id),
      );

      const adminRecipients = (adminProfiles || [])
        .filter((p) => p.email)
        .filter((p) => !leftAlready.has(p.user_id as string));

      if (adminRecipients.length === 0) {
        console.warn("No admin emails found — alerting admins of the gap");
        await sendReceipt();
        await alertAdminsOfFailure(
          RESEND_API_KEY,
          `A new ${noun || "staff"} request from ${requesterName || "a staff member"}${range ? ` (${range})` : ""}`,
          "the admin team",
          {
            advice: "Nobody with a reviewer role has an email address on file, so no reviewer was emailed. Please add an email address for a reviewer, and review this request in the portal.",
            buttonLabel: "Review staff requests",
            buttonUrl: `${APP_URL}/view/hr`,
          }
        );
        return new Response(
          JSON.stringify({ success: true, skipped: true, message: "No admin emails to notify" }),
          { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }

      await sendReceipt();

      console.log("Sending new request notification to reviewers, individually:", adminRecipients.map((p) => p.email));

      const subjectNoun = isOvertimeType(requestType) ? "overtime" : noun;
      const subject = subjectNoun
        ? `${requesterFirst} has requested ${subjectNoun}${shortRange ? ` — ${shortRange}` : ""}`
        : `${requesterFirst} has sent a new request`;

      // Warn the reviewer when someone covering the same client is already off
      // over these dates. It does not change the request — it is the thing they
      // would otherwise have to remember to check by hand.
      let clashHtml = "";
      if (isHolidayType(requestType) && requesterUserId && startDate && endDate) {
        const clashes = await fetchTeamClashes(requesterUserId, startDate, endDate, requestId);
        if (clashes.length > 0) {
          const lines = clashes.map((c) => {
            const when = niceDateRange(c.start_date, c.end_date);
            const pending = c.status === "pending" ? " (requested, not yet approved)" : "";
            const shared = c.shared_clients?.length
              ? ` — both on ${esc(c.shared_clients.join(", "))}`
              : "";
            return `<li style="margin-bottom:6px;"><strong>${esc(c.display_name)}</strong>: ${esc(when)}${pending}${shared}</li>`;
          }).join("");

          clashHtml =
            `<div style="border-left:4px solid #f59e0b;background:#fffbeb;padding:12px 16px;margin:0 0 16px;">
               <p style="color:#92400e;font-size:15px;font-weight:600;margin:0 0 8px;">
                 ${clashes.length === 1 ? "Someone on the same team is already off then" : `${clashes.length} people on the same team are already off then`}
               </p>
               <ul style="color:#374151;font-size:14px;line-height:1.6;margin:0;padding-left:20px;">${lines}</ul>
               <p style="color:#92400e;font-size:13px;line-height:1.6;margin:8px 0 0;">
                 Approving this would leave that client without their usual cover.
               </p>
             </div>`;
        }
      }

      // One email per reviewer — never every address in one visible to: field.
      const results = [];
      for (const recipient of adminRecipients) {
        const bodyContent =
          greeting(recipient.display_name) +
          paragraph(storySentence) +
          (details ? paragraph(`In their words: &ldquo;${esc(details)}&rdquo;`) : "") +
          clashHtml +
          paragraph(`Please review it and let ${requesterFirst === "A staff member" ? "them" : esc(requesterFirst)} know.`) +
          button(`Review ${requesterFirst === "A staff member" ? "this" : `${esc(requesterFirst)}'s`} request`, reviewLink);
        const res = await sendOne(
          recipient.email as string,
          subject,
          emailShell("A new staff request", bodyContent, "You're receiving this because you review staff requests at Care Cuddle.")
        );
        results.push(res);
      }
      emailResult = results;
    } else if (type === "request_approved" || type === "request_rejected") {
      const isApproved = type === "request_approved";

      if (!requesterEmail) {
        console.warn(`No requester email for ${type} — alerting admins`);
        await alertAdminsOfFailure(
          RESEND_API_KEY,
          `${requesterName || "A staff member"}'s ${noun || "staff"} request${range ? ` for ${range}` : ""} was ${isApproved ? "approved" : "not approved"}`,
          `${requesterName || "The requester"} (no email address on file)`
        );
        return new Response(
          JSON.stringify({ success: true, skipped: true, message: "No requester email to notify" }),
          { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }

      const reviewerFirst = firstName(reviewerName);
      const approver = reviewerFirst || "The admin team";
      console.log(`Sending ${isApproved ? "approved" : "not approved"} notification to:`, requesterEmail);

      let bodyContent: string;
      let subject: string;
      let headerTitle: string;

      const approverHtml = esc(approver);

      if (isApproved) {
        headerTitle = `Your ${noun || "request"} is approved`;
        subject = `Your ${noun || "request"} is approved${shortRange ? ` — ${shortRange}` : ""}`;
        const onRota = isOvertimeType(requestType)
          ? "These shifts are now on your rota in the portal."
          : "These days are now marked on your rota in the portal.";
        bodyContent =
          greeting(requesterName) +
          paragraph(`Good news — ${approverHtml} approved your ${noun || "request"}${range ? ` for <strong>${range}</strong>` : ""}${days && noun ? ` (${days}${isHolidayType(requestType) ? ` of ${noun}` : ""})` : ""}.`) +
          paragraph(onRota) +
          (reviewNotes ? paragraph(`${approverHtml} added a note: &ldquo;${esc(reviewNotes)}&rdquo;`) : "") +
          (isHolidayType(requestType)
            ? handoverParagraphs(
                "Before your holiday, please start the handover so your cover knows what to do.",
                impactedClients || []
              )
            : "") +
          button("See your requests", `${APP_URL}/view/hr`);
      } else {
        headerTitle = "Your request wasn't approved";
        subject = `Your ${noun || ""}${noun ? " " : ""}request wasn't approved`;
        bodyContent =
          greeting(requesterName) +
          paragraph(`We're sorry — ${approverHtml} didn't approve your ${noun || "request"}${noun ? " request" : ""}${range ? ` for <strong>${range}</strong>` : ""}.`) +
          (reviewNotes
            ? paragraph(`${approverHtml} explained: &ldquo;${esc(reviewNotes)}&rdquo;`)
            : "") +
          paragraph(`If you'd like to talk it through, please speak to ${esc(reviewerFirst) || "your manager"}.`) +
          button("See your requests", `${APP_URL}/view/hr`);
      }

      emailResult = await sendOne(
        requesterEmail,
        subject,
        emailShell(headerTitle, bodyContent, "You're receiving this because you sent a request on Care Cuddle.")
      );
    } else if (type === "cover_assigned") {
      const clients = impactedClients || [];
      const dates = coveredDates || [];
      const datesLabel = niceDateList(dates);
      const coveredFirst = firstName(coveredForName);

      if (!assigneeEmail) {
        console.warn("No assignee email for cover_assigned — alerting admins");
        await alertAdminsOfFailure(
          RESEND_API_KEY,
          `Cover${coveredForName ? ` for ${coveredForName}'s shifts` : " shifts"}${datesLabel ? ` on ${datesLabel}` : ""}`,
          `${assigneeName || "The person assigned to cover"} (no email address on file)`,
          { buttonLabel: "Open the schedule", buttonUrl: `${APP_URL}/view/schedule` }
        );
        return new Response(
          JSON.stringify({ success: true, skipped: true, message: "No assignee email to notify" }),
          { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }

      // niceDate returns "" for unparseable input — fall through to the
      // dateless wording rather than a dangling "covering Tom on ".
      const singleDateLabel = dates.length === 1 ? niceDate(dates[0]) : "";
      const subject = coveredFirst
        ? (singleDateLabel
            ? `You're covering ${coveredFirst} on ${singleDateLabel}`
            : `You're covering ${coveredFirst}'s shifts${dates.length > 1 ? ` — ${daysText(dates.length)}` : ""}`)
        : `You've been assigned cover shifts${datesLabel ? ` — ${daysText(dates.length)}` : ""}`;

      const bodyContent =
        greeting(assigneeName) +
        paragraph(
          coveredForName
            ? `You're covering <strong>${esc(coveredForName)}</strong>'s shifts${datesLabel ? ` on <strong>${datesLabel}</strong>` : ""}.`
            : `You've been assigned cover shifts${datesLabel ? ` on <strong>${datesLabel}</strong>` : ""}.`
        ) +
        (coveredForName
          ? paragraph(`Please contact ${esc(coveredFirst || coveredForName)}${coveredForEmail ? ` at <a href="mailto:${esc(coveredForEmail)}" style="color:${BRAND_COLOR};font-weight:600;">${esc(coveredForEmail)}</a>` : ""} to arrange the handover, so you're ready for their clients.`)
          : "") +
        handoverParagraphs("The Handover Tracker shows what you need for each client.", clients) +
        button("See your schedule", `${APP_URL}/view/schedule`);

      emailResult = await sendOne(
        assigneeEmail,
        subject,
        emailShell(
          coveredFirst ? `You're covering ${esc(coveredFirst)}'s shifts` : "You've been assigned cover shifts",
          bodyContent,
          "You're receiving this because cover shifts were assigned to you at Care Cuddle."
        )
      );
    } else if (type === "cover_confirmed") {
      // To the person going on leave. They were the one who asked for the time
      // off and had no way of knowing it had been arranged — the only email went
      // to the colleague picking it up.
      const clients = impactedClients || [];
      const dates = coveredDates || [];
      const datesLabel = niceDateList(dates);
      const coverFirst = firstName(assigneeName);
      const changed = !!previousAssigneeName && previousAssigneeName !== assigneeName;

      if (!coveredForEmail) {
        console.warn("No covered-for email for cover_confirmed — alerting admins");
        await alertAdminsOfFailure(
          RESEND_API_KEY,
          `${assigneeName ? `${assigneeName} is covering their shifts` : "Cover has been arranged for their shifts"}${datesLabel ? ` on ${datesLabel}` : ""}`,
          `${coveredForName || "The person going on leave"} (no email address on file)`,
          { buttonLabel: "Open the schedule", buttonUrl: `${APP_URL}/view/schedule` }
        );
        return new Response(
          JSON.stringify({ success: true, skipped: true, message: "No covered-for email to notify" }),
          { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }

      const firstSentence = changed
        ? `Your cover has changed — <strong>${esc(assigneeName)}</strong> is now covering your shifts${datesLabel ? ` on <strong>${datesLabel}</strong>` : ""}, taking over from ${esc(previousAssigneeName)}.`
        : assigneeName
          ? `<strong>${esc(assigneeName)}</strong> is covering your shifts${datesLabel ? ` on <strong>${datesLabel}</strong>` : ""} while you're away.`
          : `Cover has been arranged for your shifts${datesLabel ? ` on <strong>${datesLabel}</strong>` : ""} while you're away.`;

      const bodyContent =
        greeting(coveredForName) +
        paragraph(firstSentence) +
        (assigneeName
          ? paragraph(`If you haven't already, please complete the handover with ${esc(coverFirst || assigneeName)}${assigneeEmail ? ` at <a href="mailto:${esc(assigneeEmail)}" style="color:${BRAND_COLOR};font-weight:600;">${esc(assigneeEmail)}</a>` : ""}, so they have what they need for your clients.`)
          : "") +
        handoverParagraphs("Please work through the handover for each client.", clients) +
        button("See your requests", `${APP_URL}/view/hr`);

      // niceDate returns "" for unparseable input — fall through to the
      // dateless wording rather than a dangling "your shifts on ".
      const singleDateLabel = dates.length === 1 ? niceDate(dates[0]) : "";
      const subject = changed
        ? `Your cover changed — ${coverFirst || assigneeName} is now covering your shifts`
        : assigneeName
          ? `${coverFirst || assigneeName} is covering your shifts${singleDateLabel ? ` on ${singleDateLabel}` : " while you're away"}`
          : "Cover is arranged for your shifts";

      emailResult = await sendOne(
        coveredForEmail,
        subject,
        emailShell(changed ? "Your cover has changed" : "Your cover is arranged", bodyContent, "You're receiving this because cover was arranged for your shifts at Care Cuddle.")
      );
    } else if (type === "cover_removed") {
      // To whoever was covering before. Without this they keep believing they're
      // on those shifts, which is the worst of the three ways to get this wrong.
      const dates = coveredDates || [];
      const datesLabel = niceDateList(dates);
      const coveredFirst = firstName(coveredForName);
      const oldCoverFirst = firstName(assigneeName);

      if (assigneeEmail) {
        const standDownBody =
          greeting(assigneeName) +
          paragraph(`You're no longer covering ${coveredForName ? `<strong>${esc(coveredForName)}</strong>'s shifts` : "the cover shifts you were given"}${datesLabel ? ` on <strong>${datesLabel}</strong>` : ""} — please don't work them.`) +
          paragraph(
            newAssigneeName
              ? `<strong>${esc(newAssigneeName)}</strong> is covering instead, so there's nothing more for you to do.`
              : "The admin team is arranging replacement cover, so there's nothing more for you to do."
          ) +
          paragraph("Your own shifts aren't affected.") +
          button("See your schedule", `${APP_URL}/view/schedule`);

        emailResult = await sendOne(
          assigneeEmail,
          coveredFirst ? `You're no longer covering ${coveredFirst}` : "Your cover shifts have been cancelled",
          emailShell("You're no longer covering these shifts", standDownBody, "You're receiving this because your cover shifts changed at Care Cuddle.", AMBER)
        );
      } else {
        console.warn("No previous assignee email for cover_removed — alerting admins");
        await alertAdminsOfFailure(
          RESEND_API_KEY,
          `They are no longer covering ${coveredForName ? `${coveredForName}'s shifts` : "some shifts"}${datesLabel ? ` on ${datesLabel}` : ""} and must be stood down`,
          `${assigneeName || "The previous cover person"} (no email address on file)`,
          { buttonLabel: "Open the schedule", buttonUrl: `${APP_URL}/view/schedule` }
        );
      }

      // The person going on leave needs to know their cover has gone too —
      // otherwise they believe they're covered when they're not.
      if (coveredForEmail) {
        const coveredBody =
          greeting(coveredForName) +
          paragraph(`${assigneeName ? `<strong>${esc(assigneeName)}</strong> is` : "Your cover is"} no longer covering your shifts${datesLabel ? ` on <strong>${datesLabel}</strong>` : ""}.`) +
          paragraph(
            newAssigneeName
              ? `<strong>${esc(newAssigneeName)}</strong> will cover instead — we'll make sure they get your handover.`
              : "The admin team is arranging replacement cover and will confirm who as soon as possible. If your time off is soon and you haven't heard, please contact the admin team."
          ) +
          button("See your requests", `${APP_URL}/view/hr`);
        await sendOne(
          coveredForEmail,
          oldCoverFirst ? `${oldCoverFirst} is no longer covering your shifts` : "Your cover has changed",
          emailShell("Your cover has changed", coveredBody, "You're receiving this because cover for your shifts changed at Care Cuddle.", AMBER)
        );
      } else {
        console.warn("No covered-for email for cover_removed — alerting admins");
        await alertAdminsOfFailure(
          RESEND_API_KEY,
          `${assigneeName || "Their cover"} is no longer covering their shifts${datesLabel ? ` on ${datesLabel}` : ""}${newAssigneeName ? ` — ${newAssigneeName} is covering instead` : " and no replacement is in place yet"}`,
          `${coveredForName || "The person being covered"} (no email address on file)`,
          { buttonLabel: "Open the schedule", buttonUrl: `${APP_URL}/view/schedule` }
        );
      }

      // Admins get an immediate copy whenever cover is removed — a stood-down
      // cover is one of the few changes that can leave shifts unworked.
      try {
        const { data: adminProfiles, error: adminError } = await supabaseClient
          .from("profiles")
          .select("email, display_name")
          .eq("role", "admin")
          .not("email", "is", null);
        if (adminError) {
          console.error("Error fetching admins for cover_removed copy:", adminError);
        } else {
          const newCoverFirst = firstName(newAssigneeName) || newAssigneeName;
          const adminSubject = newAssigneeName
            ? `Cover changed — ${newCoverFirst} is now covering ${coveredFirst || "these shifts"}`
            : `Cover removed — ${coveredForName || "someone"} needs cover again`;
          for (const admin of adminProfiles || []) {
            const adminBody =
              greeting(admin.display_name) +
              paragraph(`${assigneeName ? `<strong>${esc(assigneeName)}</strong> is` : "The assigned cover is"} no longer covering ${coveredForName ? `<strong>${esc(coveredForName)}</strong>'s shifts` : "some cover shifts"}${datesLabel ? ` on <strong>${datesLabel}</strong>` : ""}.`) +
              paragraph(
                newAssigneeName
                  ? `<strong>${esc(newAssigneeName)}</strong> is covering instead — nothing to arrange.`
                  : "No replacement is in place yet — please arrange new cover so these shifts aren't missed."
              ) +
              button("Open the schedule", `${APP_URL}/view/schedule`);
            await sendOne(
              admin.email as string,
              adminSubject,
              emailShell("A cover arrangement was removed", adminBody, "You're receiving this because you're an admin at Care Cuddle.", AMBER)
            );
          }
        }
      } catch (adminCopyError) {
        console.error("Failed to send admin copies for cover_removed:", adminCopyError);
      }
    } else {
      throw new Error(`Unknown email type: ${type}`);
    }

    console.log("Email sent successfully:", emailResult);

    return new Response(JSON.stringify({ success: true, result: emailResult }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: unknown) {
    console.error("Error in send-request-email function:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

serve(handler);
