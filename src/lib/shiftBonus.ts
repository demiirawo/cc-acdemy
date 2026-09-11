import { eachDayOfInterval, format, parseISO } from "date-fns";
import { isShiftCoveredByRequest } from "@/lib/coverageUtils";
import { patternOccursOn, resolveDayKind, type DayOverride, type SchedulablePattern } from "@/lib/patternSchedule";

/**
 * THE SHIFT BONUS.
 *
 * Some extra shifts — a Saturday series, typically — cannot be paid at the
 * overtime day-rate. Instead the admin has a fixed monthly bonus, paid in
 * proportion to the bonus shifts they actually worked that month:
 *
 *     bonus = monthly amount × bonus shifts worked ÷ bonus shifts scheduled
 *
 * A Saturday series has four or five occurrences depending on the month.
 * Work all of them and the full bonus is paid; work four of five and four
 * fifths is. Bonus shifts earn nothing else: they are routed out of the
 * overtime day-rate and the public-holiday uplift, so this is the only pay
 * those days produce.
 *
 * Payroll and the staff member's own pay view both call this. They used to
 * carry separate copies of the pay maths, and staff raise their invoice from
 * their own view — so two copies meant staff invoicing a different figure from
 * the one payroll paid. One function, one answer.
 */

/**
 * Leads the description of every shift-bonus pay record. Must not start with
 * "Bonus pot ·": the pot resync deletes bonus records by that prefix, and would
 * take a captured shift bonus with it.
 */
export const SHIFT_BONUS_TAG = "Shift bonus";

export interface ShiftBonusConfig {
  id: string;
  user_id: string;
  /** Paid in full for a month in which every bonus shift is worked. */
  monthly_amount: number;
  /** The admin's own pay currency, like every other bonus. */
  currency: string;
  description: string | null;
  /** First day of the first month it applies to. */
  start_date: string;
  /** Last day of the last month it applies to; null = until stopped. */
  end_date: string | null;
}

export interface BonusPattern extends SchedulablePattern {
  id: string;
  /** NULL = an unallocated placeholder, which nobody is paid for. */
  user_id: string | null;
  is_overtime: boolean;
  overtime_subtype: string | null;
  start_time: string;
  end_time: string;
  client_name: string;
}

/** Why a scheduled bonus shift did not count as worked. */
export type MissReason = "holiday" | "sickness" | "absence" | "covered";

export interface LeaveRequest { user_id: string; start_date: string; end_date: string; request_type?: string | null }
export interface Absence {
  user_id: string;
  start_date: string;
  end_date: string;
  status?: string | null;
  absence_type?: string | null;
}
export interface CoverRequest {
  user_id: string;
  request_type: string;
  swap_with_user_id: string | null;
  start_date: string;
  end_date: string;
  /** Straight from the jsonb column; coverageUtils reads its shape. */
  coverage_metadata?: unknown;
  status?: string | null;
}

export interface BonusCount {
  /** Distinct dates this month with a scheduled bonus shift, ascending. */
  scheduled: string[];
  /** The scheduled dates actually worked. */
  worked: string[];
  /** The scheduled dates not worked, and why. */
  missed: Array<{ date: string; reason: MissReason; detail?: string }>;
}

export interface CountArgs {
  userId: string;
  monthStart: Date;
  monthEnd: Date;
  patterns: BonusPattern[];
  /** pattern_id -> dates with a 'deleted' exception */
  deleted: Map<string, Set<string>>;
  /** pattern_id -> date -> 'overtime' / 'not_overtime' override */
  overrides: Map<string, Map<string, DayOverride>>;
  employedOn: (dateStr: string) => boolean;
  /** Approved holiday_paid / holiday_unpaid / sickness requests. */
  leaveRequests: LeaveRequest[];
  /** staff_holidays rows: holiday, unpaid, sick and every other absence type. */
  absences: Absence[];
  /** Approved shift_swap requests; the ones covering this admin are picked out here. */
  coverRequests: CoverRequest[];
}

