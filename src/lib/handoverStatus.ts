import { supabase } from "@/integrations/supabase/client";
import { differenceInCalendarDays, differenceInWeeks, eachDayOfInterval, format, getDay, parseISO, startOfWeek } from "date-fns";

// Handover status linked to a specific period of annual leave: "relevant"
// clients are the ones this staff member actually has shifts for during the
// leave window (via recurring_shift_patterns), not every client they've
// ever worked. One holiday can therefore require SEVERAL handovers — one per
// client — and the overall status only reads "complete" when every one of
// them is done. A client with zero handover tasks recorded counts as
// "not started" — the goal is a confirmed, successful handover, not merely
// the absence of tracked tasks. A holiday marked no_cover_required needs no
// handover at all ("not_required") — and the same applies per client when
// every one of that client's shift dates in the window is listed in the
// holiday's no_cover_dates.
export type HandoverStatus = "none" | "not_required" | "not_started" | "in_progress" | "complete";

export interface ClientHandoverStatus {
  client: string;
  avgProgress: number;
  taskCount: number;
}

export interface HolidayHandoverStatus {
  status: HandoverStatus;
  clients: ClientHandoverStatus[];
}

const BENCH_SENTINEL = "Care Cuddle";

interface PatternWindow {
  client_name: string | null;
  days_of_week: number[] | null;
  start_date: string;
  end_date: string | null;
  recurrence_interval?: string | null;
}

const PATTERN_WINDOW_COLS = "user_id, client_name, days_of_week, start_date, end_date, recurrence_interval";

/** ISO dates within [windowStart, windowEnd] on which this pattern has a shift. */
function patternDatesInWindow(p: PatternWindow, windowStart: string, windowEnd: string): string[] {
  const start = p.start_date > windowStart ? p.start_date : windowStart;
  const end = p.end_date && p.end_date < windowEnd ? p.end_date : windowEnd;
  if (start > end) return [];
  const interval = p.recurrence_interval || "weekly";
  const patternStart = parseISO(p.start_date);
  const dates: string[] = [];
  for (const day of eachDayOfInterval({ start: parseISO(start), end: parseISO(end) })) {
    const iso = format(day, "yyyy-MM-dd");
    if (interval === "one_off") {
      if (iso === p.start_date) dates.push(iso);
      continue;
    }
    if (interval === "monthly") {
      if (day.getDate() === patternStart.getDate()) dates.push(iso);
      continue;
    }
    if (interval !== "daily" && !(p.days_of_week || []).includes(getDay(day))) continue;
    if (interval === "biweekly") {
      const weeksDiff = differenceInWeeks(startOfWeek(day, { weekStartsOn: 1 }), startOfWeek(patternStart, { weekStartsOn: 1 }));
      if (weeksDiff % 2 !== 0) continue;
    }
    dates.push(iso);
  }
  return dates;
}

/**
 * True if any of these patterns' shift dates in the window still needs cover
 * — i.e. isn't listed in the holiday's no_cover_dates. A client whose every
 * shift during the leave is individually marked no-cover needs no handover.
 */
function needsCoverInWindow(
  patterns: PatternWindow[],
  windowStart: string,
  windowEnd: string,
  noCoverDates: Set<string>
): boolean {
  return patterns.some(p =>
    patternDatesInWindow(p, windowStart, windowEnd).some(d => !noCoverDates.has(d))
  );
}

function overallStatus(clients: ClientHandoverStatus[]): HandoverStatus {
  if (clients.length === 0) return "none";
  const allComplete = clients.every(c => c.taskCount > 0 && c.avgProgress >= 100);
  if (allComplete) return "complete";
  const anyProgress = clients.some(c => c.avgProgress > 0);
  return anyProgress ? "in_progress" : "not_started";
}

function aggregateTasks(
  tasks: { client_name: string; progress: number | null }[],
  clientNames: string[]
): ClientHandoverStatus[] {
  const grouped = new Map<string, { sum: number; count: number }>();
  for (const t of tasks) {
    if (!t.client_name) continue;
    const cur = grouped.get(t.client_name) || { sum: 0, count: 0 };
    cur.sum += t.progress ?? 0;
    cur.count += 1;
    grouped.set(t.client_name, cur);
  }
  return clientNames.map(client => {
    const g = grouped.get(client);
    return { client, avgProgress: g ? Math.round(g.sum / g.count) : 0, taskCount: g ? g.count : 0 };
  });
}

/** Group patterns by trimmed client name, dropping bench/blank entries. */
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
 * Clients a staff member has shifts for during a leave window that still
 * need cover — clients whose every in-window shift date is in noCoverDates
 * are excluded (no cover means no handover for that client).
 */
