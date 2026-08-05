// Set the pipeline stage on a recruitment attempt and email the candidate.
// Stages: 'rejected' | 'interview' | 'success'
// - rejected  -> queues the rejection email (sent ~12 hours later by the
//                process-pending-rejections function, which owns that copy)
// - interview -> emails the candidate an interview booking invitation now
// - success   -> emails the candidate the good news now
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { Resend } from "npm:resend@2.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
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
 * failure), tell the admins instead of returning success-shaped silence. Creates
 * its own service-role client so any function can call it.
 */
async function alertAdminsOfFailure(
  resendApiKey: string,
  what: string,      // "Cover assignment for Peace Jimoh"
  whoMissed: string, // "Oluwatosin (no email address on file)"
): Promise<void> {
  try {
    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2.45.0");
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: admins } = await admin.from("profiles").select("email").eq("role", "admin").not("email", "is", null);
    const emails: string[] = (admins ?? []).map((a: { email: string }) => a.email);
    if (emails.length === 0) return;
    const body =
      greeting(null) +
      paragraph(`We couldn't email <strong>${esc(whoMissed)}</strong> about: <strong>${esc(what)}</strong>.`) +
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
// End of canonical helpers
// ============================================================================

/** Escape user-supplied text before it goes into email HTML. */
function esc(s?: string | null): string {
  return (s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const INTERVIEW_LINK = "https://calendar.app.google/ChJ2sXR7vfN9FopQ8";

type Stage = "rejected" | "interview" | "success";

// The rejection email itself is rendered and sent by the
// process-pending-rejections function about 12 hours after the stage change —
// no rejection copy lives in this file.

const interviewEmail = (name?: string | null) =>
  emailShell(
    "You're invited to an interview",
    greeting(esc(name)) +
      paragraph(
        `Good news — we'd like to interview you for the Administrator role at Care Cuddle. Please book a time that suits you using the button below.`,
      ) +
      paragraph(
        `The interview is a video call on Google Meet. We'll talk about your experience, explain what the role involves, and answer any questions you have.`,
      ) +
      button("Book your interview", INTERVIEW_LINK) +
      mutedParagraph(
        `If the button doesn't work, copy and paste this link into your browser:<br/>${INTERVIEW_LINK}`,
      ) +
      paragraph(`If you have any questions before then, just reply to this email.`),
    "You're receiving this because you applied for a role at Care Cuddle.",
  );

const successEmail = (name?: string | null) =>
  emailShell(
    "Your application was successful",
    greeting(esc(name)) +
      paragraph(
        `Good news — your application for the Administrator role at Care Cuddle has been successful. Congratulations!`,
      ) +
      paragraph(
        `We'll be in touch soon with your next steps. There's nothing you need to do right now — if you have any questions, just reply to this email.`,
      ),
    "You're receiving this because you applied for a role at Care Cuddle.",
  );

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const attemptId: string | undefined = body?.attempt_id;
    const stage: Stage | undefined = body?.stage;

    if (!attemptId || !stage || !["rejected", "interview", "success"].includes(stage)) {
      return new Response(JSON.stringify({ error: "attempt_id and valid stage required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify caller is an admin
    const supabaseAuth = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } },
    );
    const { data: userData } = await supabaseAuth.auth.getUser();
    const userId = userData?.user?.id;
    if (!userId) {
      return new Response(JSON.stringify({ error: "not authenticated" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("user_id", userId)
      .maybeSingle();
    if (profile?.role !== "admin") {
      return new Response(JSON.stringify({ error: "admin only" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: attempt, error: aErr } = await supabase
      .from("recruitment_attempts")
      .select("id, candidate_name, email")
      .eq("id", attemptId)
      .maybeSingle();
    if (aErr || !attempt) {
      return new Response(JSON.stringify({ error: "attempt not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Update status
    const { error: upErr } = await supabase
      .from("recruitment_attempts")
      .update({ status: stage })
      .eq("id", attemptId);
    if (upErr) {
      return new Response(JSON.stringify({ error: upErr.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Audit
    await supabase.from("recruitment_events").insert({
      attempt_id: attemptId,
      event_type: "stage_changed",
      metadata: { stage, by: userId },
    });

    // Cancel any pending rejection emails when stage moves away from "rejected"
    if (stage !== "rejected") {
      await supabase
        .from("pending_rejection_emails")
        .update({ cancelled_at: new Date().toISOString() })
        .eq("attempt_id", attemptId)
        .is("sent_at", null)
        .is("cancelled_at", null);
    }

    const resendApiKey = Deno.env.get("RESEND_API_KEY") ?? "";
    const candidateEmail = (attempt.email ?? "").trim();
    const candidateLabel = (attempt.candidate_name ?? "").trim() || "This candidate";

    let emailResult: any = null;
    let queued = false;

    if (stage === "rejected") {
      // Delay rejection by 12 hours — queue it instead of sending now
      const sendAfter = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString();
      const { error: qErr } = await supabase
        .from("pending_rejection_emails")
        .insert({
          attempt_id: attemptId,
          candidate_name: attempt.candidate_name,
          email: attempt.email,
          send_after: sendAfter,
        });
      if (qErr) {
        emailResult = { error: qErr.message };
        // Silent failure is banned: the candidate would never hear back.
        await alertAdminsOfFailure(
          resendApiKey,
          "The outcome of their Care Cuddle application (the rejection email could not be queued for sending)",
          `${candidateLabel} (rejection email failed to queue)`,
        );
      } else {
        queued = true;
        emailResult = { queued: true, send_after: sendAfter };
        if (!candidateEmail) {
          // Queued, but the queue row has no address — the processor can never send it.
          await alertAdminsOfFailure(
            resendApiKey,
            "The outcome of their Care Cuddle application (rejection email)",
            `${candidateLabel} (no email address on file)`,
          );
        }
      }
    } else if (stage === "interview") {
      if (!candidateEmail) {
        emailResult = { skipped: true, reason: "candidate has no email address on file" };
        await alertAdminsOfFailure(
          resendApiKey,
          "Their interview invitation for the Administrator role",
          `${candidateLabel} (no email address on file)`,
        );
      } else {
        const resend = new Resend(resendApiKey);
        try {
          emailResult = await resend.emails.send({
            from: EMAIL_SENDER,
            to: [candidateEmail],
            subject: "You're invited to interview for the Administrator role",
            html: interviewEmail(attempt.candidate_name),
          });
          if (emailResult?.error) {
            await alertAdminsOfFailure(
              resendApiKey,
              "Their interview invitation for the Administrator role",
              `${candidateLabel} (the invitation email failed to send)`,
            );
          }
        } catch (e: any) {
          emailResult = { error: e?.message ?? String(e) };
          await alertAdminsOfFailure(
            resendApiKey,
            "Their interview invitation for the Administrator role",
            `${candidateLabel} (the invitation email failed to send)`,
          );
        }
      }
    } else if (stage === "success") {
      if (!candidateEmail) {
        emailResult = { skipped: true, reason: "candidate has no email address on file" };
        await alertAdminsOfFailure(
          resendApiKey,
          "The good news that their Care Cuddle application was successful",
          `${candidateLabel} (no email address on file)`,
        );
      } else {
        const resend = new Resend(resendApiKey);
        try {
          emailResult = await resend.emails.send({
            from: EMAIL_SENDER,
            to: [candidateEmail],
            subject: "Good news — your Care Cuddle application was successful",
            html: successEmail(attempt.candidate_name),
          });
          if (emailResult?.error) {
            await alertAdminsOfFailure(
              resendApiKey,
              "The good news that their Care Cuddle application was successful",
              `${candidateLabel} (the email failed to send)`,
            );
          }
        } catch (e: any) {
          emailResult = { error: e?.message ?? String(e) };
          await alertAdminsOfFailure(
            resendApiKey,
            "The good news that their Care Cuddle application was successful",
            `${candidateLabel} (the email failed to send)`,
          );
        }
      }
    }

    return new Response(JSON.stringify({ ok: true, stage, queued, emailResult }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message ?? String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
