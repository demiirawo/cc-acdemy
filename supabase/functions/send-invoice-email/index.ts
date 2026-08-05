import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "npm:resend@2.0.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

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
const APP_URL = "https://www.care-cuddle-academy.co.uk";
// Existing hosted logo — keep until a first-party asset exists.
const LOGO_URL =
  "https://care-cuddle.co.uk/wp-content/uploads/2023/07/Green-and-Beige-Bold-Typographic-Coffee-Products-Coffee-Logo-e1689542108718.png";

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
// End of canonical helpers
// ============================================================================

/** Escape user-typed text before it goes into email HTML. */
const escapeHtml = (s: unknown): string =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/** "August" — or "August 2025" when it isn't this year. */
const monthLabel = (input: string): string => {
  const d = new Date(input);
  if (isNaN(d.getTime())) return "";
  const year = d.getFullYear() === new Date().getFullYear() ? "" : ` ${d.getFullYear()}`;
  return `${MONTHS[d.getMonth()]}${year}`;
};

/** "£1,250.00" — unknown currency codes read as "1,250.00 CAD", never "CAD 1,250.00 ". */
const formatMoney = (amount: number, currency: string): string => {
  const n = new Intl.NumberFormat("en-GB", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(amount || 0));
  switch ((currency || "GBP").toUpperCase()) {
    case "NGN": return `₦${n}`;
    case "GBP": return `£${n}`;
    case "USD": return `$${n}`;
    case "EUR": return `€${n}`;
    default: return `${n} ${(currency || "").toUpperCase()}`.trim();
  }
};

