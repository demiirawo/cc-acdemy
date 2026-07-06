import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "npm:resend@2.0.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const LOGO_URL = "https://care-cuddle.co.uk/wp-content/uploads/2023/03/Green-and-Beige-Bold-Typographic-Coffee-Products-Coffee-Logo-e1689542108718.png";
const BRAND_COLOR = "#5F17EB";
const APP_URL = "https://www.care-cuddle-academy.co.uk";
const BIRTHDAY_IMAGE_URL = "https://www.care-cuddle-academy.co.uk/images/birthday-celebration.png";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const formatDate = (dateStr: string): string => {
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
};

const formatShortDate = (dateStr: string): string => {
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  });
};

interface DigestSection {
  type: string;
  title: string;
  icon: string;
  accentColor: string;
  itemsHtml: string[];
  summary: string;
}

const sendStandaloneAlert = async (
  recipients: string[],
  subject: string,
  title: string,
  color: string,
  items: string[],
  todayStr: string,
  options?: { showCelebrationImage?: boolean }
): Promise<{ success: boolean; error?: string }> => {
  if (recipients.length === 0) return { success: false, error: "no recipients" };
  const itemsHtml = items.map(item => `<li style="margin-bottom: 8px; font-size: 14px;">${item}</li>`).join("");

  const footerContent = options?.showCelebrationImage
    ? `<div style="text-align: center; margin-top: 24px;">
        <img src="${BIRTHDAY_IMAGE_URL}" alt="Celebration" width="150" height="150" style="display: inline-block;" />
      </div>`
    : '';

  try {
    await resend.emails.send({
      from: "Care Cuddle Academy <hello@care-cuddle-academy.co.uk>",
      to: recipients,
      subject,
      html: `
<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:40px 20px;">
    <tr><td align="center">
      <table width="500" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
        <tr><td style="background:${BRAND_COLOR};padding:24px 40px;text-align:center;">
          <img src="${LOGO_URL}" alt="Care Cuddle Academy" width="140" style="display:block;margin:0 auto 16px;" />
          <h1 style="margin:0;color:#fff;font-size:20px;font-weight:600;">${title}</h1>
          <p style="color:rgba(255,255,255,0.9);margin:6px 0 0;font-size:13px;">${formatDate(todayStr)}</p>
          <div style="width:60px;height:3px;background:${color};margin:12px auto 0;border-radius:2px;"></div>
        </td></tr>
        <tr><td style="padding:32px 40px;">
          <ul style="margin:0;padding-left:20px;color:#374151;">${itemsHtml}</ul>
          ${footerContent}
        </td></tr>
        <tr><td style="padding:20px 40px;background:#f9fafb;text-align:center;border-top:1px solid #e5e7eb;">
          <p style="margin:0;color:#9ca3af;font-size:12px;">© ${new Date().getFullYear()} Care Cuddle Academy. All rights reserved.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`,
    });
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
  }
};

