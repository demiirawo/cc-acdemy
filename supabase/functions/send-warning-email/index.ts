import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "npm:resend@2.0.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

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
const APP_URL = Deno.env.get("APP_URL") || "https://www.care-cuddle-academy.co.uk";
// Existing hosted logo — keep until a first-party asset exists.
const LOGO_URL =
  "https://care-cuddle.co.uk/wp-content/uploads/2023/03/Green-and-Beige-Bold-Typographic-Coffee-Products-Coffee-Logo-e1689542108718.png";

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
 * its own service-role client so any function can call it. Returns true only if
 * at least one admin alert was actually accepted for delivery.
 */
async function alertAdminsOfFailure(
  resendApiKey: string,
  what: string,      // "Cover assignment for Peace Jimoh"
  whoMissed: string, // "Oluwatosin (no email address on file)"
): Promise<boolean> {
  try {
    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2.57.4");
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: admins } = await admin.from("profiles").select("email").eq("role", "admin").not("email", "is", null);
    const emails: string[] = (admins ?? []).map((a: { email: string }) => a.email);
    if (emails.length === 0) return false;
    const body =
      greeting(null) +
      paragraph(`We couldn't email <strong>${escapeHtml(whoMissed)}</strong> about: <strong>${escapeHtml(what)}</strong>.`) +
      paragraph(`They don't know about this yet — please tell them another way, or fix their email address and resend.`) +
      button("Open the HR area", `${APP_URL}/view/hr`);
    const results = await Promise.all(emails.map((to) =>
      fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${resendApiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: EMAIL_SENDER,
          to: [to],
          subject: `We couldn't notify ${whoMissed.split("(")[0].trim()} — action needed`,
          html: emailShell("Someone wasn't notified", body, "You're receiving this because you're an admin at Care Cuddle.", "#d97706"),
        }),
      }).then((r) => r.ok).catch(() => false)
    ));
    return results.some(Boolean);
  } catch (_) { /* alerting must never break the main send */ return false; }
}

// ============================================================================
// End of canonical helpers
// ============================================================================

/** Escape user-typed text (names, categories, reasons) before it enters HTML. */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

interface WarningEmailRequest {
  recipientEmail?: string | null;
  recipientName?: string | null;
  category?: string | null;
  reason: string;
  severity?: string | null;
}

