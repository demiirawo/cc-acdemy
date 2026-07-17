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

/**
 * Cover-change notifications for a handover task.
 *  - type "removed":       tells the PREVIOUS assignee they're no longer covering it.
 *  - type "cover_changed": tells the person handing over (i.e. whose leave is being
 *                          covered) that a different person is now covering.
 */
interface Payload {
  type: "removed" | "cover_changed";
  recipientEmail: string;
  recipientName?: string | null;
  clientName: string;
  taskName: string;
  previousAssignee?: string | null;
  newAssignee?: string | null;
  targetDate?: string | null;
}

const shell = (headerTitle: string, clientName: string, inner: string) => `
<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 20px;">
  <tr><td align="center">
    <table width="520" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08);">
      <tr><td style="background:${BRAND_COLOR};padding:24px 40px;text-align:center;">
        <img src="${LOGO_URL}" alt="Care Cuddle Academy" width="140" style="display:block;margin:0 auto 12px;" />
        <h1 style="margin:0;color:#fff;font-size:20px;font-weight:600;">${headerTitle}</h1>
        <p style="color:rgba(255,255,255,.9);margin:6px 0 0;font-size:13px;">${clientName}</p>
      </td></tr>
      <tr><td style="padding:32px 40px;">${inner}
        <div style="text-align:center;margin-top:24px;">
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

const detailBox = (rows: string) => `
  <div style="background:#f9fafb;padding:16px;border-radius:8px;border:1px solid #e5e7eb;margin-bottom:8px;">
    <table style="width:100%;border-collapse:collapse;">${rows}</table>
  </div>`;
const row = (label: string, value: string) =>
  `<tr><td style="padding:8px 0;color:#6b7280;font-size:14px;">${label}</td><td style="padding:8px 0;color:#111827;font-size:14px;font-weight:600;">${value}</td></tr>`;

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = (await req.json()) as Payload;
    const { type, recipientEmail, recipientName, clientName, taskName, previousAssignee, newAssignee, targetDate } = body;

    if (!recipientEmail || !clientName || !taskName || !type) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const dueLine = targetDate
      ? new Date(targetDate).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" })
      : null;

    let subject: string;
    let html: string;

    if (type === "removed") {
      subject = `You're no longer covering: ${taskName} (${clientName})`;
      html = shell("Handover Task Reassigned", clientName, `
        <p style="color:#374151;font-size:16px;margin:0 0 16px;">Hi ${recipientName || "there"},</p>
        <p style="color:#374151;font-size:16px;margin:0 0 20px;">
          You are <strong>no longer assigned</strong> to a handover task for <strong>${clientName}</strong>.
          ${newAssignee ? `It has been reassigned to <strong>${newAssignee}</strong>.` : "It is currently unassigned."}
          There's nothing further for you to do on it.
        </p>
        ${detailBox(row("Task:", taskName) + (dueLine ? row("Target Date:", dueLine) : ""))}
        <p style="color:#6b7280;font-size:14px;margin:12px 0 0;">If you think this is a mistake, please speak to your manager.</p>`);
    } else {
      subject = `Cover change for your handover: ${taskName} (${clientName})`;
      html = shell("Your Cover Has Changed", clientName, `
        <p style="color:#374151;font-size:16px;margin:0 0 16px;">Hi ${recipientName || "there"},</p>
        <p style="color:#374151;font-size:16px;margin:0 0 20px;">
          The person covering one of your handover tasks for <strong>${clientName}</strong> has changed
          ${newAssignee ? `— it's now <strong>${newAssignee}</strong>.` : "— it is currently unassigned."}
        </p>
        ${detailBox(
          row("Task:", taskName) +
          (previousAssignee ? row("Previously:", previousAssignee) : "") +
          row("Now covering:", newAssignee || "Unassigned") +
          (dueLine ? row("Target Date:", dueLine) : "")
        )}
        <p style="color:#6b7280;font-size:14px;margin:12px 0 0;">Please make sure they have everything they need before your leave starts.</p>`);
    }

    const result = await resend.emails.send({
      from: "Care Cuddle Academy <hello@care-cuddle-academy.co.uk>",
      to: [recipientEmail],
      subject,
      html,
    });

    return new Response(JSON.stringify({ success: true, result }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: unknown) {
    console.error("send-handover-change-email error", error);
    const msg = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
};

serve(handler);
