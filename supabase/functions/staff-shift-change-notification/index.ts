import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

// ============================================================================
// CARE CUDDLE — CANONICAL EMAIL HELPERS
// Shared copy of the canonical helpers: every email in a staff member's inbox
// should look like it came from the same company on the same day.
// ============================================================================

const EMAIL_SENDER = "Care Cuddle <hello@care-cuddle-academy.co.uk>";
const BRAND_COLOR = "#5F17EB";
const APP_URL = "https://www.care-cuddle-academy.co.uk";
// Existing hosted logo — keep until a first-party asset exists.
const LOGO_URL = "https://care-cuddle.co.uk/wp-content/uploads/2023/03/Green-and-Beige-Bold-Typographic-Coffee-Products-Coffee-Logo-e1689542108718.png";

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const DAYS = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];

/** "Monday 11 August" — year only when it isn't this year. */
function niceDate(input: string | Date): string {
  const d = typeof input === "string" ? new Date(input) : input;
  if (isNaN(d.getTime())) return "";
  const year = d.getFullYear() === new Date().getFullYear() ? "" : ` ${d.getFullYear()}`;
  return `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}${year}`;
}

/** "Monday 11 to Friday 15 August" (same date in and out → single niceDate). */
function niceDateRange(start: string, end: string): string {
  if (!start || !end || start === end) return niceDate(start || end);
  const s = new Date(start), e = new Date(end);
  if (isNaN(s.getTime()) || isNaN(e.getTime())) return "";
  if (s.getMonth() === e.getMonth() && s.getFullYear() === e.getFullYear()) {
    const year = e.getFullYear() === new Date().getFullYear() ? "" : ` ${e.getFullYear()}`;
    return `${DAYS[s.getDay()]} ${s.getDate()} to ${DAYS[e.getDay()]} ${e.getDate()} ${MONTHS[e.getMonth()]}${year}`;
  }
  return `${niceDate(s)} to ${niceDate(e)}`;
}

/** A readable list of dates: "Tuesday 11, Wednesday 12 and Thursday 13 August". */
function niceDateList(dates: string[]): string {
  const ds = dates.map((x) => new Date(x)).filter((d) => !isNaN(d.getTime()));
  if (ds.length === 0) return "";
  if (ds.length === 1) return niceDate(ds[0]);
  const sameMonth = ds.every((d) => d.getMonth() === ds[0].getMonth() && d.getFullYear() === ds[0].getFullYear());
  if (sameMonth) {
    const parts = ds.map((d) => `${DAYS[d.getDay()]} ${d.getDate()}`);
    const last = parts.pop();
    return `${parts.join(", ")} and ${last} ${MONTHS[ds[0].getMonth()]}`;
  }
  const parts = ds.map((d) => niceDate(d));
  const last = parts.pop();
  return `${parts.join(", ")} and ${last}`;
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
  return `<p style="color:#374151;font-size:16px;line-height:1.6;margin:0 0 16px;">Hi${f ? ` ${escapeHtml(f)}` : ""},</p>`;
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
      paragraph(`We couldn't email <strong>${escapeHtml(whoMissed)}</strong> about: <strong>${escapeHtml(what)}</strong>.`) +
      paragraph(`They don't know about this yet — please tell them another way, or fix their email address and resend.`) +
      button("Open Care Cuddle", APP_URL);
    await Promise.all(emails.map((to) =>
      fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${resendApiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: EMAIL_SENDER,
          to: [to],
          subject: `We couldn't notify ${whoMissed.replace(/\s*\([^()]*\)\s*$/, "").trim()} — action needed`,
          html: emailShell("Someone wasn't notified", body, "You're receiving this because you're an admin at Care Cuddle.", "#d97706"),
        }),
      }).catch(() => {})
    ));
  } catch (_) { /* alerting must never break the main send */ }
}

// ============================================================================
// Domain logic
// ============================================================================