interface Body {
  invoiceId: string;
  pdfBase64?: string;
  pdfStoragePath?: string;
  staffEmail?: string;
  staffName?: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  try {
    const body = (await req.json()) as Body;
    if (!body?.invoiceId || (!body?.pdfBase64 && !body?.pdfStoragePath)) {
      return new Response(
        JSON.stringify({ error: "invoiceId and (pdfBase64 or pdfStoragePath) are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const resendApiKey = Deno.env.get("RESEND_API_KEY") ?? "";
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Resolve PDF content — prefer storage path (avoids body size limits)
    let pdfBase64: string;
    if (body.pdfStoragePath) {
      const { data: fileBlob, error: dlErr } = await supabase.storage
        .from("invoice-pdfs")
        .download(body.pdfStoragePath);
      if (dlErr || !fileBlob) {
        throw new Error(`Failed to download PDF from storage: ${dlErr?.message || "not found"}`);
      }
      const buf = new Uint8Array(await fileBlob.arrayBuffer());
      // Base64-encode
      let binary = "";
      const chunkSize = 0x8000;
      for (let i = 0; i < buf.length; i += chunkSize) {
        binary += String.fromCharCode(...buf.subarray(i, i + chunkSize));
      }
      pdfBase64 = btoa(binary);
    } else {
      pdfBase64 = body.pdfBase64!;
    }

    // Load invoice
    const { data: invoice, error: invErr } = await supabase
      .from("staff_invoices")
      .select("*")
      .eq("id", body.invoiceId)
      .single();
    if (invErr || !invoice) {
      throw new Error(invErr?.message || "Invoice not found");
    }

    // Load contractor details
    const { data: contractor } = await supabase
      .from("contractor_invoice_details")
      .select("*")
      .eq("user_id", invoice.user_id)
      .maybeSingle();

    // Look up the person who sent the invoice, so they always get a receipt.
    const { data: submitterProfile } = await supabase
      .from("profiles")
      .select("email, display_name")
      .eq("user_id", invoice.user_id)
      .maybeSingle();

    // Resolve admin recipient list
    let recipients: string[] = [];
    const { data: settings } = await supabase
      .from("notification_settings")
      .select("recipient_emails, is_enabled")
      .eq("notification_type", "invoice_submitted")
      .maybeSingle();

    if (settings?.is_enabled && settings.recipient_emails?.length) {
      recipients = settings.recipient_emails;
    } else {
      const { data: admins } = await supabase
        .from("profiles")
        .select("email")
        .eq("role", "admin");
      recipients = (admins || []).map((a: any) => a.email).filter(Boolean);
    }

    // Who the email is about, and where their receipt goes.
    const senderName: string =
      contractor?.company_name || body.staffName || contractor?.contact_name || submitterProfile?.display_name || "";
    const submitterName: string =
      contractor?.contact_name || body.staffName || submitterProfile?.display_name || "";
    const submitterEmail: string | undefined =
      submitterProfile?.email || contractor?.email || body.staffEmail || undefined;

    const invMonth = monthLabel(invoice.month);
    const forMonth = invMonth ? ` for ${invMonth}` : "";
    const amount = formatMoney(Number(invoice.amount), invoice.currency);
    const invoiceDate = niceDate(invoice.date_requested);
    const description = (invoice.description || "").trim();

    if (recipients.length === 0) {
      // Nobody is configured to hear about invoices. Try to raise the alarm
      // (a no-op only if there are truly no admin emails at all), then fail
      // loudly so the caller sees an error instead of success-shaped silence.
      await alertAdminsOfFailure(
        resendApiKey,
        `A new invoice${forMonth}${senderName ? ` from ${senderName}` : ""} — ${amount}`,
        "the admin team (no invoice notification recipients are set up)"
      );
      throw new Error("No admin recipients found");
    }

    // Resolve first names for the admin recipients so each greeting is personal.
    const nameByEmail = new Map<string, string>();
    const { data: recipientProfiles } = await supabase
      .from("profiles")
      .select("email, display_name")
      .in("email", recipients);
    for (const p of recipientProfiles || []) {
      if (p.email && p.display_name) nameByEmail.set(p.email, p.display_name);
    }

    const senderSlug = (senderName || "").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    const fileName = senderSlug
      ? `Invoice-${invoice.invoice_number}-${senderSlug}.pdf`
      : `Invoice-${invoice.invoice_number}.pdf`;
    const attachment = { filename: fileName, content: pdfBase64 };

    // --- Email 1: one email per admin recipient (never one send with every address visible) ---
    const adminSubject = senderName
      ? `New invoice from ${senderName}${invMonth ? ` — ${invMonth}` : ""}`
      : `A new invoice has arrived${invMonth ? ` — ${invMonth}` : ""}`;

    const escSender = escapeHtml(senderName);
    const adminStory = senderName
      ? `<strong>${escSender}</strong> has sent their invoice${forMonth} — <strong>${amount}</strong>.`
      : `A new invoice${forMonth} has arrived — <strong>${amount}</strong>.`;

    const adminBodyFor = (name: string | null) =>
      greeting(name) +
      paragraph(adminStory) +
      (invoiceDate ? paragraph(`The invoice is dated ${invoiceDate}.`) : "") +
      (description ? paragraph(`They described the work as &ldquo;${escapeHtml(description)}&rdquo;.`) : "") +
      paragraph("The invoice PDF is attached to this email.") +
      button("Open payroll", `${APP_URL}/view/finance?tab=payroll`);

    const sendResult: any[] = [];
    let adminSendsSucceeded = 0;
    for (const to of recipients) {
      // A thrown send (e.g. network failure) must not abort the loop after some
      // admins were already emailed — record it and carry on to the rest.
      try {
        const result = await resend.emails.send({
          from: EMAIL_SENDER,
          to: [to],
          subject: adminSubject,
          html: emailShell(
            "A new invoice has arrived",
            adminBodyFor(nameByEmail.get(to) ?? null),
            "You're receiving this because invoice notifications for Care Cuddle are sent to you."
          ),
          attachments: [attachment],
        });
        sendResult.push(result);
        if (!(result as any)?.error) adminSendsSucceeded++;
      } catch (sendErr) {
        console.error(`send-invoice-email: send to admin recipient failed:`, sendErr);
        sendResult.push({ error: { message: (sendErr as any)?.message || String(sendErr) } });
      }
    }

    if (adminSendsSucceeded === 0) {
      throw new Error("Failed to send the invoice email to any admin recipient");
    }

    // --- Email 2: a receipt to the person who sent the invoice ---
    let submitterEmailed = false;
    if (submitterEmail) {
      try {
        const receiptBody =
          greeting(submitterName) +
          paragraph(`We've received your invoice${forMonth} — <strong>${amount}</strong>.`) +
          paragraph("The admin team will check it and arrange payment. A copy of your invoice is attached for your records.") +
          button("See your pay forecast", `${APP_URL}/view/hr`);
        const receiptResult = await resend.emails.send({
          from: EMAIL_SENDER,
          to: [submitterEmail],
          subject: invMonth ? `We've received your ${invMonth} invoice` : "We've received your invoice",
          html: emailShell(
            "We've received your invoice",
            receiptBody,
            "You're receiving this because you sent an invoice through Care Cuddle."
          ),
          attachments: [attachment],
        });
        if ((receiptResult as any)?.error) {
          throw new Error((receiptResult as any).error?.message || "receipt send failed");
        }
        submitterEmailed = true;
      } catch (receiptErr) {
        console.error("send-invoice-email: receipt to submitter failed:", receiptErr);
        await alertAdminsOfFailure(
          resendApiKey,
          `Invoice receipt${forMonth} — ${amount}`,
          `${submitterName || senderName || "the person who sent the invoice"} (their receipt email failed to send)`
        );
      }
    } else {
      // The person who sent the invoice has no email on file — never fail silently.
      await alertAdminsOfFailure(
        resendApiKey,
        `Invoice receipt${forMonth} — ${amount}`,
        `${submitterName || senderName || "the person who sent the invoice"} (no email address on file)`
      );
    }

    // Update invoice
    await supabase
      .from("staff_invoices")
      .update({
        status: "sent",
        sent_at: new Date().toISOString(),
        sent_to_emails: [...recipients, ...(submitterEmailed && submitterEmail ? [submitterEmail] : [])],
      })
      .eq("id", invoice.id);

    return new Response(
      JSON.stringify({ success: true, sendResult, recipients, submitterEmailed }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("send-invoice-email error:", err);
    return new Response(
      JSON.stringify({ error: err.message || "Failed to send invoice email" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