const datesBetween = (start: string, end: string, monthStart: string, monthEnd: string): string[] => {
  const from = start > monthStart ? start : monthStart;
  const to = end < monthEnd ? end : monthEnd;
  if (from > to) return [];
  return eachDayOfInterval({ start: parseISO(from), end: parseISO(to) }).map(d => format(d, "yyyy-MM-dd"));
};

/**
 * Sickness is the reason this reads staff_holidays at all. Payroll's own
 * "not worked" test only ever looked at leave requests, and sickness has no
 * request type: it exists only as a staff_holidays row. Without this, a
 * sick Saturday counted as worked.
 */
const reasonForAbsence = (type: string | null | undefined): { reason: MissReason; detail?: string } => {
  if (type === "sick") return { reason: "sickness" };
  if (!type || type === "holiday" || type === "unpaid") return { reason: "holiday" };
  return { reason: "absence", detail: type };
};

/**
 * Count one admin's bonus shifts for a month.
 *
 * SCHEDULED is pooled by date across every bonus series the admin has, not
 * counted per pattern row. A series is not one row: editing it from a date
 * ends the old row and starts a new one, and weekend work is often entered as
 * one row per weekend. Counted per row, a Saturday series split mid-month
 * scored 2/2 + 3/3 — two full bonuses — and every one-row weekend scored 1/1.
 * Two bonus shifts on the same date are one bonus day.
 *
 * Only dates inside the admin's employment are scheduled for them at all, so a
 * joiner or leaver is measured against the bonus shifts they were actually
 * there for, not against the whole calendar month.
 *
 * A cancelled occurrence (a 'deleted' exception) is not scheduled. The shift
 * did not happen, and that is not something to hold against the admin.
 */
export function countBonusShifts(a: CountArgs): BonusCount {
  const monthStartStr = format(a.monthStart, "yyyy-MM-dd");
  const monthEndStr = format(a.monthEnd, "yyyy-MM-dd");
  const mine = a.patterns.filter(p => p.user_id === a.userId);

  const leave = new Map<string, MissReason>();
  for (const r of a.leaveRequests) {
    if (r.user_id !== a.userId) continue;
    const reason: MissReason = r.request_type === "sickness" ? "sickness" : "holiday";
    for (const d of datesBetween(r.start_date, r.end_date, monthStartStr, monthEndStr)) {
      if (leave.get(d) !== "sickness") leave.set(d, reason);
    }
  }
  const absent = new Map<string, { reason: MissReason; detail?: string }>();
  for (const h of a.absences) {
    // Only a confirmed absence counts. A sickness report still waiting for an
    // admin must not quietly cost somebody their bonus.
    if (h.user_id !== a.userId || (h.status ?? "approved") !== "approved") continue;
    const why = reasonForAbsence(h.absence_type);
    for (const d of datesBetween(h.start_date, h.end_date, monthStartStr, monthEndStr)) {
      // Sickness is the most specific thing to report, so it wins a date shared
      // with a holiday row.
      const prev = absent.get(d);
      if (!prev || why.reason === "sickness") absent.set(d, why);
    }
  }
  const coveringMe = a.coverRequests.filter(r =>
    r.request_type === "shift_swap" && r.swap_with_user_id === a.userId && (r.status ?? "approved") === "approved");

  const scheduled: string[] = [];
  const worked: string[] = [];
  const missed: BonusCount["missed"] = [];

  for (const day of eachDayOfInterval({ start: a.monthStart, end: a.monthEnd })) {
    const date = format(day, "yyyy-MM-dd");
    if (!a.employedOn(date)) continue;

    const occurrences = mine.filter(p =>
      patternOccursOn(p, day)
      && !a.deleted.get(p.id)?.has(date)
      && resolveDayKind(p, a.overrides.get(p.id)?.get(date)) === "bonus");
    if (occurrences.length === 0) continue;
    scheduled.push(date);

    // An approved sickness request and its staff_holidays row say the same
    // thing, and either is enough: the request still counts if writing the row
    // failed, and a row an admin retyped to sick still says sickness when its
    // request was filed as holiday. Sickness is named over holiday either way.
    const fromRequest = leave.get(date);
    const fromAbsence = absent.get(date);
    if (fromRequest === "sickness" || fromAbsence?.reason === "sickness") { missed.push({ date, reason: "sickness" }); continue; }
    if (fromRequest) { missed.push({ date, reason: fromRequest }); continue; }
    if (fromAbsence) { missed.push({ date, ...fromAbsence }); continue; }

    // Covered means somebody else did it. If the admin had two bonus shifts
    // that day and handed over only one, they still worked a bonus day.
    const allCovered = occurrences.every(p =>
      coveringMe.some(r =>
        date >= r.start_date && date <= r.end_date
        && isShiftCoveredByRequest(r as Parameters<typeof isShiftCoveredByRequest>[0], {
          id: `pattern-${p.id}-${date}`,
          date,
          startTime: p.start_time,
          endTime: p.end_time,
          clientName: p.client_name,
        })));
    if (allCovered && coveringMe.length > 0) { missed.push({ date, reason: "covered" }); continue; }

    worked.push(date);
  }

  return { scheduled, worked, missed };
}

