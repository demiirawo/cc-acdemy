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
const APP_URL = "https://www.care-cuddle-academy.co.uk";

interface Payload {
  assigneeEmail: string;
  assigneeName?: string;
  clientName: string;
  taskName: string;
  taskDescription?: string | null;
  link?: string | null;
  handedOverBy?: string | null;
  targetDate?: string | null;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = (await req.json()) as Payload;
    const {
      assigneeEmail,
      assigneeName,
      clientName,
      taskName,
      taskDescription,
      link,
      handedOverBy,
      targetDate,
    } = body;

    if (!assigneeEmail || !clientName || !taskName) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } },
      );
    }

    const dueLine = targetDate
      ? new Date(targetDate).toLocaleDateString("en-GB", {
          weekday: "short",
          day: "numeric",
          month: "short",
          year: "numeric",
        })
      : null;

    const html = `
<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 20px;">
  <tr><td align="center">
    <table width="520" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08);">
      <tr><td style="background:${BRAND_COLOR};padding:24px 40px;text-align:center;">
        <img src="${LOGO_URL}" alt="Care Cuddle Academy" width="140" style="display:block;margin:0 auto 12px;" />
        <h1 style="margin:0;color:#fff;font-size:20px;font-weight:600;">New Handover Task Assigned</h1>
        <p style="color:rgba(255,255,255,.9);margin:6px 0 0;font-size:13px;">${clientName}</p>
      </td></tr>
      <tr><td style="padding:32px 40px;">
        <p style="color:#374151;font-size:16px;margin:0 0 16px;">Hi ${assigneeName || "there"},</p>
        <p style="color:#374151;font-size:16px;margin:0 0 20px;">
          ${handedOverBy ? `<strong>${handedOverBy}</strong> has assigned` : "You have been assigned"}
          a handover task for <strong>${clientName}</strong>. Please review it and confirm completion in the tracker.
        </p>
        <div style="background:#f9fafb;padding:16px;border-radius:8px;border:1px solid #e5e7eb;margin-bottom:24px;">
          <table style="width:100%;border-collapse:collapse;">
            <tr><td style="padding:8px 0;color:#6b7280;font-size:14px;">Task:</td>
                <td style="padding:8px 0;color:#111827;font-size:14px;font-weight:600;">${taskName}</td></tr>
            ${taskDescription ? `<tr><td style="padding:8px 0;color:#6b7280;font-size:14px;vertical-align:top;">Details:</td><td style="padding:8px 0;color:#111827;font-size:14px;">${taskDescription}</td></tr>` : ""}
            ${dueLine ? `<tr><td style="padding:8px 0;color:#6b7280;font-size:14px;">Target Date:</td><td style="padding:8px 0;color:#111827;font-size:14px;font-weight:600;">${dueLine}</td></tr>` : ""}
            ${link ? `<tr><td style="padding:8px 0;color:#6b7280;font-size:14px;">Reference:</td><td style="padding:8px 0;font-size:14px;"><a href="${link}" style="color:${BRAND_COLOR};">Open link</a></td></tr>` : ""}
          </table>
        </div>
        <div style="text-align:center;">
          <a href="${APP_URL}" style="display:inline-block;background:${BRAND_COLOR};color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;">
            Open Handover Tracker
          </a>
        </div>
      </td></tr>
      <tr><td style="background:#f9fafb;padding:16px 40px;text-align:center;color:#6b7280;font-size:12px;">
        Care Cuddle Academy
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;

    const result = await resend.emails.send({
      from: "Care Cuddle Academy <hello@care-cuddle-academy.co.uk>",
      to: [assigneeEmail],
      subject: `Handover task assigned: ${taskName} (${clientName})`,
      html,
    });

    return new Response(JSON.stringify({ success: true, result }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: unknown) {
    console.error("send-handover-assignment-email error", error);
    const msg = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
};

serve(handler);
