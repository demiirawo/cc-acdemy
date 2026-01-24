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

      if (todayBirthdays.length > 0) {
        const message = todayBirthdays.length === 1
          ? `🎂 ${todayBirthdays[0]} has a birthday today!`
          : `🎂 ${todayBirthdays.join(", ")} have birthdays today!`;
        
        const result = await sendIndividualAlert(
          resend,
          adminEmails,
          `🎂 Staff Birthday${todayBirthdays.length > 1 ? "s" : ""} Today!`,
          "🎂 Happy Birthday!",
          "#ec4899",
          [message],
          todayStr
        );
        
        results.push({
          type: "birthday_today",
          title: "Birthdays",
          items: todayBirthdays,
          emailSent: result.success,
          error: result.error
        });
      } else if (testType === "birthday_today") {
        results.push({
          type: "birthday_today",
          title: "Birthdays",
          items: [],
          emailSent: false
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

      if (todayAnniversaries.length > 0) {
        const items = todayAnniversaries.length === 1
          ? [`🎉 ${todayAnniversaries[0].name} celebrates ${todayAnniversaries[0].years} year${todayAnniversaries[0].years > 1 ? "s" : ""} today!`]
          : todayAnniversaries.map(a => `🎉 ${a.name} - ${a.years} year${a.years > 1 ? "s" : ""}`);
        
        const result = await sendIndividualAlert(
          resend,
          adminEmails,
          `🎉 Work Anniversary Today!`,
          "🎉 Work Anniversary",
          "#8b5cf6",
          items,
          todayStr
        );
        
        results.push({
          type: "anniversary_today",
          title: "Anniversaries",
          items: todayAnniversaries.map(a => a.name),
          emailSent: result.success,
          error: result.error
        });
      } else if (testType === "anniversary_today") {
        results.push({
          type: "anniversary_today",
          title: "Anniversaries",
          items: [],
          emailSent: false
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

      if (upcomingHolidays && upcomingHolidays.length > 0) {
        const holidayItems = upcomingHolidays.map(h => {
          const name = profileMap.get(h.user_id) || "Unknown";
          const dateRange = h.start_date === h.end_date 
            ? formatShortDate(h.start_date)
            : `${formatShortDate(h.start_date)} - ${formatShortDate(h.end_date)}`;
          return `📅 ${name}: ${dateRange}`;
        });

        const result = await sendIndividualAlert(
          resend,
          adminEmails,
          `📅 ${upcomingHolidays.length} Upcoming Holiday${upcomingHolidays.length > 1 ? "s" : ""} (Next ${holidayDays} Days)`,
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
      } else if (testType === "upcoming_holidays") {
        results.push({
          type: "upcoming_holidays",
          title: "Upcoming Holidays",
          items: [],
          emailSent: false
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

      if (pendingClientNotification && pendingClientNotification.length > 0) {
        const notificationItems = pendingClientNotification.map(r => {
          const name = profileMap.get(r.user_id) || "Unknown";
          const daysUntil = Math.ceil((new Date(r.start_date).getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
          return `🚨 ${name} - holiday starts in ${daysUntil} day${daysUntil !== 1 ? "s" : ""} (${formatShortDate(r.start_date)}) - CLIENT NOT NOTIFIED`;
        });

        const result = await sendIndividualAlert(
          resend,
          adminEmails,
          `🚨 ${pendingClientNotification.length} Holiday${pendingClientNotification.length > 1 ? "s" : ""} Without Client Notification`,
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
      } else if (testType === "holiday_no_client_notification") {
        results.push({
          type: "holiday_no_client_notification",
          title: "Missing Client Notifications",
          items: [],
          emailSent: false
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
