import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "npm:resend@2.0.0";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const LOGO_URL = "https://care-cuddle.co.uk/wp-content/uploads/2023/03/Green-and-Beige-Bold-Typographic-Coffee-Products-Coffee-Logo-e1689542108718.png";
const BRAND_COLOR = "#5F17EB";
const APP_URL = Deno.env.get("APP_URL") || "https://cc-acdemy.lovable.app";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { recipientEmail, recipientName, subject, bodyHtml } = await req.json();

    if (!recipientEmail) {
      return new Response(JSON.stringify({ error: "recipientEmail is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const greetingName = (recipientName || "").split(" ")[0] || "there";
    const html = `
<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:40px 20px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
        <tr><td style="background:${BRAND_COLOR};padding:28px 40px;text-align:center;">
          <img src="${LOGO_URL}" alt="Care Cuddle Academy" width="150" style="display:block;margin:0 auto;" />
        </td></tr>
        <tr><td style="padding:32px 40px;color:#374151;font-size:15px;line-height:1.6;">
          <p style="margin:0 0 16px;">Hi ${greetingName},</p>
          ${bodyHtml || "<p>Welcome to Care Cuddle. Please complete your onboarding in the Academy.</p>"}
          <div style="text-align:center;margin-top:28px;">
            <a href="${APP_URL}/view/hr?tab=onboarding" style="display:inline-block;background:${BRAND_COLOR};color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;">Start your onboarding</a>
          </div>
        </td></tr>
        <tr><td style="padding:20px 40px;background:#f9fafb;text-align:center;border-top:1px solid #e5e7eb;">
          <p style="margin:0;color:#9ca3af;font-size:12px;">© ${new Date().getFullYear()} Care Cuddle Academy. All rights reserved.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

    await resend.emails.send({
      from: "Care Cuddle Academy <hello@care-cuddle-academy.co.uk>",
      to: [recipientEmail],
      subject: subject || "Welcome to Care Cuddle — Your Offer",
      html,
    });

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
});
