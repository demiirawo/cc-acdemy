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

// Only these fields constitute a real schedule change per table. Updates
// where every one of them is unchanged (string comparison is whitespace-
// trimmed) are cosmetic — e.g. a data-hygiene trim of "Carelink Services "
// to "Carelink Services" — and must not email staff.
const SCHEDULE_FIELDS: Record<string, string[]> = {
  recurring_shift_patterns: ["user_id", "client_name", "days_of_week", "start_time", "end_time", "start_date", "end_date", "recurrence_interval", "shift_type", "is_overtime", "overtime_subtype"],
  staff_schedules: ["user_id", "client_name", "start_datetime", "end_datetime", "shift_type"],
  shift_pattern_exceptions: ["pattern_id", "exception_date", "exception_type", "overtime_subtype"],
};

const normalizeFieldValue = (v: unknown): string => {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v.trim();
  return JSON.stringify(v);
};

const isMeaningfulChange = (log: ShiftAuditLog): boolean => {
  if (log.action !== "UPDATE" || !log.old_data || !log.new_data) return true;
  const fields = SCHEDULE_FIELDS[log.table_name];
  if (!fields) return true;
  return fields.some((f) => normalizeFieldValue(log.old_data![f]) !== normalizeFieldValue(log.new_data![f]));
};

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
  // Whitespace-only differences are cosmetic, not a change.
  if (typeof a === "string" && typeof b === "string") return a.trim() === b.trim();
  return (a ?? null) === (b ?? null);
};

// One-line description of the shifts a pattern/schedule row represents, so
// the email says WHICH shifts changed, not just that "a pattern" did.
const describeShifts = (tableName: string, d: Record<string, unknown>): string => {
  const client = d.client_name ? escapeHtml(d.client_name) : "an unassigned client";
  if (tableName === "staff_schedules") {
    const dt = d.start_datetime ? formatDate(String(d.start_datetime)) : null;
    return `your shift at <strong>${client}</strong>${dt ? ` on ${dt}` : ""}`;
  }
  const days = Array.isArray(d.days_of_week) && d.days_of_week.length > 0 ? daysLabel(d.days_of_week) : null;
  const times = d.start_time && d.end_time ? `${formatTime(String(d.start_time))} – ${formatTime(String(d.end_time))}` : null;
  return `your recurring <strong>${client}</strong> shifts${days ? ` (${days}${times ? `, ${times}` : ""})` : times ? ` (${times})` : ""}`;
};