const buildDigestHtml = (sections: DigestSection[], todayStr: string): string => {
  const tocHtml = sections.length > 1
    ? `<div style="background:#f9fafb;padding:16px 20px;border-radius:8px;margin-bottom:24px;border:1px solid #e5e7eb;">
        <p style="margin:0 0 8px;font-size:13px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;">In this digest</p>
        <ul style="margin:0;padding-left:18px;color:#374151;">
          ${sections.map(s => `<li style="margin-bottom:4px;font-size:14px;">${s.icon} ${s.title} <span style="color:#9ca3af;">— ${s.summary}</span></li>`).join("")}
        </ul>
      </div>`
    : '';

  const sectionsHtml = sections.map(s => `
    <div style="margin-bottom:28px;border-left:4px solid ${s.accentColor};padding:12px 16px;background:#fafafa;border-radius:0 8px 8px 0;">
      <h2 style="margin:0 0 12px;font-size:16px;color:#111827;">${s.icon} ${s.title}</h2>
      <ul style="margin:0;padding-left:20px;color:#374151;">
        ${s.itemsHtml.map(i => `<li style="margin-bottom:8px;font-size:14px;">${i}</li>`).join("")}
      </ul>
    </div>
  `).join("");

  return `
<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:40px 20px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
        <tr><td style="background:${BRAND_COLOR};padding:24px 40px;text-align:center;">
          <img src="${LOGO_URL}" alt="Care Cuddle Academy" width="140" style="display:block;margin:0 auto 16px;" />
          <h1 style="margin:0;color:#fff;font-size:22px;font-weight:600;">📬 Daily Admin Digest</h1>
          <p style="color:rgba(255,255,255,0.9);margin:6px 0 0;font-size:13px;">${formatDate(todayStr)}</p>
        </td></tr>
        <tr><td style="padding:32px 40px;">
          ${tocHtml}
          ${sectionsHtml}
          <div style="text-align:center;margin-top:24px;">
            <a href="https://www.care-cuddle-academy.co.uk" style="display:inline-block;background:${BRAND_COLOR};color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;">Go to Dashboard</a>
          </div>
        </td></tr>
        <tr><td style="padding:20px 40px;background:#f9fafb;text-align:center;border-top:1px solid #e5e7eb;">
          <p style="margin:0;color:#9ca3af;font-size:12px;">© ${new Date().getFullYear()} Care Cuddle Academy. All rights reserved.</p>
          <p style="margin:6px 0 0;color:#9ca3af;font-size:11px;">You can manage which sections appear in this digest from the Admin Notification Settings.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
};

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    let testType: string | null = null;
    try {
      const body = await req.json();
      testType = body?.testType || null;
    } catch { /* ignore */ }

    // Only send on the real (cron) run when it's 9am UK time. The cron fires at
    // both 08:00 and 09:00 UTC so that exactly one of them lands on 09:00 in
    // Europe/London regardless of BST/GMT. Test runs bypass this gate.
    if (!testType) {
      const londonHour = Number(
        new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", hour: "numeric", hourCycle: "h23" }).format(new Date())
      );
      if (londonHour !== 9) {
        return new Response(
          JSON.stringify({ skipped: true, reason: "not 9am UK time", londonHour }),
          { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString().split("T")[0];

    const { data: notificationSettings } = await supabaseClient
      .from("notification_settings").select("*");
    const settingsMap = new Map(notificationSettings?.map(s => [s.notification_type, s]) || []);

    const { data: adminProfiles } = await supabaseClient
      .from("profiles").select("email, display_name").eq("role", "admin");
    const adminEmails = adminProfiles?.filter(p => p.email).map(p => p.email as string) || [];

    const { data: profiles } = await supabaseClient
      .from("profiles").select("user_id, display_name");
    const profileMap = new Map(profiles?.map(p => [p.user_id, p.display_name]) || []);

    const sections: DigestSection[] = [];
    const standaloneResults: Array<{ type: string; emailSent: boolean; error?: string; title: string }> = [];

    const isEnabled = (type: string) => {
      const s = settingsMap.get(type);
      return s ? s.is_enabled : true;
    };
    const shouldRun = (type: string) => {
      if (testType === "digest") return isEnabled(type);
      if (testType) return testType === type;
      return isEnabled(type);
    };

    // ===== 1. BIRTHDAYS =====
    // Standalone email to ALL active staff (celebratory). Also add a line to the admin digest.
    if (shouldRun("birthday_today")) {
      const { data: onboardingDocs } = await supabaseClient
        .from("staff_onboarding_documents")
        .select("user_id, date_of_birth, full_name")
        .not("date_of_birth", "is", null);

      const todayBirthdays: string[] = [];
      for (const doc of onboardingDocs || []) {
        if (!doc.date_of_birth) continue;
        const dob = new Date(doc.date_of_birth);
        if (dob.getDate() === today.getDate() && dob.getMonth() === today.getMonth()) {
          todayBirthdays.push(doc.full_name || profileMap.get(doc.user_id) || "Unknown");
        }
      }

      if (todayBirthdays.length > 0 || testType === "birthday_today") {
        const displayItems = todayBirthdays.length > 0 ? todayBirthdays : ["[TEST] John Smith", "[TEST] Jane Doe"];

        // Send celebratory email to all active staff
        const { data: allStaffProfiles } = await supabaseClient
          .from("profiles").select("user_id, email").neq("role", "client");
        const { data: activeHr } = await supabaseClient
          .from("hr_profiles").select("user_id")
          .in("employment_status", ["active", "onboarding_probation", "onboarding_passed"]);
        const activeIds = new Set(activeHr?.map(h => h.user_id) || []);
        const staffEmails = allStaffProfiles?.filter(p => p.email && activeIds.has(p.user_id)).map(p => p.email as string) || [];
        const birthdayRecipients = staffEmails.length > 0 ? staffEmails : adminEmails;

        const message = displayItems.length === 1
          ? `🎂 ${displayItems[0]} has a birthday today!`
          : `🎂 ${displayItems.join(", ")} have birthdays today!`;
        const namesForSubject = displayItems.length <= 3
          ? displayItems.join(", ")
          : `${displayItems.slice(0, 2).join(", ")} + ${displayItems.length - 2} more`;

        const r = await sendStandaloneAlert(
          birthdayRecipients,
          `🎂 Birthday: ${namesForSubject}`,
          "🎂 Happy Birthday!", "#ec4899",
          [message], todayStr, { showCelebrationImage: true }
        );
        standaloneResults.push({ type: "birthday_today", emailSent: r.success, error: r.error, title: "Birthdays (all staff)" });

        // Also add to admin digest
        sections.push({
          type: "birthday_today",
          title: "Birthdays Today",
          icon: "🎂",
          accentColor: "#ec4899",
          itemsHtml: displayItems.map(n => `${n}`),
          summary: `${displayItems.length} today`,
        });
      }
    }

    // ===== 2. WORK ANNIVERSARIES =====
    if (shouldRun("anniversary_today")) {
      const { data: hrProfiles } = await supabaseClient
        .from("hr_profiles").select("user_id, start_date").not("start_date", "is", null);

      const todayAnniversaries: { name: string; years: number }[] = [];
      for (const hr of hrProfiles || []) {
        if (!hr.start_date) continue;
        const startDate = new Date(hr.start_date);
        if (startDate.getDate() === today.getDate() && startDate.getMonth() === today.getMonth()) {
          const years = today.getFullYear() - startDate.getFullYear();
          if (years > 0) {
            todayAnniversaries.push({ name: profileMap.get(hr.user_id) || "Unknown", years });
          }
        }
      }

      if (todayAnniversaries.length > 0 || testType === "anniversary_today") {
        const display = todayAnniversaries.length > 0
          ? todayAnniversaries
          : [{ name: "[TEST] John Smith", years: 3 }];
        sections.push({
          type: "anniversary_today",
          title: "Work Anniversaries",
          icon: "🎉",
          accentColor: "#8b5cf6",
          itemsHtml: display.map(a => `${a.name} — ${a.years} year${a.years > 1 ? "s" : ""} 🎉`),
          summary: `${display.length} today`,
        });
      }
    }

    // ===== 3. UPCOMING APPROVED HOLIDAYS (next 3 months, with cover status) =====
    if (shouldRun("upcoming_holidays")) {
      const horizon = new Date(today);
      horizon.setMonth(horizon.getMonth() + 3);
      const horizonStr = horizon.toISOString().split("T")[0];

      const { data: upcomingHolidays } = await supabaseClient
        .from("staff_holidays")
        .select("id, user_id, start_date, end_date, holiday_type, no_cover_dates, no_cover_required")
        .eq("status", "approved")
        .gte("start_date", todayStr)
        .lte("start_date", horizonStr)
        .order("start_date");

      const holidayUserIdsForCovers = [...new Set((upcomingHolidays || []).map(h => h.user_id))];
      const { data: holidayCovers } = holidayUserIdsForCovers.length > 0
        ? await supabaseClient
            .from("staff_requests")
            .select("user_id, swap_with_user_id, coverage_metadata, start_date, end_date")
            .eq("request_type", "shift_swap")
            .eq("status", "approved")
            .in("swap_with_user_id", holidayUserIdsForCovers)
        : { data: [] as any[] };

      const has = upcomingHolidays && upcomingHolidays.length > 0;
      if (has || testType === "upcoming_holidays") {
        const enumerateDates = (start: string, end: string): string[] => {
          const out: string[] = [];
          const s = new Date(start); const e = new Date(end);
          for (const d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) {
            out.push(d.toISOString().split("T")[0]);
          }
          return out;
        };

        const items = has
          ? upcomingHolidays.map(h => {
              const name = profileMap.get(h.user_id) || "Unknown";
              const allDates = enumerateDates(h.start_date, h.end_date);
              const noCoverDates = new Set<string>((h.no_cover_dates as string[] | null) || []);
              const datesNeedingCover = allDates.filter(d => !noCoverDates.has(d));
              const coveredSet = new Set<string>();
              for (const c of holidayCovers || []) {
                if (c.swap_with_user_id !== h.user_id) continue;
                const dates: string[] = (c.coverage_metadata as any)?.covered_dates || [];
                if (dates.length > 0) {
                  dates.forEach(d => { if (datesNeedingCover.includes(d)) coveredSet.add(d); });
                } else {
                  datesNeedingCover.forEach(d => { if (d >= c.start_date && d <= c.end_date) coveredSet.add(d); });
                }
              }
              const total = datesNeedingCover.length;
              const covered = coveredSet.size;
              let status: string;
              if ((h as any).no_cover_required === true || total === 0) status = `<span style="color:#10b981;font-weight:600;">No cover needed</span>`;
              else if (covered === 0) status = `<span style="color:#ef4444;font-weight:600;">Not covered</span>`;
              else if (covered >= total) status = `<span style="color:#10b981;font-weight:600;">Fully covered</span>`;
              else status = `<span style="color:#f59e0b;font-weight:600;">Partially covered (${covered}/${total} days)</span>`;
              const dateRange = h.start_date === h.end_date
                ? formatShortDate(h.start_date)
                : `${formatShortDate(h.start_date)} – ${formatShortDate(h.end_date)}`;
              const daysUntil = Math.ceil((new Date(h.start_date).getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
              return { sortKey: h.start_date, html: `<strong>${name}</strong> — ${dateRange} (in ${daysUntil} day${daysUntil === 1 ? "" : "s"}) — ${status}` };
            })
          : [{ sortKey: "0", html: `<strong>[TEST] John Smith</strong> — 25 Jan – 28 Jan (in 5 days) — <span style="color:#f59e0b;font-weight:600;">Partially covered (2/4 days)</span>` }];

        items.sort((a, b) => a.sortKey.localeCompare(b.sortKey));

        sections.push({
          type: "upcoming_holidays",
          title: "Upcoming Holidays (next 3 months)",
          icon: "📅",
          accentColor: "#3b82f6",
          itemsHtml: items.map(i => i.html),
          summary: `${items.length} upcoming`,
        });
      }
    }

    // ===== 4. SHIFT PATTERNS EXPIRING =====
    if (shouldRun("pattern_expiring")) {
      const patternDays = settingsMap.get("pattern_expiring")?.days_before || 14;
      const futureDate = new Date(today);
      futureDate.setDate(futureDate.getDate() + patternDays);
      const futureDateStr = futureDate.toISOString().split("T")[0];

      const { data: expiringPatterns } = await supabaseClient
        .from("recurring_shift_patterns")
        .select("id, user_id, client_name, end_date, shift_type")
        .eq("is_overtime", false)
        .gte("end_date", todayStr)
        .lte("end_date", futureDateStr)
        .order("end_date");

      if (expiringPatterns && expiringPatterns.length > 0) {
        sections.push({
          type: "pattern_expiring",
          title: `Shift Patterns Expiring (next ${patternDays} days)`,
          icon: "⚠️",
          accentColor: "#f59e0b",
          itemsHtml: expiringPatterns.map(p => {
            const name = profileMap.get(p.user_id) || "Unknown";
            return `<strong>${name}</strong> at ${p.client_name || "Unknown client"} — expires ${formatShortDate(p.end_date)}`;
          }),
          summary: `${expiringPatterns.length} expiring`,
        });
      }
    }

    // ===== 5. HOLIDAYS WITHOUT CLIENT NOTIFICATION =====
    if (shouldRun("holiday_no_client_notification")) {
      const days = settingsMap.get("holiday_no_client_notification")?.days_before || 14;
      const futureDate = new Date(today);
      futureDate.setDate(futureDate.getDate() + days);
      const futureDateStr = futureDate.toISOString().split("T")[0];

      const { data: pending } = await supabaseClient
        .from("staff_requests")
        .select("id, user_id, start_date, end_date, client_informed")
        .in("request_type", ["holiday_paid", "holiday_unpaid", "holiday"])
        .eq("status", "approved")
        .or(`client_informed.is.null,client_informed.eq.false`)
        .gte("start_date", todayStr)
        .lte("start_date", futureDateStr)
        .order("start_date");

      const has = pending && pending.length > 0;
      if (has || testType === "holiday_no_client_notification") {
        const data = has
          ? pending.map(r => {
              const name = profileMap.get(r.user_id) || "Unknown";
              const daysUntil = Math.ceil((new Date(r.start_date).getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
              return { name, daysUntil, date: formatShortDate(r.start_date) };
            })
          : [{ name: "[TEST] John Smith", daysUntil: 3, date: "27 Jan" }];

        sections.push({
          type: "holiday_no_client_notification",
          title: "Client Notification Missing",
          icon: "🚨",
          accentColor: "#ef4444",
          itemsHtml: data.map(r => `<strong>${r.name}</strong> — holiday in ${r.daysUntil} day${r.daysUntil !== 1 ? "s" : ""} (${r.date}) — <span style="color:#ef4444;font-weight:600;">CLIENT NOT NOTIFIED</span>`),
          summary: `${data.length} action needed`,
        });
      }
    }

    // ===== 6. HOLIDAY COUNTDOWN (7/3/1 days) + HANDOVER REMINDER =====
    // Personal emails to taker/cover stay separate. Admin copy goes in the digest.
    if (!testType || testType === "holiday_countdown" || testType === "digest") {
      const targetDates: string[] = [];
      for (const offset of [1, 3, 7]) {
        const d = new Date(today);
        d.setDate(d.getDate() + offset);
        targetDates.push(d.toISOString().split("T")[0]);
      }

      const { data: upcoming } = await supabaseClient
        .from("staff_requests")
        .select("id, user_id, start_date, end_date, request_type")
        .in("request_type", ["holiday_paid", "holiday_unpaid", "holiday"])
        .eq("status", "approved")
        .in("start_date", targetDates);

      const holidays = upcoming || [];

      if (holidays.length > 0) {
        const holidayUserIds = [...new Set(holidays.map(h => h.user_id))];
        const { data: covers } = await supabaseClient
          .from("staff_requests")
          .select("user_id, swap_with_user_id, coverage_metadata, start_date, end_date")
          .eq("request_type", "shift_swap")
          .eq("status", "approved")
          .in("swap_with_user_id", holidayUserIds);

        // Per-day no-cover info from staff_holidays (joined by user_id|start|end).
        const holidayStartDates = [...new Set(holidays.map(h => h.start_date))];
        const { data: holidayRows } = await supabaseClient
          .from("staff_holidays")
          .select("user_id, start_date, end_date, no_cover_dates, no_cover_required")
          .eq("status", "approved")
          .in("user_id", holidayUserIds)
          .in("start_date", holidayStartDates);
        const noCoverInfoMap = new Map<string, { noCoverDates: Set<string>; noCoverRequired: boolean }>();
        for (const r of holidayRows || []) {
          noCoverInfoMap.set(`${r.user_id}|${r.start_date}|${r.end_date}`, {
            noCoverDates: new Set<string>((r.no_cover_dates as string[] | null) || []),
            noCoverRequired: r.no_cover_required === true,
          });
        }

        const { data: emailProfiles } = await supabaseClient
          .from("profiles").select("user_id, email, display_name");
        const emailMap = new Map(
          emailProfiles?.map(p => [p.user_id, { email: p.email, name: p.display_name }]) || []
        );

        const adminCountdownItems: string[] = [];

        for (const h of holidays) {
          const daysUntil = Math.round((new Date(h.start_date).getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
          const takerInfo = emailMap.get(h.user_id);
          const takerName = takerInfo?.name || "Unknown";
          const dayWord = daysUntil === 1 ? "day" : "days";
          const dateRange = h.start_date === h.end_date
            ? formatShortDate(h.start_date)
            : `${formatShortDate(h.start_date)} – ${formatShortDate(h.end_date)}`;

          const noCoverInfo = noCoverInfoMap.get(`${h.user_id}|${h.start_date}|${h.end_date}`)
            || { noCoverDates: new Set<string>(), noCoverRequired: false };
          const holidayDates: string[] = [];
          for (const d = new Date(h.start_date); d <= new Date(h.end_date); d.setDate(d.getDate() + 1)) {
            holidayDates.push(d.toISOString().split("T")[0]);
          }
          const datesNeedingCover = holidayDates.filter(d => !noCoverInfo.noCoverDates.has(d));
          const coverNotNeeded = noCoverInfo.noCoverRequired || datesNeedingCover.length === 0;

          const matchingCovers = (covers || []).filter(c => {
            if (c.swap_with_user_id !== h.user_id) return false;
            const dates: string[] = (c.coverage_metadata as any)?.covered_dates || [];
            if (dates.length === 0) return !(c.end_date < h.start_date || c.start_date > h.end_date);
            return dates.some(d => d >= h.start_date && d <= h.end_date);
          });
          const coverPeople = matchingCovers
            .map(c => ({ id: c.user_id, ...emailMap.get(c.user_id) }))
            .filter(c => c.email);
          const coverNames = coverPeople.map(c => c.name || "Unknown");

          // Clients impacted by this person's leave → handover-tracker deep links.
          const { data: takerPatterns } = await supabaseClient
            .from("recurring_shift_patterns")
            .select("client_name")
            .eq("user_id", h.user_id);
          const handoverClients = [...new Set((takerPatterns || [])
            .map(p => p.client_name)
            .filter((c): c is string => !!c && c !== "Care Cuddle"))];
          const handoverLinkItems = handoverClients.map(c =>
            `🔗 <a href="${APP_URL}/public/schedule/${encodeURIComponent(c)}" style="color:${BRAND_COLOR};font-weight:600;text-decoration:none;">Open ${c} handover tracker</a>`
          );

          // Admin digest line
          adminCountdownItems.push(
            `<strong>${takerName}</strong> on holiday in <strong>${daysUntil} ${dayWord}</strong> (${dateRange}) — ${
              coverNames.length > 0
                ? `cover: ${coverNames.join(", ")}`
                : coverNotNeeded
                  ? `<span style="color:#10b981;font-weight:600;">no cover needed</span>`
                  : `<span style="color:#ef4444;font-weight:600;">no cover assigned</span>`
            }`
          );

          // Personal email to the staff member on holiday
          if (takerInfo?.email) {
            await sendStandaloneAlert(
              [takerInfo.email as string],
              `📅 Your holiday starts in ${daysUntil} ${dayWord}`,
              "📅 Your Holiday is Coming Up", "#0ea5e9",
              [
                `Your holiday starts in ${daysUntil} ${dayWord}.`,
                `🗓️ ${dateRange}`,
                coverNames.length > 0
                  ? `🤝 Your cover: ${coverNames.join(", ")}`
                  : coverNotNeeded
                    ? `✅ No cover is needed for this holiday.`
                    : `⚠️ No cover has been assigned yet — please check with the admin team.`,
                ...(handoverLinkItems.length > 0
                  ? [`📋 <strong>Please complete your handover before you leave</strong> so your cover is set up:`, ...handoverLinkItems]
                  : []),
                `Have a great break! 🌴`,
              ],
              todayStr
            );
          }

          // Personal emails to each cover person
          for (const cover of coverPeople) {
            await sendStandaloneAlert(
              [cover.email as string],
              `🤝 Covering ${takerName} in ${daysUntil} ${dayWord}`,
              "🤝 Upcoming Cover Reminder", "#0ea5e9",
              [
                `You're covering ${takerName}'s holiday in ${daysUntil} ${dayWord}.`,
                `🗓️ Holiday dates: ${dateRange}`,
                `Please review your schedule for the covered shifts.`,
                `💬 <strong>Reach out to ${takerName}</strong> to complete the handover before their leave.`,
                ...(handoverLinkItems.length > 0
                  ? [`📋 Open the handover tracker for each client:`, ...handoverLinkItems]
                  : []),
              ],
              todayStr
            );
          }
        }

        if (adminCountdownItems.length > 0) {
          sections.push({
            type: "holiday_countdown",
            title: "Holidays Starting Soon",
            icon: "📅",
            accentColor: "#0ea5e9",
            itemsHtml: adminCountdownItems,
            summary: `${adminCountdownItems.length} imminent`,
          });
        }
      } else if (testType === "holiday_countdown") {
        sections.push({
          type: "holiday_countdown",
          title: "Holidays Starting Soon",
          icon: "📅",
          accentColor: "#0ea5e9",
          itemsHtml: [`<strong>[TEST] John Smith</strong> on holiday in <strong>1 day</strong> (${formatShortDate(targetDates[0])}) — cover: [TEST] Jane Doe`],
          summary: "1 imminent",
        });
      }
    }

    // ===== 7. UK CLOCK CHANGE REMINDERS =====
    // Always sent as standalone to all staff (educational personal email).
    if (!testType || testType === "clock_change" || testType === "digest") {
      const getLastSundayOfMonth = (year: number, month: number): Date => {
        const lastDay = new Date(year, month + 1, 0);
        const dayOfWeek = lastDay.getDay();
        const lastSunday = new Date(year, month + 1, 0 - (dayOfWeek === 0 ? 0 : dayOfWeek));
        lastSunday.setHours(0, 0, 0, 0);
        return lastSunday;
      };

      const currentYear = today.getFullYear();
      const clockChangeDates: { date: Date; type: "spring_forward" | "fall_back" }[] = [];
      for (const year of [currentYear, currentYear + 1]) {
        clockChangeDates.push(
          { date: getLastSundayOfMonth(year, 2), type: "spring_forward" },
          { date: getLastSundayOfMonth(year, 9), type: "fall_back" }
        );
      }

      for (const clockChange of clockChangeDates) {
        const daysUntil = Math.round((clockChange.date.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        if (daysUntil === 7 || daysUntil === 1 || testType === "clock_change") {
          const { data: allProfiles } = await supabaseClient
            .from("profiles").select("user_id, email").neq("role", "client");
          const { data: activeHr } = await supabaseClient
            .from("hr_profiles").select("user_id")
            .in("employment_status", ["active", "onboarding_probation", "onboarding_passed"]);
          const activeIds = new Set(activeHr?.map(h => h.user_id) || []);
          const staffEmails = allProfiles?.filter(p => p.email && activeIds.has(p.user_id)).map(p => p.email as string) || [];

          if (staffEmails.length === 0 && testType !== "clock_change") break;

          let actualDaysUntil = daysUntil;
          let changeType = clockChange.type;
          let changeDate = clockChange.date;
          if (testType === "clock_change") {
            const futureChanges = clockChangeDates
              .filter(c => Math.round((c.date.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)) >= 0)
              .sort((a, b) => a.date.getTime() - b.date.getTime());
            if (futureChanges.length > 0) {
              changeDate = futureChanges[0].date;
              changeType = futureChanges[0].type;
              actualDaysUntil = Math.round((changeDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
            }
          }

          const direction = changeType === "spring_forward" ? "forward" : "back";
          const emoji = changeType === "spring_forward" ? "⏰🌸" : "⏰🍂";
          const urgency = actualDaysUntil === 1 ? "TOMORROW" : `in ${actualDaysUntil} days`;
          const targets = staffEmails.length > 0 ? staffEmails : adminEmails;

          await sendStandaloneAlert(
            targets,
            `${emoji} UK Clock Change ${urgency} - Clocks go ${direction}`,
            `${emoji} UK Clock Change Reminder`, "#6366f1",
            [
              `On ${formatDate(changeDate.toISOString().split("T")[0])}, UK clocks go <strong>${direction} by 1 hour</strong>.`,
              changeType === "spring_forward"
                ? `UK moves from GMT to BST. After the change, UK 9am = Nigeria 9am (currently 10am Nigeria). Your day starts <strong>1 hour earlier</strong> in Nigeria time.`
                : `UK moves from BST to GMT. After the change, UK 9am = Nigeria 10am (currently 9am Nigeria). Your day starts <strong>1 hour later</strong> in Nigeria time.`,
            ],
            todayStr
          );

          standaloneResults.push({ type: "clock_change", emailSent: true, title: `Clock change ${direction}` });

          // Also add admin reference line to digest
          sections.push({
            type: "clock_change",
            title: "UK Clock Change Reminder",
            icon: emoji,
            accentColor: "#6366f1",
            itemsHtml: [`UK clocks go <strong>${direction}</strong> on ${formatDate(changeDate.toISOString().split("T")[0])} (${urgency}). Staff have been notified directly.`],
            summary: urgency,
          });

          if (testType !== "clock_change") break;
        }
      }
    }

    // ===== 8. OUTSTANDING HANDOVERS (high-level per client) =====
    if (shouldRun("outstanding_handovers")) {
      const { data: openTasks } = await supabaseClient
        .from("client_handover_tasks")
        .select("client_name, progress, target_date")
        .lt("progress", 100);

      const tasks = openTasks || [];
      const isTest = testType === "outstanding_handovers" && tasks.length === 0;

      type ClientAgg = { client: string; avgProgress: number; latestTarget: string | null; count: number };
      const grouped = new Map<string, { sum: number; count: number; latest: string | null }>();
      for (const t of tasks) {
        if (!t.client_name) continue;
        const cur = grouped.get(t.client_name) || { sum: 0, count: 0, latest: null };
        cur.sum += t.progress ?? 0;
        cur.count += 1;
        if (t.target_date && (!cur.latest || t.target_date > cur.latest)) cur.latest = t.target_date;
        grouped.set(t.client_name, cur);
      }

      const clients: ClientAgg[] = isTest
        ? [
            { client: "[TEST] Comfort", avgProgress: 40, latestTarget: todayStr, count: 2 },
            { client: "[TEST] Hope", avgProgress: 70, latestTarget: null, count: 1 },
          ]
        : Array.from(grouped.entries()).map(([client, v]) => ({
            client,
            avgProgress: Math.round(v.sum / v.count),
            latestTarget: v.latest,
            count: v.count,
          }));

      if (clients.length > 0) {
        // Sort: ones with target dates first (soonest first), then no-date
        clients.sort((a, b) => {
          if (a.latestTarget && b.latestTarget) return a.latestTarget.localeCompare(b.latestTarget);
          if (a.latestTarget) return -1;
          if (b.latestTarget) return 1;
          return 0;
        });

        const items = clients.map(c => {
          const dateLabel = c.latestTarget ? formatShortDate(c.latestTarget) : "no due date";
          const overdue = c.latestTarget && c.latestTarget <= todayStr;
          const dateHtml = overdue
            ? `<span style="color:#ef4444;font-weight:600;">due ${dateLabel}</span>`
            : `due ${dateLabel}`;
          return `<strong>${c.client}</strong> — ${c.avgProgress}% complete · ${dateHtml}`;
        });

        sections.push({
          type: "outstanding_handovers",
          title: "Outstanding Handovers",
          icon: "📋",
          accentColor: "#f59e0b",
          itemsHtml: items,
          summary: `${clients.length} client${clients.length === 1 ? "" : "s"}`,
        });
      }
    }

    // ===== 9. ONBOARDING — daily next-step reminders + admin digest =====
    // Only staff currently IN onboarding (probation or passed) are included.
    // Active / inactive staff are excluded entirely.
    if (shouldRun("onboarding_pending")) {
      const ONBOARDING_STATUSES = ["onboarding_probation", "onboarding_passed"];
      const STAGE_ORDER = ["Getting Started", "System & Tools", "Company Policies", "Training", "Final Checks"];

      // Who is in onboarding?
      const { data: onboardingHr } = await supabaseClient
        .from("hr_profiles")
        .select("user_id, employment_status")
        .in("employment_status", ONBOARDING_STATUSES);
      const onboardingUserIds = (onboardingHr || []).map(h => h.user_id);

      const isTest = testType === "onboarding_pending";

      if (onboardingUserIds.length > 0 || isTest) {
        // All onboarding steps in canonical order.
        const { data: steps } = await supabaseClient
          .from("onboarding_steps")
          .select("id, title, stage, sort_order, step_type, target_page_id");
        // Only count steps in a known stage; steps in an unrecognised/typo
        // stage are hidden from staff and must not affect totals.
        const STAGE_SET = new Set(STAGE_ORDER);
        const orderedSteps = (steps || []).filter(s => STAGE_SET.has(s.stage || "Getting Started")).slice().sort((a, b) => {
          const sa = STAGE_ORDER.indexOf(a.stage || "Getting Started");
          const sb = STAGE_ORDER.indexOf(b.stage || "Getting Started");
          if (sa !== sb) return sa - sb;
          return (a.sort_order ?? 0) - (b.sort_order ?? 0);
        });

        // Completions + page acknowledgements for the onboarding cohort.
        const { data: completions } = await supabaseClient
          .from("onboarding_completions")
          .select("step_id, user_id")
          .in("user_id", onboardingUserIds.length > 0 ? onboardingUserIds : ["no-match"]);
        const internalPageIds = orderedSteps
          .filter(s => s.step_type === "internal_page" && s.target_page_id)
          .map(s => s.target_page_id as string);
        const { data: acks } = internalPageIds.length > 0
          ? await supabaseClient
              .from("page_acknowledgements")
              .select("page_id, user_id")
              .in("user_id", onboardingUserIds.length > 0 ? onboardingUserIds : ["no-match"])
              .in("page_id", internalPageIds)
          : { data: [] as any[] };

        const completionSet = new Set((completions || []).map(c => `${c.step_id}::${c.user_id}`));
        const ackSet = new Set((acks || []).map(a => `${a.page_id}::${a.user_id}`));

        // Training-linked steps: complete when all active training is in date.
        const hasTrainingStep = orderedSteps.some(s => s.step_type === "training");
        let trainingItemsList: any[] = [];
        const trainingRecsByUser = new Map<string, Map<string, string>>();
        if (hasTrainingStep) {
          const { data: tItems } = await supabaseClient
            .from("training_items").select("id, refresh_frequency_months").eq("is_active", true);
          trainingItemsList = tItems || [];
          const { data: tRecs } = await supabaseClient
            .from("training_records")
            .select("training_item_id, user_id, completed_date")
            .in("user_id", onboardingUserIds.length > 0 ? onboardingUserIds : ["no-match"]);
          for (const r of tRecs || []) {
            if (!trainingRecsByUser.has(r.user_id)) trainingRecsByUser.set(r.user_id, new Map());
            trainingRecsByUser.get(r.user_id)!.set(r.training_item_id, r.completed_date);
          }
        }
        const trainingUpToDate = (userId: string): boolean => {
          if (trainingItemsList.length === 0) return true;
          const m = trainingRecsByUser.get(userId) || new Map<string, string>();
          return trainingItemsList.every(it => {
            const d = m.get(it.id);
            if (!d) return false;
            if (it.refresh_frequency_months == null) return true;
            const exp = new Date(d);
            exp.setMonth(exp.getMonth() + it.refresh_frequency_months);
            return exp.getTime() >= Date.now();
          });
        };

        const isStepDone = (step: any, userId: string): boolean => {
          if (step.step_type === "training") {
            return trainingUpToDate(userId);
          }
          if (step.step_type === "internal_page" && step.target_page_id) {
            return ackSet.has(`${step.target_page_id}::${userId}`);
          }
          return completionSet.has(`${step.id}::${userId}`);
        };

        // Emails / names for the onboarding cohort.
        const { data: cohortProfiles } = await supabaseClient
          .from("profiles")
          .select("user_id, email, display_name")
          .in("user_id", onboardingUserIds.length > 0 ? onboardingUserIds : ["no-match"]);
        const cohortMap = new Map((cohortProfiles || []).map(p => [p.user_id, p]));

        const adminItems: { html: string; sortKey: number }[] = [];

        if (orderedSteps.length > 0) {
          for (const userId of onboardingUserIds) {
            const profile = cohortMap.get(userId);
            const name = profile?.display_name || profileMap.get(userId) || "Unknown";
            const total = orderedSteps.length;
            const completed = orderedSteps.filter(s => isStepDone(s, userId)).length;
            const nextStep = orderedSteps.find(s => !isStepDone(s, userId));

            // Admin digest line
            if (nextStep) {
              adminItems.push({
                sortKey: completed / total,
                html: `<strong>${name}</strong> — ${completed}/${total} steps · next: <em>${nextStep.title}</em> <span style="color:#9ca3af;">(${nextStep.stage})</span>`,
              });
            } else {
              adminItems.push({
                sortKey: 1,
                html: `<strong>${name}</strong> — <span style="color:#10b981;font-weight:600;">all ${total} steps complete 🎉</span>`,
              });
            }

            // Personal daily reminder to the onboarding staff member (only if steps remain).
            if (nextStep && profile?.email) {
              const remaining = total - completed;
              await sendStandaloneAlert(
                [profile.email as string],
                `📚 Your next onboarding step: ${nextStep.title}`,
                "📚 Onboarding Reminder", BRAND_COLOR,
                [
                  `Hi ${name.split(" ")[0] || name}, here's your next onboarding step:`,
                  `👉 <strong>${nextStep.title}</strong> <span style="color:#6b7280;">(${nextStep.stage})</span>`,
                  `You've completed <strong>${completed} of ${total}</strong> steps — ${remaining} to go. Keep it up!`,
                  `Open the Academy and head to <strong>HR → Onboarding Steps</strong> to complete it.`,
                ],
                todayStr
              );
            }
          }
        }

        const digestItems = isTest && adminItems.length === 0
          ? [`<strong>[TEST] John Smith</strong> — 3/12 steps · next: <em>Read Health &amp; Safety Policy</em> <span style="color:#9ca3af;">(Company Policies)</span>`]
          : adminItems.sort((a, b) => a.sortKey - b.sortKey).map(i => i.html);

        if (digestItems.length > 0) {
          sections.push({
            type: "onboarding_pending",
            title: "Staff in Onboarding",
            icon: "📚",
            accentColor: BRAND_COLOR,
            itemsHtml: digestItems,
            summary: `${digestItems.length} onboarding`,
          });
        }
      }
    }

    // ===== SEND THE DIGEST =====
    let digestSent = false;
    let digestError: string | undefined;
    if (sections.length > 0 && adminEmails.length > 0) {
      // If a specific test was requested, prefix subject
      const isTestRun = !!testType;
      const subjectCount = sections.length;

      // Surface birthdays / work anniversaries in the subject line.
      const birthdaySection = sections.find(s => s.type === "birthday_today");
      const anniversarySection = sections.find(s => s.type === "anniversary_today");
      const celebratoryBits: string[] = [];
      if (birthdaySection) {
        celebratoryBits.push(`🎂 ${birthdaySection.itemsHtml.join(", ")}'s birthday`);
      }
      if (anniversarySection) {
        // itemsHtml look like "Name — 3 years 🎉"; take just the names.
        const names = anniversarySection.itemsHtml.map(h => h.split(" — ")[0]).join(", ");
        celebratoryBits.push(`🎉 ${names}'s work anniversary`);
      }
      const celebratoryPrefix = celebratoryBits.length ? celebratoryBits.join(" · ") + " · " : "";

      const subject = `${isTestRun ? "[TEST] " : ""}${celebratoryPrefix}📬 Daily Admin Digest — ${subjectCount} update${subjectCount === 1 ? "" : "s"} (${formatShortDate(todayStr)})`;
      try {
        await resend.emails.send({
          from: "Care Cuddle Academy <hello@care-cuddle-academy.co.uk>",
          to: adminEmails,
          subject,
          html: buildDigestHtml(sections, todayStr),
        });
        digestSent = true;
      } catch (e) {
        digestError = e instanceof Error ? e.message : "Unknown error";
      }
    }

    console.log("Daily digest processed:", JSON.stringify({
      sectionCount: sections.length,
      sectionTypes: sections.map(s => s.type),
      digestSent,
      digestError,
      standaloneResults,
    }, null, 2));

    return new Response(
      JSON.stringify({
        success: true,
        digestSent,
        digestError,
        sectionCount: sections.length,
        sections: sections.map(s => ({ type: s.type, title: s.title, summary: s.summary })),
        standaloneResults,
        // back-compat for the UI test handler
        emailSent: digestSent || standaloneResults.some(r => r.emailSent),
      }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );

  } catch (error: unknown) {
    console.error("Error in daily-admin-alerts function:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);
