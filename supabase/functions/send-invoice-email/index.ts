import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "npm:resend@2.0.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BRAND_COLOR = "#5F17EB";
const FROM_ADDRESS = "Care Cuddle Academy <hello@care-cuddle-academy.co.uk>";

interface Body {
  invoiceId: string;
  pdfBase64: string;
  staffEmail?: string;
  staffName?: string;
}

const currencySymbol = (c: string) => {
  switch ((c || "GBP").toUpperCase()) {
    case "NGN": return "\u20A6";
    case "GBP": return "\u00A3";
    case "USD": return "$";
    case "EUR": return "\u20AC";
    default: return c + " ";
  }
};

const formatMoney = (amount: number, currency: string) => {
  const sym = currencySymbol(currency);
  const formatted = new Intl.NumberFormat("en-GB", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(amount || 0));
  return `${sym} ${formatted}`;
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  try {
    const body = (await req.json()) as Body;
    if (!body?.invoiceId || !body?.pdfBase64) {
      return new Response(
        JSON.stringify({ error: "invoiceId and pdfBase64 are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

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

    if (recipients.length === 0) {
      throw new Error("No admin recipients found");
    }

    const cc = body.staffEmail ? [body.staffEmail] : undefined;
    const companyName = contractor?.company_name || body.staffName || "Contractor";
    const subject = `Invoice #${invoice.invoice_number} — ${companyName} — ${new Date(invoice.month).toLocaleDateString("en-GB", { month: "long", year: "numeric" })}`;

    const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /></head>
<body style="margin:0;padding:0;background:#f5f5f7;font-family:Figtree,Arial,sans-serif;color:#1a1a1a;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f7;padding:24px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.08);">
        <tr>
          <td style="background:${BRAND_COLOR};padding:24px 32px;color:#fff;">
            <h1 style="margin:0;font-size:22px;">New Contractor Invoice</h1>
            <p style="margin:6px 0 0 0;opacity:.9;font-size:13px;">Care Cuddle Academy</p>
          </td>
        </tr>
        <tr>
          <td style="padding:28px 32px;">
            <p style="margin:0 0 16px 0;font-size:15px;">A new contractor invoice has been submitted via the Pay Forecast.</p>
            <table width="100%" cellpadding="8" cellspacing="0" style="border:1px solid #eee;border-radius:8px;font-size:14px;">
              <tr><td style="color:#666;width:40%;">Invoice Number</td><td><strong>#${invoice.invoice_number}</strong></td></tr>
              <tr><td style="color:#666;">Company</td><td>${companyName}</td></tr>
              <tr><td style="color:#666;">Contact</td><td>${contractor?.contact_name || body.staffName || ""}</td></tr>
              <tr><td style="color:#666;">Period</td><td>${new Date(invoice.month).toLocaleDateString("en-GB", { month: "long", year: "numeric" })}</td></tr>
              <tr><td style="color:#666;">Date Requested</td><td>${new Date(invoice.date_requested).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</td></tr>
              <tr><td style="color:#666;">Description</td><td>${invoice.description}</td></tr>
              <tr><td style="color:#666;">Amount</td><td><strong style="color:${BRAND_COLOR};font-size:16px;">${formatMoney(Number(invoice.amount), invoice.currency)}</strong></td></tr>
            </table>
            <p style="margin:24px 0 0 0;font-size:13px;color:#666;">The invoice PDF is attached to this email.</p>
          </td>
        </tr>
        <tr>
          <td style="background:#fafafa;padding:16px 32px;text-align:center;font-size:12px;color:#999;">
            Care Cuddle Academy · Automated invoice notification
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

    const fileName = `Invoice-${invoice.invoice_number}-${companyName.replace(/[^A-Za-z0-9]+/g, "-")}.pdf`;

    const sendResult = await resend.emails.send({
      from: FROM_ADDRESS,
      to: recipients,
      cc,
      subject,
      html,
      attachments: [
        {
          filename: fileName,
          content: body.pdfBase64,
        },
      ],
    });

    // Update invoice
    await supabase
      .from("staff_invoices")
      .update({
        status: "sent",
        sent_at: new Date().toISOString(),
        sent_to_emails: [...recipients, ...(cc || [])],
      })
      .eq("id", invoice.id);

    return new Response(
      JSON.stringify({ success: true, sendResult, recipients }),
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