export async function getRelevantClientsForLeave(
  userId: string,
  startDate: string,
  endDate: string,
  noCoverDates: string[] = []
): Promise<string[]> {
  const { data: patterns } = await supabase
    .from("recurring_shift_patterns")
    .select(PATTERN_WINDOW_COLS)
    .eq("user_id", userId)
    .lte("start_date", endDate)
    .or(`end_date.is.null,end_date.gte.${startDate}`);
  const noCover = new Set(noCoverDates);
  return Array.from(patternsByClient((patterns || []) as PatternWindow[]).entries())
    .filter(([, ps]) => needsCoverInWindow(ps, startDate, endDate, noCover))
    .map(([client]) => client)
    .sort((a, b) => a.localeCompare(b));
}

/** Handover status for a single staff member's leave window. */
export async function computeHolidayHandoverStatus(
  userId: string,
  startDate: string,
  endDate: string,
  opts?: { noCoverRequired?: boolean; noCoverDates?: string[] | null }
): Promise<HolidayHandoverStatus> {
  if (opts?.noCoverRequired) return { status: "not_required", clients: [] };
  const clientNames = await getRelevantClientsForLeave(userId, startDate, endDate, opts?.noCoverDates || []);
  if (clientNames.length === 0) {
    // Distinguish "no clients at all" from "every client's shifts are marked
    // no-cover" so the UI can say handover isn't required rather than N/A.
    if ((opts?.noCoverDates?.length ?? 0) > 0) {
      const anyClients = await getRelevantClientsForLeave(userId, startDate, endDate);
      if (anyClients.length > 0) return { status: "not_required", clients: [] };
    }
    return { status: "none", clients: [] };
  }

  const { data: tasks } = await supabase
    .from("client_handover_tasks")
    .select("client_name, progress")
    .in("client_name", clientNames);

  const clients = aggregateTasks(tasks || [], clientNames);
  return { status: overallStatus(clients), clients };
}

export interface HolidayForHandoverBatch {
  id: string;
  userId: string;
  startDate: string;
  endDate: string;
  /** staff_holidays.no_cover_required — no cover means no handover is needed. */
  noCoverRequired?: boolean;
  /** staff_holidays.no_cover_dates — per-date no-cover; a client whose every
   * in-window shift date is listed needs no handover. */
  noCoverDates?: string[] | null;
}

/**
 * Bulk variant for list views (schedule grid, holiday managers) — avoids N+1
 * queries by fetching all relevant patterns/tasks in two round trips total.
 */
export async function computeHolidayHandoverStatusBatch(
  holidays: HolidayForHandoverBatch[]
): Promise<Map<string, HolidayHandoverStatus>> {
  const result = new Map<string, HolidayHandoverStatus>();
  if (holidays.length === 0) return result;

  const userIds = Array.from(new Set(holidays.map(h => h.userId)));
  const { data: allPatterns } = await supabase
    .from("recurring_shift_patterns")
    .select(PATTERN_WINDOW_COLS)
    .in("user_id", userIds);

  const patternsByUser = new Map<string, (PatternWindow & { user_id: string })[]>();
  ((allPatterns || []) as (PatternWindow & { user_id: string })[]).forEach(p => {
    if (!patternsByUser.has(p.user_id)) patternsByUser.set(p.user_id, []);
    patternsByUser.get(p.user_id)!.push(p);
  });

  const relevantClientsByHoliday = new Map<string, string[]>();
  // Holidays where per-date no-cover wiped out every client — "not required"
  // rather than "no handover needed".
  const allNoCoverHolidayIds = new Set<string>();
  const allClientNames = new Set<string>();
  for (const h of holidays) {
    if (h.noCoverRequired) {
      relevantClientsByHoliday.set(h.id, []);
      continue;
    }
    const byClient = patternsByClient(patternsByUser.get(h.userId) || []);
    const noCover = new Set(h.noCoverDates || []);
    const clients = Array.from(byClient.entries())
      .filter(([, ps]) => needsCoverInWindow(ps, h.startDate, h.endDate, noCover))
      .map(([client]) => client);
    if (clients.length === 0 && noCover.size > 0
      && Array.from(byClient.values()).some(ps => needsCoverInWindow(ps, h.startDate, h.endDate, new Set()))) {
      allNoCoverHolidayIds.add(h.id);
    }
    relevantClientsByHoliday.set(h.id, clients);
    clients.forEach(c => allClientNames.add(c));
  }

  const { data: allTasks } = allClientNames.size > 0
    ? await supabase.from("client_handover_tasks").select("client_name, progress").in("client_name", Array.from(allClientNames))
    : { data: [] as { client_name: string; progress: number | null }[] };

  const tasksByClient = new Map<string, { sum: number; count: number }>();
  (allTasks || []).forEach(t => {
    if (!t.client_name) return;
    const cur = tasksByClient.get(t.client_name) || { sum: 0, count: 0 };
    cur.sum += t.progress ?? 0;
    cur.count += 1;
    tasksByClient.set(t.client_name, cur);
  });

  for (const h of holidays) {
    if (h.noCoverRequired || allNoCoverHolidayIds.has(h.id)) {
      result.set(h.id, { status: "not_required", clients: [] });
      continue;
    }
    const clientNames = relevantClientsByHoliday.get(h.id) || [];
    const clients: ClientHandoverStatus[] = clientNames.map(client => {
      const g = tasksByClient.get(client);
      return { client, avgProgress: g ? Math.round(g.sum / g.count) : 0, taskCount: g ? g.count : 0 };
    });
    result.set(h.id, { status: overallStatus(clients), clients });
  }

  return result;
}