interface ShiftAuditLog {
  id: string;
  table_name: string;
  record_id: string;
  action: string;
  changed_by: string | null;
  old_data: Record<string, any> | null;
  new_data: Record<string, any> | null;
  changed_at: string;
  // Set locally when an UPDATE that swapped user_id is split in two: the id of
  // the OTHER person in the swap, so each email can name their counterpart.
  swapOtherId?: string;
}

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

// ---- Plain-English formatting helpers ----

const COUNT_WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
const countWord = (n: number): string => COUNT_WORDS[n] ?? String(n);

const joinAnd = (parts: string[]): string =>
  parts.length <= 1 ? (parts[0] ?? "") : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;

/** [1,3] → "Monday and Wednesday" (full day names, sorted). */
const daysPhrase = (arr: unknown): string => {
  if (!Array.isArray(arr) || arr.length === 0) return "";
  const names = arr.slice().sort((a, b) => Number(a) - Number(b)).map((d) => DAYS[Number(d)]).filter(Boolean) as string[];
  return joinAnd(names);
};

/** "09:00:00" → "09:00". */
const t24 = (t: unknown): string => {
  const m = String(t ?? "").match(/^(\d{1,2}):(\d{2})/);
  return m ? `${m[1].padStart(2, "0")}:${m[2]}` : "";
};

/** ISO datetime → "09:00" in UK time. */
const isoTime = (v: unknown): string => {
  if (!v) return "";
  const d = new Date(String(v));
  if (isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });
};

const recurrencePhrase = (n: unknown): string => {
  const i = Number(n ?? 1);
  return !i || i <= 1 ? "every week" : `every ${i} weeks`;
};

/** Overtime described the way a person would say it, never "subtype"/"override". */
const overtimePhrase = (subtype: unknown): string =>
  String(subtype ?? "") === "double_up" ? "overtime that falls within your normal hours" : "overtime";

const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

type NameLookup = (id: string | null | undefined) => string | null;

const attributionFor = (log: ShiftAuditLog, names: NameLookup): string => {
  if (!log.changed_by) return "This was updated automatically.";
  const nm = names(log.changed_by);
  return nm ? `${escapeHtml(firstName(nm) || nm)} made this change.` : "An administrator made this change.";
};

// ---- One prose paragraph per change ----

const renderException = (log: ShiftAuditLog, attribution: string): string => {
  const d = (log.new_data || log.old_data || {}) as Record<string, unknown>;
  const client = String(d.client_name ?? "").trim();
  const at = client ? ` at <strong>${escapeHtml(client)}</strong>` : "";
  const day = d.exception_date ? niceDate(String(d.exception_date)) : "";
  const onDay = day ? ` on ${day}` : "";
  const removed = log.action === "DELETE";
  const et = String(d.exception_type ?? "");
  let s: string;
  if (et === "deleted") {
    s = removed
      ? `Your shift${at}${onDay} is back on — please attend as normal.`
      : `Your shift${at}${onDay} has been cancelled — you don't need to come in for it.`;
  } else if (et === "overtime") {
    s = removed
      ? `Your shift${at}${onDay} will no longer be paid as overtime — it will be paid as a normal shift.`
      : `Your shift${at}${onDay} will now be paid as ${overtimePhrase(d.overtime_subtype)}. This can affect your pay.`;
  } else if (et === "not_overtime") {
    s = removed
      ? `Your shift${at}${onDay} will be paid as overtime again.`
      : `Your shift${at}${onDay} will be paid as a normal shift, not overtime.`;
  } else {
    s = `There has been a change to your shift${at}${onDay} — please check your schedule for the latest details.`;
  }
  return paragraph(`${s} ${attribution}`);
};

