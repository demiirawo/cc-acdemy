import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

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

function escapeHtml(value?: string | null): string {
  return (value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ============================================================================
// Function-specific
// ============================================================================

const PROFILE_URL = `${APP_URL}/view/hr?tab=my-profile`;

/**
 * What the profile actually holds, in the order it appears on the page. Written
 * as "here is where you look for X" rather than a feature list, because the
 * point of the email is that someone can find their holiday balance without
 * asking anybody.
 */
const FEATURES: Array<{ title: string; detail: string }> = [
  {
    title: "Your details",
    detail: "Job title, start date, contact details and your photo. Anything that looks wrong here, tell us and we'll correct it.",
  },
  {
    title: "Pay",
    detail: "Your salary, and a month-by-month forecast for the year ahead including any overtime, bonuses and public holiday pay.",
  },
  {
    title: "Holiday",
    detail: "How many days you have, how many you've used, and how many you've built up so far. You request time off from here too.",
  },
  {
    title: "Your schedule",
    detail: "The shifts you're booked on. If anything changes you'll be emailed and asked to acknowledge it, so nothing moves without you knowing.",
  },
  {
    title: "Onboarding",
    detail: "The steps to work through in your first weeks, grouped into stages. Tick each one off as you go — only you can mark your own steps complete.",
  },
  {
    title: "Training",
    detail: "The training you need, what's in date and what's coming up for renewal.",
  },
  {
    title: "Performance and feedback",
    detail: "Your rating and any feedback you've been given. Feedback is emailed to you as well, and you acknowledge it there.",
  },
  {
    title: "Documents",
    detail: "Your contract and the paperwork from your onboarding form, all in one place.",
  },
];

function featureList(): string {
  const rows = FEATURES.map(f => `
    <tr>
      <td style="padding:0 0 14px;">
        <p style="color:#111827;font-size:15px;font-weight:600;margin:0 0 2px;">${escapeHtml(f.title)}</p>
        <p style="color:#6b7280;font-size:14px;line-height:1.55;margin:0;">${escapeHtml(f.detail)}</p>
      </td>
    </tr>`).join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 4px;">${rows}</table>`;
}

interface Body {
  recipientEmail: string;
  recipientName?: string | null;
  jobTitle?: string | null;
  startDate?: string | null;
}

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const json = (payload: unknown) =>
    // Always 200: supabase-js throws on a non-2xx without reading the body, so a
    // useful message would be replaced by "Edge Function returned a non-2xx".
    new Response(JSON.stringify(payload), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    const apiKey = Deno.env.get("RESEND_API_KEY");
    if (!apiKey) return json({ error: "Email isn't configured — RESEND_API_KEY is missing." });

    const body: Body = await req.json().catch(() => ({} as Body));
    const { recipientEmail, recipientName, jobTitle, startDate } = body;

    if (!recipientEmail) return json({ error: "No email address to send to." });

    const started = startDate ? niceDate(startDate) : "";
    const role = (jobTitle ?? "").trim();

    const html = emailShell(
      "Your Care Cuddle profile is ready",
      greeting(recipientName) +
        paragraph(
          `Your profile on the Care Cuddle Academy has been set up${role ? ` as <strong>${escapeHtml(role)}</strong>` : ""}${started ? `, starting <strong>${started}</strong>` : ""}.`
        ) +
        paragraph(
          `It's the one place for everything about your job here — your pay, your holiday, your shifts and your training. Have a look through it when you get a moment so you know where things are.`
        ) +
        featureList() +
        button("Open my profile", PROFILE_URL) +
        mutedParagraph(
          `Sign in with this email address. If the button doesn't work, copy this into your browser:<br/>${PROFILE_URL}`
        ) +
        paragraph(`Anything that looks wrong, or anything you can't find, just reply to this email.`),
      "You're receiving this because a profile has been created for you at Care Cuddle."
    );

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: EMAIL_SENDER,
        to: [recipientEmail],
        subject: "Your Care Cuddle profile is ready",
        html,
      }),
    });

    const result = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error("send-profile-welcome-email — Resend rejected", result);
      return json({ error: result?.message || "The email provider rejected the message." });
    }

    console.log("send-profile-welcome-email — sent to", recipientEmail, result?.id ?? "");
    return json({ sent: true, id: result?.id ?? null });
  } catch (err) {
    console.error("send-profile-welcome-email error", err);
    return json({ error: String((err as Error)?.message ?? err) });
  }
});
