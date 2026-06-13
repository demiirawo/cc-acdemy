import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "npm:resend@2.0.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const LOGO_URL = "https://care-cuddle.co.uk/wp-content/uploads/2023/03/Green-and-Beige-Bold-Typographic-Coffee-Products-Coffee-Logo-e1689542108718.png";
const BRAND_COLOR = "#5F17EB";
const BIRTHDAY_IMAGE_URL = "https://cc-acdemy.lovable.app/images/birthday-celebration.png";

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
            <a href="https://cc-acdemy.lovable.app" style="display:inline-block;background:${BRAND_COLOR};color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;">Go to Dashboard</a>
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

    // ===== 3. UPCOMING APPROVED HOLIDAYS =====
    if (shouldRun("upcoming_holidays")) {
      const holidayDays = settingsMap.get("upcoming_holidays")?.days_before || 7;
      const futureDate = new Date(today);
      futureDate.setDate(futureDate.getDate() + holidayDays);
      const futureDateStr = futureDate.toISOString().split("T")[0];

      const { data: upcomingHolidays } = await supabaseClient
        .from("staff_holidays")
        .select("user_id, start_date, end_date, holiday_type")
        .eq("status", "approved")
        .gte("start_date", todayStr)
        .lte("start_date", futureDateStr)
        .order("start_date");

      const has = upcomingHolidays && upcomingHolidays.length > 0;
      if (has || testType === "upcoming_holidays") {
        const data = has
          ? upcomingHolidays.map(h => ({
              name: profileMap.get(h.user_id) || "Unknown",
              dateRange: h.start_date === h.end_date
                ? formatShortDate(h.start_date)
                : `${formatShortDate(h.start_date)} – ${formatShortDate(h.end_date)}`,
            }))
          : [{ name: "[TEST] John Smith", dateRange: "25 Jan – 28 Jan" }];

        sections.push({
          type: "upcoming_holidays",
          title: `Upcoming Holidays (next ${holidayDays} days)`,
          icon: "📅",
          accentColor: "#3b82f6",
          itemsHtml: data.map(h => `<strong>${h.name}</strong>: ${h.dateRange}`),
          summary: `${data.length} starting soon`,
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

    // ===== 6. HOLIDAY COUNTDOWN (3/2/1 days) =====
    // Personal emails to taker/cover stay separate. Admin copy goes in the digest.
    if (!testType || testType === "holiday_countdown") {
      const targetDates: string[] = [];
      for (const offset of [1, 2, 3]) {
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

          // Admin digest line
          adminCountdownItems.push(
            `<strong>${takerName}</strong> on holiday in <strong>${daysUntil} ${dayWord}</strong> (${dateRange}) — ${coverNames.length > 0 ? `cover: ${coverNames.join(", ")}` : `<span style="color:#ef4444;font-weight:600;">no cover assigned</span>`}`
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
                coverNames.length > 0 ? `🤝 Your cover: ${coverNames.join(", ")}` : `⚠️ No cover has been assigned yet — please check with the admin team.`,
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
              ],
              todayStr
            );
          }
        }

        if (adminCountdownItems.length > 0) {
          sections.push({
            type: "holiday_countdown",
            title: "Holidays Starting Soon (3-day countdown)",
            icon: "📅",
            accentColor: "#0ea5e9",
            itemsHtml: adminCountdownItems,
            summary: `${adminCountdownItems.length} imminent`,
          });
        }
      } else if (testType === "holiday_countdown") {
        sections.push({
          type: "holiday_countdown",
          title: "Holidays Starting Soon (3-day countdown)",
          icon: "📅",
          accentColor: "#0ea5e9",
          itemsHtml: [`<strong>[TEST] John Smith</strong> on holiday in <strong>1 day</strong> (${formatShortDate(targetDates[0])}) — cover: [TEST] Jane Doe`],
          summary: "1 imminent",
        });
      }
    }

    // ===== 7. UK CLOCK CHANGE REMINDERS =====
    // Always sent as standalone to all staff (educational personal email).
    if (!testType || testType === "clock_change") {
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

    // ===== 8. OUTSTANDING HANDOVERS =====
    if (shouldRun("outstanding_handovers")) {
      const handoverLeadDays = settingsMap.get("outstanding_handovers")?.days_before ?? 3;
      const { data: openTasks } = await supabaseClient
        .from("client_handover_tasks")
        .select("id, client_name, task_name, handed_over_by, handed_over_to, progress, target_date")
        .lt("progress", 100)
        .order("target_date", { ascending: true, nullsFirst: false });

      const tasks = openTasks || [];
      const horizon = new Date(today);
      horizon.setDate(horizon.getDate() + handoverLeadDays);
      const horizonStr = horizon.toISOString().split("T")[0];

      const overdue = tasks.filter(t => t.target_date && t.target_date <= todayStr);
      const upcoming = tasks.filter(t => t.target_date && t.target_date > todayStr && t.target_date <= horizonStr);
      const other = tasks.filter(t => !t.target_date || t.target_date > horizonStr);

      const hasAny = overdue.length > 0 || upcoming.length > 0 || other.length > 0;
      const isTest = testType === "outstanding_handovers" && !hasAny;

      if (hasAny || isTest) {
        const fmtItem = (t: any, prefix: string) => {
          const dateLabel = t.target_date ? formatShortDate(t.target_date) : "no due date";
          return `${prefix} <strong>${t.client_name}</strong> — ${t.task_name} (${t.progress}%) · from ${t.handed_over_by || "—"} → ${t.handed_over_to || "unassigned"} · leave starts ${dateLabel}`;
        };

        const display = isTest
          ? {
              overdue: [{ client_name: "[TEST] Comfort", task_name: "Medication handover", handed_over_by: "Jane Doe", handed_over_to: "John Smith", progress: 40, target_date: todayStr }],
              upcoming: [{ client_name: "[TEST] Hope", task_name: "Care plan briefing", handed_over_by: "Mary K", handed_over_to: "Peter O", progress: 20, target_date: horizonStr }],
              other: [] as any[],
            }
          : { overdue, upcoming, other };

        const items: string[] = [];
        if (display.overdue.length > 0) {
          items.push(`<span style="color:#ef4444;font-weight:700;">⚠️ Not acknowledged before leave start (${display.overdue.length}):</span>`);
          display.overdue.forEach((t: any) => items.push(fmtItem(t, "🔴")));
        }
        if (display.upcoming.length > 0) {
          items.push(`<span style="color:#f59e0b;font-weight:700;">⏳ Due within ${handoverLeadDays} day${handoverLeadDays === 1 ? "" : "s"} (${display.upcoming.length}):</span>`);
          display.upcoming.forEach((t: any) => items.push(fmtItem(t, "🟠")));
        }
        if (display.other.length > 0) {
          items.push(`<span style="color:#6b7280;font-weight:700;">📋 Other outstanding (${display.other.length}):</span>`);
          display.other.slice(0, 20).forEach((t: any) => items.push(fmtItem(t, "•")));
          if (display.other.length > 20) items.push(`…and ${display.other.length - 20} more`);
        }

        const totalCount = display.overdue.length + display.upcoming.length + display.other.length;
        sections.push({
          type: "outstanding_handovers",
          title: "Outstanding Handovers",
          icon: "📋",
          accentColor: display.overdue.length > 0 ? "#ef4444" : "#f59e0b",
          itemsHtml: items,
          summary: `${totalCount} open${display.overdue.length > 0 ? `, ${display.overdue.length} overdue` : ""}`,
        });
      }
    }

    // ===== SEND THE DIGEST =====
    let digestSent = false;
    let digestError: string | undefined;
    if (sections.length > 0 && adminEmails.length > 0) {
      // If a specific test was requested, prefix subject
      const isTestRun = !!testType;
      const subjectCount = sections.length;
      const subject = `${isTestRun ? "[TEST] " : ""}📬 Daily Admin Digest — ${subjectCount} update${subjectCount === 1 ? "" : "s"} (${formatShortDate(todayStr)})`;
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