const renderUpdate = (log: ShiftAuditLog, attribution: string): string => {
  const oneOff = log.table_name === "staff_schedules";
  const o = log.old_data as Record<string, unknown>;
  const n = log.new_data as Record<string, unknown>;
  const client = String(n.client_name ?? o.client_name ?? "").trim();
  const noun = oneOff ? "shift" : "regular shifts";
  const fullSubj = `your ${noun}${client ? ` at <strong>${escapeHtml(client)}</strong>` : ""}`;
  const shortSubj = oneOff ? "this shift" : "these shifts";
  let first = true;
  const S = (): string => {
    const s = first ? fullSubj : shortSubj;
    first = false;
    return cap(s);
  };
  const sentences: string[] = [];

  // Client moved (same person keeps the shifts).
  if (!valuesEqual(o.client_name, n.client_name)) {
    const oc = String(o.client_name ?? "").trim();
    const nc = String(n.client_name ?? "").trim();
    first = false;
    if (nc && oc) sentences.push(`Your ${noun} ${oneOff ? "has" : "have"} moved from <strong>${escapeHtml(oc)}</strong> to <strong>${escapeHtml(nc)}</strong>.`);
    else if (nc) sentences.push(`Your ${noun} ${oneOff ? "is" : "are"} now with <strong>${escapeHtml(nc)}</strong>.`);
    else if (oc) sentences.push(`Your ${noun} ${oneOff ? "is" : "are"} no longer with <strong>${escapeHtml(oc)}</strong> — please check your schedule for where you'll be working.`);
  }

  if (oneOff) {
    // One-off shift moved to a different date/time.
    if (!valuesEqual(o.start_datetime, n.start_datetime) || !valuesEqual(o.end_datetime, n.end_datetime)) {
      const whenBit = (d: Record<string, unknown>): string => {
        const day = d.start_datetime ? niceDate(String(d.start_datetime)) : "";
        const a = isoTime(d.start_datetime), b = isoTime(d.end_datetime);
        return [day, a && b ? `${a} to ${b}` : ""].filter(Boolean).join(", ");
      };
      const nb = whenBit(n), ob = whenBit(o);
      if (nb) sentences.push(`${S()} now runs on ${nb}${ob ? ` (it was ${ob})` : ""}.`);
    }
  } else {
    if (!valuesEqual(o.days_of_week, n.days_of_week)) {
      const nd = daysPhrase(n.days_of_week), od = daysPhrase(o.days_of_week);
      if (nd) sentences.push(`${S()} now fall on ${nd}${od ? ` (previously ${od})` : ""}.`);
    }
    if (!valuesEqual(o.start_time, n.start_time) || !valuesEqual(o.end_time, n.end_time)) {
      const a = t24(n.start_time), b = t24(n.end_time);
      const oa = t24(o.start_time), ob = t24(o.end_time);
      if (a && b) sentences.push(`${S()} now run ${a} to ${b}${oa && ob ? ` (previously ${oa} to ${ob})` : ""}.`);
    }
    if (!valuesEqual(o.start_date, n.start_date) && n.start_date) {
      const sd = niceDate(String(n.start_date));
      const osd = o.start_date ? niceDate(String(o.start_date)) : "";
      if (sd) sentences.push(`${S()} now start on ${sd}${osd ? ` (previously ${osd})` : ""}.`);
    }
    if (!valuesEqual(o.end_date, n.end_date)) {
      if (n.end_date) {
        const ed = niceDate(String(n.end_date));
        if (ed) sentences.push(`${S()} now finish on ${ed}${o.end_date ? ` (previously ${niceDate(String(o.end_date))})` : " — until now they had no finish date"}.`);
      } else {
        sentences.push(`${S()} no longer have a finish date — they carry on until you hear otherwise${o.end_date ? ` (previously they finished on ${niceDate(String(o.end_date))})` : ""}.`);
      }
    }
    if (!valuesEqual(o.recurrence_interval, n.recurrence_interval)) {
      sentences.push(`${S()} now repeat ${recurrencePhrase(n.recurrence_interval)} (previously ${recurrencePhrase(o.recurrence_interval)}).`);
    }
    if (!valuesEqual(o.is_overtime, n.is_overtime)) {
      sentences.push(n.is_overtime
        ? `${S()} now count as ${overtimePhrase(n.overtime_subtype)}. This can affect your pay.`
        : `${S()} no longer count as overtime — they will be paid as normal shifts.`);
    } else if (n.is_overtime && !valuesEqual(o.overtime_subtype, n.overtime_subtype)) {
      sentences.push(`${S()} now count as ${overtimePhrase(n.overtime_subtype)}. This can affect your pay.`);
    }
  }

  if (!valuesEqual(o.shift_type, n.shift_type) && n.shift_type) {
    const phrase = (v: unknown): string =>
      String(v) === "Bench"
        ? (oneOff ? "a bench (standby) shift" : "bench (standby) shifts")
        : (oneOff ? `a ${escapeHtml(String(v))} shift` : `${escapeHtml(String(v))} shifts`);
    sentences.push(`${S()} ${oneOff ? "is" : "are"} now ${phrase(n.shift_type)}${o.shift_type ? ` (previously ${phrase(o.shift_type)})` : ""}.`);
  }

  if (!valuesEqual(o.notes, n.notes)) {
    sentences.push(`The notes for ${first ? fullSubj : shortSubj} have been updated — you can read them in the app.`);
  }

  if (sentences.length === 0) {
    sentences.push(`Some details of ${fullSubj} have been updated — please check your schedule for the latest picture.`);
  }

  return paragraph(`${sentences.join(" ")} ${attribution}`);
};

