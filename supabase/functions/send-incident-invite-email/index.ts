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

interface IncidentInviteRequest {
  recipientEmail?: string | null;
  recipientName?: string | null;
  incidentTitle: string;
  incidentDate?: string | null;
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
    const body: IncidentInviteRequest = await req.json();
    const { recipientEmail, recipientName, incidentTitle, incidentDate } = body;

    if (!recipientEmail) {
      return new Response(JSON.stringify({ skipped: "no recipient email" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const content = `
      <p style="color:#374151;font-size:15px;line-height:1.6;margin:0 0 12px;">Hi ${recipientName || "there"},</p>
      <p style="color:#374151;font-size:15px;line-height:1.6;margin:0 0 12px;">
        You've been asked to provide a statement about an incident${incidentDate ? ` from <strong>${incidentDate}</strong>` : ""}:
      </p>
      <p style="text-align:center;margin:0 0 16px;">
        <span style="display:inline-block;padding:10px 18px;border-radius:8px;background-color:#f3f4f6;color:#111827;font-size:15px;font-weight:700;">${incidentTitle}</span>
      </p>
      <p style="color:#374151;font-size:15px;line-height:1.6;margin:0 0 4px;">
        Please log in and open the <strong>Incidents</strong> tab to give your account of what happened and note any
        lessons learned. Your input helps us support our clients and improve how we work.
      </p>
      ${button("Provide my statement", `${APP_URL}/view/incidents`)}
      <p style="color:#9ca3af;font-size:13px;line-height:1.5;margin:0;">
        If the button doesn't work, copy this link into your browser:<br/>${APP_URL}/view/incidents
      </p>`;

    const { error } = await resend.emails.send({
      from: FROM,
      to: [recipientEmail],
      subject: `Action needed: statement on "${incidentTitle}"`,
      html: emailWrapper("You've been asked for a statement", content),
    });
    if (error) throw error;

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("send-incident-invite-email error", err);
    return new Response(JSON.stringify({ error: String(err?.message ?? err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
