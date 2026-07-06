import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "npm:resend@2.0.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const LOGO_URL = "https://care-cuddle.co.uk/wp-content/uploads/2023/03/Green-and-Beige-Bold-Typographic-Coffee-Products-Coffee-Logo-e1689542108718.png";
const BRAND_COLOR = "#5F17EB";
const APP_URL = "https://www.care-cuddle-academy.co.uk";

interface EmailRequest {
  type: "new_request" | "request_approved" | "request_rejected" | "cover_assigned";
  requestId?: string;
  requestType?: string;
  requesterName?: string;
  requesterEmail?: string;
  startDate?: string;
  endDate?: string;
  daysRequested?: number;
  details?: string;
  reviewNotes?: string;
  reviewerName?: string;
  // Handover / cover fields
  impactedClients?: string[];
  assigneeName?: string;
  assigneeEmail?: string;
  coveredForName?: string;
  coveredForEmail?: string;
  coveredDates?: string[];
}

const isHolidayType = (rt: string | undefined): boolean =>
  ["holiday", "holiday_paid", "holiday_unpaid"].includes(rt || "");

const clientHandoverButton = (client: string): string =>
  `<a href="${APP_URL}/public/schedule/${encodeURIComponent(client)}" style="display:inline-block; background-color:${BRAND_COLOR}; color:#ffffff; padding:10px 18px; border-radius:8px; text-decoration:none; font-weight:600; font-size:13px; margin:4px 8px 4px 0;">Open ${client} handover →</a>`;

const handoverBlock = (title: string, intro: string, clients: string[]): string =>
  clients.length === 0 ? "" : `
    <div style="background:#f5f3ff; border:1px solid #ddd6fe; border-radius:8px; padding:16px 18px; margin-bottom:24px;">
      <p style="color:#4c1d95; font-size:15px; font-weight:600; margin:0 0 8px;">📋 ${title}</p>
      <p style="color:#374151; font-size:14px; margin:0 0 14px;">${intro}</p>
      <div>${clients.map(clientHandoverButton).join("")}</div>
    </div>`;

const getRequestTypeLabel = (requestType: string | undefined): string => {
  const labels: Record<string, string> = {
    holiday_paid: "Paid Holiday",
    holiday_unpaid: "Unpaid Holiday",
    holiday: "Holiday",
    shift_swap: "Shift Cover",
    overtime: "Overtime",
    overtime_standard: "Standard Overtime",
    overtime_double_up: "Double-Up Overtime",
  };
  return labels[requestType || ""] || requestType || "";
};

const formatDate = (dateStr: string | undefined): string => {
  if (!dateStr) return "";
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
};