const renderAdded = (log: ShiftAuditLog, attribution: string, names: NameLookup): string => {
  const d = (log.new_data || {}) as Record<string, unknown>;
  const oneOff = log.table_name === "staff_schedules";
  const client = String(d.client_name ?? "").trim();
  const clientHtml = client ? ` at <strong>${escapeHtml(client)}</strong>` : "";
  const sentences: string[] = [];

  if (oneOff) {
    const day = d.start_datetime ? niceDate(String(d.start_datetime)) : "";
    const a = isoTime(d.start_datetime), b = isoTime(d.end_datetime);
    let s = `You've been given a shift${clientHtml}`;
    if (day) s += ` on ${day}`;
    if (a && b) s += `, ${a} to ${b}`;
    sentences.push(`${s}.`);
    if (String(d.shift_type ?? "") === "Bench") sentences.push("This is a bench (standby) shift.");
  } else {
    sentences.push(`You've been given regular shifts${clientHtml}.`);
    const days = daysPhrase(d.days_of_week);
    const a = t24(d.start_time), b = t24(d.end_time);
    const bits: string[] = [];
    if (days) bits.push(`on ${days}`);
    if (a && b) bits.push(`${a} to ${b}`);
    if (d.start_date) {
      const sd = niceDate(String(d.start_date));
      if (sd) bits.push(`starting ${sd}`);
    }
    if (bits.length > 0) sentences.push(`You'll work ${bits.join(", ")}.`);
    if (d.end_date) {
      const ed = niceDate(String(d.end_date));
      if (ed) sentences.push(`These shifts run until ${ed}.`);
    }
    const ri = Number(d.recurrence_interval ?? 1);
    if (ri > 1) sentences.push(`They repeat ${recurrencePhrase(ri)}.`);
    if (d.is_overtime) sentences.push(`They count as ${overtimePhrase(d.overtime_subtype)}. This can affect your pay.`);
    if (String(d.shift_type ?? "") === "Bench") sentences.push("These are bench (standby) shifts.");
  }

  if (log.swapOtherId) {
    const nm = names(log.swapOtherId);
    if (nm) sentences.push(`You're taking ${oneOff ? "this shift" : "these shifts"} over from <strong>${escapeHtml(nm)}</strong>.`);
  }

  return paragraph(`${sentences.join(" ")} ${attribution}`);
};

