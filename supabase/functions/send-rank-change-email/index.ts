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
const FROM = "Care Cuddle Academy <onboarding@resend.dev>";

const RANK_LABELS: Record<string, string> = {
  S: "S Rank — Exceptional",
  A: "A Rank — Strong",
  B: "B Rank — Solid",
  C: "C Rank — Developing",
  D: "D Rank — Needs support",
};

interface RankChangeEmailRequest {
  recipientEmail?: string | null;
  recipientName?: string | null;
  oldRank?: string | null;
  newRank: string;
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
    const body: RankChangeEmailRequest = await req.json();
    const { recipientEmail, recipientName, oldRank, newRank } = body;

    if (!recipientEmail) {
      return new Response(JSON.stringify({ skipped: "no recipient email" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const newLabel = RANK_LABELS[newRank] || newRank;
    const oldLabel = oldRank ? (RANK_LABELS[oldRank] || oldRank) : null;

    const content = `
      <p style="color:#374151;font-size:15px;line-height:1.6;margin:0 0 12px;">Hi ${recipientName || "there"},</p>
      <p style="color:#374151;font-size:15px;line-height:1.6;margin:0 0 12px;">
        Your performance rating has been updated${oldLabel ? ` from <strong>${oldLabel}</strong>` : ""} to:
      </p>
      <p style="text-align:center;margin:0 0 16px;">
        <span style="display:inline-block;padding:10px 20px;border-radius:8px;background-color:#f3f4f6;color:#111827;font-size:16px;font-weight:700;">${newLabel}</span>
      </p>
      <p style="color:#374151;font-size:15px;line-height:1.6;margin:0 0 4px;">
        Your rating and tenure together determine your share of the monthly bonus pot — you can see the full breakdown on your HR profile.
      </p>
      ${button("View my HR profile", `${APP_URL}/view/hr`)}
      <p style="color:#6b7280;font-size:14px;line-height:1.6;margin:16px 0 0;">
        If you have any questions about this change or would like guidance on how to improve your rating, please speak to your manager.
      </p>`;

    const { error } = await resend.emails.send({
      from: FROM,
      to: [recipientEmail],
      subject: `Your performance rating has been updated to ${newRank} Rank`,
      html: emailWrapper("Performance rating updated", content),
    });
    if (error) throw error;

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("send-rank-change-email error", err);
    return new Response(JSON.stringify({ error: String(err?.message ?? err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