// How each severity reads in plain words. An unrecognised severity value from a
// caller must never be presented as "minor" — it falls back to neutral wording.
const SEVERITY_COPY: Record<string, { noun: string; header: string; subjectLead: string }> = {
  minor: { noun: "minor warning", header: "A formal warning", subjectLead: "A formal warning" },
  major: { noun: "major warning", header: "A serious warning", subjectLead: "A serious warning" },
  final: { noun: "final warning", header: "A final warning", subjectLead: "A final warning" },
};
const GENERIC_SEVERITY = { noun: "formal warning", header: "A formal warning", subjectLead: "A formal warning" };

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body: WarningEmailRequest = await req.json();
    const { recipientEmail, recipientName, category, reason, severity } = body;

    const sev = SEVERITY_COPY[severity || "minor"] || GENERIC_SEVERITY;
    const staffName = (recipientName ?? "").trim() || "A staff member";
    const staffFirst = firstName(recipientName) || "them";
    // "Attention to Detail" / "client_communication" → "attention to detail".
    const humanCategory = (category ?? "").trim().replace(/[_-]+/g, " ").toLowerCase();
    const categoryPhrase = humanCategory ? ` about ${escapeHtml(humanCategory)}` : "";
    const safeReason = escapeHtml(reason ?? "");

    // The reason, quoted in the issuer's own words — sentences, not a form table.
    const reasonBlock = safeReason
      ? `<div style="border-left:3px solid #d1d5db;background-color:#f9fafb;padding:12px 16px;border-radius:0 6px 6px 0;margin:0 0 16px;">
           <p style="color:#374151;font-size:15px;line-height:1.6;margin:0;">${safeReason}</p>
         </div>`
      : "";

    if (!recipientEmail) {
      // Never let a formal warning vanish silently — tell the admins the staff
      // member could not be emailed.
      const adminsAlerted = await alertAdminsOfFailure(
        Deno.env.get("RESEND_API_KEY") ?? "",
        `A ${sev.noun}${humanCategory ? ` about ${humanCategory}` : ""} that was just issued`,
        `${staffName} (no email address on file)`,
      );
      return new Response(JSON.stringify({ skipped: "no recipient email", adminsAlerted }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ---- Email to the staff member ----
    const isFinal = (severity || "") === "final";
    const staffBody =
      greeting(recipientName) +
      paragraph(
        `Your manager has given you a <strong>${sev.noun}</strong>${categoryPhrase}. Please read this carefully.`
      ) +
      (safeReason ? paragraph(`Here's why, in your manager's words:`) + reasonBlock : "") +
      (isFinal
        ? paragraph(
            `<strong>This is a final warning</strong> — the most serious step before further action. Please treat it seriously.`
          )
        : "") +
      paragraph(
        `Warnings like this can lower your performance rating. A lower rating can reduce your monthly bonus. Doing well again over time will bring both back up.`
      ) +
      paragraph(
        `You can respond — please speak to your manager this week if you'd like to talk this through or want help improving.`
      ) +
      button("See your performance rating", `${APP_URL}/view/hr`);

    // Keep subjects scannable: fall back to the generic form if the category
    // would push the subject past ~60 characters.
    const categorySubject = `${sev.subjectLead} about your ${humanCategory}`;
    const subject = humanCategory && categorySubject.length <= 60
      ? categorySubject
      : `${sev.subjectLead} from your manager`;

    const { error } = await resend.emails.send({
      from: EMAIL_SENDER,
      to: [recipientEmail],
      subject,
      html: emailShell(
        sev.header,
        staffBody,
        "You're receiving this because a warning was issued to you at Care Cuddle.",
      ),
    });
    if (error) throw error;

    // ---- Copy to each admin, sent individually (formal warnings always reach
    // the admin team immediately, so there is a company-side trail and the
    // manager knows a conversation is coming) ----
    try {
      const supabaseAdmin = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      );
      const { data: admins, error: adminError } = await supabaseAdmin
        .from("profiles")
        .select("email, display_name")
        .eq("role", "admin")
        .not("email", "is", null);
      if (adminError) throw adminError;

      const adminRecipients = (admins ?? []).filter(
        (a: { email: string }) => a.email && a.email !== recipientEmail,
      );
      for (const adminProfile of adminRecipients) {
        const adminBody =
          greeting(adminProfile.display_name) +
          paragraph(
            `${escapeHtml(staffName)} has been given a <strong>${sev.noun}</strong>${categoryPhrase}, and has been emailed about it.`
          ) +
          (safeReason ? paragraph(`Here's the reason given:`) + reasonBlock : "") +
          paragraph(
            `This copy keeps the admin team in the picture — nothing is needed from you unless you'd like to follow up with ${escapeHtml(staffFirst)}.`
          ) +
          button("Open the HR area", `${APP_URL}/view/hr`);
        await resend.emails.send({
          from: EMAIL_SENDER,
          to: [adminProfile.email],
          subject: `${staffName} has been given a ${sev.noun}`,
          html: emailShell(
            "A warning was issued",
            adminBody,
            "You're receiving this because you're an admin at Care Cuddle.",
          ),
        });
      }
    } catch (copyErr) {
      // The staff member has been told; a failed admin copy must not fail the
      // request, but it should not be invisible either.
      console.error("send-warning-email: admin copy failed", copyErr);
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("send-warning-email error", err);
    return new Response(JSON.stringify({ error: String(err?.message ?? err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
