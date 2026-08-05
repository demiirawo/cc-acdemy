import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

// ============================================================================
// CARE CUDDLE — CANONICAL EMAIL HELPERS
// ============================================================================

const EMAIL_SENDER = "Care Cuddle <hello@care-cuddle-academy.co.uk>";
const BRAND_COLOR = "#5F17EB";
const APP_URL = "https://www.care-cuddle-academy.co.uk";
// Existing hosted logo — keep until a first-party asset exists.
const LOGO_URL =
  "https://care-cuddle.co.uk/wp-content/uploads/2023/03/Green-and-Beige-Bold-Typographic-Coffee-Products-Coffee-Logo-e1689542108718.png";

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const DAYS = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];

/** "Monday 11 August" — year only when it isn't this year. */
function niceDate(input: string | Date): string {
  const d = typeof input === "string" ? new Date(input) : input;
  if (isNaN(d.getTime())) return "";
  const year = d.getFullYear() === new Date().getFullYear() ? "" : ` ${d.getFullYear()}`;
  return `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}${year}`;
}

/** First name for greetings. Never returns "there". */
function firstName(name?: string | null): string {
  const n = (name ?? "").trim();
  if (!n || n.includes("@")) return "";
  return n.split(/\s+/)[0];
}

/** "Hi Sarah," — or just "Hi," when no usable name exists. */
function greeting(name?: string | null): string {
  const f = firstName(name);
  return `<p style="color:#374151;font-size:16px;line-height:1.6;margin:0 0 16px;">Hi${f ? ` ${f}` : ""},</p>`;
}

function paragraph(html: string): string {
  return `<p style="color:#374151;font-size:16px;line-height:1.6;margin:0 0 16px;">${html}</p>`;
}

function mutedParagraph(html: string): string {
  return `<p style="color:#6b7280;font-size:14px;line-height:1.6;margin:0 0 16px;">${html}</p>`;
}

/** One button per email. label = verb + what you'll see. url must be a real route. */
function button(label: string, url: string): string {
  return `<div style="text-align:center;margin:24px 0 8px;">
    <a href="${url}" style="display:inline-block;background-color:${BRAND_COLOR};color:#ffffff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;">${label}</a>
  </div>`;
}

/**
 * The shared shell. headerTitle is the outcome in plain words ("Your holiday is
 * approved"); reason is one line saying why the reader got this email.
 */
function emailShell(headerTitle: string, bodyHtml: string, reason: string, accent: string = BRAND_COLOR): string {
  return `<!DOCTYPE html>
<html><body style="margin:0;padding:0;background-color:#f4f4f5;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background-color:#ffffff;border-radius:12px;overflow:hidden;font-family:Arial,Helvetica,sans-serif;">
        <tr><td style="background-color:${accent};padding:28px 32px;text-align:center;">
          <img src="${LOGO_URL}" alt="Care Cuddle" width="120" style="margin-bottom:12px;" />
          <h1 style="color:#ffffff;font-size:22px;margin:0;font-weight:700;">${headerTitle}</h1>
        </td></tr>
        <tr><td style="padding:32px;">
          ${bodyHtml}
          <p style="color:#374151;font-size:16px;line-height:1.6;margin:24px 0 0;">Best wishes,<br/>The Care Cuddle team</p>
        </td></tr>
        <tr><td style="padding:20px 32px;background-color:#f9fafb;border-top:1px solid #e5e7eb;">
          <p style="color:#9ca3af;font-size:12px;line-height:1.6;margin:0;">${reason}</p>
          <p style="color:#9ca3af;font-size:12px;line-height:1.6;margin:6px 0 0;">Care Cuddle · Questions? Email <a href="mailto:hello@care-cuddle.co.uk" style="color:#9ca3af;">hello@care-cuddle.co.uk</a> · © ${new Date().getFullYear()} Care Cuddle</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

/**
 * When an email can't be sent to someone who needed it (missing address, lookup
 * failure), tell the admins instead of returning success-shaped silence. Creates
 * its own service-role client so any function can call it.
 */
async function alertAdminsOfFailure(
  resendApiKey: string,
  what: string,      // "Cover assignment for Peace Jimoh"
  whoMissed: string, // "Oluwatosin (no email address on file)"
): Promise<void> {
  try {
    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2.57.4");
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: admins } = await admin.from("profiles").select("email").eq("role", "admin").not("email", "is", null);
    const emails: string[] = (admins ?? []).map((a: { email: string }) => a.email);
    if (emails.length === 0) return;
    const body =
      greeting(null) +
      paragraph(`We couldn't email <strong>${whoMissed}</strong> about: <strong>${what}</strong>.`) +
      paragraph(`They don't know about this yet — please tell them another way, or fix their email address and resend.`) +
      button("Open Care Cuddle", APP_URL);
    await Promise.all(emails.map((to) =>
      fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${resendApiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: EMAIL_SENDER,
          to: [to],
          subject: `We couldn't notify ${whoMissed.split("(")[0].trim()} — action needed`,
          html: emailShell("Someone wasn't notified", body, "You're receiving this because you're an admin at Care Cuddle.", "#d97706"),
        }),
      }).catch(() => {})
    ));
  } catch (_) { /* alerting must never break the main send */ }
}