/** Shift-bonus configs that apply to any part of the month. */
export function activeShiftBonuses(
  configs: ShiftBonusConfig[], userId: string, monthStart: Date, monthEnd: Date,
): ShiftBonusConfig[] {
  const s = format(monthStart, "yyyy-MM-dd");
  const e = format(monthEnd, "yyyy-MM-dd");
  // The same overlap test recurring bonuses use, so the two can't disagree
  // about which months a bonus is live in.
  return configs.filter(c => c.user_id === userId && c.start_date <= e && (!c.end_date || c.end_date >= s));
}

/** Monthly amount x worked / scheduled, to the kobo. Nothing scheduled pays nothing. */
export function proRatedShiftBonus(monthlyAmount: number, count: BonusCount): number {
  const scheduled = count.scheduled.length;
  if (scheduled === 0 || !(monthlyAmount > 0)) return 0;
  return Math.round((monthlyAmount * count.worked.length / scheduled) * 100) / 100;
}

export interface ShiftBonusResult {
  /** A shift bonus is set for this month. */
  configured: boolean;
  monthlyAmount: number;
  /** What this month pays. */
  amount: number;
  count: BonusCount;
  /**
   * Bonus shifts on the rota but no bonus set. Those shifts are kept out of
   * overtime, so they would be paid nothing at all — which must be seen, not
   * discovered on payday.
   */
  unconfigured: boolean;
}

export function computeShiftBonus(a: CountArgs & { configs: ShiftBonusConfig[] }): ShiftBonusResult {
  const count = countBonusShifts(a);
  const active = activeShiftBonuses(a.configs, a.userId, a.monthStart, a.monthEnd);
  const monthlyAmount = active.reduce((sum, c) => sum + Number(c.monthly_amount), 0);
  return {
    configured: active.length > 0,
    monthlyAmount,
    amount: proRatedShiftBonus(monthlyAmount, count),
    count,
    unconfigured: active.length === 0 && count.scheduled.length > 0,
  };
}

/** "Shift bonus · 4 of 5 bonus shifts" */
export const shiftBonusLabel = (count: BonusCount) =>
  `${SHIFT_BONUS_TAG} · ${count.worked.length} of ${count.scheduled.length} bonus shift${count.scheduled.length === 1 ? "" : "s"}`;

/** Plain-English note for the shifts that were missed, e.g. "17 Oct holiday, 24 Oct covered". */
export const missedSummary = (count: BonusCount) =>
  count.missed.map(m => `${format(parseISO(m.date), "d MMM")} ${m.reason === "absence" ? (m.detail ?? "absence") : m.reason}`).join(", ");