// Plain-English headline for what actually changed, e.g. "Client changed" /
// "Shift times changed" — clearer than a generic "pattern updated".
const CHANGE_HEADLINES: Record<string, string> = {
  client_name: "Client changed",
  days_of_week: "Working days changed",
  start_time: "Shift times changed",
  end_time: "Shift times changed",
  start_date: "Shift dates changed",
  end_date: "Shift dates changed",
  shift_date: "Shift date changed",
  shift_type: "Shift type changed",
  is_overtime: "Overtime status changed",
  overtime_subtype: "Overtime status changed",
  notes: "Notes updated",
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
    // Field-by-field diff so staff see exactly what moved/changed, with a
    // context line naming WHICH shifts this affects and explicit
    // "changed from X to Y" wording per field.
    const changedKeys: string[] = [];
    const diffs: string[] = [];
    for (const spec of FIELD_SPECS) {
      const before = (log.old_data as Record<string, unknown>)[spec.key];
      const after = (log.new_data as Record<string, unknown>)[spec.key];
      if (before === undefined && after === undefined) continue;
      if (!valuesEqual(before, after)) {
        changedKeys.push(spec.key);
        diffs.push(line(spec.label, `changed from ${spec.fmt(before)} <span style="color:#9ca3af;">to</span> <strong>${spec.fmt(after)}</strong>`));
      }
    }
    const headlines = Array.from(new Set(changedKeys.map(k => CHANGE_HEADLINES[k]).filter(Boolean)));
    title = headlines.length === 1 ? headlines[0] : `${tableLabel} updated`;
    // Describe the shifts as they were BEFORE the change, so "Client changed"
    // reads as "your Carelink shifts moved to X", not the other way round.
    const context = describeShifts(log.table_name, log.old_data as Record<string, unknown>);
    body = diffs.length > 0
      ? `<p style="margin: 6px 0 0 8px; color: #4b5563; font-size: 13px;">This affects ${context}:</p>
         <div style="margin-left: 8px; margin-top: 6px;">${diffs.join("")}</div>`
      : `<p style="margin: 6px 0 0 8px; color: #6b7280; font-size: 13px;">Minor update to ${context} — your days, times and client are unchanged.</p>`;
  } else {
    // INSERT / DELETE: show the full picture of the added/removed shift.
    const data = (log.action === "DELETE" ? log.old_data : log.new_data) || {};
    const clientSuffix = (data as Record<string, unknown>).client_name
      ? ` — ${escapeHtml((data as Record<string, unknown>).client_name)}`
      : "";
    title = log.action === "INSERT"
      ? `New ${tableLabel.toLowerCase()} added${clientSuffix}`
      : `${tableLabel} removed${clientSuffix}`;
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

    // Drop cosmetic updates (no schedule-relevant field actually changed).
    const meaningfulLogs = (auditLogs as ShiftAuditLog[]).filter(isMeaningfulChange);
    if (meaningfulLogs.length === 0) {
      return new Response(JSON.stringify({ success: true, message: "Only cosmetic changes — no notifications sent" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Expand logs into per-person events. A "replace" is an UPDATE that changes
    // user_id — split it into a removal for the OLD person and an addition for
    // the NEW person, so BOTH are told (the removed person was previously silent).
    const grouped = new Map<string, ShiftAuditLog[]>();
    const pushGrouped = (userId: string | undefined, log: ShiftAuditLog) => {
      if (!userId) return;
      const list = grouped.get(userId) || [];
      list.push(log);
      grouped.set(userId, list);
    };
    // Team-composition events per client (added/removed people) for co-workers.
    type TeamEvent = { client: string; kind: "added" | "removed"; personId: string };
    const teamEvents: TeamEvent[] = [];

    for (const log of meaningfulLogs) {
      const oldU = log.old_data?.user_id as string | undefined;
      const newU = log.new_data?.user_id as string | undefined;
      const isReplace = log.action === "UPDATE" && oldU && newU && oldU !== newU;

      if (isReplace) {
        // Removed person: render as a DELETE of the old shift.
        pushGrouped(oldU, { ...log, action: "DELETE", new_data: null });
        // Added person: render as an INSERT of the new shift.
        pushGrouped(newU, { ...log, action: "INSERT", old_data: null });
        const oldClient = String(log.old_data?.client_name ?? "").trim();
        const newClient = String(log.new_data?.client_name ?? "").trim();
        if (oldClient) teamEvents.push({ client: oldClient, kind: "removed", personId: oldU! });
        if (newClient) teamEvents.push({ client: newClient, kind: "added", personId: newU! });
      } else {
        const data = log.new_data || log.old_data;
        const uid = data?.user_id as string | undefined;
        pushGrouped(uid, log);
        // Co-workers care about people joining/leaving a client (not edits).
        const client = String(data?.client_name ?? "").trim();
        if (client && uid && log.action === "INSERT") teamEvents.push({ client, kind: "added", personId: uid });
        if (client && uid && log.action === "DELETE") teamEvents.push({ client, kind: "removed", personId: uid });
      }
    }

    if (grouped.size === 0 && teamEvents.length === 0) {
      return new Response(JSON.stringify({ success: true, message: "No staff-affecting changes" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Work out which clients had team changes, and who else works there.
    const affectedClients = [...new Set(teamEvents.map((e) => e.client))];
    const coworkerIdsByClient = new Map<string, Set<string>>();
    if (affectedClients.length) {
      const today = new Date().toISOString().slice(0, 10);
      const [{ data: assigns }, { data: pats }] = await Promise.all([
        supabase.from("staff_client_assignments").select("staff_user_id, client_name").in("client_name", affectedClients),
        supabase.from("recurring_shift_patterns").select("user_id, client_name, end_date").in("client_name", affectedClients),
      ]);
      for (const a of assigns || []) {
        const c = String(a.client_name).trim();
        if (!coworkerIdsByClient.has(c)) coworkerIdsByClient.set(c, new Set());
        coworkerIdsByClient.get(c)!.add(a.staff_user_id);
      }
      for (const p of pats || []) {
        if (p.end_date && String(p.end_date) < today) continue; // ended pattern
        const c = String(p.client_name).trim();
        if (!coworkerIdsByClient.has(c)) coworkerIdsByClient.set(c, new Set());
        coworkerIdsByClient.get(c)!.add(p.user_id);
      }
    }

    // Fetch profiles for everyone we might name or email.
    const changerIds = [...new Set(meaningfulLogs.map((l) => l.changed_by).filter(Boolean) as string[])];
    const coworkerIds = [...new Set([...coworkerIdsByClient.values()].flatMap((s) => [...s]))];
    const eventPersonIds = teamEvents.map((e) => e.personId);
    const allIds = [...new Set([...grouped.keys(), ...changerIds, ...coworkerIds, ...eventPersonIds])];

    const { data: profiles } = await supabase
      .from("profiles")
      .select("user_id, display_name, email")
      .in("user_id", allIds);

    const profileMap = new Map(
      (profiles || []).map((p) => [p.user_id, { name: p.display_name || p.email || "Unknown", email: p.email }])
    );
    const nameOf = (id: string) => profileMap.get(id)?.name || "A team member";

    let emailsSent = 0;
    let coworkerEmailsSent = 0;
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
          <h1 style="margin: 0; color: #ffffff; font-size: 20px; font-weight: 600;">Your schedule has changed</h1>
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
          <p style="margin: 0; color: #9ca3af; font-size: 12px;">(c) ${new Date().getFullYear()} Care Cuddle Academy. All rights reserved.</p>
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
          subject: `Your schedule has changed (${logs.length} update${logs.length > 1 ? "s" : ""})`,
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

    // ---- Co-worker ("team at this client changed") notifications ----
    // For each client that had people added/removed, tell everyone else who
    // works there. The people directly involved already got a personal email.
    for (const client of affectedClients) {
      const events = teamEvents.filter((e) => e.client === client);
      if (events.length === 0) continue;

      const added = [...new Set(events.filter((e) => e.kind === "added").map((e) => e.personId))];
      const removed = [...new Set(events.filter((e) => e.kind === "removed").map((e) => e.personId))];
      const involved = new Set([...added, ...removed]);

      const summaryItems: string[] = [];
      for (const id of added) summaryItems.push(`<li style="margin:4px 0;color:#166534;"><strong>${escapeHtml(nameOf(id))}</strong> has been added to the team</li>`);
      for (const id of removed) summaryItems.push(`<li style="margin:4px 0;color:#991b1b;"><strong>${escapeHtml(nameOf(id))}</strong> has been removed from the team</li>`);
      if (summaryItems.length === 0) continue;

      const recipients = [...(coworkerIdsByClient.get(client) || [])]
        .filter((id) => !involved.has(id) && !changerIds.includes(id)) // involved got a personal email; the changer made the change
        .map((id) => profileMap.get(id))
        .filter((p): p is { name: string; email: string } => !!p?.email);

      if (recipients.length === 0) continue;

      const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:'Figtree',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:40px 20px;"><tr><td align="center">
    <table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
      <tr><td style="background:${BRAND_COLOR};padding:24px 40px;text-align:center;">
        <img src="${LOGO_URL}" alt="Care Cuddle Academy" width="140" style="display:block;margin:0 auto 16px;" />
        <h1 style="margin:0;color:#fff;font-size:20px;font-weight:600;">Your client team has changed</h1>
        <p style="color:rgba(255,255,255,0.9);margin:6px 0 0;font-size:13px;">${escapeHtml(client)}</p>
      </td></tr>
      <tr><td style="padding:32px 40px;">
        <p style="color:#374151;font-size:15px;margin:0 0 16px;">Hi {{NAME}},</p>
        <p style="color:#4b5563;font-size:14px;margin:0 0 12px;">There's been a change to the team working with <strong>${escapeHtml(client)}</strong>, one of the clients you support:</p>
        <ul style="margin:0 0 8px;padding-left:20px;font-size:14px;">${summaryItems.join("")}</ul>
        <div style="text-align:center;margin-top:24px;">
          <a href="${APP_URL}" style="display:inline-block;background:${BRAND_COLOR};color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;">View the Schedule</a>
        </div>
        <p style="color:#6b7280;font-size:12px;margin:24px 0 0;text-align:center;">You're receiving this because you also work with this client.</p>
      </td></tr>
      <tr><td style="padding:20px 40px;background:#f9fafb;text-align:center;border-top:1px solid #e5e7eb;">
        <p style="margin:0;color:#9ca3af;font-size:12px;">(c) ${new Date().getFullYear()} Care Cuddle Academy. All rights reserved.</p>
      </td></tr>
    </table>
  </td></tr></table>
</body></html>`;

      for (const r of recipients) {
        const resp = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { "Authorization": `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            from: "Care Cuddle Academy <hello@care-cuddle-academy.co.uk>",
            to: [r.email],
            subject: `Team change for ${client}`,
            html: html.replace("{{NAME}}", escapeHtml(r.name?.split(" ")[0] || "there")),
          }),
        });
        if (!resp.ok) errors.push(`${r.email}: ${await resp.text()}`);
        else coworkerEmailsSent++;
      }
    }

    return new Response(JSON.stringify({
      success: true,
      changeCount: meaningfulLogs.length,
      staffNotified: emailsSent,
      coworkersNotified: coworkerEmailsSent,
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