/**
 * "2 of 3 clients ready" — spelled-out multi-client progress. One holiday can
 * need several handovers (one per client the staff member works for), so a
 * bare status label undersells what's outstanding.
 */
export function handoverClientsSummary(s: HolidayHandoverStatus): string | null {
  if (s.clients.length <= 1) return null;
  const ready = s.clients.filter(c => c.taskCount > 0 && c.avgProgress >= 100).length;
  return `${ready} of ${s.clients.length} clients ready`;
}

export interface UpcomingClientLeave {
  userId: string;
  staffName: string;
  staffEmail: string | null;
  startDate: string;
  endDate: string;
  /** 0 = starts today, negative = leave is already underway. */
  daysUntil: number;
  ongoing: boolean;
}

/**
 * For each client, the soonest approved leave (upcoming or already underway)
 * among staff currently scheduled there via recurring_shift_patterns. Used to
 * surface "this handover relates to X's leave" context directly on the
 * per-client tracker, since client_handover_tasks itself has no staff/leave
 * linkage.
 */
export async function getUpcomingLeaveForClients(
  clientNames: string[]
): Promise<Map<string, UpcomingClientLeave>> {
  const names = Array.from(new Set(clientNames.map(c => (c || "").trim()).filter(Boolean)));
  const result = new Map<string, UpcomingClientLeave>();
  if (names.length === 0) return result;

  const todayISO = new Date().toISOString().slice(0, 10);

  const { data: patterns } = await supabase
    .from("recurring_shift_patterns")
    .select(PATTERN_WINDOW_COLS)
    .in("client_name", names)
    .or(`end_date.is.null,end_date.gte.${todayISO}`);

  // Patterns per (user, client) so per-date no-cover can be checked per client.
  const patternsByUserClient = new Map<string, PatternWindow[]>();
  const userIdsByClient = new Map<string, Set<string>>();
  for (const p of ((patterns || []) as (PatternWindow & { user_id: string })[])) {
    const client = (p.client_name || "").trim();
    if (!client) continue;
    if (!userIdsByClient.has(client)) userIdsByClient.set(client, new Set());
    userIdsByClient.get(client)!.add(p.user_id);
    const key = `${p.user_id}|${client}`;
    if (!patternsByUserClient.has(key)) patternsByUserClient.set(key, []);
    patternsByUserClient.get(key)!.push(p);
  }

  const allUserIds = Array.from(new Set(Array.from(userIdsByClient.values()).flatMap(s => Array.from(s))));
  if (allUserIds.length === 0) return result;

  const { data: rawHolidays } = await supabase
    .from("staff_holidays")
    .select("user_id, start_date, end_date, no_cover_required, no_cover_dates")
    .in("user_id", allUserIds)
    .eq("status", "approved")
    .gte("end_date", todayISO)
    .order("start_date", { ascending: true });
  // No cover required → no handover needed → doesn't drive tracker banners.
  const holidays = (rawHolidays || []).filter(h => !h.no_cover_required);
  if (holidays.length === 0) return result;

  const { data: profiles } = await supabase
    .from("profiles")
    .select("user_id, display_name, email")
    .in("user_id", Array.from(new Set(holidays.map(h => h.user_id))));
  const nameByUser = new Map((profiles || []).map(p => [p.user_id, (p.display_name || p.email || "Unknown").trim()]));
  const emailByUser = new Map((profiles || []).map(p => [p.user_id, p.email || null]));

  const holidaysByUser = new Map<string, { start_date: string; end_date: string; no_cover_dates: string[] | null }[]>();
  for (const h of holidays) {
    if (!holidaysByUser.has(h.user_id)) holidaysByUser.set(h.user_id, []);
    holidaysByUser.get(h.user_id)!.push(h);
  }

  const today = new Date(todayISO);
  for (const [client, userIds] of userIdsByClient.entries()) {
    let best: { userId: string; start_date: string; end_date: string } | null = null;
    for (const uid of userIds) {
      const clientPatterns = patternsByUserClient.get(`${uid}|${client}`) || [];
      // Holidays are start_date ascending — first one where this client's
      // shifts still need cover is that user's soonest relevant leave.
      const h = (holidaysByUser.get(uid) || []).find(hol =>
        needsCoverInWindow(clientPatterns, hol.start_date, hol.end_date, new Set(hol.no_cover_dates || []))
      );
      if (!h) continue;
      if (!best || h.start_date < best.start_date) best = { userId: uid, start_date: h.start_date, end_date: h.end_date };
    }
    if (!best) continue;
    const daysUntil = differenceInCalendarDays(new Date(best.start_date), today);
    result.set(client, {
      userId: best.userId,
      staffName: nameByUser.get(best.userId) || "Unknown",
      staffEmail: emailByUser.get(best.userId) ?? null,
      startDate: best.start_date,
      endDate: best.end_date,
      daysUntil,
      ongoing: daysUntil < 0,
    });
  }

  return result;
}

