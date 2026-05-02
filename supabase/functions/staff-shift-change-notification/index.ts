import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const LOGO_URL = "https://care-cuddle.co.uk/wp-content/uploads/2023/03/Green-and-Beige-Bold-Typographic-Coffee-Products-Coffee-Logo-e1689542108718.png";
const BRAND_COLOR = "#5F17EB";

interface ShiftAuditLog {
  id: string;
  table_name: string;
  record_id: string;
  action: string;
  changed_by: string | null;
  old_data: Record<string, any> | null;
  new_data: Record<string, any> | null;
  changed_at: string;
}

const formatTime = (time: string | null | undefined): string => {
  if (!time) return "N/A";
  const [hours, minutes] = time.split(":");
  const hour = parseInt(hours);
  const ampm = hour >= 12 ? "PM" : "AM";
  const hour12 = hour % 12 || 12;
  return `${hour12}:${minutes} ${ampm}`;
};

const formatDate = (dateStr: string | null | undefined): string => {
  if (!dateStr) return "N/A";
  return new Date(dateStr).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
};

const getActionColor = (action: string): string => {
  switch (action) {
    case "INSERT": return "#22c55e";
    case "UPDATE": return "#f59e0b";
    case "DELETE": return "#ef4444";
    default: return "#6b7280";
  }
};

