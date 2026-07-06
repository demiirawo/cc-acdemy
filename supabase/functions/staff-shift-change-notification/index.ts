import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const LOGO_URL = "https://care-cuddle.co.uk/wp-content/uploads/2023/03/Green-and-Beige-Bold-Typographic-Coffee-Products-Coffee-Logo-e1689542108718.png";
const BRAND_COLOR = "#5F17EB";
const APP_URL = "https://www.care-cuddle-academy.co.uk";

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
  const [hours, minutes] = String(time).split(":");
  const hour = parseInt(hours);
  if (isNaN(hour)) return String(time);
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

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const daysLabel = (arr: unknown): string =>
  Array.isArray(arr) ? arr.slice().sort((a, b) => Number(a) - Number(b)).map((d) => DAY_NAMES[Number(d)] ?? d).join(", ") : String(arr ?? "N/A");

const escapeHtml = (s: unknown): string =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// Fields we render/diff for a shift or recurring pattern, in display order.
const FIELD_SPECS: Array<{ key: string; label: string; fmt: (v: unknown) => string }> = [
  { key: "client_name", label: "Client", fmt: (v) => escapeHtml(v ?? "N/A") },
  { key: "shift_date", label: "Date", fmt: (v) => formatDate(v as string) },
  { key: "start_date", label: "Start date", fmt: (v) => formatDate(v as string) },
  { key: "end_date", label: "End date", fmt: (v) => (v ? formatDate(v as string) : "ongoing") },
  { key: "days_of_week", label: "Days", fmt: (v) => daysLabel(v) },
  { key: "start_time", label: "Start time", fmt: (v) => formatTime(v as string) },
  { key: "end_time", label: "End time", fmt: (v) => formatTime(v as string) },
  { key: "shift_type", label: "Type", fmt: (v) => escapeHtml(v ?? "N/A") },
  { key: "is_overtime", label: "Overtime", fmt: (v) => (v ? "Yes" : "No") },
  { key: "overtime_subtype", label: "Overtime type", fmt: (v) => escapeHtml(v ?? "—") },
  { key: "notes", label: "Notes", fmt: (v) => escapeHtml(v ?? "—") },
];

const valuesEqual = (a: unknown, b: unknown): boolean => {
  if (Array.isArray(a) || Array.isArray(b)) {
    const as = Array.isArray(a) ? a.slice().sort() : a;
    const bs = Array.isArray(b) ? b.slice().sort() : b;
    return JSON.stringify(as) === JSON.stringify(bs);
  }
  return (a ?? null) === (b ?? null);
};

const line = (label: string, value: string): string =>
  `<p style="margin: 4px 0; color: #4b5563;"><strong>${label}:</strong> ${value}</p>`;

const buildChangeBlock = (log: ShiftAuditLog, changedByName: string): string => {
  const color = getActionColor(log.action);
  const when = new Date(log.changed_at).toLocaleString("en-GB");

  // Single-shift exceptions (cancel a day, toggle a day to/from overtime).
  if (log.table_name === "shift_pattern_exceptions") {
    const d = log.new_data || log.old_data || {};
    const dateStr = formatDate(d.exception_date as string);
    const client = escapeHtml(d.client_name || "a client");
    const removed = log.action === "DELETE";
    const et = d.exception_type;
    let title = "Schedule change";
    let accent = "#6b7280";
    if (et === "deleted") {
      title = removed ? `Shift reinstated — ${dateStr}` : `Shift cancelled — ${dateStr}`;
      accent = removed ? "#22c55e" : "#ef4444";
    } else if (et === "overtime") {
      title = removed ? `Overtime removed — ${dateStr}` : `Marked as overtime — ${dateStr}`;
      accent = "#f59e0b";
    } else if (et === "not_overtime") {
      title = removed ? `Overtime override removed — ${dateStr}` : `Marked as non-overtime — ${dateStr}`;
      accent = "#f59e0b";
    }
    return `
      <div style="border-left: 4px solid ${accent}; padding: 12px; margin: 12px 0; background: #f9fafb; border-radius: 4px;">
        <div>
          <span style="font-weight: bold; color: ${accent};">${title}</span>
          <span style="color: #6b7280; font-size: 12px; float: right;">${when}</span>
        </div>
        <div style="margin-left: 8px; margin-top: 6px;">
          ${line("Client", client)}
          ${line("Date", dateStr)}
        </div>
        <p style="color: #374151; margin: 8px 0 0; font-size: 13px;">Changed by: <strong>${escapeHtml(changedByName)}</strong></p>
      </div>
    `;
  }

  const tableLabel = log.table_name === "staff_schedules" ? "Shift" : "Recurring pattern";
  let title = "";
  let body = "";

  if (log.action === "UPDATE" && log.old_data && log.new_data) {
    // Field-by-field diff so staff see exactly what moved/changed.
    title = `${tableLabel} updated`;
    const diffs: string[] = [];
    for (const spec of FIELD_SPECS) {
      const before = (log.old_data as Record<string, unknown>)[spec.key];
      const after = (log.new_data as Record<string, unknown>)[spec.key];
      if (before === undefined && after === undefined) continue;
      if (!valuesEqual(before, after)) {
        diffs.push(line(spec.label, `${spec.fmt(before)} <span style="color:#9ca3af;">→</span> <strong>${spec.fmt(after)}</strong>`));
      }
    }
    body = diffs.length > 0
      ? `<div style="margin-left: 8px; margin-top: 6px;">${diffs.join("")}</div>`
      : `<p style="margin: 6px 0 0 8px; color: #6b7280; font-size: 13px;">Minor update.</p>`;
  } else {
    // INSERT / DELETE: show the full picture of the added/removed shift.
    title = log.action === "INSERT" ? `New ${tableLabel.toLowerCase()} added` : `${tableLabel} removed`;
    const data = (log.action === "DELETE" ? log.old_data : log.new_data) || {};
    const rows: string[] = [];
    for (const spec of FIELD_SPECS) {
      const v = (data as Record<string, unknown>)[spec.key];
      if (v === undefined || v === null || v === "") continue;
      rows.push(line(spec.label, spec.fmt(v)));
    }
    body = `<div style="margin-left: 8px; margin-top: 6px;">${rows.join("")}</div>`;
  }

  return `
    <div style="border-left: 4px solid ${color}; padding: 12px; margin: 12px 0; background: #f9fafb; border-radius: 4px;">
      <div>
        <span style="font-weight: bold; color: ${color};">${title}</span>
        <span style="color: #6b7280; font-size: 12px; float: right;">${when}</span>
      </div>
      ${body}
      <p style="color: #374151; margin: 8px 0 0; font-size: 13px;">Changed by: <strong>${escapeHtml(changedByName)}</strong></p>
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
      .in("table_name", ["staff_schedules", "recurring_shift_patterns", "shift_pattern_exceptions"])
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
          <p style="color: #374151; font-size: 15px; margin: 0 0 16px;">Hi ${escapeHtml(profile.name?.split(" ")[0] || "there")},</p>
          <p style="color: #4b5563; font-size: 14px; margin: 0 0 20px;">The following change(s) have been made to your schedule:</p>
          ${changeBlocks}
          <div style="text-align: center; margin-top: 28px;">
            <a href="${APP_URL}" style="display: inline-block; background-color: ${BRAND_COLOR}; color: white; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 14px;">
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