/** Single-client convenience wrapper around {@link getUpcomingLeaveForClients}. */
export async function getUpcomingLeaveForClient(clientName: string): Promise<UpcomingClientLeave | null> {
  const map = await getUpcomingLeaveForClients([clientName]);
  return map.get(clientName.trim()) ?? null;
}

/**
 * Same as {@link getUpcomingLeaveForClients} but scans every approved
 * upcoming/ongoing leave rather than being scoped to a known client list —
 * used to surface clients with pending leave whose handover hasn't been
 * initiated at all yet (so they'd never appear in a client_handover_tasks-
 * driven list).
 */
export async function getUpcomingLeaveByAllClients(): Promise<Map<string, UpcomingClientLeave>> {
  const result = new Map<string, UpcomingClientLeave>();
  const todayISO = new Date().toISOString().slice(0, 10);

  const { data: rawHolidays } = await supabase
    .from("staff_holidays")
    .select("user_id, start_date, end_date, no_cover_required, no_cover_dates")
    .eq("status", "approved")
    .gte("end_date", todayISO)
    .order("start_date", { ascending: true });
  // No cover required → no handover needed → doesn't create placeholder rows.
  const holidays = (rawHolidays || []).filter(h => !h.no_cover_required);
  if (holidays.length === 0) return result;

  const userIds = Array.from(new Set(holidays.map(h => h.user_id)));
  const { data: patterns } = await supabase
    .from("recurring_shift_patterns")
    .select(PATTERN_WINDOW_COLS)
    .in("user_id", userIds);

  const patternsByUser = new Map<string, (PatternWindow & { user_id: string })[]>();
  ((patterns || []) as (PatternWindow & { user_id: string })[]).forEach(p => {
    if (!patternsByUser.has(p.user_id)) patternsByUser.set(p.user_id, []);
    patternsByUser.get(p.user_id)!.push(p);
  });

  const { data: profiles } = await supabase
    .from("profiles")
    .select("user_id, display_name, email")
    .in("user_id", userIds);
  const nameByUser = new Map((profiles || []).map(p => [p.user_id, (p.display_name || p.email || "Unknown").trim()]));
  const emailByUser = new Map((profiles || []).map(p => [p.user_id, p.email || null]));

  const today = new Date(todayISO);
  // Holidays are ordered by start_date ascending, so the first holiday that
  // touches a given client is that client's soonest — later matches are
  // skipped. Clients whose every in-window shift date is marked no-cover
  // don't need a handover for that holiday.
  for (const h of holidays) {
    const byClient = patternsByClient(patternsByUser.get(h.user_id) || []);
    const noCover = new Set((h.no_cover_dates as string[] | null) || []);
    const daysUntil = differenceInCalendarDays(new Date(h.start_date), today);
    for (const [client, ps] of byClient.entries()) {
      if (result.has(client)) continue;
      if (!needsCoverInWindow(ps, h.start_date, h.end_date, noCover)) continue;
      result.set(client, {
        userId: h.user_id,
        staffName: nameByUser.get(h.user_id) || "Unknown",
        staffEmail: emailByUser.get(h.user_id) ?? null,
        startDate: h.start_date,
        endDate: h.end_date,
        daysUntil,
        ongoing: daysUntil < 0,
      });
    }
  }

  return result;
}

export const HANDOVER_STATUS_LABEL: Record<HandoverStatus, string> = {
  none: "No handover needed",
  not_required: "Not required — no cover needed",
  not_started: "Not started",
  in_progress: "In progress",
  complete: "Complete",
};

export const HANDOVER_STATUS_TONE: Record<HandoverStatus, "success" | "warning" | "danger" | "neutral"> = {
  none: "neutral",
  not_required: "neutral",
  not_started: "danger",
  in_progress: "warning",
  complete: "success",
};
