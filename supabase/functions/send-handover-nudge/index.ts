import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "npm:resend@2.0.0";

// Sends the handover nudge an admin triggers from the Active Handover
// Trackers dashboard — the email equivalent of the "Copy message" WhatsApp
// text: leave timing, per-client status with tracker links, the how-to
// video, and a start-vs-finish ask.

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const LOGO_URL = "https://care-cuddle.co.uk/wp-content/uploads/2023/03/Green-and-Beige-Bold-Typographic-Coffee-Products-Coffee-Logo-e1689542108718.png";
const BRAND_COLOR = "#5F17EB";
const APP_URL = "https://www.care-cuddle-academy.co.uk";
const HANDOVER_VIDEO_URL = "https://www.youtube.com/watch?v=VGzR7cR1npA";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface NudgeClient {
  client: string;
  /** "not started" or e.g. "40% complete" */
  statusLabel: string;
  /** Who is covering this client's shifts — the person to hand over to. */
  coverNames?: string[];
}

interface NudgeRequest {
  recipientEmail: string;
  recipientName: string;
  leaveStart: string;   // ISO date
  leaveEnd: string;     // ISO date
  daysUntil: number;    // negative/0 = ongoing/today
  ongoing: boolean;
  anyStarted: boolean;
  clients: NudgeClient[];
}

const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body: NudgeRequest = await req.json();
    const { recipientEmail, recipientName, leaveStart, leaveEnd, daysUntil, ongoing, anyStarted, clients } = body;
    if (!recipientEmail || !recipientName || !leaveStart || !leaveEnd || !Array.isArray(clients) || clients.length === 0) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const firstName = recipientName.trim().split(/\s+/)[0];
    const plural = clients.length > 1;
    const dates = leaveStart === leaveEnd ? fmtDate(leaveStart) : `${fmtDate(leaveStart)} – ${fmtDate(leaveEnd)}`;
    const timing = ongoing
      ? "your leave has already started"
      : daysUntil === 0
        ? "your leave starts today"
        : `your leave starts in ${daysUntil} day${daysUntil === 1 ? "" : "s"}`;
    const ask = anyStarted
      ? `Please complete the outstanding handover tasks before your leave begins${plural ? " — each client needs its own handover finished" : ""}. Thank you! 🙏`
      : `Please start your handover${plural ? "s" : ""} as soon as you can so everything is covered before you go. Thank you! 🙏`;

    const clientRows = clients.map(c => {
      const covers = c.coverNames || [];
      const handingTo = covers.length > 0
        ? ` — hand over to <strong>${covers.join(" & ")}</strong> (your cover)`
        : ` — <span style="color:#b45309;">no cover assigned yet</span>`;
      return `
      <li style="margin-bottom:10px; font-size:14px;">
        <strong>${c.client}</strong> — ${c.statusLabel}${handingTo} ·
        <a href="${APP_URL}/public/schedule/${encodeURIComponent(c.client.trim())}" style="color:${BRAND_COLOR}; font-weight:600; text-decoration:none;">Open handover tracker</a>
      </li>`;
    }).join("");

    await resend.emails.send({
      from: "Care Cuddle Academy <hello@care-cuddle-academy.co.uk>",
      to: [recipientEmail],
      subject: `📋 Handover needed before your leave (${dates})`,
      html: `
<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:40px 20px;">
    <tr><td align="center">
      <table width="500" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
        <tr><td style="background:${BRAND_COLOR};padding:24px 40px;text-align:center;">
          <img src="${LOGO_URL}" alt="Care Cuddle Academy" width="140" style="display:block;margin:0 auto 16px;" />
          <h1 style="margin:0;color:#fff;font-size:20px;font-weight:600;">📋 Handover Reminder</h1>
        </td></tr>
        <tr><td style="padding:32px 40px;">
          <p style="color:#374151;font-size:14px;margin:0 0 16px;">
            Hi ${firstName}, ${timing} (<strong>${dates}</strong>) and your client handover${plural ? "s aren't" : " isn't"} complete yet.
          </p>
          <ul style="margin:0 0 16px;padding-left:20px;color:#374151;">${clientRows}</ul>
          <p style="color:#374151;font-size:13px;margin:0 0 16px;">
            📺 Not sure how the Handover Tracker works?
            <a href="${HANDOVER_VIDEO_URL}" style="color:${BRAND_COLOR};font-weight:600;text-decoration:none;">Watch this short guide</a>.
          </p>
          <p style="color:#374151;font-size:14px;margin:0;">${ask}</p>
        </td></tr>
        <tr><td style="padding:20px 40px;background:#f9fafb;text-align:center;border-top:1px solid #e5e7eb;">
          <p style="margin:0;color:#9ca3af;font-size:12px;">© ${new Date().getFullYear()} Care Cuddle Academy. All rights reserved.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`,
    });

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("send-handover-nudge error", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