const renderRemoved = (log: ShiftAuditLog, attribution: string, names: NameLookup): string => {
  const d = (log.old_data || {}) as Record<string, unknown>;
  const oneOff = log.table_name === "staff_schedules";
  const client = String(d.client_name ?? "").trim();
  const clientHtml = client ? ` at <strong>${escapeHtml(client)}</strong>` : "";
  const sentences: string[] = [];

  if (oneOff) {
    const day = d.start_datetime ? niceDate(String(d.start_datetime)) : "";
    sentences.push(`Your shift${clientHtml}${day ? ` on ${day}` : ""} has been taken off your schedule — you don't need to attend it.`);
  } else {
    const days = daysPhrase(d.days_of_week);
    const a = t24(d.start_time), b = t24(d.end_time);
    const detail = [days, a && b ? `${a} to ${b}` : ""].filter(Boolean).join(", ");
    sentences.push(`You've been taken off your regular shifts${clientHtml}${detail ? ` (${detail})` : ""} — you don't need to attend these any more.`);
  }

  if (log.swapOtherId) {
    const nm = names(log.swapOtherId);
    if (nm) sentences.push(`<strong>${escapeHtml(nm)}</strong> is taking ${oneOff ? "this shift" : "these shifts"} over, so the client is still covered.`);
  }

  return paragraph(`${sentences.join(" ")} ${attribution}`);
};

const renderChange = (log: ShiftAuditLog, names: NameLookup): string => {
  const attribution = attributionFor(log, names);
  if (log.table_name === "shift_pattern_exceptions") return renderException(log, attribution);
  if (log.action === "UPDATE" && log.old_data && log.new_data) return renderUpdate(log, attribution);
  if (log.action === "INSERT") return renderAdded(log, attribution, names);
  if (log.action === "DELETE") return renderRemoved(log, attribution, names);
  return paragraph(`There has been a change to your shifts — please check your schedule for the latest details. ${attribution}`);
};

// True when a change is bad-news-shaped for the reader (a cancellation or
// removal) — those emails wear the amber "needs attention" header.
const isCancellation = (l: ShiftAuditLog): boolean => {
  if (l.table_name === "shift_pattern_exceptions") {
    const d = (l.new_data || l.old_data || {}) as Record<string, unknown>;
    return String(d.exception_type ?? "") === "deleted" && l.action !== "DELETE";
  }
  return l.action === "DELETE";
};