// ============================================================================
// Shift-change alert
// ============================================================================

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

/** Written counts: "one", "two" … "ten", then numerals. */
const countWord = (n: number): string =>
  ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"][n] ?? String(n);

const capitalise = (s: string): string => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

/** "HH:MM" from a "HH:MM:SS" time column, or "" when missing. */
const clockFromTime = (v: unknown): string =>
  typeof v === "string" && /^\d{2}:\d{2}/.test(v) ? v.slice(0, 5) : "";

/** "HH:MM" in UK time from an ISO timestamp, or "" when missing/invalid. */
const clockFromTimestamp = (v: unknown): string => {
  if (typeof v !== "string" || !v) return "";
  const d = new Date(v);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("en-GB", { timeZone: "Europe/London", hour: "2-digit", minute: "2-digit" });
};

/** niceDate of an ISO timestamp, using the UK calendar day. */
const ukNiceDate = (v: unknown): string => {
  if (typeof v !== "string" || !v) return "";
  const d = new Date(v);
  if (isNaN(d.getTime())) return "";
  return niceDate(new Date(d.toLocaleString("en-US", { timeZone: "Europe/London" })));
};

/** "09:00 to 17:00", or "" when either half is missing (never "N/A"). */
const timeRange = (start: string, end: string): string =>
  start && end ? `${start} to ${end}` : "";

/**
 * One plain-English sentence (sometimes two) describing an audit row.
 * Never leaks table names, SQL actions, "System", "N/A" or "Unknown":
 * missing values restructure the sentence instead.
 */
