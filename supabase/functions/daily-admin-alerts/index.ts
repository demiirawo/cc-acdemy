import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "npm:resend@2.0.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";

// ============================================================================
// CARE CUDDLE — CANONICAL EMAIL HELPERS (shared across all email functions)
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
 * failure), tell the admins instead of returning success-shaped silence.
 */
async function alertAdminsOfFailure(
  resendApiKey: string,
  what: string,      // "Cover assignment for Peace Jimoh"
  whoMissed: string, // "Oluwatosin (no email address on file)"
): Promise<void> {
  try {
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
// Function-specific constants and helpers
// ============================================================================

const HANDOVER_VIDEO_URL = "https://www.youtube.com/watch?v=VGzR7cR1npA";
const BIRTHDAY_IMAGE_URL = "https://www.care-cuddle-academy.co.uk/images/birthday-celebration.png";
const BIRTHDAY_PINK = "#ec4899";
const AMBER = "#d97706";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/** "today" / "tomorrow" / "in 5 days" */
const inDays = (n: number): string => (n <= 0 ? "today" : n === 1 ? "tomorrow" : `in ${n} days`);

/** "Ada", "Ada and Tunde", "Ada, Tunde and Kemi" */
const joinNames = (names: string[]): string => {
  const ns = names.filter(Boolean);
  if (ns.length === 0) return "";
  if (ns.length === 1) return ns[0];
  return `${ns.slice(0, -1).join(", ")} and ${ns[ns.length - 1]}`;
};

/** A short readable list inside an email body. */
const listHtml = (items: string[]): string =>
  `<ul style="color:#374151;font-size:16px;line-height:1.6;margin:0 0 16px;padding-left:20px;">${items.map(i => `<li style="margin-bottom:8px;">${i}</li>`).join("")}</ul>`;

/** Detail lines nested under one digest item. */
const subListHtml = (items: string[]): string =>
  `<ul style="margin:6px 0 0;padding-left:18px;font-size:14px;line-height:1.6;">${items.map(i => `<li style="margin-bottom:4px;">${i}</li>`).join("")}</ul>`;

/** For free text typed by staff (a "not required" reason) going into HTML. */
const escapeHtml = (s: string): string => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Send one email to one person through the shared shell. */
const sendOne = async (
  to: string,
  subject: string,
  headerTitle: string,
  bodyHtml: string,
  reason: string,
  accent: string = BRAND_COLOR
): Promise<{ success: boolean; error?: string }> => {
  try {
    await resend.emails.send({
      from: EMAIL_SENDER,
      to: [to],
      subject,
      html: emailShell(headerTitle, bodyHtml, reason, accent),
    });
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
  }
};

interface DigestSection {
  type: string;
  title: string;
  icon: string;
  accentColor: string;
  itemsHtml: string[];
  summary: string;
}

// ============================================================================
// Handovers — a local copy of what src/lib/handoverStatus.ts works out
// ============================================================================
// An edge function cannot import from src/, so the parts of the shared lib the
// digest needs are mirrored here and must be kept in step with it: which dates
// a shift pattern has inside a leave window, whether an approved cover request
// covers a given client, and when a handover, a client and a leave count as
// ready. A handover is one person handing ONE client to ONE colleague for ONE
// leave — a holiday split between two coverers is two handovers, each with its
// own checklist and its own "not required" decision. Which handovers exist is
// worked out from the rota and the covers; a client_handovers row only exists
// once somebody has acted on one, so a pair with no row is simply not started.

const BENCH_SENTINEL = "Care Cuddle";

interface PatternWindow {
  client_name: string | null;
  days_of_week: number[] | null;
  start_date: string;
  end_date: string | null;
  recurrence_interval?: string | null;
}

/** Monday of the week containing this UTC date. */
const mondayOfUtc = (d: Date): Date => {
  const m = new Date(d);
  m.setUTCDate(m.getUTCDate() - ((m.getUTCDay() + 6) % 7));
  return m;
};

/**
 * ISO dates within [windowStart, windowEnd] on which this pattern has a shift.
 * Mirrors patternDatesInWindow in the lib; the calendar arithmetic is in UTC
 * here, which the runtime is in anyway, so nothing drifts across a clock change.
 */
function patternDatesInWindow(p: PatternWindow, windowStart: string, windowEnd: string): string[] {
  const start = p.start_date > windowStart ? p.start_date : windowStart;
  const end = p.end_date && p.end_date < windowEnd ? p.end_date : windowEnd;
  if (start > end) return [];
  const interval = p.recurrence_interval || "weekly";
  const patternStart = new Date(`${p.start_date}T00:00:00Z`);
  const patternMonday = mondayOfUtc(patternStart);
  const last = new Date(`${end}T00:00:00Z`);
  const dates: string[] = [];
  for (const day = new Date(`${start}T00:00:00Z`); day <= last; day.setUTCDate(day.getUTCDate() + 1)) {
    const iso = day.toISOString().slice(0, 10);
    if (interval === "one_off") {
      if (iso === p.start_date) dates.push(iso);
      continue;
    }
    if (interval === "monthly") {
      if (day.getUTCDate() === patternStart.getUTCDate()) dates.push(iso);
      continue;
    }
    if (interval !== "daily" && !(p.days_of_week || []).includes(day.getUTCDay())) continue;
    if (interval === "biweekly") {
      const weeksDiff = Math.round((mondayOfUtc(day).getTime() - patternMonday.getTime()) / (7 * 86_400_000));
      if (weeksDiff % 2 !== 0) continue;
    }
    dates.push(iso);
  }
  return dates;
}

/** Group patterns by trimmed client name, dropping bench and blank entries. Mirrors patternsByClient in the lib. */
function patternsByClient(patterns: PatternWindow[]): Map<string, PatternWindow[]> {
  const map = new Map<string, PatternWindow[]>();
  for (const p of patterns) {
    const client = (p.client_name || "").trim();
    if (!client || client === BENCH_SENTINEL) continue;
    if (!map.has(client)) map.set(client, []);
    map.get(client)!.push(p);
  }
  return map;
}

/**
 * A client's shift dates during a leave that still need cover: every pattern's
 * dates in the window, less the holiday's no_cover_dates. Empty means no
 * handover for that client — mirrors needsCoverInWindow in the lib.
 */
function clientDatesNeedingCover(patterns: PatternWindow[], windowStart: string, windowEnd: string, noCoverDates: Set<string>): string[] {
  return [...new Set(patterns.flatMap(p => patternDatesInWindow(p, windowStart, windowEnd)))]
    .filter(d => !noCoverDates.has(d))
    .sort();
}

/** The subset of a cover (shift_swap) request needed to scope it to a client. */
interface CoverRequestScope {
  start_date: string;
  end_date: string;
  coverage_metadata: unknown;
}

/**
 * Does this cover request cover the given client? Mirrors coverAppliesToClient
 * in the lib, verbatim.
 *
 * Handovers are segregated per client: when one person's leave spans several
 * clients, each client can have a different cover. Client-scoped requests say
 * so explicitly in coverage_metadata (covered_clients, or shifts[] entries with
 * client_name). Legacy requests only carry dates, so for those we fall back to
 * date overlap with this client's shift dates during the leave.
 */
function coverAppliesToClient(
  req: CoverRequestScope,
  clientName: string,
  clientShiftDates: string[]
): boolean {
  const meta = req.coverage_metadata as {
    covered_dates?: string[];
    covered_clients?: string[];
    shifts?: { date?: string; client_name?: string }[];
  } | null;
  const client = clientName.trim().toLowerCase();

  // Client-scoped metadata wins: explicit covered_clients, or per-shift entries.
  const scopedClients = new Set<string>();
  if (Array.isArray(meta?.covered_clients)) {
    meta!.covered_clients!.forEach(c => { if (c) scopedClients.add(c.trim().toLowerCase()); });
  }
  if (Array.isArray(meta?.shifts)) {
    meta!.shifts!.forEach(s => { if (s?.client_name) scopedClients.add(s.client_name.trim().toLowerCase()); });
  }
  if (scopedClients.size > 0) {
    if (!scopedClients.has(client)) return false;
    // Scoped to this client — still require a date to actually touch it when
    // per-shift dates exist for this client (partial covers).
    if (Array.isArray(meta?.shifts) && meta!.shifts!.some(s => s?.client_name && s?.date)) {
      return meta!.shifts!.some(s =>
        (s.client_name || "").trim().toLowerCase() === client && s.date && clientShiftDates.includes(s.date)
      ) || clientShiftDates.length === 0;
    }
    return true;
  }

  // Legacy date-only requests: covered dates (or the request's date range)
  // touching this client's shift dates.
  const coveredDates = Array.isArray(meta?.covered_dates) && meta!.covered_dates!.length > 0
    ? meta!.covered_dates!
    : null;
  return coveredDates
    ? clientShiftDates.some(d => coveredDates.includes(d))
    : clientShiftDates.some(d => d >= req.start_date && d <= req.end_date);
}

/** A client_handovers row, as this function selects it. */
interface StoredHandoverRow {
  id: string;
  client_name: string;
  kind: string;
  from_user_id: string;
  holiday_id: string | null;
  to_user_id: string | null;
  status: string;
  not_required_reason: string | null;
}

/**
 * Stable identity of a handover, with or without a stored row. Mirrors
 * handoverKey in src/lib/handoverStatus.ts exactly — the tracker matches its
 * ?handover= links against that key — and it starts with the client because
 * one leave at two clients is two handovers.
 */
const handoverKey = (client: string, kind: "leave" | "departure", fromUserId: string, holidayId: string | null, toUserId: string | null): string =>
  `${client.trim()}|${kind}|${fromUserId}|${holidayId ?? ""}|${toUserId ?? ""}`;

/** One handover as the digest sees it: what the rota says exists, with the stored row (if any) laid over it. */
interface DigestHandover {
  /** client_handovers.id once a row exists; null until somebody acts on it. */
  id: string | null;
  key: string;
  client: string;
  toUserId: string | null;
  /** Who it is handed to; null = cover not assigned yet. */
  toName: string | null;
  requirement: "required" | "not_required";
  notRequiredReason: string | null;
  taskCount: number;
  completedCount: number;
  avgProgress: number;
}

interface TaskAgg { count: number; done: number; sum: number }

/** Per-handover task counts. Tasks with no handover are history and are left out. */
function aggregateHandoverTasks(rows: { handover_id: string | null; progress: number | null }[]): Map<string, TaskAgg> {
  const agg = new Map<string, TaskAgg>();
  for (const t of rows) {
    if (!t.handover_id) continue;
    const progress = Number(t.progress) || 0;
    const cur = agg.get(t.handover_id) || { count: 0, done: 0, sum: 0 };
    cur.count += 1;
    cur.sum += progress;
    if (progress >= 100) cur.done += 1;
    agg.set(t.handover_id, cur);
  }
  return agg;
}

function digestHandover(
  key: string, client: string, toUserId: string | null, toName: string | null,
  row: StoredHandoverRow | undefined, tasks: TaskAgg | undefined,
): DigestHandover {
  return {
    id: row?.id ?? null,
    key,
    client,
    toUserId,
    toName,
    requirement: row?.status === "not_required" ? "not_required" : "required",
    notRequiredReason: row?.not_required_reason ?? null,
    taskCount: tasks?.count ?? 0,
    completedCount: tasks?.done ?? 0,
    avgProgress: tasks && tasks.count > 0 ? Math.round(tasks.sum / tasks.count) : 0,
  };
}

/** Complete = required, has tasks, and every task is at 100%. */
const handoverIsComplete = (h: DigestHandover): boolean =>
  h.requirement === "required" && h.taskCount > 0 && h.completedCount === h.taskCount;

/** "ready" / "about 40% done" / "not started" / "not required (reason)". */
const handoverLabel = (h: DigestHandover): string => {
  if (h.requirement === "not_required") return `not required${h.notRequiredReason ? ` (${escapeHtml(h.notRequiredReason)})` : ""}`;
  if (handoverIsComplete(h)) return "ready";
  if (h.taskCount > 0 && h.avgProgress > 0) return `about ${h.avgProgress}% done`;
  return "not started";
};

/** Where one client of a leave stands. Mirrors ClientHandoverStatus in the lib. */
interface ClientReadiness {
  client: string;
  handovers: DigestHandover[];
  /** Every required handover here is complete (and at least one is required). */
  ready: boolean;
  /** Every handover here is marked not required. */
  notRequired: boolean;
}

/**
 * Per-client readiness from a leave's handovers, clients A–Z and, within a
 * client, coverers by name with "cover not assigned yet" last. A leave is
 * ready when every client that isn't marked not required is ready.
 */
function clientReadiness(handovers: DigestHandover[]): ClientReadiness[] {
  const byClient = new Map<string, DigestHandover[]>();
  for (const h of handovers) {
    if (!byClient.has(h.client)) byClient.set(h.client, []);
    byClient.get(h.client)!.push(h);
  }
  return [...byClient.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([client, hs]) => {
      hs.sort((a, b) => (!a.toName !== !b.toName ? (a.toName ? -1 : 1) : (a.toName || "").localeCompare(b.toName || "")));
      const required = hs.filter(h => h.requirement === "required");
      const notRequired = required.length === 0;
      return { client, handovers: hs, ready: !notRequired && required.every(handoverIsComplete), notRequired };
    });
}

/** The client's tracker page, opened on one handover when there is exactly one to open. */
const trackerUrl = (client: string, h?: DigestHandover): string =>
  `${APP_URL}/public/schedule/${encodeURIComponent(client)}${h ? `?handover=${encodeURIComponent(h.id ?? h.key)}` : ""}`;

/**
 * "Springs of Joy → Amaka Ezenwanebe: not started; → Sam George: not required."
 * with a link to the client's tracker. A client with no handover rows at all
 * reads "not started".
 */
const handoverClientLine = (c: ClientReadiness): string => {
  const standing = c.handovers.length > 0
    ? ` → ${c.handovers.map(h => `${h.toName ?? "cover not assigned yet"}: ${handoverLabel(h)}`).join("; → ")}`
    : ": not started";
  const url = trackerUrl(c.client, c.handovers.length === 1 ? c.handovers[0] : undefined);
  return `<strong>${c.client}</strong>${standing}. <a href="${url}" style="color:${BRAND_COLOR};font-weight:600;text-decoration:none;">Open the Handover Tracker for ${c.client}</a>`;
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

    // The digest is one email, so its recipients are the union of the
    // role-configured recipients (notification_settings.recipient_roles) across
    // every enabled alert. Defaults to admins + HR, who manage holidays, cover
    // and schedule changes together.
    const digestRoles = new Set<string>();
    (notificationSettings || []).forEach(s => {
      if (s.is_enabled === false) return;
      const roles: string[] = Array.isArray(s.recipient_roles) ? s.recipient_roles : [];
      roles.forEach(r => digestRoles.add(r));
    });
    if (digestRoles.size === 0) { digestRoles.add("admin"); digestRoles.add("human_resources"); }
    const { data: adminProfiles } = await supabaseClient
      .from("profiles").select("email, display_name").in("role", Array.from(digestRoles));
    const adminRecipients = (adminProfiles || []).filter(p => p.email) as { email: string; display_name: string | null }[];

    const { data: profiles } = await supabaseClient
      .from("profiles").select("user_id, display_name, email");
    const profileMap = new Map(profiles?.map(p => [p.user_id, p.display_name]) || []);
    const emailByUser = new Map(profiles?.filter(p => p.email).map(p => [p.user_id, p.email as string]) || []);
    // "Funmi Otitoju" — falling back to their email, then "Unknown", when the
    // profile has no name, as the tracker does.
    const personName = (userId: string): string => profileMap.get(userId) || emailByUser.get(userId) || "Unknown";

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

    // Who has actually left — celebrations and milestones skip them. The status
    // field has proven unreliable (departed staff still marked "active"), so the
    // end date is the test.
    const { data: endedRows } = await supabaseClient
      .from("hr_profiles")
      .select("user_id, employment_end_date")
      .not("employment_end_date", "is", null);
    const leftUserIds = new Set(
      (endedRows || [])
        .filter((r) => new Date(r.employment_end_date) < today)
        .map((r) => r.user_id)
    );

    // ===== 1. BIRTHDAYS =====
    // Personal email to every current staff member (celebratory, one send per
    // person so nobody sees anyone else's address). Also a line in the digest.
    if (shouldRun("birthday_today")) {
      const { data: onboardingDocs } = await supabaseClient
        .from("staff_onboarding_documents")
        .select("user_id, date_of_birth, full_name")
        .not("date_of_birth", "is", null);

      const todayBirthdays: { userId: string; name: string }[] = [];
      for (const doc of onboardingDocs || []) {
        if (!doc.date_of_birth) continue;
        if (leftUserIds.has(doc.user_id)) continue;
        const dob = new Date(doc.date_of_birth);
        if (dob.getDate() === today.getDate() && dob.getMonth() === today.getMonth()) {
          const name = doc.full_name || profileMap.get(doc.user_id) || null;
          if (!name) {
            // Never announce a nameless "Unknown" — tell an admin instead.
            await alertAdminsOfFailure(RESEND_API_KEY, "Today's birthday announcement", "a staff member whose profile has no name");
            continue;
          }
          todayBirthdays.push({ userId: doc.user_id, name });
        }
      }

      if (todayBirthdays.length > 0 || testType === "birthday_today") {
        const displayItems = todayBirthdays.length > 0
          ? todayBirthdays
          : [{ userId: "test-1", name: "[TEST] John Smith" }, { userId: "test-2", name: "[TEST] Jane Doe" }];
        const names = displayItems.map(b => b.name);
        const birthdayIds = new Set(displayItems.map(b => b.userId));

        // Everyone still employed hears about a birthday — including colleagues
        // on maternity, sick or other leave; only people who have left are skipped.
        const { data: allStaffProfiles } = await supabaseClient
          .from("profiles").select("user_id, email, display_name").neq("role", "client");
        let recipients = (allStaffProfiles || [])
          .filter(p => p.email && !leftUserIds.has(p.user_id)) as { user_id: string; email: string; display_name: string | null }[];
        if (recipients.length === 0) {
          recipients = adminRecipients.map(a => ({ user_id: "", email: a.email, display_name: a.display_name }));
        }

        // Keep subjects around 60 characters — long names fall back to a count.
        const twoNameSubject = names.length === 2 ? `🎂 It's ${names[0]} and ${names[1]}'s birthdays today` : "";
        const teamSubject = names.length === 1
          ? `🎂 It's ${names[0]}'s birthday today`
          : names.length === 2 && twoNameSubject.length <= 60
            ? twoNameSubject
            : `🎂 ${names.length} birthdays at Care Cuddle today`;

        const celebrationImage = `<div style="text-align:center;margin:8px 0 16px;">
          <img src="${BIRTHDAY_IMAGE_URL}" alt="Celebration" width="150" height="150" style="display:inline-block;max-width:100%;" />
        </div>`;

        let anySent = false;
        let lastError: string | undefined;
        if (recipients.length === 0) {
          await alertAdminsOfFailure(RESEND_API_KEY, "Today's birthday announcement", "the team (no staff email addresses were found)");
          lastError = "no recipients";
        }
        for (const p of recipients) {
          const isBirthdayPerson = birthdayIds.has(p.user_id);
          const others = displayItems.filter(b => b.userId !== p.user_id).map(b => b.name);
          const subject = isBirthdayPerson ? "🎂 Happy birthday from Care Cuddle" : teamSubject;
          const headerTitle = isBirthdayPerson ? "Happy birthday! 🎂" : "A birthday to celebrate 🎂";
          const bodyHtml =
            greeting(p.display_name) +
            (isBirthdayPerson
              ? paragraph(`Happy birthday! Everyone at Care Cuddle hopes you have a lovely day.`)
              : paragraph(others.length === 1
                  ? `It's <strong>${others[0]}</strong>'s birthday today — if you get a moment, drop them a message to help them celebrate.`
                  : `It's <strong>${joinNames(others)}</strong>'s birthdays today — if you get a moment, drop them a message to help them celebrate.`)) +
            (isBirthdayPerson && others.length > 0
              ? paragraph(`You share the day with ${joinNames(others)} — happy birthday to them too!`)
              : "") +
            celebrationImage +
            button("Open Care Cuddle", APP_URL);
          const r = await sendOne(
            p.email, subject, headerTitle, bodyHtml,
            "You're receiving this because you're part of the team at Care Cuddle.",
            BIRTHDAY_PINK
          );
          if (r.success) anySent = true;
          else lastError = r.error;
        }
        standaloneResults.push({ type: "birthday_today", emailSent: anySent, error: lastError, title: "Birthdays (all staff)" });

        // Also add to admin digest
        sections.push({
          type: "birthday_today",
          title: "Birthdays today",
          icon: "🎂",
          accentColor: BIRTHDAY_PINK,
          itemsHtml: displayItems.map(b => `It's <strong>${b.name}</strong>'s birthday today.`),
          summary: `${displayItems.length === 1 ? "one" : displayItems.length} today`,
        });
      }
    }

    // ===== 2. WORK ANNIVERSARIES =====
    if (shouldRun("anniversary_today")) {
      const { data: hrProfiles } = await supabaseClient
        .from("hr_profiles")
        .select("user_id, start_date, employment_end_date")
        .not("start_date", "is", null);

      // An anniversary landing on a Saturday or Sunday is held until the next working
      // day, so nobody's milestone is announced to an inbox no one is reading. That
      // means a weekend run reports nothing, and Monday's run covers Saturday and
      // Sunday alongside itself rather than letting them pass unmarked.
      const isWeekend = (d: Date) => d.getDay() === 0 || d.getDay() === 6;
      const datesToCover: Date[] = [];
      if (!isWeekend(today)) {
        datesToCover.push(new Date(today));
        const back = new Date(today);
        back.setDate(back.getDate() - 1);
        while (isWeekend(back)) {
          datesToCover.push(new Date(back));
          back.setDate(back.getDate() - 1);
        }
      }

      const todayAnniversaries: { userId: string; name: string; years: number; on: Date }[] = [];
      for (const hr of hrProfiles || []) {
        if (!hr.start_date) continue;
        // Only people still employed get celebrated: no anniversary once an end
        // date has passed, and none for records whose account no longer exists —
        // a nameless line is worse than no line at all.
        if (hr.employment_end_date && new Date(hr.employment_end_date) < today) continue;
        if (!profileMap.has(hr.user_id)) continue;
        const startDate = new Date(hr.start_date);
        for (const when of datesToCover) {
          if (startDate.getDate() === when.getDate() && startDate.getMonth() === when.getMonth()) {
            const years = when.getFullYear() - startDate.getFullYear();
            if (years > 0) {
              const name = profileMap.get(hr.user_id);
              if (!name) {
                await alertAdminsOfFailure(RESEND_API_KEY, "A work anniversary announcement", "a staff member whose profile has no name");
                break;
              }
              todayAnniversaries.push({ userId: hr.user_id, name, years, on: when });
            }
            break;
          }
        }
      }

      // Personal congratulations to each person on their anniversary — they were
      // previously never told directly, only mentioned in the admin digest.
      let anniversarySent = false;
      let anniversaryError: string | undefined;
      const congratulatedIds = new Set<string>();
      for (const a of todayAnniversaries) {
        const yearsPhrase = a.years === 1 ? "one year" : `${a.years} years`;
        const email = emailByUser.get(a.userId);
        if (!email) {
          await alertAdminsOfFailure(RESEND_API_KEY, `Work anniversary congratulations — ${yearsPhrase} at Care Cuddle`, `${a.name} (no email address on file)`);
          continue;
        }
        const sameDay = a.on.getTime() === today.getTime();
        const bodyHtml =
          greeting(a.name) +
          paragraph(sameDay
            ? `Congratulations — today you've been with Care Cuddle for <strong>${yearsPhrase}</strong>! Thank you for everything you do. 🎉`
            : `Congratulations — on ${niceDate(a.on)} you reached <strong>${yearsPhrase}</strong> with Care Cuddle! Thank you for everything you do. 🎉`) +
          (sameDay ? "" : paragraph(`Sorry this note arrives a little after the day — we don't send emails over the weekend.`)) +
          button("Open Care Cuddle", APP_URL);
        const r = await sendOne(
          email,
          `Happy work anniversary — ${yearsPhrase} at Care Cuddle`,
          "Happy work anniversary!",
          bodyHtml,
          "You're receiving this because it's your work anniversary at Care Cuddle."
        );
        if (r.success) { anniversarySent = true; congratulatedIds.add(a.userId); }
        else anniversaryError = r.error;
      }
      if (todayAnniversaries.length > 0) {
        standaloneResults.push({ type: "anniversary_today", emailSent: anniversarySent, error: anniversaryError, title: "Work anniversaries (personal)" });
      }

      if (todayAnniversaries.length > 0 || testType === "anniversary_today") {
        const display = todayAnniversaries.length > 0
          ? todayAnniversaries
          : [{ userId: "", name: "[TEST] John Smith", years: 3, on: new Date(today) }];
        const deferred = display.filter(a => a.on.getTime() !== today.getTime() && isWeekend(a.on)).length;
        sections.push({
          type: "anniversary_today",
          title: "Work anniversaries",
          icon: "🎉",
          accentColor: "#8b5cf6",
          // Say which day it actually fell on when it wasn't today, so a Monday
          // greeting doesn't read as though the date were wrong. Only claim the
          // person has been emailed when their congratulations actually sent —
          // otherwise ask the admins to pass it on themselves.
          itemsHtml: display.map(a => {
            const yearsPhrase = a.years === 1 ? "one year" : `${a.years} years`;
            const congratulated = todayAnniversaries.length === 0 || congratulatedIds.has(a.userId);
            const tail = congratulated
              ? "They've been congratulated by email."
              : `<span style="color:#ef4444;font-weight:600;">We couldn't email them their congratulations</span> — please pass them on another way.`;
            return isWeekend(a.on)
              ? `<strong>${a.name}</strong> reached ${yearsPhrase} with Care Cuddle on ${niceDate(a.on)}, over the weekend. ${tail}`
              : `<strong>${a.name}</strong> has been with Care Cuddle for ${yearsPhrase} today. ${tail}`;
          }),
          summary: deferred > 0 ? `${display.length} (including ${deferred} from the weekend)` : `${display.length === 1 ? "one" : display.length} today`,
        });
      }
    }

    // ===== 3. UPCOMING APPROVED HOLIDAYS (next 3 months, with cover status) =====
    if (shouldRun("upcoming_holidays")) {
      const horizon = new Date(today);
      horizon.setMonth(horizon.getMonth() + 3);
      const horizonStr = horizon.toISOString().split("T")[0];

      // Sickness is left out: nobody arranges cover for it in advance. This
      // query used to ask for a column that doesn't exist (holiday_type) and
      // swallow the error, so the section was silently empty; a failure is now
      // said in the digest rather than passed off as "nothing coming up".
      const { data: upcomingHolidays, error: upcomingHolidaysError } = await supabaseClient
        .from("staff_holidays")
        .select("id, user_id, start_date, end_date, absence_type, no_cover_dates, no_cover_required")
        .eq("status", "approved")
        .neq("absence_type", "sick")
        .gte("start_date", todayStr)
        .lte("start_date", horizonStr)
        .order("start_date");
      if (upcomingHolidaysError) console.error("Upcoming holidays query failed:", upcomingHolidaysError.message);

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
      if (has || upcomingHolidaysError || testType === "upcoming_holidays") {
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
              const name = profileMap.get(h.user_id) || "A staff member with no name on their profile";
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
              let coverSentence: string;
              if ((h as any).no_cover_required === true || total === 0) coverSentence = `<span style="color:#10b981;font-weight:600;">No cover is needed.</span>`;
              else if (covered === 0) coverSentence = `<span style="color:#ef4444;font-weight:600;">No cover has been arranged yet.</span>`;
              else if (covered >= total) coverSentence = `<span style="color:#10b981;font-weight:600;">Cover is fully arranged.</span>`;
              else coverSentence = `<span style="color:#f59e0b;font-weight:600;">Cover is arranged for ${covered} of the ${total} days.</span>`;
              const when = niceDateRange(h.start_date, h.end_date);
              const daysUntil = Math.ceil((new Date(h.start_date).getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
              // "on holiday", or "on unpaid leave", "on maternity leave" — say which.
              const what = !h.absence_type || h.absence_type === "holiday" ? "holiday" : `${String(h.absence_type).replace(/_/g, " ")} leave`;
              return { sortKey: h.start_date, html: `<strong>${name}</strong> is on ${what} ${when}, starting ${inDays(daysUntil)}. ${coverSentence}` };
            })
          : upcomingHolidaysError
            ? [{ sortKey: "0", html: `<span style="color:#ef4444;font-weight:600;">The list of upcoming holidays couldn't be loaded today</span> (${upcomingHolidaysError.message}) — please check the schedule directly.` }]
            : [{ sortKey: "0", html: `<strong>[TEST] John Smith</strong> is on holiday Monday 25 to Thursday 28 January, starting in 5 days. <span style="color:#f59e0b;font-weight:600;">Cover is arranged for 2 of the 4 days.</span>` }];

        items.sort((a, b) => a.sortKey.localeCompare(b.sortKey));

        sections.push({
          type: "upcoming_holidays",
          title: "Holidays in the next three months",
          icon: "📅",
          accentColor: "#3b82f6",
          itemsHtml: items.map(i => i.html),
          summary: upcomingHolidaysError ? "couldn't be loaded" : `${items.length === 1 ? "one" : items.length} coming up`,
        });
      }
    }

    // ===== 4. REGULAR SHIFTS ENDING SOON (shift patterns expiring) =====
    if (shouldRun("pattern_expiring")) {
      const patternDays = settingsMap.get("pattern_expiring")?.days_before || 14;
      const futureDate = new Date(today);
      futureDate.setDate(futureDate.getDate() + patternDays);
      const futureDateStr = futureDate.toISOString().split("T")[0];

      const { data: expiringPatterns } = await supabaseClient
        .from("recurring_shift_patterns")
        .select("id, user_id, client_name, end_date, start_date, days_of_week, recurrence_interval, shift_type")
        .eq("is_overtime", false)
        .gte("end_date", todayStr)
        .lte("end_date", futureDateStr)
        .order("end_date");

      // One-day cancellations, so a deleted final day doesn't get reported as
      // the last shift.
      const { data: delExc } = (expiringPatterns && expiringPatterns.length > 0)
        ? await supabaseClient
            .from("shift_pattern_exceptions")
            .select("pattern_id, exception_date")
            .eq("exception_type", "deleted")
            .in("pattern_id", expiringPatterns.map((p: any) => p.id))
        : { data: [] as any[] };
      const deletedDays = new Set((delExc || []).map((e: any) => `${e.pattern_id}::${e.exception_date}`));

      // The pattern's end date is just a fence; the last day someone actually
      // works is the latest date inside it that matches the pattern's days and
      // recurrence. A Mon/Wed pattern fenced at a Friday ends, in reality, on
      // the Wednesday — and that's the date worth telling people.
      // Calendar arithmetic in UTC: elapsed-ms division loses a day across BST.
      const lastRealShift = (p: any): string | null => {
        const days = new Set<number>(((p.days_of_week ?? []) as any[]).map(Number));
        const end = new Date(`${p.end_date}T00:00:00Z`);
        const start = p.start_date ? new Date(`${p.start_date}T00:00:00Z`) : null;
        if (isNaN(end.getTime())) return null;
        const interval = p.recurrence_interval || "weekly";
        const mondayOf = (d: Date) => {
          const m = new Date(d);
          m.setUTCDate(m.getUTCDate() - ((m.getUTCDay() + 6) % 7));
          return m;
        };
        const startMonday = start ? mondayOf(start) : null;
        // 10 weeks covers every interval type comfortably.
        for (let i = 0; i < 70; i++) {
          const d = new Date(end);
          d.setUTCDate(d.getUTCDate() - i);
          if (start && d < start) break;
          const iso = d.toISOString().slice(0, 10);
          const dow = d.getUTCDay();
          let matches = false;
          if (interval === "daily") matches = true;
          else if (interval === "weekly" || interval === "one_off") matches = days.has(dow);
          else if (interval === "biweekly") {
            if (days.has(dow) && startMonday) {
              const weeks = Math.round((mondayOf(d).getTime() - startMonday.getTime()) / (7 * 24 * 3600 * 1000));
              matches = weeks % 2 === 0;
            }
          } else if (interval === "monthly") {
            if (days.has(dow) && start) {
              matches = Math.ceil(d.getUTCDate() / 7) === Math.ceil(start.getUTCDate() / 7);
            }
          } else matches = days.has(dow);
          if (matches && !deletedDays.has(`${p.id}::${iso}`)) return iso;
        }
        return null;
      };

      // A one-off shift is a single date, not a pattern. Nothing is "coming to
      // an end" when it passes — it was only ever that one day — so reporting it
      // as a regular shift pattern ending is noise, and it was drowning out the
      // genuine ones. Overtime is already excluded by the query above, since
      // overtime is not a regular pattern either.
      //
      // Identical rows are collapsed too: the same shift recorded twice was
      // being announced twice, to admins and to the person.
      const seenPattern = new Set<string>();
      const regularPatterns = (expiringPatterns ?? []).filter((p: any) => {
        if ((p.recurrence_interval || "weekly") === "one_off") return false;
        const key = [
          p.user_id,
          p.client_name ?? "",
          p.end_date,
          p.recurrence_interval ?? "weekly",
          (p.days_of_week ?? []).join(","),
        ].join("|");
        if (seenPattern.has(key)) return false;
        seenPattern.add(key);
        return true;
      });

      if (regularPatterns.length > 0) {
        // Tell the staff member directly — until now only admins heard, as a
        // digest line, while the person kept planning around shifts that were
        // about to stop. One email as the end date enters the window, then
        // reminders a week and a day before.
        const notifyOffsets = new Set([patternDays, 7, 1]);
        let patternSent = false;
        let patternError: string | undefined;
        for (const p of regularPatterns) {
          const lastDay = lastRealShift(p) ?? p.end_date;
          // Already over: the fence date may still be ahead, but there is no
          // shift left to warn anyone about.
          if (lastDay < todayStr) continue;
          const daysUntil = Math.ceil((new Date(`${lastDay}T00:00:00Z`).getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
          if (!notifyOffsets.has(daysUntil)) continue;
          const name = profileMap.get(p.user_id) || null;
          const email = emailByUser.get(p.user_id);
          const atClient = p.client_name ? ` at ${p.client_name}` : "";
          if (!email) {
            await alertAdminsOfFailure(
              RESEND_API_KEY,
              `Their regular shifts${atClient} — last one on ${niceDate(lastDay)}`,
              `${name || "a staff member with no name on their profile"} (no email address on file)`
            );
            continue;
          }
          const bodyHtml =
            greeting(name) +
            paragraph(`Your last regular shift${atClient} is on <strong>${niceDate(lastDay)}</strong> — after that you won't be scheduled for them.`) +
            paragraph(`If you expected these shifts to carry on, please contact the admin team so they can look into it.`) +
            button("See your schedule", `${APP_URL}/view/schedule`);
          // "in 7 days" keeps the subject short; the exact date is in the body.
          // A very long client name falls back to the plain form.
          const patternSubject = `Your regular shifts${atClient} end ${inDays(daysUntil)}`;
          const r = await sendOne(
            email,
            patternSubject.length <= 60 ? patternSubject : `Your regular shifts end ${inDays(daysUntil)}`,
            "Your regular shifts are ending",
            bodyHtml,
            "You're receiving this because these shifts are on your Care Cuddle schedule."
          );
          if (r.success) patternSent = true;
          else patternError = r.error;
        }
        if (patternSent || patternError) {
          standaloneResults.push({ type: "pattern_expiring", emailSent: patternSent, error: patternError, title: "Regular shifts ending (personal)" });
        }

const endingSoon = regularPatterns
          .map(p => ({ p, lastDay: lastRealShift(p) ?? p.end_date }))
          .filter(({ lastDay }) => lastDay >= todayStr);
        if (endingSoon.length > 0) sections.push({
          type: "pattern_expiring",
          title: `Regular shifts ending in the next ${patternDays} days`,
          icon: "⚠️",
          accentColor: "#f59e0b",
          itemsHtml: endingSoon.map(({ p, lastDay }) => {
            const name = profileMap.get(p.user_id) || "A staff member with no name on their profile";
            const atClient = p.client_name ? ` at ${p.client_name}` : "";
            return `<strong>${name}</strong>'s last regular shift${atClient} is ${niceDate(lastDay)}.`;
          }),
          summary: `${endingSoon.length === 1 ? "one" : endingSoon.length} ending`,
        });
      }
    }

    // ===== 5. HOLIDAYS WHERE THE CLIENT HASN'T BEEN TOLD =====
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
        const items = has
          ? pending.map(r => {
              const name = profileMap.get(r.user_id) || "A staff member with no name on their profile";
              const daysUntil = Math.ceil((new Date(r.start_date).getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
              return `<strong>${name}</strong> starts holiday on ${niceDate(r.start_date)} (${inDays(daysUntil)}) and <span style="color:#ef4444;font-weight:600;">the client hasn't been told yet</span> — please let them know.`;
            })
          : [`<strong>[TEST] John Smith</strong> starts holiday in 3 days and <span style="color:#ef4444;font-weight:600;">the client hasn't been told yet</span> — please let them know.`];

        sections.push({
          type: "holiday_no_client_notification",
          title: "Clients not yet told about holidays",
          icon: "🚨",
          accentColor: "#ef4444",
          itemsHtml: items,
          summary: `${items.length === 1 ? "one" : items.length} to action`,
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

        // The staff_holidays row behind each request (joined by user|start|end):
        // per-day no-cover info, and the id its handovers are stored against.
        const holidayStartDates = [...new Set(holidays.map(h => h.start_date))];
        const { data: holidayRows } = await supabaseClient
          .from("staff_holidays")
          .select("id, user_id, start_date, end_date, no_cover_dates, no_cover_required")
          .eq("status", "approved")
          .in("user_id", holidayUserIds)
          .in("start_date", holidayStartDates);
        const holidayInfoMap = new Map<string, { id: string | null; noCoverDates: Set<string>; noCoverRequired: boolean }>();
        for (const r of holidayRows || []) {
          holidayInfoMap.set(`${r.user_id}|${r.start_date}|${r.end_date}`, {
            id: r.id as string,
            noCoverDates: new Set<string>((r.no_cover_dates as string[] | null) || []),
            noCoverRequired: r.no_cover_required === true,
          });
        }
        const holidayIds = (holidayRows || []).map(r => r.id as string);

        // Approved cover for these people — shift cover offered to them, plus
        // anything explicitly linked to one of these leaves — as the tracker
        // reads it. A departure or sickness row can name a colleague too, and
        // neither is somebody covering a holiday.
        const coverFilter = [`and(request_type.eq.shift_swap,swap_with_user_id.in.(${holidayUserIds.join(",")}))`];
        if (holidayIds.length > 0) coverFilter.push(`linked_holiday_id.in.(${holidayIds.join(",")})`);
        const { data: coverRows } = await supabaseClient
          .from("staff_requests")
          .select("user_id, request_type, swap_with_user_id, linked_holiday_id, coverage_metadata, start_date, end_date")
          .eq("status", "approved")
          .or(coverFilter.join(","));
        const covers = (coverRows || []).filter(c => c.request_type !== "departure" && c.request_type !== "sickness");

        // The handovers already acted on for these leaves — the checklist and
        // any "not required" decision — and where their tasks stand.
        const { data: storedRows } = holidayIds.length > 0
          ? await supabaseClient
              .from("client_handovers")
              .select("id, client_name, kind, from_user_id, holiday_id, to_user_id, status, not_required_reason")
              .in("holiday_id", holidayIds)
          : { data: [] as StoredHandoverRow[] };
        const storedByKey = new Map<string, StoredHandoverRow>(
          ((storedRows || []) as StoredHandoverRow[]).map(s => [handoverKey(s.client_name, "leave", s.from_user_id, s.holiday_id, s.to_user_id), s])
        );
        const storedIds = ((storedRows || []) as StoredHandoverRow[]).map(s => s.id);
        const { data: storedTaskRows } = storedIds.length > 0
          ? await supabaseClient.from("client_handover_tasks").select("handover_id, progress").in("handover_id", storedIds)
          : { data: [] as { handover_id: string | null; progress: number | null }[] };
        const tasksByHandover = aggregateHandoverTasks(storedTaskRows || []);

        const { data: emailProfiles } = await supabaseClient
          .from("profiles").select("user_id, email, display_name");
        const emailMap = new Map(
          emailProfiles?.map(p => [p.user_id, { email: p.email, name: p.display_name }]) || []
        );

        const adminCountdownItems: string[] = [];
        const handoverEscalationItems: string[] = [];

        for (const h of holidays) {
          const daysUntil = Math.round((new Date(h.start_date).getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
          const takerInfo = emailMap.get(h.user_id);
          const takerName = takerInfo?.name || profileMap.get(h.user_id) || "";
          const takerLabel = takerName || "the person going on holiday";
          const when = niceDateRange(h.start_date, h.end_date);
          const timePhrase = inDays(daysUntil);

          const holidayInfo = holidayInfoMap.get(`${h.user_id}|${h.start_date}|${h.end_date}`)
            || { id: null, noCoverDates: new Set<string>(), noCoverRequired: false };
          const holidayDates: string[] = [];
          for (const d = new Date(h.start_date); d <= new Date(h.end_date); d.setDate(d.getDate() + 1)) {
            holidayDates.push(d.toISOString().split("T")[0]);
          }
          const datesNeedingCover = holidayDates.filter(d => !holidayInfo.noCoverDates.has(d));
          const coverNotNeeded = holidayInfo.noCoverRequired || datesNeedingCover.length === 0;

          // Cover for this leave: offered to this person, or linked to it — and
          // never this person covering themselves.
          const leaveCovers = covers.filter(c =>
            (c.swap_with_user_id === h.user_id || (holidayInfo.id !== null && c.linked_holiday_id === holidayInfo.id))
            && c.user_id !== h.user_id);
          const matchingCovers = leaveCovers.filter(c => {
            const dates: string[] = (c.coverage_metadata as any)?.covered_dates || [];
            if (dates.length === 0) return !(c.end_date < h.start_date || c.start_date > h.end_date);
            return dates.some(d => d >= h.start_date && d <= h.end_date);
          });
          // Keep every cover person — including those without an email address,
          // so the digest doesn't wrongly claim "no cover" and so we can alert
          // admins about the ones we couldn't reach.
          const coverPeople = matchingCovers.map(c => {
            const info = emailMap.get(c.user_id);
            const metaDates: string[] = (c.coverage_metadata as any)?.covered_dates || [];
            return {
              id: c.user_id,
              email: info?.email as string | undefined,
              name: (info?.name as string | undefined) || null,
              dates: metaDates.filter(d => d >= h.start_date && d <= h.end_date),
            };
          });
          const coverNames = coverPeople.map(c => c.name).filter(Boolean) as string[];

          // The handovers this leave calls for, as the tracker derives them:
          // for each client the person has shifts at during the leave (less
          // any dates marked no-cover), one handover per colleague whose
          // approved cover touches that client — or one "cover not assigned
          // yet" handover when nobody's does. A stored row supplies the
          // checklist and any "not required" decision; a pair with no row is
          // not started. A no-cover-required holiday needs no handover at all.
          const { data: takerPatterns } = coverNotNeeded
            ? { data: [] as PatternWindow[] }
            : await supabaseClient
                .from("recurring_shift_patterns")
                .select("client_name, days_of_week, start_date, end_date, recurrence_interval")
                .eq("user_id", h.user_id)
                .lte("start_date", h.end_date)
                .or(`end_date.is.null,end_date.gte.${h.start_date}`);
          const handovers: DigestHandover[] = [];
          for (const [client, ps] of patternsByClient((takerPatterns || []) as PatternWindow[]).entries()) {
            const clientDates = clientDatesNeedingCover(ps, h.start_date, h.end_date, holidayInfo.noCoverDates);
            if (clientDates.length === 0) continue; // no shifts, or every one marked no-cover
            const coverers = [...new Set(leaveCovers.filter(c => coverAppliesToClient(c, client, clientDates)).map(c => c.user_id as string))];
            for (const toUserId of coverers.length > 0 ? coverers : [null]) {
              const key = handoverKey(client, "leave", h.user_id, holidayInfo.id, toUserId);
              const row = storedByKey.get(key);
              handovers.push(digestHandover(key, client, toUserId, toUserId ? personName(toUserId) : null, row, row ? tasksByHandover.get(row.id) : undefined));
            }
          }

          // Readiness as the tracker measures it: a handover is complete when
          // it is required, has tasks and every task is at 100%; a client is
          // ready when all its required handovers are complete; clients marked
          // not required drop out; the leave is ready when every client left
          // is ready.
          const clients = clientReadiness(handovers);
          const liveClients = clients.filter(c => !c.notRequired);
          const handoverComplete = liveClients.length > 0 && liveClients.every(c => c.ready);
          const handoverReadyCount = liveClients.filter(c => c.ready).length;
          const multiClient = liveClients.length > 1;
          // Per-client, per-coverer standing, each with a link to the tracker.
          const handoverLines = clients.map(handoverClientLine);

          // Admin digest line — plain sentences, no field notation — with where
          // each handover stands underneath while anything is still outstanding.
          const coverSentence = coverPeople.length > 0
            ? coverNames.length > 0
              ? `${joinNames(coverNames)} ${coverNames.length > 1 ? "are" : "is"} covering.`
              : `Cover has been arranged.`
            : coverNotNeeded
              ? `<span style="color:#10b981;font-weight:600;">No cover is needed.</span>`
              : `<span style="color:#ef4444;font-weight:600;">No cover has been arranged yet.</span>`;
          const handoverSentence = coverNotNeeded
            ? `No handover is needed.`
            : clients.length > 0
              ? liveClients.length === 0
                ? `No handover is needed — it has been marked not required.`
                : handoverComplete
                  ? `<span style="color:#10b981;font-weight:600;">The handover is ready.</span>`
                  : multiClient
                    ? `<span style="color:#ef4444;font-weight:600;">The handover is ready for ${handoverReadyCount} of their ${liveClients.length} clients.</span>`
                    : `<span style="color:#ef4444;font-weight:600;">The handover isn't ready yet.</span>`
              : "";
          const handoverDetail = !coverNotNeeded && liveClients.length > 0 && !handoverComplete ? subListHtml(handoverLines) : "";
          adminCountdownItems.push(
            `<strong>${takerLabel}</strong> starts holiday ${timePhrase}, ${when}. ${coverSentence}${handoverSentence ? ` ${handoverSentence}` : ""}${handoverDetail}`
          );

          // Escalate to admins when leave is imminent (≤3 days) and a handover
          // isn't done, naming each one. Never fires for a no-cover-required
          // holiday (no clients) or when every handover is marked not required.
          if (liveClients.length > 0 && !handoverComplete && daysUntil <= 3) {
            const outstanding = liveClients.flatMap(c => c.handovers
              .filter(hv => hv.requirement === "required" && !handoverIsComplete(hv))
              .map(hv => ({ who: `${c.client}${hv.toName ? ` → ${hv.toName}` : " (cover not assigned yet)"}`, ...hv })));
            const notStarted = outstanding.filter(hv => hv.avgProgress === 0).map(hv => hv.who);
            const inProgressList = outstanding.filter(hv => hv.avgProgress > 0);
            const chunks: string[] = [];
            if (notStarted.length > 0) chunks.push(`the handover${notStarted.length > 1 ? "s" : ""} for ${joinNames(notStarted)} ${notStarted.length > 1 ? "haven't" : "hasn't"} been started yet`);
            for (const hv of inProgressList) chunks.push(`the handover for ${hv.who} is about ${hv.avgProgress}% done`);
            handoverEscalationItems.push(
              `<strong>${takerLabel}</strong> starts holiday ${timePhrase} (${when}) and ${chunks.length > 0 ? chunks.join(", and ") : "their handover isn't finished"}.`
            );
          }

          // NEW: when leave is imminent and no cover exists (and cover is needed),
          // email the admins directly — until now the only person told was the
          // holiday taker, who can't fix it.
          if (!coverNotNeeded && coverPeople.length === 0 && daysUntil <= 3) {
            for (const admin of adminRecipients) {
              const bodyHtml =
                greeting(admin.display_name) +
                paragraph(`<strong>${takerLabel}</strong> starts holiday <strong>${timePhrase}</strong> (${when}) and no cover has been arranged yet.`) +
                paragraph(`Please arrange cover for their shifts, or mark the holiday as not needing cover if that's right.`) +
                button("Open the schedule", `${APP_URL}/view/schedule`);
              await sendOne(
                admin.email,
                `No cover for ${takerLabel}'s holiday — starts ${timePhrase}`,
                "Cover still needed",
                bodyHtml,
                "You're receiving this because you're an admin at Care Cuddle.",
                AMBER
              );
            }
          }

          // Personal email to the staff member on holiday: greeting first, the
          // whole story in one sentence, then cover and handover in plain words.
          if (takerInfo?.email) {
            const anyStarted = liveClients.some(c => c.handovers.some(hv => hv.requirement === "required" && hv.avgProgress > 0));
            const handoverOutstanding = liveClients.length > 0 && !handoverComplete && !coverNotNeeded;

            const bodyParts: string[] = [];
            bodyParts.push(greeting(takerName));
            bodyParts.push(paragraph(`Your holiday starts <strong>${timePhrase}</strong> — ${when}.`));

            if (coverNames.length > 0) {
              bodyParts.push(paragraph(`${joinNames(coverNames)} will cover your shifts while you're away.`));
            } else if (coverPeople.length > 0) {
              bodyParts.push(paragraph(`Cover has been arranged for your shifts while you're away.`));
            } else if (coverNotNeeded) {
              bodyParts.push(paragraph(`No one needs to cover your shifts for this holiday.`));
            } else if (daysUntil <= 3) {
              bodyParts.push(paragraph(`Cover hasn't been arranged yet. We've flagged this to the admin team today — they're sorting it, so you don't need to chase it.`));
            } else {
              bodyParts.push(paragraph(`Cover hasn't been arranged yet. The admin team is arranging it and will confirm who is covering you.`));
            }

            if (coverNotNeeded) {
              bodyParts.push(paragraph(`You don't need to prepare a handover for this holiday.`));
            } else if (clients.length > 0) {
              if (liveClients.length === 0) {
                bodyParts.push(paragraph(`Your handover has been marked as not required, so there's nothing to prepare.`));
              } else if (handoverComplete) {
                bodyParts.push(paragraph(`Your handover is complete — thank you, you're all set.`));
              } else {
                bodyParts.push(paragraph(
                  daysUntil <= 1
                    ? `Your handover still needs finishing before you go — please make it your priority today.`
                    : daysUntil <= 3
                      ? anyStarted
                        ? `Your handover isn't finished yet — please complete it before your holiday starts.`
                        : `Your handover hasn't been started yet — please start it today so everything is covered before you go.`
                      : `Please make sure your handover is finished before your holiday starts.`
                ));
                if (handovers.length > 1) {
                  // One checklist per client — and per colleague covering it.
                  const splitCover = clients.some(c => c.handovers.length > 1);
                  bodyParts.push(paragraph(clients.length > 1 && splitCover
                    ? `Each client — and each colleague covering you there — needs their own handover. Here's where each one stands:`
                    : clients.length > 1
                      ? `Each client needs their own handover. Here's where each one stands:`
                      : `Each colleague covering you needs their own handover. Here's where each one stands:`));
                }
                bodyParts.push(listHtml(handoverLines));
                bodyParts.push(mutedParagraph(`Not sure how the Handover Tracker works? <a href="${HANDOVER_VIDEO_URL}" style="color:${BRAND_COLOR};font-weight:600;">Watch this short video guide</a>.`));
              }
            }

            if (!handoverOutstanding) {
              bodyParts.push(paragraph(`Have a lovely break! 🌴`));
            }

            const takerButton = handoverOutstanding && liveClients.length === 1
              ? button("Open the Handover Tracker", trackerUrl(liveClients[0].client, liveClients[0].handovers.length === 1 ? liveClients[0].handovers[0] : undefined))
              : button("See your schedule", `${APP_URL}/view/schedule`);
            bodyParts.push(takerButton);

            await sendOne(
              takerInfo.email as string,
              handoverOutstanding && daysUntil <= 3
                ? `Your holiday starts ${timePhrase} — please finish your handover`
                : `Your holiday starts ${timePhrase}`,
              "Your holiday is coming up",
              bodyParts.join(""),
              "You're receiving this because you have a holiday booked at Care Cuddle."
            );
          } else {
            // The holiday taker has no email — an admin must know, or the
            // handover chase never reaches them.
            await alertAdminsOfFailure(
              RESEND_API_KEY,
              `Their holiday starts ${timePhrase} (${when}) and they may still have a handover to finish`,
              `${takerName || "a staff member with no name on their profile"} (no email address on file)`
            );
          }

          // Personal emails to each cover person — with their actual covering
          // days when we know them, and the taker's real handover status.
          for (const cover of coverPeople) {
            if (!cover.email) {
              await alertAdminsOfFailure(
                RESEND_API_KEY,
                `They're covering ${takerLabel}'s holiday, ${when}`,
                `${cover.name || "a staff member with no name on their profile"} (no email address on file)`
              );
              continue;
            }
            const coverBodyParts: string[] = [];
            coverBodyParts.push(greeting(cover.name));
            coverBodyParts.push(paragraph(`You're covering <strong>${takerLabel}</strong>'s shifts while they're on holiday ${when} — starting <strong>${timePhrase}</strong>.`));
            if (cover.dates.length > 0) {
              coverBodyParts.push(paragraph(`Your covering days are ${niceDateList(cover.dates)}.`));
            }
            // Only the handovers to this person — the clients they are
            // covering, not every client the taker has.
            const theirClients = clientReadiness(handovers.filter(hv => hv.toUserId === cover.id));
            const theirLive = theirClients.filter(c => !c.notRequired);
            if (theirClients.length > 0) {
              if (theirLive.length === 0) {
                coverBodyParts.push(paragraph(`No handover is needed for the shifts you're covering — it has been marked not required.`));
              } else if (theirLive.every(c => c.ready)) {
                coverBodyParts.push(paragraph(`${takerLabel}'s handover to you is complete — you'll have everything you need.`));
              } else {
                coverBodyParts.push(paragraph(`${takerLabel} is still finishing their handover to you. It's worth checking in with them before the holiday starts, so nothing is missed.`));
                coverBodyParts.push(listHtml(theirClients.map(handoverClientLine)));
                coverBodyParts.push(mutedParagraph(`New to the Handover Tracker? <a href="${HANDOVER_VIDEO_URL}" style="color:${BRAND_COLOR};font-weight:600;">Watch this short video guide</a>.`));
              }
            }
            coverBodyParts.push(button("See your schedule", `${APP_URL}/view/schedule`));
            // A very long taker name would push the subject past ~60 characters,
            // so fall back to the generic form — the body has the full name.
            const namedCoverSubject = `You're covering ${takerName}'s holiday — starts ${timePhrase}`;
            await sendOne(
              cover.email,
              takerName && namedCoverSubject.length <= 60
                ? namedCoverSubject
                : `You're covering a holiday — starts ${timePhrase}`,
              takerName ? `You're covering ${takerName}` : "You're covering a holiday",
              coverBodyParts.join(""),
              "You're receiving this because you're covering a colleague's holiday at Care Cuddle."
            );
          }
        }

        if (adminCountdownItems.length > 0) {
          sections.push({
            type: "holiday_countdown",
            title: "Holidays starting soon",
            icon: "📅",
            accentColor: "#0ea5e9",
            itemsHtml: adminCountdownItems,
            summary: `${adminCountdownItems.length === 1 ? "one" : adminCountdownItems.length} starting soon`,
          });
        }

        if (handoverEscalationItems.length > 0) {
          sections.push({
            type: "handover_not_ready",
            title: "Handovers not ready for upcoming holidays",
            icon: "🚨",
            accentColor: "#ef4444",
            itemsHtml: handoverEscalationItems,
            summary: `${handoverEscalationItems.length === 1 ? "one needs" : `${handoverEscalationItems.length} need`} attention`,
          });
        }
      } else if (testType === "holiday_countdown") {
        sections.push({
          type: "holiday_countdown",
          title: "Holidays starting soon",
          icon: "📅",
          accentColor: "#0ea5e9",
          itemsHtml: [`<strong>[TEST] John Smith</strong> starts holiday tomorrow, ${niceDate(targetDates[0])}. [TEST] Jane Doe is covering.`],
          summary: "one starting soon",
        });
      }
    }

    // ===== 7. UK CLOCK CHANGE REMINDERS =====
    // Personal email to every current staff member (one send per person).
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
          // Everyone still employed needs this — including staff on leave that
          // week, who would otherwise come back to a shifted schedule unwarned.
          const { data: allProfiles } = await supabaseClient
            .from("profiles").select("user_id, email, display_name").neq("role", "client");
          const staffRecipients = (allProfiles || [])
            .filter(p => p.email && !leftUserIds.has(p.user_id)) as { user_id: string; email: string; display_name: string | null }[];

          if (staffRecipients.length === 0 && testType !== "clock_change") {
            await alertAdminsOfFailure(RESEND_API_KEY, "The UK clock change reminder", "the team (no staff email addresses were found)");
            break;
          }

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
          const shift = changeType === "spring_forward" ? "earlier" : "later";
          const exampleTime = changeType === "spring_forward" ? "09:00" : "11:00";
          const dayAfter = new Date(changeDate);
          dayAfter.setDate(dayAfter.getDate() + 1);
          const whenWord = actualDaysUntil === 1 ? "tomorrow" : actualDaysUntil <= 7 ? "this Sunday" : `on ${niceDate(changeDate)}`;
          const targets = staffRecipients.length > 0
            ? staffRecipients
            : adminRecipients.map(a => ({ user_id: "", email: a.email, display_name: a.display_name }));

          let anyClockSent = false;
          let clockError: string | undefined;
          for (const p of targets) {
            const bodyHtml =
              greeting(p.display_name) +
              paragraph(`UK clocks go <strong>${direction} by one hour</strong> on ${niceDate(changeDate)}.`) +
              paragraph(`If you work UK hours from another country, your working day will start <strong>one hour ${shift} by your local time</strong> from ${niceDate(dayAfter)}. For example, if you normally start at 10:00 your local time, you'll start at ${exampleTime} instead.`) +
              paragraph(`Your UK shift times themselves don't change — a shift at 09:00 UK time is still at 09:00 UK time.`) +
              button("See your schedule", `${APP_URL}/view/schedule`);
            const r = await sendOne(
              p.email,
              `UK clocks go ${direction} ${whenWord} — start one hour ${shift}`,
              "The clocks are changing in the UK",
              bodyHtml,
              "You're receiving this because you're part of the team at Care Cuddle."
            );
            if (r.success) anyClockSent = true;
            else clockError = r.error;
          }

          standaloneResults.push({ type: "clock_change", emailSent: anyClockSent, error: clockError, title: `Clock change ${direction}` });

          // Also add admin reference line to digest
          sections.push({
            type: "clock_change",
            title: "UK clock change",
            icon: changeType === "spring_forward" ? "⏰🌸" : "⏰🍂",
            accentColor: "#6366f1",
            itemsHtml: [`UK clocks go <strong>${direction}</strong> by one hour on ${niceDate(changeDate)} (${inDays(actualDaysUntil)}). All staff have been emailed about it.`],
            summary: inDays(actualDaysUntil),
          });

          // One send is enough on every kind of run. Without this, a test run
          // would match all four clock-change dates and email every member of
          // staff the identical broadcast four times.
          break;
        }
      }
    }

    // ===== 8. OUTSTANDING HANDOVERS (per handover) =====
    // Open tasks grouped by the handover they belong to — one person handing
    // one client to one colleague for one leave — for leaves still ahead or
    // under way, and for departures. Tasks from before handovers were kept per
    // leave have no handover; they are history, not something to chase.
    if (shouldRun("outstanding_handovers")) {
      const { data: openTasks } = await supabaseClient
        .from("client_handover_tasks")
        .select("handover_id, progress, target_date")
        .lt("progress", 100)
        .not("handover_id", "is", null);

      const openByHandover = new Map<string, { open: number; latestTarget: string | null }>();
      for (const t of openTasks || []) {
        if (!t.handover_id) continue;
        const cur = openByHandover.get(t.handover_id) || { open: 0, latestTarget: null };
        cur.open += 1;
        if (t.target_date && (!cur.latestTarget || t.target_date > cur.latestTarget)) cur.latestTarget = t.target_date;
        openByHandover.set(t.handover_id, cur);
      }

      const openIds = [...openByHandover.keys()];
      const { data: handoverRows } = openIds.length > 0
        ? await supabaseClient
            .from("client_handovers")
            .select("id, client_name, kind, from_user_id, holiday_id, to_user_id, status, not_required_reason")
            .in("id", openIds)
        : { data: [] as StoredHandoverRow[] };
      // A handover marked not required has nothing outstanding, whatever its tasks say.
      const openHandovers = ((handoverRows || []) as StoredHandoverRow[]).filter(r => r.status !== "not_required");

      // A leave handover matters while its leave is ahead or under way; a
      // departure handover matters until it is done.
      const leaveIds = [...new Set(openHandovers.map(r => r.holiday_id).filter((id): id is string => !!id))];
      const { data: leaveRows } = leaveIds.length > 0
        ? await supabaseClient.from("staff_holidays").select("id, start_date, end_date").in("id", leaveIds).gte("end_date", todayStr)
        : { data: [] as { id: string; start_date: string; end_date: string }[] };
      const leaveById = new Map(((leaveRows || []) as { id: string; start_date: string; end_date: string }[]).map(l => [l.id, l]));
      const leaverIds = [...new Set(openHandovers.filter(r => r.kind === "departure").map(r => r.from_user_id))];
      // Only departures still asked for: once the opt-in is unticked (they are
      // staying, or it was recorded wrongly) the tracker shows the row as
      // history, and this must not keep chasing it every morning.
      const { data: leaverRows } = leaverIds.length > 0
        ? await supabaseClient.from("hr_profiles").select("user_id, employment_end_date").in("user_id", leaverIds)
            .eq("departure_handover_required", true).not("employment_end_date", "is", null)
        : { data: [] as { user_id: string; employment_end_date: string | null }[] };
      const lastDayByLeaver = new Map(((leaverRows || []) as { user_id: string; employment_end_date: string | null }[]).map(l => [l.user_id, l.employment_end_date]));

      type Outstanding = { client: string; from: string; to: string; when: string; leaveDate: string; open: number; latestTarget: string | null };
      const outstanding: Outstanding[] = [];
      for (const r of openHandovers) {
        const counts = openByHandover.get(r.id);
        if (!counts) continue;
        let when: string;
        let leaveDate: string;
        if (r.kind === "departure") {
          const lastDay = lastDayByLeaver.get(r.from_user_id) ?? null;
          if (!lastDay) continue; // the departure handover is no longer asked for: history
          when = `last day ${niceDate(lastDay)}`;
          leaveDate = lastDay;
        } else {
          const leave = r.holiday_id ? leaveById.get(r.holiday_id) : undefined;
          if (!leave) continue; // the leave has passed: history
          when = niceDateRange(leave.start_date, leave.end_date);
          leaveDate = leave.start_date;
        }
        outstanding.push({
          client: r.client_name,
          from: personName(r.from_user_id),
          to: r.to_user_id ? personName(r.to_user_id) : "cover not assigned yet",
          when,
          leaveDate,
          open: counts.open,
          latestTarget: counts.latestTarget,
        });
      }

      const isTest = testType === "outstanding_handovers" && outstanding.length === 0;
      const rows: Outstanding[] = isTest
        ? [
            { client: "[TEST] Comfort", from: "[TEST] John Smith", to: "[TEST] Jane Doe", when: "Monday 25 to Thursday 28 January", leaveDate: "0", open: 2, latestTarget: todayStr },
            { client: "[TEST] Hope", from: "[TEST] John Smith", to: "cover not assigned yet", when: "Monday 25 to Thursday 28 January", leaveDate: "0", open: 1, latestTarget: null },
          ]
        : outstanding;

      if (rows.length > 0) {
        // Ones with target dates first (soonest first), then by when the leave starts.
        rows.sort((a, b) => {
          if (a.latestTarget && b.latestTarget && a.latestTarget !== b.latestTarget) return a.latestTarget.localeCompare(b.latestTarget);
          if (!!a.latestTarget !== !!b.latestTarget) return a.latestTarget ? -1 : 1;
          return a.leaveDate.localeCompare(b.leaveDate) || a.client.localeCompare(b.client);
        });

        const items = rows.map(r => {
          let due = "";
          if (r.latestTarget) {
            due = r.latestTarget < todayStr
              ? `, <span style="color:#ef4444;font-weight:600;">was due by ${niceDate(r.latestTarget)}</span>`
              : r.latestTarget === todayStr
                ? `, <span style="color:#ef4444;font-weight:600;">due today</span>`
                : `, due by ${niceDate(r.latestTarget)}`;
          }
          return `<strong>${r.client}</strong> — ${r.from} → ${r.to} · ${r.when} · ${r.open} open${due}`;
        });

        sections.push({
          type: "outstanding_handovers",
          title: "Handovers still in progress",
          icon: "📋",
          accentColor: "#f59e0b",
          itemsHtml: items,
          summary: `${rows.length === 1 ? "one handover" : `${rows.length} handovers`}`,
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
          .select("step_id, user_id, completed_at")
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
          // An explicit completion row always wins — including admin bulk-marks.
          if (completionSet.has(`${step.id}::${userId}`)) return true;
          if (step.step_type === "training") {
            return trainingUpToDate(userId);
          }
          if (step.step_type === "internal_page" && step.target_page_id) {
            return ackSet.has(`${step.target_page_id}::${userId}`);
          }
          return false;
        };

        // When someone finished, from their most recent completion row. Drives
        // the one-week window: a finished person appears in the digest for a
        // week as a result worth seeing, then stops taking up space.
        const lastCompletionByUser = new Map<string, string>();
        for (const c of completions || []) {
          if (!c.completed_at) continue;
          const prev = lastCompletionByUser.get(c.user_id);
          if (!prev || c.completed_at > prev) lastCompletionByUser.set(c.user_id, c.completed_at);
        }
        const WEEK_MS = 7 * 24 * 3600 * 1000;

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
            const name = profile?.display_name || profileMap.get(userId) || "A staff member with no name on their profile";
            const total = orderedSteps.length;
            const completed = orderedSteps.filter(s => isStepDone(s, userId)).length;
            const nextStep = orderedSteps.find(s => !isStepDone(s, userId));

            // Admin digest line
            if (nextStep) {
              adminItems.push({
                sortKey: completed / total,
                html: `<strong>${name}</strong> has finished ${completed} of ${total} onboarding steps — next is <em>${nextStep.title}</em>.`,
              });
            } else {
              // Finished: celebrate for a week, then stop appearing. Someone
              // complete for months is not news, and marking veterans complete
              // in bulk must not fill the digest with fifty lines.
              const finishedAt = lastCompletionByUser.get(userId);
              const stillNews = !finishedAt || (Date.now() - new Date(finishedAt).getTime()) <= WEEK_MS;
              if (stillNews) {
                adminItems.push({
                  sortKey: 1,
                  html: `<strong>${name}</strong> has finished <span style="color:#10b981;font-weight:600;">all ${total} onboarding steps</span>. 🎉`,
                });
              }
            }

            // Personal daily reminder to the onboarding staff member (only if steps remain).
            if (nextStep) {
              if (profile?.email) {
                const bodyHtml =
                  greeting(profile.display_name) +
                  paragraph(`Your next onboarding step is <strong>${nextStep.title}</strong>.`) +
                  paragraph(completed > 0
                    ? `You've finished ${completed === 1 ? "one" : completed} of the ${total} steps so far — you're getting there!`
                    : `This is the first of ${total} steps — a great place to start.`) +
                  mutedParagraph(`This is an automatic daily reminder. It stops as soon as the step is done.`) +
                  button("Open your onboarding steps", `${APP_URL}/view/hr`);
                await sendOne(
                  profile.email as string,
                  `Your next onboarding step — ${nextStep.title}`,
                  "Your next onboarding step",
                  bodyHtml,
                  "You're receiving this because you're completing your onboarding at Care Cuddle."
                );
              } else {
                await alertAdminsOfFailure(
                  RESEND_API_KEY,
                  `Their next onboarding step (${nextStep.title})`,
                  `${profile?.display_name || profileMap.get(userId) || "a staff member in onboarding"} (no email address on file)`
                );
              }
            }
          }
        }

        const digestItems = isTest && adminItems.length === 0
          ? [`<strong>[TEST] John Smith</strong> has finished 3 of 12 onboarding steps — next is <em>Read the Health &amp; Safety Policy</em>.`]
          : adminItems.sort((a, b) => a.sortKey - b.sortKey).map(i => i.html);

        if (digestItems.length > 0) {
          sections.push({
            type: "onboarding_pending",
            title: "Staff in onboarding",
            icon: "📚",
            accentColor: BRAND_COLOR,
            itemsHtml: digestItems,
            summary: `${digestItems.length === 1 ? "one person" : `${digestItems.length} people`} onboarding`,
          });
        }
      }
    }

    // ===== 10. CONTRACTS AWAITING SIGNATURE =====
    // Staff are chased every morning by notify-pending-contracts. This is the
    // other half of that: who is still outstanding, so somebody can have a word
    // once the emails have plainly stopped working.
    {
      const CHASE_AFTER_DAYS = 7;
      const { data: unsigned } = await supabaseClient
        .from("contracts")
        .select("recipient_name, recipient_email, sent_at, viewed_at")
        .in("status", ["sent", "viewed"])
        .is("signed_at", null);

      if (unsigned && unsigned.length > 0) {
        const rows = unsigned
          .map((c: { recipient_name: string | null; recipient_email: string | null; sent_at: string; viewed_at: string | null }) => ({
            name: c.recipient_name || c.recipient_email || "Unknown",
            days: Math.floor((Date.now() - new Date(c.sent_at).getTime()) / 86_400_000),
            opened: !!c.viewed_at,
          }))
          .sort((a, b) => b.days - a.days);

        const overdue = rows.filter((r) => r.days >= CHASE_AFTER_DAYS);
        const neverOpened = rows.filter((r) => !r.opened);

        const items = rows.map((r) => {
          const waited = r.days === 0 ? "sent today" : `${r.days} day${r.days === 1 ? "" : "s"}`;
          const state = r.opened ? "opened it, not signed" : "hasn't opened it";
          return r.days >= CHASE_AFTER_DAYS
            ? `<strong>${r.name}</strong> — <span style="color:#b45309;font-weight:600;">${waited}</span>, ${state}`
            : `<strong>${r.name}</strong> — ${waited}, ${state}`;
        });

        // The useful signal is buried in a long list, so say it above the list.
        if (overdue.length > 0 || neverOpened.length > 0) {
          const notes: string[] = [];
          if (overdue.length > 0) {
            notes.push(`${overdue.length} ${overdue.length === 1 ? "has" : "have"} been waiting over a week — another email is unlikely to be what does it`);
          }
          if (neverOpened.length > 0) {
            notes.push(`${neverOpened.length} ${neverOpened.length === 1 ? "has" : "have"} never opened it, so it may not be reaching them`);
          }
          items.unshift(`<em>${notes.join("; ")}.</em>`);
        }

        sections.push({
          type: "contracts_unsigned",
          title: "Contracts awaiting signature",
          icon: "✍️",
          accentColor: overdue.length > 0 ? "#b45309" : "#5F17EB",
          itemsHtml: items,
          summary: overdue.length > 0
            ? `${rows.length} unsigned · ${overdue.length} over a week`
            : `${rows.length} unsigned`,
        });
      }
    }

    // ===== 11. QUALITY ASSURANCE CHECKS OUTSTANDING =====
    // One line, not a list. The page is where you find out who — this is only
    // here so nobody has to open the page to learn there is nothing to do.
    //
    // The scope has to match the page exactly or the two disagree in public:
    // Call Monitoring shifts only, no overtime cover, no leavers, running in
    // the next four weeks, counted per client line rather than per person.
    {
      const SCOPE_AHEAD_DAYS = 28;
      const CHECK_DUE_AFTER_DAYS = 14;
      const todayIso = new Date().toISOString().slice(0, 10);
      const horizonIso = new Date(Date.now() + SCOPE_AHEAD_DAYS * 86_400_000).toISOString().slice(0, 10);

      const [{ data: patterns }, { data: qaChecks }, { data: hrEnds }] = await Promise.all([
        supabaseClient.from("recurring_shift_patterns")
          .select("user_id, client_name, shift_type, is_overtime, start_date, end_date, days_of_week"),
        supabaseClient.from("qa_checks")
          .select("staff_user_id, client_name, checked_at").order("checked_at", { ascending: false }),
        supabaseClient.from("hr_profiles").select("user_id, employment_end_date"),
      ]);

      const gone = new Set((hrEnds || [])
        .filter((h: { employment_end_date: string | null }) => h.employment_end_date && h.employment_end_date < todayIso)
        .map((h: { user_id: string }) => h.user_id));

      const lines = new Set<string>();
      for (const p of patterns || []) {
        const pat = p as {
          user_id: string; client_name: string | null; shift_type: string | null;
          is_overtime: boolean | null; start_date: string | null; end_date: string | null;
          days_of_week: number[] | null;
        };
        if (pat.is_overtime) continue;
        if ((pat.shift_type || "").trim().toLowerCase() !== "call monitoring") continue;
        if (gone.has(pat.user_id)) continue;
        if (!pat.days_of_week?.length) continue;
        if (pat.end_date && pat.end_date < todayIso) continue;
        if (pat.start_date && pat.start_date > horizonIso) continue;
        lines.add(`${pat.user_id}|${(pat.client_name || "").trim() || "No client set"}`);
      }

      // Newest first, so the first hit for a line is its last check.
      const lastChecked = new Map<string, string>();
      for (const c of qaChecks || []) {
        const chk = c as { staff_user_id: string; client_name: string | null; checked_at: string };
        const key = `${chk.staff_user_id}|${(chk.client_name || "").trim() || "No client set"}`;
        if (!lastChecked.has(key)) lastChecked.set(key, chk.checked_at);
      }

      let neverChecked = 0;
      let overdue = 0;
      for (const key of lines) {
        const last = lastChecked.get(key);
        if (!last) { neverChecked += 1; continue; }
        const days = Math.floor((Date.now() - new Date(last).getTime()) / 86_400_000);
        if (days >= CHECK_DUE_AFTER_DAYS) overdue += 1;
      }
      const outstanding = neverChecked + overdue;

      if (lines.size > 0) {
        // Said in full even at zero — "nothing outstanding" is the useful
        // version of this line, and a section that vanishes when it is
        // healthy reads as a section that broke.
        const detail = outstanding === 0
          ? `All ${lines.size} monitoring ${lines.size === 1 ? "line is" : "lines are"} checked and in date.`
          : neverChecked > 0 && overdue > 0
            ? `${neverChecked} never checked, ${overdue} overdue.`
            : neverChecked > 0
              ? `${neverChecked === 1 ? "It has" : "They have"} never been checked.`
              : `Last checked over ${CHECK_DUE_AFTER_DAYS} days ago.`;

        sections.push({
          type: "qa_checks_due",
          title: "Quality assurance",
          icon: "\u260E\uFE0F",
          accentColor: outstanding > 0 ? "#b45309" : "#5F17EB",
          itemsHtml: [
            outstanding === 0
              ? `<strong>No checks outstanding.</strong> ${detail}`
              : `<strong>${outstanding} of ${lines.size}</strong> monitoring ${lines.size === 1 ? "line is" : "lines are"} due a call check. ${detail}`,
          ],
          summary: outstanding === 0 ? "all in date" : `${outstanding} due`,
        });
      }
    }

    // ===== 12. DEPARTURE HANDOVERS =====
    // A departure handover is the same shape as a leave one: the leaver hands
    // each client they still hold to whoever takes it on — one handover per
    // successor, each with its own checklist — kept in client_handovers with
    // kind 'departure'. A client with no row for this leaver is not started.
    //
    // Only people whose handover was requested. The digest reaches several
    // admins, and a dismissal is not announced by an email.
    {
      const CHASE_WITHIN_DAYS = 14;
      const todayIso = new Date().toISOString().slice(0, 10);

      const { data: leavers } = await supabaseClient
        .from("hr_profiles")
        .select("user_id, employment_end_date")
        .eq("departure_handover_required", true)
        .not("employment_end_date", "is", null);

      const pending = (leavers ?? []).filter((l: { employment_end_date: string | null }) => l.employment_end_date);
      if (pending.length > 0) {
        const ids = pending.map((l: { user_id: string }) => l.user_id);
        const { data: patterns } = await supabaseClient
          .from("recurring_shift_patterns")
          .select("user_id, client_name, end_date")
          .in("user_id", ids);

        const clientsByUser = new Map<string, Set<string>>();
        for (const p of (patterns ?? []) as Array<{ user_id: string; client_name: string | null; end_date: string | null }>) {
          const name = (p.client_name || "").trim();
          if (!name || name === BENCH_SENTINEL) continue;
          if (p.end_date && p.end_date < todayIso) continue;
          if (!clientsByUser.has(p.user_id)) clientsByUser.set(p.user_id, new Set());
          clientsByUser.get(p.user_id)!.add(name);
        }

        // Their departure handovers — per client and successor — and the tasks on them.
        const { data: departureRows } = await supabaseClient
          .from("client_handovers")
          .select("id, client_name, kind, from_user_id, holiday_id, to_user_id, status, not_required_reason")
          .eq("kind", "departure")
          .in("from_user_id", ids);
        const departures = (departureRows ?? []) as StoredHandoverRow[];
        const { data: departureTasks } = departures.length > 0
          ? await supabaseClient.from("client_handover_tasks").select("handover_id, progress").in("handover_id", departures.map(d => d.id))
          : { data: [] as { handover_id: string | null; progress: number | null }[] };
        const tasksByDeparture = aggregateHandoverTasks(departureTasks ?? []);
        const handoversByLeaver = new Map<string, DigestHandover[]>();
        for (const r of departures) {
          if (!handoversByLeaver.has(r.from_user_id)) handoversByLeaver.set(r.from_user_id, []);
          handoversByLeaver.get(r.from_user_id)!.push(digestHandover(
            handoverKey(r.client_name, "departure", r.from_user_id, null, r.to_user_id), r.client_name, r.to_user_id,
            r.to_user_id ? personName(r.to_user_id) : null, r, tasksByDeparture.get(r.id),
          ));
        }

        const rows: Array<{ name: string; days: number; ready: number; live: number; lines: string[] }> = [];
        for (const l of pending as Array<{ user_id: string; employment_end_date: string }>) {
          const cs = [...(clientsByUser.get(l.user_id) ?? [])].sort((a, b) => a.localeCompare(b));
          if (cs.length === 0) continue;
          // Readiness as the tracker measures it, per client the leaver still
          // holds: a client with no handover row yet is not started; one whose
          // every handover is marked not required drops out; the leaver is done
          // when every client left is ready.
          const known = clientReadiness((handoversByLeaver.get(l.user_id) ?? []).filter(hv => cs.includes(hv.client)));
          const clients: ClientReadiness[] = cs.map(c =>
            known.find(k => k.client === c) ?? { client: c, handovers: [], ready: false, notRequired: false });
          const live = clients.filter(c => !c.notRequired);
          if (live.length === 0 || live.every(c => c.ready)) continue;
          rows.push({
            name: personName(l.user_id),
            days: Math.round((new Date(l.employment_end_date).getTime() - new Date(todayIso).getTime()) / 86_400_000),
            ready: live.filter(c => c.ready).length,
            live: live.length,
            lines: clients.map(handoverClientLine),
          });
        }

        if (rows.length > 0) {
          rows.sort((a, b) => a.days - b.days);
          const pressing = rows.filter(r => r.days <= CHASE_WITHIN_DAYS);
          const items = rows.map(r => {
            const when = r.days < 0 ? `<span style="color:#b91c1c;font-weight:600;">left ${Math.abs(r.days)} day${Math.abs(r.days) === 1 ? "" : "s"} ago</span>`
              : r.days === 0 ? '<span style="color:#b91c1c;font-weight:600;">last day today</span>'
              : r.days <= CHASE_WITHIN_DAYS ? `<span style="color:#b45309;font-weight:600;">${r.days} day${r.days === 1 ? "" : "s"} left</span>`
              : `${r.days} days left`;
            return `<strong>${r.name}</strong> — ${when}, handover ready for ${r.ready} of ${r.live} client${r.live === 1 ? "" : "s"}` +
              subListHtml(r.lines);
          });
          sections.push({
            type: "departure_handovers",
            title: "Departure handovers outstanding",
            icon: "\uD83D\uDCE4",
            accentColor: pressing.length > 0 ? "#b45309" : "#5F17EB",
            itemsHtml: items,
            summary: pressing.length > 0
              ? `${rows.length} outstanding · ${pressing.length} close to leaving`
              : `${rows.length} outstanding`,
          });
        }
      }
    }

    // ===== SEND THE DIGEST =====
    // One email per admin recipient — never one email with every address in to:.
    let digestSent = false;
    let digestError: string | undefined;
    if (sections.length > 0 && adminRecipients.length === 0) {
      // Silent failure is banned: the digest had content but nobody to send to.
      await alertAdminsOfFailure(RESEND_API_KEY, "The daily admin digest", "the admin team (no admin email addresses were found)");
      digestError = "no admin recipients";
    }
    if (sections.length > 0 && adminRecipients.length > 0) {
      const isTestRun = !!testType;
      const subjectCount = sections.length;
      const subject = `${isTestRun ? "[TEST] " : ""}Daily admin digest — ${subjectCount === 1 ? "one update" : `${subjectCount} updates`}`;

      const sectionsHtml = sections.map(s => `
        <div style="margin:0 0 24px;border-left:4px solid ${s.accentColor};padding:4px 0 4px 16px;">
          <h2 style="margin:0 0 8px;font-size:16px;color:#111827;">${s.icon} ${s.title}</h2>
          <ul style="margin:0;padding-left:20px;color:#374151;font-size:15px;line-height:1.6;">
            ${s.itemsHtml.map(i => `<li style="margin-bottom:8px;">${i}</li>`).join("")}
          </ul>
        </div>`).join("");

      for (const admin of adminRecipients) {
        const bodyHtml =
          greeting(admin.display_name) +
          paragraph(`Here's the Care Cuddle admin digest for ${niceDate(today)} — ${sections.length === 1 ? "one update" : `${sections.length} updates`} to look over.`) +
          sectionsHtml +
          button("Open Care Cuddle", APP_URL);
        const r = await sendOne(
          admin.email,
          subject,
          "Your daily admin digest",
          bodyHtml,
          "You're receiving this daily digest because your role at Care Cuddle is set to receive admin alerts. Admins can change what it includes in the notification settings."
        );
        if (r.success) digestSent = true;
        else digestError = r.error;
      }
      if (!digestSent && digestError) {
        await alertAdminsOfFailure(RESEND_API_KEY, "The daily admin digest", `the admin team (sending failed: ${digestError})`);
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
