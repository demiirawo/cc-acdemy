import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "npm:resend@2.0.0";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const LOGO_URL =
  "https://care-cuddle.co.uk/wp-content/uploads/2023/03/Green-and-Beige-Bold-Typographic-Coffee-Products-Coffee-Logo-e1689542108718.png";
const BRAND_COLOR = "#5F17EB";
const APP_URL = Deno.env.get("APP_URL") || "https://www.care-cuddle-academy.co.uk";
const FROM = "Care Cuddle Academy <hello@care-cuddle-academy.co.uk>";

const SEVERITY_LABELS: Record<string, { label: string; color: string }> = {
  minor: { label: "Minor warning", color: "#d97706" },
  major: { label: "Major warning", color: "#dc2626" },
  final: { label: "Final warning", color: "#991b1b" },
};

interface WarningEmailRequest {
  recipientEmail?: string | null;
  recipientName?: string | null;
  category?: string | null;
  reason: string;
  severity?: string | null;
}

const emailWrapper = (headerTitle: string, content: string) => `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:40px 20px;">
    <tr><td align="center">
      <table width="500" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
        <tr><td style="background-color:${BRAND_COLOR};padding:24px 40px;text-align:center;">
          <img src="${LOGO_URL}" alt="Care Cuddle Academy" width="140" style="display:block;margin:0 auto 16px;" />
          <h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:600;">${headerTitle}</h1>
        </td></tr>
        <tr><td style="padding:32px 40px;">${content}</td></tr>
        <tr><td style="padding:20px 40px;background-color:#f9fafb;text-align:center;border-top:1px solid #e5e7eb;">
          <p style="margin:0;color:#9ca3af;font-size:12px;">© ${new Date().getFullYear()} Care Cuddle Academy. All rights reserved.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

const button = (label: string, href: string) => `
  <table cellpadding="0" cellspacing="0" style="margin:24px 0;"><tr><td style="border-radius:8px;background-color:${BRAND_COLOR};">
    <a href="${href}" style="display:inline-block;padding:12px 28px;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;">${label}</a>
  </td></tr></table>`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body: WarningEmailRequest = await req.json();
    const { recipientEmail, recipientName, category, reason, severity } = body;

    if (!recipientEmail) {
      return new Response(JSON.stringify({ skipped: "no recipient email" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sev = SEVERITY_LABELS[severity || "minor"] || SEVERITY_LABELS.minor;

    const content = `
      <p style="color:#374151;font-size:15px;line-height:1.6;margin:0 0 12px;">Hi ${recipientName || "there"},</p>
      <p style="color:#374151;font-size:15px;line-height:1.6;margin:0 0 16px;">
        This is to let you know that a warning has been added to your record.
      </p>
      <table cellpadding="0" cellspacing="0" style="width:100%;margin:0 0 16px;border-collapse:collapse;">
        <tr>
          <td style="padding:6px 0;color:#6b7280;font-size:13px;width:90px;vertical-align:top;">Type</td>
          <td style="padding:6px 0;"><span style="display:inline-block;padding:3px 10px;border-radius:6px;background-color:${sev.color};color:#ffffff;font-size:13px;font-weight:600;">${sev.label}</span></td>
        </tr>
        ${category ? `<tr>
          <td style="padding:6px 0;color:#6b7280;font-size:13px;vertical-align:top;">Area</td>
          <td style="padding:6px 0;color:#111827;font-size:14px;font-weight:600;">${category}</td>
        </tr>` : ""}
        <tr>
          <td style="padding:6px 0;color:#6b7280;font-size:13px;vertical-align:top;">Reason</td>
          <td style="padding:6px 0;color:#374151;font-size:14px;line-height:1.5;">${reason}</td>
        </tr>
      </table>
      <div style="border-left:3px solid ${BRAND_COLOR};background-color:#f9fafb;padding:12px 16px;border-radius:0 6px 6px 0;margin:0 0 8px;">
        <p style="color:#374151;font-size:14px;line-height:1.6;margin:0;">
          <strong>How this affects your rating:</strong> your performance rating reflects how consistently you meet
          expectations${category ? ` in <strong>${category}</strong>` : ""}. Warnings are a signal that this area needs attention —
          repeated or unaddressed warnings can lower your rating, which in turn reduces your share of the monthly bonus pot.
          Sustained improvement can raise it again.
        </p>
      </div>
      ${button("View my performance rating", `${APP_URL}/view/hr`)}
      <p style="color:#6b7280;font-size:14px;line-height:1.6;margin:16px 0 0;">
        If you'd like to discuss this warning or how to improve, please speak to your manager.
      </p>`;

    const { error } = await resend.emails.send({
      from: FROM,
      to: [recipientEmail],
      subject: `${sev.label} added to your record`,
      html: emailWrapper("A warning has been added to your record", content),
    });
    if (error) throw error;

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
