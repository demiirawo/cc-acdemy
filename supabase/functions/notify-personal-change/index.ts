import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
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
const AMBER = "#d97706";
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

// ============================================================================
// Function-specific helpers
// ============================================================================

/** Escape user-entered text (names, field labels) before it lands in HTML. */
function escapeHtml(value?: string | null): string {
  return (value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Database column names translated into the words a person would use.
 * Anything not listed falls back to the column name with underscores turned
 * into spaces — never a raw slug in a reader's inbox.
 */
const FIELD_WORDS: Record<string, string> = {
  // staff_onboarding_documents
  employment_start_date: "employment start date",
  full_name: "name",
  date_of_birth: "date of birth",
  phone_number: "phone number",
  personal_email: "personal email address",
  address: "home address",
  proof_of_id_1_path: "first ID document",
  proof_of_id_1_type: "first ID type",
  proof_of_id_2_path: "second ID document",
  proof_of_id_2_type: "second ID type",
  proof_of_address_path: "proof of address document",
  proof_of_address_type: "proof of address type",
  photograph_path: "photograph",
  bank_name: "bank name",
  account_number: "bank account number",
  emergency_contact_name: "emergency contact's name",
  emergency_contact_relationship: "emergency contact's relationship to you",
  emergency_contact_phone: "emergency contact's phone number",
  emergency_contact_email: "emergency contact's email address",
  // contractor_invoice_details
  company_name: "company name",
  contact_name: "contact name",
  phone: "phone number",
  email: "email address",
  company_address: "company address",
  bank_account_name: "bank account name",
  bank_account_number: "bank account number",
  sort_code: "sort code",
  iban: "IBAN",
  swift: "SWIFT code",
};

/** Columns that mean money can end up somewhere new. Any of these changing is
 *  treated as a bank-details change, whichever form it came through. */
const BANK_FIELDS = new Set([
  "bank_name",
  "account_number",
  "bank_account_name",
  "bank_account_number",
  "sort_code",
  "iban",
  "swift",
]);

function fieldWord(field: string): string {
  return FIELD_WORDS[field] ?? field.replace(/[_-]+/g, " ").toLowerCase();
}

/** "your photograph", "your photograph and phone number",
 *  "your photograph, phone number and home address". */
function humanList(words: string[]): string {
  const parts = [...new Set(words)];
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0];
  const last = parts.pop();
  return `${parts.join(", ")} and ${last}`;
}

/** "today (Tuesday 5 August) at 14:03 UK time" — no seconds, no timestamps. */
function whenNow(): string {
  const now = new Date();
  let time = "";
  try {
    time = new Intl.DateTimeFormat("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: "Europe/London",
    }).format(now);
  } catch (_) {
    time = "";
  }
  const date = niceDate(now);
  return `today${date ? ` (${date})` : ""}${time ? ` at ${time} UK time` : ""}`;
}

interface PersonalChangeRequest {
  kind?: "bank_details" | "profile_update" | null;
  userId?: string | null;
  changedFields?: string[] | null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body: PersonalChangeRequest = await req.json();
    const { kind, userId } = body;
    const changedFields = (body.changedFields ?? []).filter(
      (f): f is string => typeof f === "string" && f.length > 0,
    );

