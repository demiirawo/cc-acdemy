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
  old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
  changed_at: string;
}

const formatTime = (time: string | null): string => {
  if (!time) return "N/A";
  const [hours, minutes] = time.split(":");
  const hour = parseInt(hours);
  const ampm = hour >= 12 ? "PM" : "AM";
  const hour12 = hour % 12 || 12;
  return `${hour12}:${minutes} ${ampm}`;
};

const formatDate = (dateStr: string | null): string => {
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
    case "INSERT": return "Created";
    case "UPDATE": return "Modified";
    case "DELETE": return "Deleted";
    default: return action;
  }
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
      .eq("notification_type", "shift_change")
      .single();

    if (!settings?.is_enabled) {
      return new Response(JSON.stringify({ success: true, message: "Shift change alerts disabled" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const { data: auditLogs, error: auditError } = await supabase
      .from("shift_audit_log")
      .select("*")
      .gte("changed_at", fiveMinutesAgo)
      .order("changed_at", { ascending: false });

    if (auditError) throw auditError;
    if (!auditLogs || auditLogs.length === 0) {
      return new Response(JSON.stringify({ success: true, message: "No recent changes" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: admins } = await supabase
      .from("profiles")
      .select("email")
      .eq("role", "admin");

    const adminEmails = admins?.map((a) => a.email).filter(Boolean) as string[];
    if (adminEmails.length === 0) {
      return new Response(JSON.stringify({ success: false, error: "No admin emails found" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userIds = [...new Set(auditLogs.map((log: ShiftAuditLog) => log.changed_by).filter(Boolean))];
    const { data: profiles } = await supabase
      .from("profiles")
      .select("user_id, display_name, email")
      .in("user_id", userIds);

    const profileMap = new Map(profiles?.map((p) => [p.user_id, p.display_name || p.email || "Unknown"]) || []);

    const changes = auditLogs.map((log: ShiftAuditLog) => {
      const changedBy = log.changed_by ? profileMap.get(log.changed_by) || "Unknown" : "System";
      const data = log.action === "DELETE" ? log.old_data : log.new_data;
      const tableLabel = log.table_name === "staff_schedules" ? "Shift" : "Recurring Pattern";
      
      let details = "";
      if (data) {
        const clientName = data.client_name || "N/A";
        const startTime = formatTime(data.start_time as string);
        const endTime = formatTime(data.end_time as string);
        const date = data.shift_date ? formatDate(data.shift_date as string) : 
                     data.start_date ? formatDate(data.start_date as string) : "N/A";
        
        details = `
          <div style="margin-left: 20px; color: #4b5563;">
            <p style="margin: 4px 0;"><strong>Client:</strong> ${clientName}</p>
            <p style="margin: 4px 0;"><strong>Date:</strong> ${date}</p>
            <p style="margin: 4px 0;"><strong>Time:</strong> ${startTime} - ${endTime}</p>
          </div>
        `;
      }

      return `
        <div style="border-left: 4px solid ${getActionColor(log.action)}; padding: 12px; margin: 12px 0; background: #f9fafb; border-radius: 4px;">
          <div>
            <span style="font-weight: bold; color: ${getActionColor(log.action)};">${getActionLabel(log.action)} ${tableLabel}</span>
            <span style="color: #6b7280; font-size: 12px; float: right;">${new Date(log.changed_at).toLocaleTimeString("en-GB")}</span>
          </div>
          <p style="color: #374151; margin: 8px 0;">Changed by: <strong>${changedBy}</strong></p>
          ${details}
        </div>
      `;
    }).join("");

    const emailHtml = `
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
              <h1 style="margin: 0; color: #ffffff; font-size: 20px; font-weight: 600;">🔔 Shift Change Alert</h1>
              <p style="color: rgba(255,255,255,0.9); margin: 6px 0 0 0; font-size: 13px;">${auditLogs.length} change(s) detected</p>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding: 32px 40px;">
              ${changes}
              <div style="text-align: center; margin-top: 24px;">
                <a href="https://cc-acdemy.lovable.app" style="display: inline-block; background-color: ${BRAND_COLOR}; color: white; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 14px;">
                  Go to Dashboard
                </a>
              </div>
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

    const resendResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Care Cuddle Academy <hello@care-cuddle-academy.co.uk>",
        to: adminEmails,
        subject: `🔔 Shift Change Alert: ${auditLogs.length} change(s)`,
        html: emailHtml,
      }),
    });

    if (!resendResponse.ok) {
      const errorText = await resendResponse.text();
      throw new Error(`Resend error: ${errorText}`);
    }

    return new Response(JSON.stringify({ 
      success: true, 
      changeCount: auditLogs.length,
      emailsSent: adminEmails.length 
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("Error:", error);
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
