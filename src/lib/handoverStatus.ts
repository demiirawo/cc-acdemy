import { supabase } from "@/integrations/supabase/client";
import { differenceInCalendarDays, differenceInWeeks, eachDayOfInterval, format, getDay, parseISO, startOfWeek } from "date-fns";

/**
 * HANDOVERS.
 *
 * A handover is one person handing ONE client to ONE colleague for ONE leave:
 * Funmi → Mercy at Springs of Joy for 22–29 September. A holiday split between
 * two coverers is two handovers, each with its own checklist, progress and
 * "not required" decision; a person with two upcoming holidays has two sets.
 * A departure is the same shape, with the leaver's last day as the window and
 * whoever takes the client on as the recipient.
 *
 * Which handovers EXIST is worked out from the rota and the cover requests,
 * not typed in: every approved leave still ahead, the clients that person has
 * shifts at during it (patterns), and the approved covers scoped to each
 * client. A client_handovers row is only written once somebody acts on one —
 * adds a task, or marks it not required — and holds the checklist and the
 * decision. So a handover can be shown before anyone has touched it, and a
 * row whose leave or cover has since gone is shown as stale rather than
 * silently kept alive.
 *
 * The tracker page, the dashboard card, the staff member's own profile, the
 * request page and the leave lists all read from here, so they cannot
 * disagree about what a handover is or whether it is done.
 */

// Handover status linked to a specific period of annual leave: "relevant"
// clients are the ones this staff member actually has shifts for during the
// leave window (via recurring_shift_patterns), not every client they've
// ever worked. One holiday can therefore require SEVERAL handovers — one per
// client, and per coverer within a client — and the overall status only
// reads "complete" when every one of them is done or marked not required. A
// handover with zero tasks recorded counts as "not started" — the goal is a
// confirmed, successful handover, not merely the absence of tracked tasks. A
// holiday marked no_cover_required needs no handover at all ("not_required"),
// and the same applies per client when every one of that client's shift dates
// in the window is listed in the holiday's no_cover_dates.
export type HandoverStatus = "none" | "not_required" | "not_started" | "in_progress" | "complete";

export type HandoverKind = "leave" | "departure";
export type HandoverRequirement = "required" | "not_required";

export interface HandoverParty {
  userId: string;
  name: string;
  email: string | null;
}

/** One handover: a person hands one client to one colleague for one leave. */
export interface ClientHandover {
  /** Stable identity, with or without a stored row. See {@link handoverKey}. */
  key: string;
  /** client_handovers.id once a row exists; null until somebody acts on it. */
  id: string | null;
  client: string;
  kind: HandoverKind;
  /** The person on leave, or leaving. */
  from: HandoverParty;
  /** Who it is handed to. null = no cover assigned yet. */
  to: HandoverParty | null;
  holidayId: string | null;
  startDate: string;
  endDate: string;
  /** 0 = starts today, negative = the leave is already under way. */
  daysUntil: number;
  ongoing: boolean;
  requirement: HandoverRequirement;
  notRequiredReason: string | null;
  /**
   * true = the rota and cover requests say this handover exists now. false =
   * only a stored row says so: the leave has passed, or the cover was changed,
   * so the checklist is history (or needs moving to whoever covers now).
   */
  derived: boolean;
  taskCount: number;
  completedCount: number;
  avgProgress: number;
  latestTargetDate: string | null;
  /** This client's shift dates in the window that this coverer covers. */
  coveredDates: string[];
}

/** The handovers of one leave (or departure), for grouping on screen. */
export interface LeaveHandoverGroup {
  key: string;
  kind: HandoverKind;
  from: HandoverParty;
  holidayId: string | null;
  startDate: string;
  endDate: string;
  daysUntil: number;
  ongoing: boolean;
  handovers: ClientHandover[];
}

export interface ClientHandoverStatus {
  client: string;
  /** Mean progress across this client's required handovers (0 when none). */
  avgProgress: number;
  /** Tasks across this client's required handovers. */
  taskCount: number;
  /** Every required handover here is complete (and at least one is required). */
  ready: boolean;
  /** Every handover here is marked not required. */
  notRequired: boolean;
  handovers: ClientHandover[];
}

export interface HolidayHandoverStatus {
  status: HandoverStatus;
  clients: ClientHandoverStatus[];
}

const BENCH_SENTINEL = "Care Cuddle";

export interface PatternWindow {
  client_name: string | null;
  days_of_week: number[] | null;
  start_date: string;
  end_date: string | null;
  recurrence_interval?: string | null;
}