    if ((kind !== "bank_details" && kind !== "profile_update") || !userId) {
      return new Response(JSON.stringify({ error: "kind and userId are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // The person whose details changed.
    const { data: person } = await admin
      .from("profiles")
      .select("display_name, email")
      .eq("user_id", userId)
      .maybeSingle();
    const staffNameRaw = (person?.display_name ?? "").trim() || "A staff member";
    const staffName = escapeHtml(staffNameRaw);
    const staffFirstRaw = firstName(person?.display_name) || staffNameRaw;
    const staffEmail = (person?.email ?? "").trim() || null;

    // Who actually made the change (usually the staff member themselves, but an
    // admin can edit bank details from another person's HR profile). We only
    // use this for honest attribution — never "Sarah updated" when Demi did.
    let actorName: string | null = null;
    let actorIsSubject = true;
    try {
      const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
      if (jwt) {
        const { data: authData } = await admin.auth.getUser(jwt);
        const actorId = authData?.user?.id ?? null;
        if (actorId && actorId !== userId) {
          actorIsSubject = false;
          const { data: actor } = await admin
            .from("profiles")
            .select("display_name")
            .eq("user_id", actorId)
            .maybeSingle();
          actorName = (actor?.display_name ?? "").trim() || null;
        }
      }
    } catch (_) {
      // Attribution is best-effort; the notification still goes out.
    }

    const bankFieldsChanged =
      kind === "bank_details" || changedFields.some((f) => BANK_FIELDS.has(f));

    const sent: string[] = [];
    const sendOne = async (to: string, subject: string, html: string) => {
      const { error } = await resend.emails.send({ from: EMAIL_SENDER, to: [to], subject, html });
      if (error) throw error;
      sent.push(to);
    };

    // ------------------------------------------------------------------
    // Admin alerts — every bank/payment detail change, sent individually.
    // This is a payroll-fraud control: if someone hijacks an account and
    // points wages at their own bank, an admin hears about it immediately.
    // ------------------------------------------------------------------
    if (bankFieldsChanged) {
      const { data: adminRows } = await admin
        .from("profiles")
        .select("email")
        .eq("role", "admin")
        .not("email", "is", null);
      const adminEmails = (adminRows ?? [])
        .map((a: { email: string | null }) => (a.email ?? "").trim())
        .filter((e: string) => e && e.toLowerCase() !== (staffEmail ?? "").toLowerCase());

      const story = actorIsSubject
        ? `<strong>${staffName}</strong> updated their bank details on the portal ${whenNow()}.`
        : `<strong>${escapeHtml(actorName ?? "An admin")}</strong> updated <strong>${staffName}</strong>'s bank details on the portal ${whenNow()}.`;
      const adminSubject = actorIsSubject
        ? `${staffFirstRaw} updated their bank details`
        : `${firstName(actorName) || "An admin"} updated ${staffFirstRaw}'s bank details`;
      const adminBody =
        greeting(null) +
        paragraph(story) +
        paragraph(
          `This is the account their pay goes to, so we flag every change. If you were expecting this, there's nothing to do.`,
        ) +
        paragraph(
          `If it's unexpected, please check with ${escapeHtml(staffFirstRaw)} directly — in person or by phone, not by email — before the next payroll run.`,
        ) +
        button(`Open the HR area`, `${APP_URL}/view/hr`);
      const adminHtml = emailShell(
        "Bank details were changed",
        adminBody,
        "You're receiving this because you're an admin at Care Cuddle — bank detail changes are always flagged for review.",
        AMBER,
      );

      await Promise.all(
        adminEmails.map((to: string) =>
          sendOne(to, adminSubject, adminHtml).catch((e: unknown) =>
            console.error("notify-personal-change admin alert failed", e),
          ),
        ),
      );

      // The staff member gets their own copy, so a hijacked account can't
      // change payment details without the real owner finding out.
      if (staffEmail) {
        const confirmBody =
          greeting(escapeHtml(person?.display_name)) +
          paragraph(
            actorIsSubject
              ? `You updated your bank details on the Care Cuddle portal ${whenNow()}.`
              : `${escapeHtml(actorName ?? "An admin")} from the admin team updated your bank details on the Care Cuddle portal ${whenNow()}.`,
          ) +
          paragraph(
            `For security we don't repeat the account numbers here — you can check them in the portal.`,
          ) +
          paragraph(
            `<strong>If this wasn't you, contact us immediately</strong> at <a href="mailto:hello@care-cuddle.co.uk" style="color:${BRAND_COLOR};">hello@care-cuddle.co.uk</a> so we can pause payments while we check.`,
          ) +
          button("Check your bank details", `${APP_URL}/view/hr`);
        await sendOne(
          staffEmail,
          "You updated your bank details",
          emailShell(
            "Your bank details were updated",
            confirmBody,
            "You're receiving this because the bank details on your Care Cuddle profile were changed.",
          ),
        ).catch((e: unknown) =>
          console.error("notify-personal-change staff bank confirmation failed", e),
        );
      }
    }

    // ------------------------------------------------------------------
    // Profile update — a short confirmation to the staff member only.
    // Never to clients, and never repeating the new values themselves.
    // ------------------------------------------------------------------
    if (kind === "profile_update") {
      if (!staffEmail) {
        return new Response(
          JSON.stringify({ skipped: "no email on file for this staff member", sent }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      const words = changedFields.map((f) => escapeHtml(fieldWord(f)));
      const story =
        words.length === 0
          ? `Your details on the Care Cuddle portal were updated ${whenNow()}.`
          : words.length > 6
            ? `Your details on the Care Cuddle portal were updated ${whenNow()} — including your ${humanList(words.slice(0, 3))}.`
            : `Your ${humanList(words)} ${words.length === 1 ? "was" : "were"} updated on the Care Cuddle portal ${whenNow()}.`;
      const confirmBody =
        greeting(escapeHtml(person?.display_name)) +
        paragraph(story) +
        paragraph(
          `If that was you, there's nothing to do — this is just a confirmation for your records.`,
        ) +
        paragraph(
          `If this wasn't you, please tell us straight away at <a href="mailto:hello@care-cuddle.co.uk" style="color:${BRAND_COLOR};">hello@care-cuddle.co.uk</a>.`,
        ) +
        button("Check your details", `${APP_URL}/view/hr`);
      await sendOne(
        staffEmail,
        "Your details were updated",
        emailShell(
          "Your details were updated",
          confirmBody,
          "You're receiving this because details on your Care Cuddle profile were changed.",
        ),
      );
    }

    return new Response(JSON.stringify({ success: true, sent: sent.length }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("notify-personal-change error", err);
    return new Response(JSON.stringify({ error: String((err as Error)?.message ?? err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