function describeChange(log: ShiftAuditLog, nameOf: (id: unknown) => string | null): string {
  const data = (log.action === "DELETE" ? log.old_data : log.new_data) ?? {};
  const oldData = log.old_data ?? {};
  const actor = log.changed_by ? nameOf(log.changed_by) : null;
  const staff = nameOf(data.user_id);

  const whose = staff ? `${staff}'s` : "a staff member's";
  const forWhom = staff ? ` for ${staff}` : "";
  const client = typeof data.client_name === "string" && data.client_name.trim() ? data.client_name.trim() : "";
  const atClient = client ? ` at ${client}` : "";

  // Named actor → active voice. No actor at all → "this happened automatically".
  // Actor we can't name → just state the fact. Never "Changed by: System".
  const tell = (active: string, plain: string): string => {
    if (actor) return `${actor} ${active}`;
    if (!log.changed_by) return `${capitalise(plain)} This happened automatically.`;
    return capitalise(plain);
  };

  if (log.table_name === "staff_schedules") {
    const day = ukNiceDate(data.start_datetime);
    const times = timeRange(clockFromTimestamp(data.start_datetime), clockFromTimestamp(data.end_datetime));
    const when = [day ? ` on ${day}` : "", times ? `, ${times}` : ""].join("");

    if (log.action === "INSERT") {
      return tell(
        `added a shift${forWhom}${atClient}${when}.`,
        `a shift${forWhom}${atClient}${when} was added.`,
      );
    }
    if (log.action === "DELETE") {
      return tell(
        `cancelled ${whose} shift${atClient}${when}.`,
        `${whose} shift${atClient}${when} was cancelled.`,
      );
    }
    // UPDATE: new reality first, then the old as context.
    const oldDay = ukNiceDate(oldData.start_datetime);
    const oldTimes = timeRange(clockFromTimestamp(oldData.start_datetime), clockFromTimestamp(oldData.end_datetime));
    let context = "";
    if (oldDay && day && oldDay !== day) {
      context = ` It was previously on ${oldDay}${oldTimes ? `, ${oldTimes}` : ""}.`;
    } else if (oldTimes && times && oldTimes !== times) {
      context = ` It previously ran ${oldTimes}.`;
    }
    // Guard against a dangling "— it is now." if both halves ever come back empty.
    const newReality = [day ? ` on ${day}` : "", times ? `, ${times}` : ""].join("");
    const isNow = newReality ? ` — it is now${newReality}` : "";
    return tell(
      `changed ${whose} shift${atClient}${isNow}.${context}`,
      `${whose} shift${atClient} was changed${isNow}.${context}`,
    );
  }

  if (log.table_name === "shift_pattern_exceptions") {
    const day = typeof data.exception_date === "string" ? niceDate(data.exception_date) : "";
    const onDay = day ? ` on ${day}` : "";
    const kind = data.exception_type;

    if (log.action === "DELETE") {
      // The one-day change was undone.
      if (kind === "deleted") {
        return tell(
          `put ${whose} shift${atClient}${onDay} back on the rota.`,
          `${whose} shift${atClient}${onDay} was put back on the rota.`,
        );
      }
      return tell(
        `undid a change to ${whose} shift${atClient}${onDay}.`,
        `a change to ${whose} shift${atClient}${onDay} was undone.`,
      );
    }
    if (kind === "deleted") {
      return tell(
        `cancelled ${whose} shift${atClient}${onDay}.`,
        `${whose} shift${atClient}${onDay} was cancelled.`,
      );
    }
    if (kind === "overtime") {
      return tell(
        `marked ${whose} shift${atClient}${onDay} as overtime.`,
        `${whose} shift${atClient}${onDay} was marked as overtime.`,
      );
    }
    if (kind === "not_overtime") {
      return tell(
        `marked ${whose} shift${atClient}${onDay} as a normal shift instead of overtime.`,
        `${whose} shift${atClient}${onDay} was marked as a normal shift instead of overtime.`,
      );
    }
    return tell(
      `changed ${whose} shift${atClient}${onDay}.`,
      `${whose} shift${atClient}${onDay} was changed.`,
    );
  }

  // recurring_shift_patterns — someone's regular weekly shifts.
  const times = timeRange(clockFromTime(data.start_time), clockFromTime(data.end_time));
  const from = typeof data.start_date === "string" ? niceDate(data.start_date) : "";
  const until = typeof data.end_date === "string" && data.end_date ? niceDate(data.end_date) : "";

  if (log.action === "INSERT") {
    const detail = [times ? `, ${times}` : "", from ? `, starting ${from}` : "", until ? ` and finishing on ${until}` : ""].join("");
    return tell(
      `set up regular shifts${forWhom}${atClient}${detail}.`,
      `regular shifts${forWhom}${atClient}${detail} were set up.`,
    );
  }
  if (log.action === "DELETE") {
    return tell(
      `took ${whose} regular shifts${atClient} off the rota.`,
      `${whose} regular shifts${atClient} were taken off the rota.`,
    );
  }
  // UPDATE: say what they look like now, then what changed.
  const oldTimes = timeRange(clockFromTime(oldData.start_time), clockFromTime(oldData.end_time));
  const oldUntil = typeof oldData.end_date === "string" && oldData.end_date ? niceDate(oldData.end_date) : "";
  const hadOld = log.old_data !== null;
  let context = "";
  if (oldTimes && times && oldTimes !== times) {
    context += ` They previously ran ${oldTimes}.`;
  }
  if (until && hadOld && !oldUntil) {
    context += ` Until now they had no finish date.`;
  } else if (until && oldUntil && until !== oldUntil) {
    context += ` The finish date was previously ${oldUntil}.`;
  } else if (!until && oldUntil) {
    context += ` They were previously due to finish on ${oldUntil}.`;
  }
  const nowDetail = [times ? ` now run ${times}` : " were updated", until ? ` and finish on ${until}` : ""].join("");
  return tell(
    `updated ${whose} regular shifts${atClient} — they${nowDetail}.${context}`,
    `${whose} regular shifts${atClient}${nowDetail === " were updated" ? " were updated" : ` ${nowDetail.trim()}`}.${context}`,
  );
}

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

    const changeCount = auditLogs.length;
    const changesPhrase = changeCount === 1 ? "one change" : `${countWord(changeCount)} changes`;

    // Recipients are role-configured per alert in notification_settings
    // (defaults to admins + HR, who share responsibility for shift changes).
    const recipientRoles: string[] = Array.isArray(settings?.recipient_roles) && settings.recipient_roles.length > 0
      ? settings.recipient_roles
      : ["admin", "human_resources"];
    const { data: admins } = await supabase
      .from("profiles")
      .select("email, display_name")
      .in("role", recipientRoles);

    const recipients = (admins ?? []).filter((a): a is { email: string; display_name: string | null } => Boolean(a.email));
    if (recipients.length === 0) {
      // Silent failure is banned: nobody in the configured roles has an email
      // address, so fall back to alerting the admins directly.
      await alertAdminsOfFailure(
        RESEND_API_KEY!,
        `${capitalise(changesPhrase)} to the staff rota in the last few minutes`,
        "the rota-alert recipients (nobody in the configured roles has an email address on file)",
      );
      return new Response(JSON.stringify({ success: false, error: "No admin emails found" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Resolve real names for everyone mentioned: the people who made the
    // changes AND the staff whose shifts changed (so the email can say whose
    // rota moved, not just which client).
    const changerIds = auditLogs.map((log: ShiftAuditLog) => log.changed_by);
    const staffIds = auditLogs.flatMap((log: ShiftAuditLog) => [
      (log.new_data as Record<string, unknown> | null)?.user_id,
      (log.old_data as Record<string, unknown> | null)?.user_id,
    ]);
    const userIds = [...new Set([...changerIds, ...staffIds].filter(Boolean))] as string[];
    const { data: profiles } = await supabase
      .from("profiles")
      .select("user_id, display_name")
      .in("user_id", userIds);

    // No usable display name → leave them out of the map; describeChange then
    // restructures the sentence rather than showing an email-derived name.
    const profileMap = new Map<string, string>();
    for (const p of profiles ?? []) {
      const name = (p.display_name ?? "").trim();
      if (p.user_id && name) profileMap.set(p.user_id, name);
    }
    const nameOf = (id: unknown): string | null =>
      typeof id === "string" && id ? profileMap.get(id) ?? null : null;

    const changeParagraphs = auditLogs
      .map((log: ShiftAuditLog) => paragraph(describeChange(log, nameOf)))
      .join("");

    const now = new Date();
    const nowClock = now.toLocaleTimeString("en-GB", { timeZone: "Europe/London", hour: "2-digit", minute: "2-digit" });
    const nowDay = niceDate(new Date(now.toLocaleString("en-US", { timeZone: "Europe/London" })));

    const subject = changeCount === 1
      ? "One rota change in the last few minutes"
      : `${capitalise(countWord(changeCount))} rota changes in the last few minutes`;
    const headerTitle = changeCount === 1
      ? "A change to the rota"
      : `${capitalise(countWord(changeCount))} changes to the rota`;
    const intro = paragraph(
      `There ${changeCount === 1 ? "has been one change" : `have been ${changesPhrase}`} to the staff rota in the few minutes before ${nowClock} on ${nowDay}.`
    );
    const sharedBody =
      intro +
      changeParagraphs +
      button("Open the rota", `${APP_URL}/view/schedule`) +
      mutedParagraph(`If the button doesn't work, copy this link into your browser: ${APP_URL}/view/schedule`);
    const reason = "You're receiving this because shift-change alerts are turned on for your role at Care Cuddle.";

    // One email per person — never every address in a single visible to: field.
    const results = await Promise.all(recipients.map(async (recipient) => {
      const html = emailShell(headerTitle, greeting(recipient.display_name) + sharedBody, reason);
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: EMAIL_SENDER,
          to: [recipient.email],
          subject,
          html,
        }),
      });
      if (!res.ok) {
        console.error(`Resend error for ${recipient.email}:`, await res.text());
        return false;
      }
      return true;
    }));

    const sentCount = results.filter(Boolean).length;
    if (sentCount === 0) {
      throw new Error("Resend error: every shift-change alert send failed");
    }

    return new Response(JSON.stringify({
      success: true,
      changeCount,
      emailsSent: sentCount
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
