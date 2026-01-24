import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "npm:resend@2.0.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

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

interface AlertResult {
  type: string;
  title: string;
  items: string[];
  emailSent: boolean;
  error?: string;
}

const sendIndividualAlert = async (
  resendClient: typeof resend,
  adminEmails: string[],
  subject: string,
  title: string,
  color: string,
  items: string[],
  todayStr: string
): Promise<{ success: boolean; error?: string }> => {
  const itemsHtml = items.map(item => `<li style="margin-bottom: 8px; font-size: 14px;">${item}</li>`).join("");

  try {
    await resendClient.emails.send({
      from: "Care & Cuddle Academy <hello@care-cuddle-academy.co.uk>",
      to: adminEmails,
      subject,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background-color: ${color}; padding: 20px; border-radius: 8px 8px 0 0;">
            <h1 style="color: white; margin: 0; font-size: 24px;">${title}</h1>
            <p style="color: rgba(255,255,255,0.9); margin: 8px 0 0 0; font-size: 14px;">${formatDate(todayStr)}</p>
          </div>
          <div style="background-color: #f9fafb; padding: 24px; border-radius: 0 0 8px 8px; border: 1px solid #e5e7eb; border-top: none;">
            <ul style="margin: 0; padding-left: 20px; color: #374151;">
              ${itemsHtml}
            </ul>
            
            <div style="text-align: center; margin-top: 24px;">
              <a href="https://cc-acdemy.lovable.app" style="display: inline-block; background-color: #f97316; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 600;">
                Go to Dashboard
              </a>
            </div>
          </div>
          <p style="color: #9ca3af; font-size: 12px; text-align: center; margin-top: 20px;">
            Care & Cuddle Staff Management System
          </p>
        </div>
      `,
    });
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
  }
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

    // Check if this is a test request for a specific type
    let testType: string | null = null;
    try {
      const body = await req.json();
      testType = body?.testType || null;
    } catch {
      // No body or invalid JSON, run all alerts
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString().split("T")[0];

    // Fetch notification settings
    const { data: notificationSettings } = await supabaseClient
      .from("notification_settings")
      .select("*");

    const settingsMap = new Map(notificationSettings?.map(s => [s.notification_type, s]) || []);

    // Fetch admin emails
    const { data: adminProfiles } = await supabaseClient
      .from("profiles")
      .select("email, display_name")
      .eq("role", "admin");

    const adminEmails = adminProfiles?.filter(p => p.email).map(p => p.email as string) || [];

    if (adminEmails.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: "No admin emails to notify" }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Fetch common data
    const { data: profiles } = await supabaseClient
      .from("profiles")
      .select("user_id, display_name");

    const profileMap = new Map(profiles?.map(p => [p.user_id, p.display_name]) || []);

    const results: AlertResult[] = [];

    // ===== 1. BIRTHDAYS =====
    const birthdaySetting = settingsMap.get("birthday_today");
    if ((birthdaySetting?.is_enabled || testType === "birthday_today") && (!testType || testType === "birthday_today")) {
      const { data: onboardingDocs } = await supabaseClient
        .from("staff_onboarding_documents")
        .select("user_id, date_of_birth, full_name")
        .not("date_of_birth", "is", null);

      const todayBirthdays: string[] = [];
      if (onboardingDocs) {
        for (const doc of onboardingDocs) {
          if (doc.date_of_birth) {
            const dob = new Date(doc.date_of_birth);
            if (dob.getDate() === today.getDate() && dob.getMonth() === today.getMonth()) {
              const name = doc.full_name || profileMap.get(doc.user_id) || "Unknown";
              todayBirthdays.push(name);
            }
          }
        }
      }

      if (todayBirthdays.length > 0 || testType === "birthday_today") {
        const displayItems = todayBirthdays.length > 0 
          ? todayBirthdays 
          : ["[TEST] John Smith", "[TEST] Jane Doe"];
        const message = displayItems.length === 1
          ? `🎂 ${displayItems[0]} has a birthday today!`
          : `🎂 ${displayItems.join(", ")} have birthdays today!`;
        
        // Build subject with names
        const namesForSubject = displayItems.length <= 3 
          ? displayItems.join(", ")
          : `${displayItems.slice(0, 2).join(", ")} + ${displayItems.length - 2} more`;
        const isTest = testType === "birthday_today" && todayBirthdays.length === 0;
        
        const result = await sendIndividualAlert(
          resend,
          adminEmails,
          isTest
            ? `[TEST] 🎂 Birthday: John Smith, Jane Doe`
            : `🎂 Birthday: ${namesForSubject}`,
          "🎂 Happy Birthday!",
          "#ec4899",
          [message],
          todayStr
        );
        
        results.push({
          type: "birthday_today",
          title: "Birthdays",
          items: displayItems,
          emailSent: result.success,
          error: result.error
        });
      }
    }

    // ===== 2. WORK ANNIVERSARIES =====
    const anniversarySetting = settingsMap.get("anniversary_today");
    if ((anniversarySetting?.is_enabled || testType === "anniversary_today") && (!testType || testType === "anniversary_today")) {
      const { data: hrProfiles } = await supabaseClient
        .from("hr_profiles")
        .select("user_id, start_date")
        .not("start_date", "is", null);

      const todayAnniversaries: { name: string; years: number }[] = [];
      if (hrProfiles) {
        for (const hr of hrProfiles) {
          if (hr.start_date) {
            const startDate = new Date(hr.start_date);
            if (startDate.getDate() === today.getDate() && startDate.getMonth() === today.getMonth()) {
              const years = today.getFullYear() - startDate.getFullYear();
              if (years > 0) {
                const name = profileMap.get(hr.user_id) || "Unknown";
                todayAnniversaries.push({ name, years });
              }
            }
          }
        }
      }

      if (todayAnniversaries.length > 0 || testType === "anniversary_today") {
        const displayAnniversaries = todayAnniversaries.length > 0
          ? todayAnniversaries
          : [{ name: "[TEST] John Smith", years: 3 }, { name: "[TEST] Jane Doe", years: 5 }];
        const items = displayAnniversaries.length === 1
          ? [`🎉 ${displayAnniversaries[0].name} celebrates ${displayAnniversaries[0].years} year${displayAnniversaries[0].years > 1 ? "s" : ""} today!`]
          : displayAnniversaries.map(a => `🎉 ${a.name} - ${a.years} year${a.years > 1 ? "s" : ""}`);
        
        // Build subject with names and years
        const isTest = testType === "anniversary_today" && todayAnniversaries.length === 0;
        const subjectNames = displayAnniversaries.length <= 2
          ? displayAnniversaries.map(a => `${a.name} (${a.years}yr)`).join(", ")
          : `${displayAnniversaries[0].name} (${displayAnniversaries[0].years}yr) + ${displayAnniversaries.length - 1} more`;
        
        const result = await sendIndividualAlert(
          resend,
          adminEmails,
          isTest
            ? `[TEST] 🎉 Anniversary: John Smith (3yr), Jane Doe (5yr)`
            : `🎉 Anniversary: ${subjectNames}`,
          "🎉 Work Anniversary",
          "#8b5cf6",
          items,
          todayStr
        );
        
        results.push({
          type: "anniversary_today",
          title: "Anniversaries",
          items: displayAnniversaries.map(a => a.name),
          emailSent: result.success,
          error: result.error
        });
      }
    }

    // ===== 3. UPCOMING APPROVED HOLIDAYS =====
    const holidaySetting = settingsMap.get("upcoming_holidays");
    const holidayDays = holidaySetting?.days_before || 7;
    if ((holidaySetting?.is_enabled || testType === "upcoming_holidays") && (!testType || testType === "upcoming_holidays")) {
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

      const hasHolidays = upcomingHolidays && upcomingHolidays.length > 0;
      if (hasHolidays || testType === "upcoming_holidays") {
        // Build holiday data with names
        const holidayData = hasHolidays
          ? upcomingHolidays.map(h => ({
              name: profileMap.get(h.user_id) || "Unknown",
              dateRange: h.start_date === h.end_date 
                ? formatShortDate(h.start_date)
                : `${formatShortDate(h.start_date)} - ${formatShortDate(h.end_date)}`
            }))
          : [{ name: "[TEST] John Smith", dateRange: "25 Jan - 28 Jan" }, { name: "[TEST] Jane Doe", dateRange: "30 Jan" }];

        const holidayItems = holidayData.map(h => `📅 ${h.name}: ${h.dateRange}`);

        // Build subject with names
        const isTest = testType === "upcoming_holidays" && !hasHolidays;
        const uniqueNames = [...new Set(holidayData.map(h => h.name))];
        const subjectNames = uniqueNames.length <= 3
          ? uniqueNames.join(", ")
          : `${uniqueNames.slice(0, 2).join(", ")} + ${uniqueNames.length - 2} more`;

        const result = await sendIndividualAlert(
          resend,
          adminEmails,
          isTest
            ? `[TEST] 📅 Upcoming Holiday: John Smith, Jane Doe`
            : `📅 Upcoming Holiday: ${subjectNames}`,
          "📅 Upcoming Holidays",
          "#3b82f6",
          holidayItems,
          todayStr
        );
        
        results.push({
          type: "upcoming_holidays",
          title: "Upcoming Holidays",
          items: holidayItems,
          emailSent: result.success,
          error: result.error
        });
      }
    }

    // ===== 4. SHIFT PATTERNS EXPIRING =====
    const patternSetting = settingsMap.get("pattern_expiring");
    const patternDays = patternSetting?.days_before || 14;
    if ((patternSetting?.is_enabled || testType === "pattern_expiring") && (!testType || testType === "pattern_expiring")) {
      const patternFutureDate = new Date(today);
      patternFutureDate.setDate(patternFutureDate.getDate() + patternDays);
      const patternFutureDateStr = patternFutureDate.toISOString().split("T")[0];

      const { data: expiringPatterns } = await supabaseClient
        .from("recurring_shift_patterns")
        .select("id, user_id, client_name, end_date, shift_type")
        .gte("end_date", todayStr)
        .lte("end_date", patternFutureDateStr)
        .order("end_date");

      if (expiringPatterns && expiringPatterns.length > 0) {
        const patternItems = expiringPatterns.map(p => {
          const name = profileMap.get(p.user_id) || "Unknown";
          return `⚠️ ${name} at ${p.client_name || "Unknown client"} - expires ${formatShortDate(p.end_date)}`;
        });

        const result = await sendIndividualAlert(
          resend,
          adminEmails,
          `⚠️ ${expiringPatterns.length} Shift Pattern${expiringPatterns.length > 1 ? "s" : ""} Expiring Soon`,
          "⚠️ Shift Patterns Expiring",
          "#f59e0b",
          patternItems,
          todayStr
        );
        
        results.push({
          type: "pattern_expiring",
          title: "Patterns Expiring",
          items: patternItems,
          emailSent: result.success,
          error: result.error
        });
      } else if (testType === "pattern_expiring") {
        results.push({
          type: "pattern_expiring",
          title: "Patterns Expiring",
          items: [],
          emailSent: false
        });
      }
    }

    // ===== 5. HOLIDAYS WITHOUT CLIENT NOTIFICATION =====
    const clientNotifSetting = settingsMap.get("holiday_no_client_notification");
    const clientNotifDays = clientNotifSetting?.days_before || 14;
    if ((clientNotifSetting?.is_enabled || testType === "holiday_no_client_notification") && (!testType || testType === "holiday_no_client_notification")) {
      const clientNotifFutureDate = new Date(today);
      clientNotifFutureDate.setDate(clientNotifFutureDate.getDate() + clientNotifDays);
      const clientNotifFutureDateStr = clientNotifFutureDate.toISOString().split("T")[0];

      const { data: pendingClientNotification } = await supabaseClient
        .from("staff_requests")
        .select("id, user_id, start_date, end_date, client_informed")
        .in("request_type", ["holiday_paid", "holiday_unpaid", "holiday"])
        .eq("status", "approved")
        .or(`client_informed.is.null,client_informed.eq.false`)
        .gte("start_date", todayStr)
        .lte("start_date", clientNotifFutureDateStr)
        .order("start_date");

      const hasPendingNotifications = pendingClientNotification && pendingClientNotification.length > 0;
      if (hasPendingNotifications || testType === "holiday_no_client_notification") {
        // Build notification data with names
        const notifData = hasPendingNotifications
          ? pendingClientNotification.map(r => {
              const name = profileMap.get(r.user_id) || "Unknown";
              const daysUntil = Math.ceil((new Date(r.start_date).getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
              return { name, daysUntil, date: formatShortDate(r.start_date) };
            })
          : [{ name: "[TEST] John Smith", daysUntil: 3, date: "27 Jan" }, { name: "[TEST] Jane Doe", daysUntil: 5, date: "29 Jan" }];

        const notificationItems = notifData.map(r => 
          `🚨 ${r.name} - holiday starts in ${r.daysUntil} day${r.daysUntil !== 1 ? "s" : ""} (${r.date}) - CLIENT NOT NOTIFIED`
        );

        // Build subject with names
        const isTest = testType === "holiday_no_client_notification" && !hasPendingNotifications;
        const uniqueNames = [...new Set(notifData.map(n => n.name))];
        const subjectNames = uniqueNames.length <= 2
          ? uniqueNames.join(", ")
          : `${uniqueNames[0]} + ${uniqueNames.length - 1} more`;

        const result = await sendIndividualAlert(
          resend,
          adminEmails,
          isTest
            ? `[TEST] 🚨 Missing Client Notification: John Smith, Jane Doe`
            : `🚨 Missing Client Notification: ${subjectNames}`,
          "🚨 Action Required: Client Notification Missing",
          "#ef4444",
          notificationItems,
          todayStr
        );
        
        results.push({
          type: "holiday_no_client_notification",
          title: "Missing Client Notifications",
          items: notificationItems,
          emailSent: result.success,
          error: result.error
        });
      }
    }

    const emailsSent = results.filter(r => r.emailSent).length;
    const hasItems = results.some(r => r.items.length > 0);

    console.log("Daily alerts processed:", JSON.stringify(results, null, 2));

    return new Response(
      JSON.stringify({ 
        success: true, 
        alertCount: results.length,
        emailsSent,
        emailSent: hasItems && emailsSent > 0,
        results 
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
