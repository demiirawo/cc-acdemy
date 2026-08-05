// Runs on a schedule. Sends queued rejection emails whose send_after time has passed.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { Resend } from "npm:resend@2.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ============================================================================
// CARE CUDDLE — CANONICAL EMAIL HELPERS
// Inlined from the shared template. Do not restyle per function: the whole
// point is that every email in a staff member's inbox looks like it came from
// the same company on the same day.
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
 * failure, or a queued send that was quietly dropped), tell the admins instead
 * of returning success-shaped silence. Sends individually per admin.
 */
async function alertAdminsOfFailure(
  resendApiKey: string,
  what: string,      // "Cover assignment for Peace Jimoh"
  whoMissed: string, // "Oluwatosin (no email address on file)"
  advice: string = "They don't know about this yet — please tell them another way, or fix their email address and resend.",
): Promise<void> {
  try {
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: admins } = await admin.from("profiles").select("email").eq("role", "admin").not("email", "is", null);
    const emails: string[] = (admins ?? []).map((a: { email: string }) => a.email);
    if (emails.length === 0) return;
    const body =
      greeting(null) +
      paragraph(`We couldn't email <strong>${whoMissed}</strong> about: <strong>${what}</strong>.`) +
      paragraph(advice) +
      button("Open Care Cuddle", APP_URL);
    const shortName = whoMissed.split("(")[0].trim();
    const subjectName = shortName.length > 30 ? `${shortName.slice(0, 29).trimEnd()}…` : shortName;
    await Promise.all(emails.map((to) =>
      fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${resendApiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: EMAIL_SENDER,
          to: [to],
          subject: `We couldn't notify ${subjectName} — action needed`,
          html: emailShell("Someone wasn't notified", body, "You're receiving this because you're an admin at Care Cuddle.", "#d97706"),
        }),
      }).catch(() => {})
    ));
  } catch (_) { /* alerting must never break the main send */ }
}

// ============================================================================
// Candidate rejection email
// ============================================================================

const rejectionEmail = (name: string, roleTitle: string | null) => {
  const applied = roleTitle
    ? `Thank you for applying for the ${roleTitle} role at Care Cuddle.`
    : `Thank you for applying to join Care Cuddle.`;
  const body =
    greeting(name) +
    paragraph(`${applied} We're sorry to let you know we won't be taking your application further this time.`) +
    paragraph(`We really appreciate the time and effort you put into the assessment, and you're welcome to apply again for future roles.`) +
    paragraph(`If you'd like feedback on your application, just reply to this email and someone from the team will get back to you.`);
  return emailShell(
    "Our decision on your application",
    body,
    "You're receiving this because you applied for a role at Care Cuddle.",
  );
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const resend = new Resend(Deno.env.get("RESEND_API_KEY"));
  const resendApiKey = Deno.env.get("RESEND_API_KEY") ?? "";

  const { data: rows, error } = await supabase
    .from("pending_rejection_emails")
    .select("id, attempt_id, candidate_name, email")
    .is("sent_at", null)
    .is("cancelled_at", null)
    .lte("send_after", new Date().toISOString())
    .limit(50);

  if (error) {
    // Nobody reads this cron response — make sure a human hears about it.
    await alertAdminsOfFailure(
      resendApiKey,
      "queued application decision emails — today's run could not read the queue, so no candidate emails were sent",
      "waiting candidates (the email queue couldn't be read)",
      "No candidate emails went out on this run. The queue is retried automatically on the next run — if this keeps happening, please check the function logs.",
    );
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const results: any[] = [];

  for (const row of rows ?? []) {
    // Re-verify the attempt is still in "rejected" status before sending
    const { data: attempt } = await supabase
      .from("recruitment_attempts")
      .select("status, test_id")
      .eq("id", row.attempt_id)
      .maybeSingle();

    if (!attempt || attempt.status !== "rejected") {
      await supabase
        .from("pending_rejection_emails")
        .update({ cancelled_at: new Date().toISOString() })
        .eq("id", row.id);
      // The candidate now receives nothing on this path — never silently.
      await alertAdminsOfFailure(
        resendApiKey,
        "the decision on their Care Cuddle application — their queued rejection email was cancelled because the application is no longer marked as rejected, so they have not been told anything yet",
        `${row.candidate_name} (their queued email was cancelled before sending)`,
        "They haven't been told anything yet — if a decision is still due on their application, please contact them directly.",
      );
      results.push({ id: row.id, cancelled: true });
      continue;
    }

    if (!row.email || !row.email.trim()) {
      await alertAdminsOfFailure(
        resendApiKey,
        "the decision on their Care Cuddle application",
        `${row.candidate_name} (no email address on file)`,
      );
      results.push({ id: row.id, error: "no email address on file" });
      continue;
    }

    // Look up the role name for the email copy only — if this fails, the
    // email still goes out, just without naming the role.
    let roleTitle: string | null = null;
    try {
      const { data: test } = await supabase
        .from("recruitment_tests")
        .select("role")
        .eq("id", attempt.test_id)
        .maybeSingle();
      roleTitle = test?.role?.trim() || null;
    } catch (_) {
      roleTitle = null;
    }

    try {
      const sendResult = await resend.emails.send({
        from: EMAIL_SENDER,
        to: [row.email],
        subject: "Our decision on your Care Cuddle application",
        html: rejectionEmail(row.candidate_name, roleTitle),
      });
      await supabase
        .from("pending_rejection_emails")
        .update({ sent_at: new Date().toISOString() })
        .eq("id", row.id);
      results.push({ id: row.id, sent: true, sendResult });
    } catch (e: any) {
      await alertAdminsOfFailure(
        resendApiKey,
        "the decision on their Care Cuddle application — the email failed to send and will be retried on the next run",
        `${row.candidate_name} (the email could not be delivered)`,
      );
      results.push({ id: row.id, error: e?.message ?? String(e) });
    }
  }

  return new Response(JSON.stringify({ processed: results.length, results }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