export const PATTERN_WINDOW_COLS = "user_id, client_name, days_of_week, start_date, end_date, recurrence_interval";

type UserPattern = PatternWindow & { user_id: string | null };

/** ISO dates within [windowStart, windowEnd] on which this pattern has a shift. */
export function patternDatesInWindow(p: PatternWindow, windowStart: string, windowEnd: string): string[] {
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

/** The subset of a cover (shift_swap) request needed to scope it to a client. */
export interface CoverRequestScope {
  start_date: string;
  end_date: string;
  coverage_metadata: unknown;
}

/**
 * Does this cover request cover the given client?
 *
 * Handovers are segregated per client: when one person's leave spans several
 * clients, each client can have a different cover. Client-scoped requests say
 * so explicitly in coverage_metadata (covered_clients, or shifts[] entries with
 * client_name). Legacy requests only carry dates, so for those we fall back to
 * date overlap with this client's shift dates during the leave.
 */
export function coverAppliesToClient(
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

/** The dates of this client's shifts that one cover request actually covers. */
function datesCoveredForClient(req: CoverRequestScope, clientName: string, clientShiftDates: string[]): string[] {
  const meta = req.coverage_metadata as {
    covered_dates?: string[];
    shifts?: { date?: string; client_name?: string }[];
  } | null;
  const client = clientName.trim().toLowerCase();
  if (Array.isArray(meta?.shifts) && meta!.shifts!.some(s => s?.client_name && s?.date)) {
    const scoped = new Set(meta!.shifts!
      .filter(s => (s.client_name || "").trim().toLowerCase() === client && s.date)
      .map(s => s.date as string));
    return clientShiftDates.filter(d => scoped.has(d));
  }
  const coveredDates = Array.isArray(meta?.covered_dates) && meta!.covered_dates!.length > 0
    ? new Set(meta!.covered_dates!)
    : null;
  return clientShiftDates.filter(d => coveredDates ? coveredDates.has(d) : d >= req.start_date && d <= req.end_date);
}

// ---------------------------------------------------------------------------
// Working out which handovers exist
// ---------------------------------------------------------------------------

/**
 * A leave (or departure) window that may need handing over. Built by the
 * entry points below from staff_holidays / hr_profiles, then turned into
 * handovers by {@link buildHandovers}.
 */
interface LeaveWindow {
  /** The staff_holidays id, or `departure:<user>` for a leaver. */
  windowId: string;
  kind: HandoverKind;
  holidayId: string | null;
  userId: string;
  start: string;
  end: string;
  noCoverRequired: boolean;
  noCoverDates: Set<string>;
}

interface CoverRow {
  user_id: string;
  request_type: string;
  swap_with_user_id: string | null;
  linked_holiday_id: string | null;
  start_date: string;
  end_date: string;
  coverage_metadata: unknown;
}

interface StoredHandover {
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
 * Stable identity of a handover, with or without a stored row: the same five
 * things the database's unique index is on. The client is part of it — one
 * leave at two clients is two handovers.
 */
export function handoverKey(client: string, kind: HandoverKind, fromUserId: string, holidayId: string | null, toUserId: string | null): string {
  return `${client.trim()}|${kind}|${fromUserId}|${holidayId ?? ""}|${toUserId ?? ""}`;
}

const todayIso = () => format(new Date(), "yyyy-MM-dd");

function toWindow(h: {
  id: string; user_id: string; start_date: string; end_date: string;
  no_cover_required: boolean | null; no_cover_dates: string[] | null;
}): LeaveWindow {
  return {
    windowId: h.id,
    kind: "leave",
    holidayId: h.id,
    userId: h.user_id,
    start: h.start_date,
    end: h.end_date,
    noCoverRequired: !!h.no_cover_required,
    noCoverDates: new Set(h.no_cover_dates || []),
  };
}

const HOLIDAY_COLS = "id, user_id, start_date, end_date, absence_type, no_cover_required, no_cover_dates";

/**
 * Approved leaves still ahead or under way that could need a handover.
 * Sickness never does — nobody hands over for it — and a leave marked
 * no-cover-required is kept (its status reads "not required") only when asked.
 */
async function upcomingLeaveWindows(opts: { userIds?: string[]; keepNoCoverRequired?: boolean }): Promise<LeaveWindow[]> {
  if (opts.userIds && opts.userIds.length === 0) return [];
  let q = supabase
    .from("staff_holidays")
    .select(HOLIDAY_COLS)
    .eq("status", "approved")
    .gte("end_date", todayIso())
    .neq("absence_type", "sick")
    .order("start_date", { ascending: true });
  if (opts.userIds) q = q.in("user_id", opts.userIds);
  const { data } = await q;
  return (data || [])
    .filter(h => opts.keepNoCoverRequired || !h.no_cover_required)
    .map(h => toWindow(h as Parameters<typeof toWindow>[0]));
}

/**
 * Leavers whose departure handover was requested. A last day is a leave
 * window that never ends. Anonymous readers (the client's public page) cannot
 * see hr_profiles, and get none; the tracker there simply shows no departures.
 */
async function departureWindows(opts: { userIds?: string[] }): Promise<LeaveWindow[]> {
  if (opts.userIds && opts.userIds.length === 0) return [];
  let q = supabase
    .from("hr_profiles")
    .select("user_id, employment_end_date")
    .eq("departure_handover_required", true)
    .not("employment_end_date", "is", null);
  if (opts.userIds) q = q.in("user_id", opts.userIds);
  const { data } = await q;
  return (data || [])
    .filter(l => l.employment_end_date)
    .map(l => ({
      windowId: `departure:${l.user_id}`,
      kind: "departure" as const,
      holidayId: null,
      userId: l.user_id,
      start: l.employment_end_date as string,
      end: l.employment_end_date as string,
      noCoverRequired: false,
      noCoverDates: new Set<string>(),
    }));
}

/** A leave that still needs handing over, or has passed but whose handover rows remain. */
export interface WindowBuildResult {
  handovers: ClientHandover[];
  /** windowId → whether the person had any client shifts in the window at all (before no-cover dates). */
  hadClients: Map<string, boolean>;
}

/**
 * Turn leave windows into handovers: for each window, the clients the person
 * has shifts at that still need cover, and for each client the colleagues
 * whose approved cover touches it — one handover per (client, coverer), or one
 * "cover not assigned yet" handover when nobody covers it. Then stored rows
 * (the checklist and any "not required" decision) are laid over the top.
 *
 * `clientFilter` limits which clients are produced (the per-client tracker);
 * the windows themselves are whatever the caller chose.
 */
async function buildHandovers(
  windows: LeaveWindow[],
  opts: { clientFilter?: Set<string>; includeStale?: boolean } = {},
): Promise<WindowBuildResult> {
  const hadClients = new Map<string, boolean>();
  if (windows.length === 0 && !opts.includeStale) return { handovers: [], hadClients };

  const today = todayIso();
  const userIds = Array.from(new Set(windows.map(w => w.userId)));

  // The person's patterns, at every client (the filter is applied per window).
  const { data: patternRows } = userIds.length > 0
    ? await supabase.from("recurring_shift_patterns").select(PATTERN_WINDOW_COLS).in("user_id", userIds)
    : { data: [] as UserPattern[] };
  const patternsByUser = new Map<string, PatternWindow[]>();
  for (const p of (patternRows || []) as UserPattern[]) {
    if (!p.user_id) continue;
    if (!patternsByUser.has(p.user_id)) patternsByUser.set(p.user_id, []);
    patternsByUser.get(p.user_id)!.push(p);
  }

  // Approved covers for these people, and anything explicitly linked to these
  // leaves. Only shift cover counts: a departure row also names a colleague in
  // swap_with_user_id (the successor), and an overtime row can too, and
  // neither is somebody covering this leave.
  const holidayIds = windows.map(w => w.holidayId).filter((id): id is string => !!id);
  const orParts: string[] = [];
  if (userIds.length > 0) orParts.push(`and(request_type.eq.shift_swap,swap_with_user_id.in.(${userIds.join(",")}))`);
  if (holidayIds.length > 0) orParts.push(`linked_holiday_id.in.(${holidayIds.join(",")})`);
  const { data: coverRows } = orParts.length > 0
    ? await supabase
        .from("staff_requests")
        .select("user_id, request_type, swap_with_user_id, linked_holiday_id, start_date, end_date, coverage_metadata")
        .eq("status", "approved")
        .or(orParts.join(","))
    : { data: [] as CoverRow[] };
  const covers = ((coverRows || []) as CoverRow[]).filter(r => r.request_type !== "departure" && r.request_type !== "sickness");

  // Who takes a leaver's clients on: whoever has a pattern there that starts
  // after the last day. The rota records the succession, so nobody types it twice.
  const departures = windows.filter(w => w.kind === "departure");
  const successorsByClient = new Map<string, Set<string>>();
  if (departures.length > 0) {
    const leaverClients = Array.from(new Set(departures.flatMap(w =>
      Array.from(patternsByClient(patternsByUser.get(w.userId) || []).keys()))));
    const earliestLastDay = departures.map(w => w.end).sort()[0];
    const { data: successorRows } = leaverClients.length > 0
      ? await supabase
          .from("recurring_shift_patterns")
          .select("user_id, client_name, start_date")
          .in("client_name", leaverClients)
          .gt("start_date", earliestLastDay)
      : { data: [] as { user_id: string | null; client_name: string | null; start_date: string }[] };
    for (const r of successorRows || []) {
      const client = (r.client_name || "").trim();
      if (!client || !r.user_id) continue;
      if (!successorsByClient.has(client)) successorsByClient.set(client, new Set());
      successorsByClient.get(client)!.add(`${r.user_id}|${r.start_date}`);
    }
  }

  // Derive.
  interface Derived {
    window: LeaveWindow; client: string; toUserId: string | null; coveredDates: string[];
  }
  const derived: Derived[] = [];
  for (const w of windows) {
    const byClient = patternsByClient(patternsByUser.get(w.userId) || []);
    let anyClient = false;
    for (const [client, ps] of byClient.entries()) {
      if (opts.clientFilter && !opts.clientFilter.has(client)) continue;
      const windowStart = w.kind === "departure" ? (today < w.end ? today : w.end) : w.start;
      const allDates = Array.from(new Set(ps.flatMap(p => patternDatesInWindow(p, windowStart, w.end))));
      if (allDates.length === 0) continue;
      anyClient = true;
      const clientDates = allDates.filter(d => !w.noCoverDates.has(d)).sort();
      if (clientDates.length === 0) continue; // every shift marked no-cover

      if (w.kind === "departure") {
        const successors = Array.from(successorsByClient.get(client) || [])
          .map(s => ({ userId: s.split("|")[0], start: s.split("|")[1] }))
          .filter(s => s.userId !== w.userId && s.start > w.end)
          .map(s => s.userId);
        const unique = Array.from(new Set(successors));
        if (unique.length === 0) derived.push({ window: w, client, toUserId: null, coveredDates: clientDates });
        for (const uid of unique) derived.push({ window: w, client, toUserId: uid, coveredDates: clientDates });
        continue;
      }

      const forThisLeave = covers.filter(r =>
        (r.swap_with_user_id === w.userId || r.linked_holiday_id === w.holidayId)
        && r.user_id !== w.userId
        && coverAppliesToClient(r, client, clientDates));
      const datesByCoverer = new Map<string, Set<string>>();
      for (const r of forThisLeave) {
        if (!datesByCoverer.has(r.user_id)) datesByCoverer.set(r.user_id, new Set());
        datesCoveredForClient(r, client, clientDates).forEach(d => datesByCoverer.get(r.user_id)!.add(d));
      }
      if (datesByCoverer.size === 0) {
        derived.push({ window: w, client, toUserId: null, coveredDates: clientDates });
      }
      for (const [uid, dates] of datesByCoverer.entries()) {
        derived.push({ window: w, client, toUserId: uid, coveredDates: Array.from(dates).sort() });
      }
    }
    hadClients.set(w.windowId, anyClient);
  }

  // Stored rows: for these leaves and leavers, plus — for a per-client page —
  // every row at the client, so stale ones can be shown and cleaned up.
  const storedQueries: Promise<{ data: StoredHandover[] | null }>[] = [];
  if (holidayIds.length > 0) {
    storedQueries.push(supabase.from("client_handovers").select("*").in("holiday_id", holidayIds) as unknown as Promise<{ data: StoredHandover[] | null }>);
  }
  const leaverIds = departures.map(w => w.userId);
  if (leaverIds.length > 0) {
    storedQueries.push(supabase.from("client_handovers").select("*").eq("kind", "departure").in("from_user_id", leaverIds) as unknown as Promise<{ data: StoredHandover[] | null }>);
  }
  if (opts.includeStale && opts.clientFilter && opts.clientFilter.size > 0) {
    storedQueries.push(supabase.from("client_handovers").select("*").in("client_name", Array.from(opts.clientFilter)) as unknown as Promise<{ data: StoredHandover[] | null }>);
  }
  const storedById = new Map<string, StoredHandover>();
  for (const { data } of await Promise.all(storedQueries)) {
    for (const row of data || []) storedById.set(row.id, row);
  }
  const stored = Array.from(storedById.values());
  const storedByKey = new Map(stored.map(s => [handoverKey(s.client_name, s.kind as HandoverKind, s.from_user_id, s.holiday_id, s.to_user_id), s]));

  // Tasks per stored handover.
  const storedIds = stored.map(s => s.id);
  const { data: taskRows } = storedIds.length > 0
    ? await supabase.from("client_handover_tasks").select("handover_id, progress, target_date").in("handover_id", storedIds)
    : { data: [] as { handover_id: string | null; progress: number | null; target_date: string | null }[] };
  const agg = new Map<string, { count: number; done: number; sum: number; latest: string | null }>();
  for (const t of taskRows || []) {
    if (!t.handover_id) continue;
    const cur = agg.get(t.handover_id) || { count: 0, done: 0, sum: 0, latest: null };
    cur.count += 1;
    cur.sum += t.progress ?? 0;
    if ((t.progress ?? 0) >= 100) cur.done += 1;
    if (t.target_date && (!cur.latest || t.target_date > cur.latest)) cur.latest = t.target_date;
    agg.set(t.handover_id, cur);
  }

  // Stale stored rows need their leave's dates for display; they may be past.
  const derivedKeys = new Set(derived.map(d => handoverKey(d.client, d.window.kind, d.window.userId, d.window.holidayId, d.toUserId)));
  const staleRows = stored.filter(s => !derivedKeys.has(handoverKey(s.client_name, s.kind as HandoverKind, s.from_user_id, s.holiday_id, s.to_user_id)));
  const windowById = new Map(windows.map(w => [w.windowId, w]));
  const staleHolidayIds = Array.from(new Set(staleRows.map(s => s.holiday_id).filter((id): id is string => !!id && !windowById.has(id))));
  const { data: staleHolidays } = staleHolidayIds.length > 0
    ? await supabase.from("staff_holidays").select("id, user_id, start_date, end_date").in("id", staleHolidayIds)
    : { data: [] as { id: string; user_id: string; start_date: string; end_date: string }[] };
  const staleHolidayById = new Map((staleHolidays || []).map(h => [h.id, h]));

  // Names and emails for everyone involved.
  const partyIds = new Set<string>();
  derived.forEach(d => { partyIds.add(d.window.userId); if (d.toUserId) partyIds.add(d.toUserId); });
  stored.forEach(s => { partyIds.add(s.from_user_id); if (s.to_user_id) partyIds.add(s.to_user_id); });
  const { data: profiles } = partyIds.size > 0
    ? await supabase.from("profiles").select("user_id, display_name, email").in("user_id", Array.from(partyIds))
    : { data: [] as { user_id: string; display_name: string | null; email: string | null }[] };
  const profileById = new Map((profiles || []).map(p => [p.user_id, p]));
  const party = (userId: string): HandoverParty => {
    const p = profileById.get(userId);
    return { userId, name: (p?.display_name || p?.email || "Unknown").trim(), email: p?.email ?? null };
  };

  const todayDate = parseISO(today);
  const make = (
    client: string, kind: HandoverKind, fromUserId: string, holidayId: string | null, toUserId: string | null,
    start: string, end: string, isDerived: boolean, coveredDates: string[],
  ): ClientHandover => {
    const key = handoverKey(client, kind, fromUserId, holidayId, toUserId);
    const row = storedByKey.get(key);
    const a = row ? agg.get(row.id) : undefined;
    const daysUntil = differenceInCalendarDays(parseISO(start), todayDate);
    return {
      key,
      id: row?.id ?? null,
      client,
      kind,
      from: party(fromUserId),
      to: toUserId ? party(toUserId) : null,
      holidayId,
      startDate: start,
      endDate: end,
      daysUntil,
      ongoing: daysUntil < 0,
      requirement: row?.status === "not_required" ? "not_required" : "required",
      notRequiredReason: row?.not_required_reason ?? null,
      derived: isDerived,
      taskCount: a?.count ?? 0,
      completedCount: a?.done ?? 0,
      avgProgress: a && a.count > 0 ? Math.round(a.sum / a.count) : 0,
      latestTargetDate: a?.latest ?? null,
      coveredDates,
    };
  };

  const handovers: ClientHandover[] = derived.map(d =>
    make(d.client, d.window.kind, d.window.userId, d.window.holidayId, d.toUserId, d.window.start, d.window.end, true, d.coveredDates));

  for (const s of staleRows) {
    // A stale row is one the rota no longer produces: only shown on the
    // per-client tracker, where it can be moved or cleared.
    if (!opts.includeStale) continue;
    if (opts.clientFilter && !opts.clientFilter.has(s.client_name)) continue;
    const kind = s.kind as HandoverKind;
    const w = s.holiday_id ? windowById.get(s.holiday_id) : windowById.get(`departure:${s.from_user_id}`);
    const hol = s.holiday_id ? staleHolidayById.get(s.holiday_id) : undefined;
    const start = w?.start ?? hol?.start_date ?? today;
    const end = w?.end ?? hol?.end_date ?? start;
    handovers.push(make(s.client_name, kind, s.from_user_id, s.holiday_id, s.to_user_id, start, end, false, []));
  }

  return { handovers, hadClients };
}

const partySort = (a: ClientHandover, b: ClientHandover) => {
  // Soonest leave first; within a leave, coverers by name, unassigned last.
  if (a.startDate !== b.startDate) return a.startDate < b.startDate ? -1 : 1;
  if (a.from.userId !== b.from.userId) return a.from.name.localeCompare(b.from.name);
  if (!a.to !== !b.to) return a.to ? -1 : 1;
  return (a.to?.name || "").localeCompare(b.to?.name || "") || a.client.localeCompare(b.client);
};

/** Group handovers by the leave (or departure) they belong to, soonest first. */
export function groupHandoversByLeave(handovers: ClientHandover[]): LeaveHandoverGroup[] {
  const groups = new Map<string, LeaveHandoverGroup>();
  for (const h of [...handovers].sort(partySort)) {
    const key = `${h.kind}|${h.from.userId}|${h.holidayId ?? ""}`;
    if (!groups.has(key)) {
      groups.set(key, {
        key, kind: h.kind, from: h.from, holidayId: h.holidayId,
        startDate: h.startDate, endDate: h.endDate, daysUntil: h.daysUntil, ongoing: h.ongoing, handovers: [],
      });
    }
    groups.get(key)!.handovers.push(h);
  }
  return Array.from(groups.values());
}

// ---------------------------------------------------------------------------
// Entry points
// ---------------------------------------------------------------------------

/**
 * Every handover at one client: each upcoming or ongoing leave of anyone with
 * shifts there, per coverer; departures likewise; plus stale stored rows
 * (a leave that has passed, or a cover that changed) so they can be moved or
 * cleared. This is what the client's tracker page shows.
 */
export async function getClientHandovers(clientName: string): Promise<ClientHandover[]> {
  const client = (clientName || "").trim();
  if (!client) return [];
  const { data: patterns } = await supabase
    .from("recurring_shift_patterns")
    .select("user_id")
    .eq("client_name", client)
    .or(`end_date.is.null,end_date.gte.${todayIso()}`);
  const userIds = Array.from(new Set((patterns || []).map(p => p.user_id).filter((id): id is string => !!id)));
  const [leaves, departures] = await Promise.all([
    upcomingLeaveWindows({ userIds }),
    departureWindows({ userIds }),
  ]);
  const { handovers } = await buildHandovers([...leaves, ...departures], { clientFilter: new Set([client]), includeStale: true });
  return handovers.sort(partySort);
}

/**
 * Every handover the rota currently calls for, across all clients: the
 * dashboard's list of what is outstanding before people go.
 */
export async function getAllHandovers(): Promise<ClientHandover[]> {
  const [leaves, departures] = await Promise.all([
    upcomingLeaveWindows({}),
    departureWindows({}),
  ]);
  const { handovers } = await buildHandovers([...leaves, ...departures]);
  return handovers.sort(partySort);
}

/** Per-client status from a window's handovers. */
function clientStatuses(handovers: ClientHandover[]): ClientHandoverStatus[] {
  const byClient = new Map<string, ClientHandover[]>();
  for (const h of handovers) {
    if (!byClient.has(h.client)) byClient.set(h.client, []);
    byClient.get(h.client)!.push(h);
  }
  return Array.from(byClient.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([client, hs]) => {
      const required = hs.filter(h => h.requirement === "required");
      const taskCount = required.reduce((s, h) => s + h.taskCount, 0);
      const avgProgress = required.length > 0
        ? Math.round(required.reduce((s, h) => s + h.avgProgress, 0) / required.length)
        : 0;
      const notRequired = required.length === 0;
      const ready = !notRequired && required.every(h => h.taskCount > 0 && h.avgProgress >= 100);
      return { client, avgProgress, taskCount, ready, notRequired, handovers: hs };
    });
}

function overallStatus(clients: ClientHandoverStatus[]): HandoverStatus {
  if (clients.length === 0) return "none";
  if (clients.every(c => c.notRequired)) return "not_required";
  const live = clients.filter(c => !c.notRequired);
  if (live.every(c => c.ready)) return "complete";
  const anyProgress = live.some(c => c.handovers.some(h => h.requirement === "required" && h.avgProgress > 0));
  return anyProgress ? "in_progress" : "not_started";
}

function statusForWindow(handovers: ClientHandover[], noCoverRequired: boolean, hadClients: boolean): HolidayHandoverStatus {
  if (noCoverRequired) return { status: "not_required", clients: [] };
  const clients = clientStatuses(handovers.filter(h => h.derived));
  if (clients.length === 0) {
    // Distinguish "no clients at all" from "every client's shifts are marked
    // no-cover" so the UI can say handover isn't required rather than N/A.
    return { status: hadClients ? "not_required" : "none", clients: [] };
  }
  return { status: overallStatus(clients), clients };
}

/** Find the staff_holidays row a request or leave list refers to. */
async function resolveHolidayWindow(
  userId: string, startDate: string, endDate: string, holidayId?: string | null,
): Promise<LeaveWindow> {
  let row: Parameters<typeof toWindow>[0] | null = null;
  if (holidayId) {
    const { data } = await supabase.from("staff_holidays").select(HOLIDAY_COLS).eq("id", holidayId).maybeSingle();
    row = (data as Parameters<typeof toWindow>[0] | null) ?? null;
  }
  if (!row) {
    const { data } = await supabase
      .from("staff_holidays").select(HOLIDAY_COLS)
      .eq("user_id", userId).eq("start_date", startDate).eq("end_date", endDate)
      .order("status", { ascending: true }) // 'approved' before 'pending'
      .limit(1);
    row = ((data || [])[0] as Parameters<typeof toWindow>[0] | undefined) ?? null;
  }
  if (row) return toWindow(row);
  // No row yet (a request still pending): derive from the dates alone.
  return {
    windowId: `pending:${userId}:${startDate}:${endDate}`, kind: "leave", holidayId: null, userId,
    start: startDate, end: endDate, noCoverRequired: false, noCoverDates: new Set(),
  };
}

/** Handover status for a single staff member's leave window. */
export async function computeHolidayHandoverStatus(
  userId: string,
  startDate: string,
  endDate: string,
  opts?: { noCoverRequired?: boolean; noCoverDates?: string[] | null; holidayId?: string | null }
): Promise<HolidayHandoverStatus> {
  if (opts?.noCoverRequired) return { status: "not_required", clients: [] };
  const w = await resolveHolidayWindow(userId, startDate, endDate, opts?.holidayId);
  if (opts?.noCoverDates) w.noCoverDates = new Set(opts.noCoverDates);
  const { handovers, hadClients } = await buildHandovers([w]);
  return statusForWindow(handovers, false, hadClients.get(w.windowId) ?? false);
}

export interface HolidayForHandoverBatch {
  /** Caller's own id for the row; also tried as the staff_holidays id. */
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
 * Bulk variant for list views (schedule grid, holiday managers) — one pass
 * over the rota for every leave in the list, keyed by the caller's ids.
 */
export async function computeHolidayHandoverStatusBatch(
  holidays: HolidayForHandoverBatch[]
): Promise<Map<string, HolidayHandoverStatus>> {
  const result = new Map<string, HolidayHandoverStatus>();
  if (holidays.length === 0) return result;

  // Match each input to its staff_holidays row, so stored handovers are found:
  // by id when the caller passed one, otherwise by person and dates.
  const userIds = Array.from(new Set(holidays.map(h => h.userId)));
  const { data: rows } = await supabase
    .from("staff_holidays").select(HOLIDAY_COLS)
    .in("user_id", userIds)
    .eq("status", "approved");
  const byId = new Map((rows || []).map(r => [r.id, r]));
  const byUserDates = new Map((rows || []).map(r => [`${r.user_id}|${r.start_date}|${r.end_date}`, r]));

  const windows: LeaveWindow[] = [];
  const windowIdByInput = new Map<string, string>();
  for (const h of holidays) {
    if (h.noCoverRequired) continue;
    const row = byId.get(h.id) ?? byUserDates.get(`${h.userId}|${h.startDate}|${h.endDate}`);
    const w: LeaveWindow = row
      ? toWindow(row as Parameters<typeof toWindow>[0])
      : { windowId: `pending:${h.id}`, kind: "leave", holidayId: null, userId: h.userId, start: h.startDate, end: h.endDate, noCoverRequired: false, noCoverDates: new Set() };
    if (h.noCoverDates) w.noCoverDates = new Set(h.noCoverDates);
    windowIdByInput.set(h.id, w.windowId);
    if (!windows.some(x => x.windowId === w.windowId)) windows.push(w);
  }

  const { handovers, hadClients } = await buildHandovers(windows);
  const byWindow = new Map<string, ClientHandover[]>();
  for (const hv of handovers) {
    const wid = hv.holidayId ?? `pending:${hv.from.userId}`;
    if (!byWindow.has(wid)) byWindow.set(wid, []);
    byWindow.get(wid)!.push(hv);
  }

  for (const h of holidays) {
    if (h.noCoverRequired) { result.set(h.id, { status: "not_required", clients: [] }); continue; }
    const wid = windowIdByInput.get(h.id)!;
    result.set(h.id, statusForWindow(byWindow.get(wid) || [], false, hadClients.get(wid) ?? false));
  }
  return result;
}

/**
 * "2 of 3 clients ready" — spelled-out multi-client progress. One holiday can
 * need several handovers (one per client, one per coverer), so a bare status
 * label undersells what's outstanding.
 */
export function handoverClientsSummary(s: HolidayHandoverStatus): string | null {
  if (s.clients.length <= 1) return null;
  const ready = s.clients.filter(c => c.ready || c.notRequired).length;
  return `${ready} of ${s.clients.length} clients ready`;
}

// ---------------------------------------------------------------------------
// Writing
// ---------------------------------------------------------------------------

/**
 * The stored row for a handover, created on first use. Nothing is written
 * for a handover nobody has acted on; the first task or the first decision
 * creates the row, and the unique index makes two simultaneous first uses
 * collapse into one.
 */
export async function ensureHandoverRow(h: Pick<ClientHandover, "client" | "kind" | "from" | "holidayId" | "to">): Promise<string> {
  const match = () => supabase
    .from("client_handovers")
    .select("id")
    .eq("client_name", h.client.trim())
    .eq("kind", h.kind)
    .eq("from_user_id", h.from.userId)
    .filter("holiday_id", h.holidayId ? "eq" : "is", h.holidayId ?? null)
    .filter("to_user_id", h.to ? "eq" : "is", h.to?.userId ?? null)
    .limit(1);
  const { data: existing } = await match();
  if (existing && existing.length > 0) return existing[0].id;
  const { data: inserted, error } = await supabase
    .from("client_handovers")
    .insert({
      client_name: h.client.trim(),
      kind: h.kind,
      from_user_id: h.from.userId,
      holiday_id: h.holidayId,
      to_user_id: h.to?.userId ?? null,
    })
    .select("id")
    .single();
  if (!error && inserted) return inserted.id;
  // 23505: somebody else created it a moment ago. Read it back.
  if (error && (error as { code?: string }).code === "23505") {
    const { data: again } = await match();
    if (again && again.length > 0) return again[0].id;
  }
  throw error ?? new Error("Could not create the handover");
}

/** Mark a handover required or not required, creating its row if needed. */
export async function setHandoverRequirement(
  h: Pick<ClientHandover, "client" | "kind" | "from" | "holidayId" | "to">,
  requirement: HandoverRequirement,
  reason: string | null,
  changedBy: string | null,
): Promise<void> {
  const id = await ensureHandoverRow(h);
  const { error } = await supabase
    .from("client_handovers")
    .update({
      status: requirement,
      not_required_reason: requirement === "not_required" ? (reason?.trim() || null) : null,
      status_changed_by: changedBy,
      status_changed_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) throw error;
}

/**
 * Move a checklist to another handover of the same leave — the case is a
 * checklist prepared before any cover was assigned, which belongs to the
 * coverer once there is one. The source row goes; its tasks (and their
 * comments) keep their ids.
 */
export async function moveHandoverTasks(fromHandoverId: string, target: Pick<ClientHandover, "client" | "kind" | "from" | "holidayId" | "to">): Promise<void> {
  const targetId = await ensureHandoverRow(target);
  if (targetId === fromHandoverId) return;
  const { error } = await supabase.from("client_handover_tasks").update({ handover_id: targetId }).eq("handover_id", fromHandoverId);
  if (error) throw error;
  const { error: delError } = await supabase.from("client_handovers").delete().eq("id", fromHandoverId);
  if (delError) throw delError;
}

// ---------------------------------------------------------------------------
// Display helpers
// ---------------------------------------------------------------------------

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

/** "Funmi Otitoju → Mercy", or "→ cover not assigned yet". */
export const handoverTitle = (h: Pick<ClientHandover, "from" | "to">) =>
  `${h.from.name} → ${h.to ? h.to.name : "cover not assigned yet"}`;
