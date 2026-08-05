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
const RANK_WORDS: Record<string, string> = {
  S: "Exceptional",
  A: "Strong",
  B: "Solid",
  C: "Developing",
  D: "Needs support",
};

// Lowest to highest, so we can tell a rise from a fall and set the tone.
const RANK_ORDER = ["D", "C", "B", "A", "S"];

interface RankChangeEmailRequest {
  recipientEmail?: string | null;
  recipientName?: string | null;
  oldRank?: string | null;
  newRank: string;
  reason?: string | null;
  // Optional: the admin who made the change, so the email can name them.
  changedByName?: string | null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body: RankChangeEmailRequest = await req.json();
    const { recipientEmail, recipientName, oldRank, newRank, reason, changedByName } = body;

    const newWord = RANK_WORDS[newRank] ?? null;
    const oldWord = oldRank ? (RANK_WORDS[oldRank] ?? null) : null;

    if (!recipientEmail) {
      // A pay-affecting change must never happen with zero notification:
      // tell the admins the staff member could not be emailed.
      await alertAdminsOfFailure(
        Deno.env.get("RESEND_API_KEY") ?? "",
        `Their performance rating ${newWord ? `is now ${newWord}` : "has changed"}`,
        `${(recipientName ?? "").trim() || "A staff member"} (no email address on file)`,
      );
      return new Response(
        JSON.stringify({ success: false, skipped: "no recipient email", adminAlerted: true }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Direction of the change, when both ranks are known.
    const newIdx = RANK_ORDER.indexOf(newRank);
    const oldIdx = oldRank ? RANK_ORDER.indexOf(oldRank) : -1;
    const wentUp = newIdx !== -1 && oldIdx !== -1 && newIdx > oldIdx;
    const wentDown = newIdx !== -1 && oldIdx !== -1 && newIdx < oldIdx;

    const actor = escapeHtml(firstName(changedByName));
    const actorName = actor || "The admin team";
    const actorPossessive = actor ? `${actor}'s` : "their";

    // Subject: outcome first, plain words, no internal codes.
    let subject: string;
    if (!newWord) {
      subject = "Your performance rating has changed";
    } else if (wentUp) {
      subject = `Your performance rating has gone up to ${newWord}`;
    } else if (wentDown) {
      subject = `Your performance rating has changed to ${newWord}`;
    } else {
      subject = `Your performance rating is now ${newWord}`;
    }

    const headerTitle = wentUp
      ? "Your rating has gone up"
      : wentDown
      ? "Your rating has changed"
      : "Your performance rating";

    // First sentence = the whole story.
    let firstSentence: string;
    if (wentUp && newWord && oldWord) {
      firstSentence = `Good news — ${actorName === "The admin team" ? "the admin team" : actorName} has raised your performance rating from ${oldWord} to <strong>${newWord}</strong>.`;
    } else if (wentDown && newWord && oldWord) {
      firstSentence = `${actorName} has moved your performance rating from ${oldWord} to <strong>${newWord}</strong>.`;
    } else if (newWord && oldWord) {
      firstSentence = `${actorName} has updated your performance rating from ${oldWord} to <strong>${newWord}</strong>.`;
    } else if (newWord) {
      firstSentence = `${actorName} has set your performance rating to <strong>${newWord}</strong>.`;
    } else {
      firstSentence = `${actorName} has updated your performance rating.`;
    }

    let content = greeting(recipientName) + paragraph(firstSentence);

    if (wentDown) {
      content += paragraph(
        `We know a change like this can be disappointing. It's meant as support, not criticism — your manager can talk it through with you.`,
      );
    }

    if (reason && reason.trim()) {
      content += paragraph(`Here's why, in ${actorPossessive} words:`);
      content += `<div style="border-left:4px solid ${BRAND_COLOR};background-color:#f9fafb;padding:12px 16px;border-radius:0 8px 8px 0;margin:0 0 16px;">
        <p style="color:#374151;font-size:15px;line-height:1.6;margin:0;white-space:pre-wrap;">${escapeHtml(reason.trim())}</p>
      </div>`;
    }

    content += paragraph(`Your rating helps decide your share of the monthly bonus.`);
    content += button("See your rating and bonus", `${APP_URL}/view/hr`);
    content += mutedParagraph(
      `If you'd like to talk about your rating, or how to improve it, please speak to your manager.`,
    );

    const { error } = await resend.emails.send({
      from: EMAIL_SENDER,
      to: [recipientEmail],
      subject,
      html: emailShell(
        headerTitle,
        content,
        "You're receiving this because your performance rating at Care Cuddle was updated.",
      ),
    });
    if (error) throw error;

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("send-rank-change-email error", err);
    const message =
      err instanceof Error
        ? err.message
        : typeof err === "object" && err !== null && "message" in err
        ? String((err as { message: unknown }).message)
        : String(err);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