const subjectFor = (logs: ShiftAuditLog[]): string => {
  const datum = (l: ShiftAuditLog) => (l.new_data || l.old_data || {}) as Record<string, unknown>;
  const clients = [...new Set(logs.map((l) => String(datum(l).client_name ?? "").trim()).filter(Boolean))];
  const client = clients.length === 1 ? clients[0] : null;

  if (logs.length === 1) {
    const l = logs[0];
    const d = datum(l);
    if (l.table_name === "shift_pattern_exceptions") {
      const day = d.exception_date ? niceDate(String(d.exception_date)) : "";
      const onDay = day ? ` on ${day}` : "";
      const et = String(d.exception_type ?? "");
      const removed = l.action === "DELETE";
      if (et === "deleted") return removed ? `Your shift${onDay} is back on` : `Your shift${onDay} is cancelled`;
      return `A pay change for your shift${onDay}`;
    }
    if (l.action === "INSERT") {
      if (l.table_name === "staff_schedules") return client ? `New shift for you at ${client}` : "You've been given a new shift";
      return client ? `New regular shifts for you at ${client}` : "You've been given new shifts";
    }
    if (l.action === "DELETE") {
      return client ? `You've been taken off shifts at ${client}` : "You've been taken off a shift";
    }
    if (l.table_name === "staff_schedules") {
      return client ? `Your shift at ${client} has changed` : "Your shift has changed";
    }
    return client ? `Your shifts at ${client} have changed` : "Your shifts have changed";
  }

  return client ? `Changes to your shifts at ${client}` : "Changes to your shifts";
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: settings, error: settingsError } = await supabase
      .from("notification_settings")
      .select("*")
      .eq("notification_type", "staff_shift_change")
      .maybeSingle();

    if (settingsError) {
      // A lookup failure must not look like "notifications are off".
      await alertAdminsOfFailure(RESEND_API_KEY ?? "", "recent shift changes", "affected staff (we could not check the notification settings)");
      throw settingsError;
    }

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
    // Changes with no staff member attached (e.g. an unassigned shift deleted):
    // nobody can be emailed directly, so these must raise an admin alert instead
    // of vanishing.
    const unassignedLogs: ShiftAuditLog[] = [];
    const pushGrouped = (userId: string | undefined, log: ShiftAuditLog) => {
      if (!userId) {
        unassignedLogs.push(log);
        return;
      }
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
        // Removed person: render as a DELETE of the old shift, naming who takes over.
        pushGrouped(oldU, { ...log, action: "DELETE", new_data: null, swapOtherId: newU });
        // Added person: render as an INSERT of the new shift, naming who they replace.
        pushGrouped(newU, { ...log, action: "INSERT", old_data: null, swapOtherId: oldU });
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

    const failureAlerts: string[] = [];

    if (unassignedLogs.length > 0) {
      const clients = [...new Set(unassignedLogs.map((l) => String(((l.new_data || l.old_data || {}) as Record<string, unknown>).client_name ?? "").trim()).filter(Boolean))];
      const what = `${unassignedLogs.length === 1 ? "a rota change" : `${countWord(unassignedLogs.length)} rota changes`} with no staff member attached${clients.length ? ` (${clients.join(", ")})` : ""}`;
      await alertAdminsOfFailure(RESEND_API_KEY ?? "", what, "the affected staff (no staff member is linked to these changes)");
      failureAlerts.push(what);
    }

    if (grouped.size === 0 && teamEvents.length === 0) {
      return new Response(JSON.stringify({
        success: true,
        message: "No staff-affecting changes",
        failureAlerts: failureAlerts.length ? failureAlerts : undefined,
      }), {
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

    const { data: profiles, error: profilesError } = await supabase
      .from("profiles")
      .select("user_id, display_name, email")
      .in("user_id", allIds);

    if (profilesError) {
      await alertAdminsOfFailure(RESEND_API_KEY ?? "", "recent shift changes", "the affected staff (we could not look up their details)");
      throw profilesError;
    }

    const profileMap = new Map<string, { name: string | null; email: string | null }>(
      (profiles || []).map((p) => [p.user_id, { name: p.display_name || null, email: p.email || null }])
    );
    const nameFor: NameLookup = (id) => (id && profileMap.get(id)?.name) || null;

    let emailsSent = 0;
    let coworkerEmailsSent = 0;
    const errors: string[] = [];

    // ---- Personal "your shifts changed" emails ----
    for (const [userId, logs] of grouped.entries()) {
      const profile = profileMap.get(userId);
      const clientsTxt = [...new Set(logs.map((l) => String(((l.new_data || l.old_data || {}) as Record<string, unknown>).client_name ?? "").trim()).filter(Boolean))].join(", ");
      const what = `${logs.length === 1 ? "a change" : `${countWord(logs.length)} changes`} to their shifts${clientsTxt ? ` at ${clientsTxt}` : ""}`;

      if (!profile?.email) {
        // Silent skips are banned: the admins must hear that this person was
        // never told about their own shift changes.
        const who = `${profile?.name || "A staff member"} (no email address on file)`;
        await alertAdminsOfFailure(RESEND_API_KEY ?? "", what, who);
        failureAlerts.push(`${who} — ${what}`);
        continue;
      }

      const removalOnly = logs.every(isCancellation);
      const accent = removalOnly ? "#d97706" : BRAND_COLOR;
      const headline = removalOnly
        ? (logs.length === 1 && logs[0].table_name === "shift_pattern_exceptions" ? "A shift has been cancelled" : "You've been taken off some shifts")
        : "Your shifts have changed";

      const intro = logs.length > 1
        ? paragraph(`There have been ${countWord(logs.length)} changes to your shifts in the last few minutes — here's what's new.`)
        : "";

      const body =
        greeting(profile.name) +
        intro +
        logs.map((log) => renderChange(log, nameFor)).join("") +
        button("See your updated schedule", `${APP_URL}/view/schedule`) +
        mutedParagraph("If anything here looks wrong, just reply to this email and the admin team will sort it out.");

      const resendResponse = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: EMAIL_SENDER,
          to: [profile.email],
          subject: subjectFor(logs),
          html: emailShell(headline, body, "You're receiving this because your shifts at Care Cuddle changed.", accent),
        }),
      });

      if (!resendResponse.ok) {
        const errorText = await resendResponse.text();
        errors.push(`${profile.email}: ${errorText}`);
        const who = `${profile.name || profile.email} (their email could not be delivered)`;
        await alertAdminsOfFailure(RESEND_API_KEY ?? "", what, who);
        failureAlerts.push(`${who} — ${what}`);
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

      // Reconcile against ACTUAL current team membership so the summary reflects
      // net changes, not per-shift churn. Editing/swapping a person's shift can
      // produce both an "added" and a "removed" event for the same person even
      // though they still work the client — which read as contradictory.
      const onTeamNow = coworkerIdsByClient.get(client) || new Set<string>();
      const addedEvents = new Set(events.filter((e) => e.kind === "added").map((e) => e.personId));
      const removedEvents = new Set(events.filter((e) => e.kind === "removed").map((e) => e.personId));

      // A person with BOTH an add and a remove event was just swapped between
      // shifts — net no membership change, so show them in neither list.
      const added = [...addedEvents].filter((id) => !removedEvents.has(id));
      // Genuinely removed = wasn't also added, and no longer on the team at all
      // after the change (still-present coworkers keep other shifts/assignments).
      const removed = [...removedEvents].filter((id) => !addedEvents.has(id) && !onTeamNow.has(id));
      const involved = new Set([...addedEvents, ...removedEvents]);

      // Nothing changed on balance (e.g. a shift was just moved) — no email.
      if (added.length === 0 && removed.length === 0) continue;

      const recipients = [...(coworkerIdsByClient.get(client) || [])]
        .filter((id) => !involved.has(id) && !changerIds.includes(id)) // involved got a personal email; the changer made the change
        .map((id) => profileMap.get(id))
        .filter((p): p is { name: string | null; email: string } => !!p && !!p.email);

      if (recipients.length === 0) continue;

      const clientStrong = `<strong>${escapeHtml(client)}</strong>`;
      const addedNames = added.map((id) => profileMap.get(id)?.name).filter((n): n is string => !!n);
      const removedNames = removed.map((id) => profileMap.get(id)?.name).filter((n): n is string => !!n);

      const storyBits: string[] = [];
      if (added.length > 0) {
        storyBits.push(addedNames.length > 0
          ? `${joinAnd(addedNames.map((n) => `<strong>${escapeHtml(n)}</strong>`))} ${addedNames.length > 1 ? "have" : "has"} joined the team at ${clientStrong}, one of the clients you support.`
          : `Someone new has joined the team at ${clientStrong}, one of the clients you support.`);
      }
      if (removed.length > 0) {
        storyBits.push(removedNames.length > 0
          ? `${joinAnd(removedNames.map((n) => `<strong>${escapeHtml(n)}</strong>`))} no longer ${removedNames.length > 1 ? "work" : "works"} shifts at ${clientStrong}.`
          : `One of the team no longer works shifts at ${clientStrong}.`);
      }

      const bodyRest =
        paragraph(storyBits.join(" ")) +
        paragraph("Nothing changes for your own shifts — this is just so you know who you'll be working alongside.") +
        button(`See the ${escapeHtml(client)} schedule`, `${APP_URL}/public/schedule/${encodeURIComponent(client)}`);

      let subject = `The team at ${client} has changed`;
      if (added.length === 1 && removed.length === 0) {
        const nm = profileMap.get(added[0])?.name;
        if (nm) subject = `${firstName(nm) || nm} is joining you at ${client}`;
      } else if (removed.length === 1 && added.length === 0) {
        const nm = profileMap.get(removed[0])?.name;
        if (nm) subject = `${firstName(nm) || nm} no longer works shifts at ${client}`;
      }

      const headline = `The team at ${escapeHtml(client)} has changed`;
      const reason = `You're receiving this because you also support ${escapeHtml(client)} at Care Cuddle.`;

      for (const r of recipients) {
        const resp = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { "Authorization": `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            from: EMAIL_SENDER,
            to: [r.email],
            subject,
            html: emailShell(headline, greeting(r.name) + bodyRest, reason),
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
      failureAlerts: failureAlerts.length ? failureAlerts : undefined,
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