const getActionLabel = (action: string): string => {
  switch (action) {
    case "INSERT": return "New shift added";
    case "UPDATE": return "Shift updated";
    case "DELETE": return "Shift removed";
    default: return action;
  }
};

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const buildChangeBlock = (log: ShiftAuditLog, changedByName: string): string => {
  const data = log.action === "DELETE" ? log.old_data : log.new_data;
  const tableLabel = log.table_name === "staff_schedules" ? "Shift" : "Recurring Pattern";

  let details = "";
  if (data) {
    const clientName = data.client_name || "N/A";
    const startTime = formatTime(data.start_time);
    const endTime = formatTime(data.end_time);
    const date = data.shift_date
      ? formatDate(data.shift_date)
      : data.start_date
      ? `${formatDate(data.start_date)}${data.end_date ? " → " + formatDate(data.end_date) : " (ongoing)"}`
      : "N/A";

    let daysLine = "";
    if (Array.isArray(data.days_of_week) && data.days_of_week.length > 0) {
      const days = data.days_of_week.map((d: number) => DAY_NAMES[d]).join(", ");
      daysLine = `<p style="margin: 4px 0;"><strong>Days:</strong> ${days}</p>`;
    }

    details = `
      <div style="margin-left: 8px; color: #4b5563;">
        <p style="margin: 4px 0;"><strong>Client:</strong> ${clientName}</p>
        <p style="margin: 4px 0;"><strong>Date:</strong> ${date}</p>
        ${daysLine}
        <p style="margin: 4px 0;"><strong>Time:</strong> ${startTime} - ${endTime}</p>
        ${data.shift_type ? `<p style="margin: 4px 0;"><strong>Type:</strong> ${data.shift_type}</p>` : ""}
        ${data.notes ? `<p style="margin: 4px 0;"><strong>Notes:</strong> ${data.notes}</p>` : ""}
      </div>
    `;
  }

  return `
    <div style="border-left: 4px solid ${getActionColor(log.action)}; padding: 12px; margin: 12px 0; background: #f9fafb; border-radius: 4px;">
      <div>
        <span style="font-weight: bold; color: ${getActionColor(log.action)};">${getActionLabel(log.action)} (${tableLabel})</span>
        <span style="color: #6b7280; font-size: 12px; float: right;">${new Date(log.changed_at).toLocaleString("en-GB")}</span>
      </div>
      <p style="color: #374151; margin: 8px 0; font-size: 13px;">Updated by: <strong>${changedByName}</strong></p>
      ${details}
    </div>
  `;
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: settings } = await supabase
      .from("notification_settings")
      .select("*")
      .eq("notification_type", "staff_shift_change")
      .maybeSingle();

    if (!settings?.is_enabled) {
      return new Response(JSON.stringify({ success: true, message: "Staff shift change notifications disabled" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sinceIso = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const { data: auditLogs, error: auditError } = await supabase
      .from("shift_audit_log")
      .select("*")
      .gte("changed_at", sinceIso)
      .in("table_name", ["staff_schedules", "recurring_shift_patterns"])
      .order("changed_at", { ascending: false });

    if (auditError) throw auditError;
    if (!auditLogs || auditLogs.length === 0) {
      return new Response(JSON.stringify({ success: true, message: "No recent changes" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const grouped = new Map<string, ShiftAuditLog[]>();
    for (const log of auditLogs as ShiftAuditLog[]) {
      const data = log.new_data || log.old_data;
      const affectedUserId = data?.user_id as string | undefined;
      if (!affectedUserId) continue;

      const list = grouped.get(affectedUserId) || [];
      list.push(log);
      grouped.set(affectedUserId, list);
    }

    if (grouped.size === 0) {
      return new Response(JSON.stringify({ success: true, message: "No staff-affecting changes" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const affectedIds = Array.from(grouped.keys());
    const changerIds = [...new Set(auditLogs.map((l: ShiftAuditLog) => l.changed_by).filter(Boolean) as string[])];
    const allIds = [...new Set([...affectedIds, ...changerIds])];

    const { data: profiles } = await supabase
      .from("profiles")
      .select("user_id, display_name, email")
      .in("user_id", allIds);

    const profileMap = new Map(
      (profiles || []).map((p) => [p.user_id, { name: p.display_name || p.email || "Unknown", email: p.email }])
    );

    let emailsSent = 0;
    const errors: string[] = [];

    for (const [userId, logs] of grouped.entries()) {
      const profile = profileMap.get(userId);
      if (!profile?.email) continue;

      const changeBlocks = logs
        .map((log) => {
          const changerName = log.changed_by
            ? profileMap.get(log.changed_by)?.name || "An administrator"
            : "System";
          return buildChangeBlock(log, changerName);
        })
        .join("");

      const emailHtml = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin: 0; padding: 0; background-color: #f4f4f5; font-family: 'Figtree', Arial, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f5; padding: 40px 20px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.08);">
        <tr><td style="background-color: ${BRAND_COLOR}; padding: 24px 40px; text-align: center;">
          <img src="${LOGO_URL}" alt="Care Cuddle Academy" width="140" style="display: block; margin: 0 auto 16px;" />
          <h1 style="margin: 0; color: #ffffff; font-size: 20px; font-weight: 600;">📅 Your schedule has changed</h1>
          <p style="color: rgba(255,255,255,0.9); margin: 6px 0 0 0; font-size: 13px;">${logs.length} change(s) to your shifts</p>
        </td></tr>
        <tr><td style="padding: 32px 40px;">
          <p style="color: #374151; font-size: 15px; margin: 0 0 16px;">Hi ${profile.name?.split(" ")[0] || "there"},</p>
          <p style="color: #4b5563; font-size: 14px; margin: 0 0 20px;">The following change(s) have been made to your schedule:</p>
          ${changeBlocks}
          <div style="text-align: center; margin-top: 28px;">
            <a href="https://cc-acdemy.lovable.app" style="display: inline-block; background-color: ${BRAND_COLOR}; color: white; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 14px;">
              View My Schedule
            </a>
          </div>
          <p style="color: #6b7280; font-size: 12px; margin: 24px 0 0; text-align: center;">If anything looks incorrect, please contact your manager.</p>
        </td></tr>
        <tr><td style="padding: 20px 40px; background-color: #f9fafb; text-align: center; border-top: 1px solid #e5e7eb;">
          <p style="margin: 0; color: #9ca3af; font-size: 12px;">© ${new Date().getFullYear()} Care Cuddle Academy. All rights reserved.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

      const resendResponse = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: "Care Cuddle Academy <hello@care-cuddle-academy.co.uk>",
          to: [profile.email],
          subject: `📅 Your schedule has changed (${logs.length} update${logs.length > 1 ? "s" : ""})`,
          html: emailHtml,
        }),
      });

      if (!resendResponse.ok) {
        const errorText = await resendResponse.text();
        errors.push(`${profile.email}: ${errorText}`);
      } else {
        emailsSent++;
      }
    }

    return new Response(JSON.stringify({
      success: true,
      changeCount: auditLogs.length,
      staffNotified: emailsSent,
      errors: errors.length ? errors : undefined,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("Error:", error);
    return new Response(JSON.stringify({ success: false, error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
