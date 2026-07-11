import { supabase } from "@/integrations/supabase/client";
import { differenceInCalendarDays } from "date-fns";

// Handover status linked to a specific period of annual leave: "relevant"
// clients are the ones this staff member is actually scheduled for during
// the leave window (via recurring_shift_patterns), not every client they've
// ever worked. One holiday can therefore require SEVERAL handovers — one per
// client — and the overall status only reads "complete" when every one of
// them is done. A client with zero handover tasks recorded counts as
// "not started" — the goal is a confirmed, successful handover, not merely
// the absence of tracked tasks. A holiday marked no_cover_required needs no
// handover at all ("not_required").
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

/** Clients a staff member is scheduled for during a leave window. */
export async function getRelevantClientsForLeave(
  userId: string,
  startDate: string,
  endDate: string
): Promise<string[]> {
  const { data: patterns } = await supabase
    .from("recurring_shift_patterns")
    .select("client_name")
    .eq("user_id", userId)
    .lte("start_date", endDate)
    .or(`end_date.is.null,end_date.gte.${startDate}`);
  return Array.from(
    new Set((patterns || []).map(p => (p.client_name || "").trim()).filter(c => c && c !== BENCH_SENTINEL))
  ).sort((a, b) => a.localeCompare(b));
}

/** Handover status for a single staff member's leave window. */
export async function computeHolidayHandoverStatus(
  userId: string,
  startDate: string,
  endDate: string,
  opts?: { noCoverRequired?: boolean }
): Promise<HolidayHandoverStatus> {
  if (opts?.noCoverRequired) return { status: "not_required", clients: [] };
  const clientNames = await getRelevantClientsForLeave(userId, startDate, endDate);
  if (clientNames.length === 0) return { status: "none", clients: [] };

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
    .select("user_id, client_name, start_date, end_date")
    .in("user_id", userIds);

  const patternsByUser = new Map<string, { client_name: string; start_date: string; end_date: string | null }[]>();
  (allPatterns || []).forEach(p => {
    if (!patternsByUser.has(p.user_id)) patternsByUser.set(p.user_id, []);
    patternsByUser.get(p.user_id)!.push(p);
  });

  const relevantClientsByHoliday = new Map<string, string[]>();
  const allClientNames = new Set<string>();
  for (const h of holidays) {
    if (h.noCoverRequired) {
      relevantClientsByHoliday.set(h.id, []);
      continue;
    }
    const patterns = patternsByUser.get(h.userId) || [];
    const clients = Array.from(new Set(
      patterns
        .filter(p => p.start_date <= h.endDate && (!p.end_date || p.end_date >= h.startDate))
        .map(p => (p.client_name || "").trim())
        .filter(c => c && c !== BENCH_SENTINEL)
    ));
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
    if (h.noCoverRequired) {
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
    .select("user_id, client_name")
    .in("client_name", names)
    .or(`end_date.is.null,end_date.gte.${todayISO}`);

  const userIdsByClient = new Map<string, Set<string>>();
  for (const p of patterns || []) {
    const client = (p.client_name || "").trim();
    if (!client) continue;
    if (!userIdsByClient.has(client)) userIdsByClient.set(client, new Set());
    userIdsByClient.get(client)!.add(p.user_id);
  }

  const allUserIds = Array.from(new Set(Array.from(userIdsByClient.values()).flatMap(s => Array.from(s))));
  if (allUserIds.length === 0) return result;

  const { data: rawHolidays } = await supabase
    .from("staff_holidays")
    .select("user_id, start_date, end_date, no_cover_required")
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

  // Holidays are ordered by start_date ascending, so the first match per user is their soonest.
  const earliestByUser = new Map<string, { start_date: string; end_date: string }>();
  for (const h of holidays) {
    if (!earliestByUser.has(h.user_id)) earliestByUser.set(h.user_id, h);
  }

  const today = new Date(todayISO);
  for (const [client, userIds] of userIdsByClient.entries()) {
    let best: { userId: string; start_date: string; end_date: string } | null = null;
    for (const uid of userIds) {
      const h = earliestByUser.get(uid);
      if (!h) continue;
      if (!best || h.start_date < best.start_date) best = { userId: uid, ...h };
    }
    if (!best) continue;
    const daysUntil = differenceInCalendarDays(new Date(best.start_date), today);
    result.set(client, {
      userId: best.userId,
      staffName: nameByUser.get(best.userId) || "Unknown",
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
    .select("user_id, start_date, end_date, no_cover_required")
    .eq("status", "approved")
    .gte("end_date", todayISO)
    .order("start_date", { ascending: true });
  // No cover required → no handover needed → doesn't create placeholder rows.
  const holidays = (rawHolidays || []).filter(h => !h.no_cover_required);
  if (holidays.length === 0) return result;

  const userIds = Array.from(new Set(holidays.map(h => h.user_id)));
  const { data: patterns } = await supabase
    .from("recurring_shift_patterns")
    .select("user_id, client_name, start_date, end_date")
    .in("user_id", userIds);

  const patternsByUser = new Map<string, { client_name: string; start_date: string; end_date: string | null }[]>();
  (patterns || []).forEach(p => {
    if (!patternsByUser.has(p.user_id)) patternsByUser.set(p.user_id, []);
    patternsByUser.get(p.user_id)!.push(p);
  });

  const { data: profiles } = await supabase
    .from("profiles")
    .select("user_id, display_name, email")
    .in("user_id", userIds);
  const nameByUser = new Map((profiles || []).map(p => [p.user_id, (p.display_name || p.email || "Unknown").trim()]));

  const today = new Date(todayISO);
  // Holidays are ordered by start_date ascending, so the first holiday that
  // touches a given client is that client's soonest — later matches are skipped.
  for (const h of holidays) {
    const userPatterns = patternsByUser.get(h.user_id) || [];
    const clients = new Set(
      userPatterns
        .filter(p => p.start_date <= h.end_date && (!p.end_date || p.end_date >= h.start_date))
        .map(p => (p.client_name || "").trim())
        .filter(c => c && c !== BENCH_SENTINEL)
    );
    const daysUntil = differenceInCalendarDays(new Date(h.start_date), today);
    for (const client of clients) {
      if (result.has(client)) continue;
      result.set(client, {
        userId: h.user_id,
        staffName: nameByUser.get(h.user_id) || "Unknown",
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
