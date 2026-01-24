import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

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

    // Check if shift_change notifications are enabled
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

    // Get recent unprocessed shift changes (last 5 minutes)
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

    // Get admin emails
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

    // Get all unique user IDs to fetch names
    const userIds = [...new Set(auditLogs.map((log: ShiftAuditLog) => log.changed_by).filter(Boolean))];
    const { data: profiles } = await supabase
      .from("profiles")
      .select("user_id, display_name, email")
      .in("user_id", userIds);

    const profileMap = new Map(profiles?.map((p) => [p.user_id, p.display_name || p.email || "Unknown"]) || []);

    // Build email content
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
            <p><strong>Client:</strong> ${clientName}</p>
            <p><strong>Date:</strong> ${date}</p>
            <p><strong>Time:</strong> ${startTime} - ${endTime}</p>
          </div>
        `;
      }

      return `
        <div style="border-left: 4px solid ${getActionColor(log.action)}; padding: 12px; margin: 12px 0; background: #f9fafb; border-radius: 4px;">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <span style="font-weight: bold; color: ${getActionColor(log.action)};">${getActionLabel(log.action)} ${tableLabel}</span>
            <span style="color: #6b7280; font-size: 12px;">${new Date(log.changed_at).toLocaleTimeString("en-GB")}</span>
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
          <title>Shift Change Alert</title>
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: linear-gradient(135deg, #8b5cf6, #6366f1); padding: 20px; border-radius: 8px 8px 0 0;">
            <h1 style="color: white; margin: 0; font-size: 24px;">🔔 Shift Change Alert</h1>
            <p style="color: rgba(255,255,255,0.9); margin: 8px 0 0 0;">${auditLogs.length} change(s) detected</p>
          </div>
          <div style="background: white; padding: 20px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
            ${changes}
            <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;">
            <p style="color: #6b7280; font-size: 12px; text-align: center;">
              This is an automated alert from Care Cuddle Academy
            </p>
          </div>
        </body>
      </html>
    `;

    // Send email via Resend
    const resendResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Care Cuddle Academy <alerts@carecuddle.co.uk>",
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
