import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "npm:resend@2.0.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface AlertSection {
  title: string;
  color: string;
  items: string[];
}

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

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString().split("T")[0];
    
    const twoWeeksFromNow = new Date(today);
    twoWeeksFromNow.setDate(twoWeeksFromNow.getDate() + 14);
    const twoWeeksStr = twoWeeksFromNow.toISOString().split("T")[0];

    const alerts: AlertSection[] = [];

    // ===== 1. TODAY'S BIRTHDAYS =====
    const { data: onboardingDocs } = await supabaseClient
      .from("staff_onboarding_documents")
      .select("user_id, date_of_birth, full_name")
      .not("date_of_birth", "is", null);

    const { data: profiles } = await supabaseClient
      .from("profiles")
      .select("user_id, display_name");

    const profileMap = new Map(profiles?.map(p => [p.user_id, p.display_name]) || []);

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
      alerts.push({
        title: "🎂 Today's Birthdays",
        color: "#ec4899",
        items: todayBirthdays.length === 1 
          ? [`${todayBirthdays[0]} has a birthday today!`]
          : [`${todayBirthdays.join(", ")} have birthdays today!`]
      });
    }

    // ===== 2. TODAY'S WORK ANNIVERSARIES =====
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
        ? [`${todayAnniversaries[0].name} celebrates ${todayAnniversaries[0].years} year${todayAnniversaries[0].years > 1 ? "s" : ""} today!`]
        : todayAnniversaries.map(a => `${a.name} - ${a.years} year${a.years > 1 ? "s" : ""}`);
      
      alerts.push({
        title: "🎉 Work Anniversaries Today",
        color: "#8b5cf6",
        items
      });
    }

    // ===== 3. UPCOMING APPROVED HOLIDAYS (next 7 days) =====
    const sevenDaysFromNow = new Date(today);
    sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);
    const sevenDaysStr = sevenDaysFromNow.toISOString().split("T")[0];

    const { data: upcomingHolidays } = await supabaseClient
      .from("staff_holidays")
      .select("user_id, start_date, end_date, holiday_type")
      .eq("status", "approved")
      .gte("start_date", todayStr)
      .lte("start_date", sevenDaysStr)
      .order("start_date");

    if (upcomingHolidays && upcomingHolidays.length > 0) {
      const holidayItems = upcomingHolidays.map(h => {
        const name = profileMap.get(h.user_id) || "Unknown";
        const dateRange = h.start_date === h.end_date 
          ? formatShortDate(h.start_date)
          : `${formatShortDate(h.start_date)} - ${formatShortDate(h.end_date)}`;
        return `${name}: ${dateRange}`;
      });

      alerts.push({
        title: "📅 Upcoming Approved Holidays (Next 7 Days)",
        color: "#3b82f6",
        items: holidayItems
      });
    }

    // ===== 4. SHIFT PATTERNS EXPIRING SOON (next 14 days) =====
    const { data: expiringPatterns } = await supabaseClient
      .from("recurring_shift_patterns")
      .select("id, user_id, client_name, end_date, shift_type")
      .gte("end_date", todayStr)
      .lte("end_date", twoWeeksStr)
      .order("end_date");

    if (expiringPatterns && expiringPatterns.length > 0) {
      const patternItems = expiringPatterns.map(p => {
        const name = profileMap.get(p.user_id) || "Unknown";
        return `${name} at ${p.client_name || "Unknown client"} - expires ${formatShortDate(p.end_date)}`;
      });

      alerts.push({
        title: "⚠️ Shift Patterns Expiring Soon",
        color: "#f59e0b",
        items: patternItems
      });
    }

    // ===== 5. HOLIDAYS STARTING SOON WITHOUT CLIENT NOTIFICATION =====
    const { data: pendingClientNotification } = await supabaseClient
      .from("staff_requests")
      .select("id, user_id, start_date, end_date, client_informed")
      .in("request_type", ["holiday_paid", "holiday_unpaid", "holiday"])
      .eq("status", "approved")
      .or(`client_informed.is.null,client_informed.eq.false`)
      .gte("start_date", todayStr)
      .lte("start_date", twoWeeksStr)
      .order("start_date");

    if (pendingClientNotification && pendingClientNotification.length > 0) {
      const notificationItems = pendingClientNotification.map(r => {
        const name = profileMap.get(r.user_id) || "Unknown";
        const daysUntil = Math.ceil((new Date(r.start_date).getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        return `${name} - holiday starts in ${daysUntil} day${daysUntil !== 1 ? "s" : ""} (${formatShortDate(r.start_date)})`;
      });

      alerts.push({
        title: "🚨 Holidays Without Client Notification",
        color: "#ef4444",
        items: notificationItems
      });
    }

    // If no alerts, don't send email
    if (alerts.length === 0) {
      console.log("No alerts to send today");
      return new Response(
        JSON.stringify({ success: true, message: "No alerts to send" }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Fetch admin emails
    const { data: adminProfiles } = await supabaseClient
      .from("profiles")
      .select("email, display_name")
      .eq("role", "admin");

    const adminEmails = adminProfiles?.filter(p => p.email).map(p => p.email as string) || [];

    if (adminEmails.length === 0) {
      console.warn("No admin emails found");
      return new Response(
        JSON.stringify({ success: true, message: "No admin emails to notify" }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Build email HTML
    const alertSectionsHtml = alerts.map(alert => `
      <div style="margin-bottom: 24px;">
        <h2 style="color: ${alert.color}; font-size: 18px; margin: 0 0 12px 0; border-bottom: 2px solid ${alert.color}; padding-bottom: 8px;">
          ${alert.title}
        </h2>
        <ul style="margin: 0; padding-left: 20px; color: #374151;">
          ${alert.items.map(item => `<li style="margin-bottom: 6px; font-size: 14px;">${item}</li>`).join("")}
        </ul>
      </div>
    `).join("");

    const emailResult = await resend.emails.send({
      from: "Care & Cuddle Academy <hello@care-cuddle-academy.co.uk>",
      to: adminEmails,
      subject: `Daily Admin Digest - ${formatDate(todayStr)}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background-color: #f97316; padding: 20px; border-radius: 8px 8px 0 0;">
            <h1 style="color: white; margin: 0; font-size: 24px;">📋 Daily Admin Digest</h1>
            <p style="color: rgba(255,255,255,0.9); margin: 8px 0 0 0; font-size: 14px;">${formatDate(todayStr)}</p>
          </div>
          <div style="background-color: #f9fafb; padding: 24px; border-radius: 0 0 8px 8px; border: 1px solid #e5e7eb; border-top: none;">
            ${alertSectionsHtml}
            
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

    console.log("Daily digest email sent:", emailResult);

    return new Response(
      JSON.stringify({ success: true, alertCount: alerts.length, result: emailResult }),
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