const emailWrapper = (headerTitle: string, headerSubtitle: string, content: string, accentColor?: string) => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; background-color: #f4f4f5; font-family: Arial, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f5; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="500" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.08);">
          <!-- Logo Header -->
          <tr>
            <td style="background-color: ${BRAND_COLOR}; padding: 24px 40px; text-align: center;">
              <img src="${LOGO_URL}" alt="Care Cuddle Academy" width="140" style="display: block; margin: 0 auto; margin-bottom: 16px;" />
              <h1 style="margin: 0; color: #ffffff; font-size: 20px; font-weight: 600;">${headerTitle}</h1>
              ${headerSubtitle ? `<p style="color: rgba(255,255,255,0.9); margin: 6px 0 0 0; font-size: 13px;">${headerSubtitle}</p>` : ''}
              ${accentColor ? `<div style="width: 60px; height: 3px; background-color: ${accentColor}; margin: 12px auto 0; border-radius: 2px;"></div>` : ''}
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding: 32px 40px;">
              ${content}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding: 20px 40px; background-color: #f9fafb; text-align: center; border-top: 1px solid #e5e7eb;">
              <p style="margin: 0; color: #9ca3af; font-size: 12px;">
                © ${new Date().getFullYear()} Care Cuddle Academy. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const emailRequest: EmailRequest = await req.json();
    const {
      type,
      requestType,
      requesterName,
      requesterEmail,
      startDate,
      endDate,
      daysRequested,
      details,
      reviewNotes,
      reviewerName,
      impactedClients,
      assigneeName,
      assigneeEmail,
      coveredForName,
      coveredForEmail,
      coveredDates,
    } = emailRequest;

    const requestTypeLabel = getRequestTypeLabel(requestType);
    const formattedStartDate = formatDate(startDate);
    const formattedEndDate = formatDate(endDate);
    const dateRange = startDate === endDate 
      ? formattedStartDate 
      : `${formattedStartDate} - ${formattedEndDate}`;

    let emailResult;

    if (type === "new_request") {
      const { data: adminProfiles, error: adminError } = await supabaseClient
        .from("profiles")
        .select("email, display_name")
        .eq("role", "admin");

      if (adminError) {
        console.error("Error fetching admin profiles:", adminError);
        throw new Error("Failed to fetch admin emails");
      }

      const adminEmails = adminProfiles
        ?.filter((p) => p.email)
        .map((p) => p.email as string) || [];

      if (adminEmails.length === 0) {
        console.warn("No admin emails found");
        return new Response(
          JSON.stringify({ success: true, message: "No admin emails to notify" }),
          { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }

      console.log("Sending new request notification to admins:", adminEmails);

      const bodyContent = `
        <p style="color: #374151; font-size: 16px; margin: 0 0 20px;">
          <strong>${requesterName}</strong> has submitted a new <strong>${requestTypeLabel}</strong> request.
        </p>
        
        <div style="background-color: #f9fafb; padding: 16px; border-radius: 8px; border: 1px solid #e5e7eb; margin-bottom: 24px;">
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Request Type:</td>
              <td style="padding: 8px 0; color: #111827; font-size: 14px; font-weight: 600;">${requestTypeLabel}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Dates:</td>
              <td style="padding: 8px 0; color: #111827; font-size: 14px; font-weight: 600;">${dateRange}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Days Requested:</td>
              <td style="padding: 8px 0; color: #111827; font-size: 14px; font-weight: 600;">${daysRequested} day${daysRequested !== 1 ? "s" : ""}</td>
            </tr>
            ${details ? `
            <tr>
              <td style="padding: 8px 0; color: #6b7280; font-size: 14px; vertical-align: top;">Details:</td>
              <td style="padding: 8px 0; color: #111827; font-size: 14px;">${details}</td>
            </tr>
            ` : ""}
          </table>
        </div>
        
        <p style="color: #6b7280; font-size: 14px; margin-bottom: 24px;">
          Please log in to the system to review and respond to this request.
        </p>
        
        <div style="text-align: center;">
          <a href="${APP_URL}" style="display: inline-block; background-color: ${BRAND_COLOR}; color: white; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 14px;">
            Review Request
          </a>
        </div>
      `;

      emailResult = await resend.emails.send({
        from: "Care Cuddle Academy <hello@care-cuddle-academy.co.uk>",
        to: adminEmails,
        subject: `New ${requestTypeLabel} Request from ${requesterName}`,
        html: emailWrapper("New Staff Request", `From ${requesterName}`, bodyContent),
      });
    } else if (type === "request_approved" || type === "request_rejected") {
      const isApproved = type === "request_approved";
      const statusText = isApproved ? "Approved" : "Rejected";
      const statusColor = isApproved ? "#22c55e" : "#ef4444";

      console.log(`Sending ${statusText.toLowerCase()} notification to:`, requesterEmail);

      const bodyContent = `
        <p style="color: #374151; font-size: 16px; margin: 0 0 20px;">
          Hi ${requesterName},
        </p>
        <p style="color: #374151; font-size: 16px; margin: 0 0 20px;">
          Your <strong>${requestTypeLabel}</strong> request has been <strong style="color: ${statusColor};">${statusText.toLowerCase()}</strong>${reviewerName ? ` by ${reviewerName}` : ""}.
        </p>
        
        <div style="background-color: #f9fafb; padding: 16px; border-radius: 8px; border: 1px solid #e5e7eb; margin-bottom: 24px;">
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Request Type:</td>
              <td style="padding: 8px 0; color: #111827; font-size: 14px; font-weight: 600;">${requestTypeLabel}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Dates:</td>
              <td style="padding: 8px 0; color: #111827; font-size: 14px; font-weight: 600;">${dateRange}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Days:</td>
              <td style="padding: 8px 0; color: #111827; font-size: 14px; font-weight: 600;">${daysRequested} day${daysRequested !== 1 ? "s" : ""}</td>
            </tr>
            ${reviewNotes ? `
            <tr>
              <td style="padding: 8px 0; color: #6b7280; font-size: 14px; vertical-align: top;">Review Notes:</td>
              <td style="padding: 8px 0; color: #111827; font-size: 14px;">${reviewNotes}</td>
            </tr>
            ` : ""}
          </table>
        </div>
        
        ${isApproved ? `
        <p style="color: #22c55e; font-size: 14px; margin-bottom: 24px;">
          ✓ This time has been added to your calendar.
        </p>
        ` : `
        <p style="color: #6b7280; font-size: 14px; margin-bottom: 24px;">
          If you have any questions about this decision, please speak to your manager.
        </p>
        `}

        ${isApproved && isHolidayType(requestType)
          ? handoverBlock(
              "Start your handover",
              "Before your leave, please start the handover for the client(s) below so your cover is set up. Open each client's handover tracker:",
              impactedClients || []
            )
          : ""}

        <div style="text-align: center;">
          <a href="${APP_URL}" style="display: inline-block; background-color: ${BRAND_COLOR}; color: white; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 14px;">
            View My Requests
          </a>
        </div>
      `;

      emailResult = await resend.emails.send({
        from: "Care Cuddle Academy <hello@care-cuddle-academy.co.uk>",
        to: [requesterEmail],
        subject: `Your ${requestTypeLabel} Request has been ${statusText}`,
        html: emailWrapper(`Request ${statusText}`, requestTypeLabel, bodyContent, statusColor),
      });
    } else if (type === "cover_assigned") {
      if (!assigneeEmail) {
        return new Response(
          JSON.stringify({ success: true, message: "No assignee email to notify" }),
          { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }
      const clients = impactedClients || [];
      const dates = coveredDates || [];
      const datesLabel = dates.length > 0 ? dates.map(formatDate).join(", ") : "";
      const coveredFor = coveredForName || "a colleague";

      const bodyContent = `
        <p style="color: #374151; font-size: 16px; margin: 0 0 20px;">Hi ${assigneeName || "there"},</p>
        <p style="color: #374151; font-size: 16px; margin: 0 0 20px;">
          You've been assigned to cover <strong>${coveredFor}</strong>'s shifts${datesLabel ? ` on <strong>${datesLabel}</strong>` : ""}.
        </p>
        <p style="color: #374151; font-size: 15px; margin: 0 0 20px;">
          Please reach out to ${coveredFor}${coveredForEmail ? ` (<a href="mailto:${coveredForEmail}" style="color:${BRAND_COLOR};">${coveredForEmail}</a>)` : ""} to start the handover so you're set up for their client(s).
        </p>
        ${handoverBlock(
          "Handover tracker",
          "Open the handover tracker for each client you'll be covering:",
          clients
        )}
        <div style="text-align: center;">
          <a href="${APP_URL}" style="display: inline-block; background-color: ${BRAND_COLOR}; color: white; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 14px;">
            View My Schedule
          </a>
        </div>
      `;

      emailResult = await resend.emails.send({
        from: "Care Cuddle Academy <hello@care-cuddle-academy.co.uk>",
        to: [assigneeEmail],
        subject: `You're covering ${coveredFor}${dates.length ? ` — ${dates.length} day${dates.length !== 1 ? "s" : ""}` : ""}`,
        html: emailWrapper("You've been assigned cover", coveredFor, bodyContent, BRAND_COLOR),
      });
    } else {
      throw new Error(`Unknown email type: ${type}`);
    }

    console.log("Email sent successfully:", emailResult);

    return new Response(JSON.stringify({ success: true, result: emailResult }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: unknown) {
    console.error("Error in send-request-email function:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

serve(handler);
