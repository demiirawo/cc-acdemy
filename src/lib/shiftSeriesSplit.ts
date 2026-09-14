import { addDays, differenceInWeeks, format, getDate, parseISO, startOfWeek } from "date-fns";
import { nextPayChangeDate } from "@/lib/payCalendar";

/**
 * EDITING A SHIFT SERIES FROM A DATE.
 *
 * A series is one row, and editing that row in place rewrote every day it had
 * already produced: unticking overtime on the 15th also unticked it for the
 * Saturdays worked on the 5th and the 12th. A change to a series that has
 * started now applies from a date. The database function edit_shift_series()
 * ends the series the day before and carries it on from that date in a new
 * row, so the days before keep the terms they were worked on.
 *
 * This file is the editor's half of that: what "today" is, which date a change
 * applies from unless somebody picks another, and which fields changed.
 */

/** Today in the UK, yyyy-MM-dd: the "today" the database guard uses. */
export function ukToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/** A series has started once its first day is before today. */
export const seriesHasStarted = (startDate: string, today: string = ukToday()): boolean => startDate < today;

/**
 * The first date on or after `from` that keeps a series in step. Fortnightly
 * series count their weeks from the start date's Monday and monthly ones run
 * in the start date's week of the month, so carrying one on from any other
 * date would flip which weeks it falls in. Mirrors shift_series_resume_date()
 * in the database, which is what the split uses.
 */
export function resumeDate(startDate: string, interval: string | null, from: string): string {
  if (from <= startDate) return startDate;
  const f = parseISO(from);
  if (interval === "biweekly") {
    const fromMonday = startOfWeek(f, { weekStartsOn: 1 });
    const weeks = differenceInWeeks(fromMonday, startOfWeek(parseISO(startDate), { weekStartsOn: 1 }));
    return weeks % 2 === 0 ? from : format(addDays(fromMonday, 7), "yyyy-MM-dd");
  }
  if (interval === "monthly") {
    const week = Math.ceil(getDate(parseISO(startDate)) / 7);
    let d = f;
    for (let i = 0; i < 62 && Math.ceil(getDate(d) / 7) !== week; i++) d = addDays(d, 1);
    return format(d, "yyyy-MM-dd");
  }
  return from;
}

/** What an edit can change about a series, in the shape the database takes it. */
export interface SeriesFields {
  user_id: string | null;
  client_name: string;
  days_of_week: number[];
  start_time: string;
  end_time: string;
  is_overtime: boolean;
  overtime_subtype: string | null;
  notes: string | null;
  recurrence_interval: string;
  shift_type: string | null;
  end_date: string | null;
}

/** How a series is paid; a change to only these lands on the 2nd, like any pay change. */
const PAY_FIELDS: (keyof SeriesFields)[] = ["is_overtime", "overtime_subtype"];

const same = (key: keyof SeriesFields, a: SeriesFields[keyof SeriesFields], b: SeriesFields[keyof SeriesFields]): boolean => {
  if (key === "days_of_week") {
    const sorted = (v: unknown) => JSON.stringify([...((v as number[] | null) ?? [])].sort((x, y) => x - y));
    return sorted(a) === sorted(b);
  }
  // The database hands times back as 09:00:00 and the form edits them as 09:00.
  if (key === "start_time" || key === "end_time") return String(a ?? "").slice(0, 5) === String(b ?? "").slice(0, 5);
  const norm = (v: unknown) => (v === "" || v === undefined ? null : v);
  return norm(a) === norm(b);
};

/** The fields that differ between the series and the form, ready to send. */
export function seriesChanges(before: SeriesFields, after: SeriesFields): Partial<SeriesFields> {
  const changes: Partial<SeriesFields> = {};
  for (const key of Object.keys(after) as (keyof SeriesFields)[]) {
    if (!same(key, before[key], after[key])) (changes as Record<string, unknown>)[key] = after[key];
  }
  return changes;
}

/** True when an edit changes how the series is paid and nothing else. */
export const changesOnlyPay = (changes: Partial<SeriesFields>): boolean => {
  const keys = Object.keys(changes) as (keyof SeriesFields)[];
  return keys.length > 0 && keys.every(k => PAY_FIELDS.includes(k));
};

/**
 * The date an edit applies from unless somebody picks another. A series that
 * hasn't started yet changes as a whole. Once it has, a change to how it is
 * paid lands on the next 2nd, the day after payroll, like every other pay
 * change, and anything else applies from the shift that was opened, or from
 * today if that shift has passed.
 */
export function defaultApplyFrom(opts: { payOnly: boolean; openedDate: string; seriesStart?: string; today?: string }): string {
  const today = opts.today ?? ukToday();
  if (opts.seriesStart && opts.seriesStart >= today) return opts.seriesStart;
  if (opts.payOnly) return format(nextPayChangeDate(parseISO(today)), "yyyy-MM-dd");
  return opts.openedDate > today ? opts.openedDate : today;
}

/** A row as far as the chain of a series is concerned. */
export interface SeriesRow {
  id: string;
  start_date: string;
  end_date: string | null;
  continues_pattern_id?: string | null;
}

/**
 * The rows of the series a row belongs to, first row first. An edit from a
 * date carries a series on in a new row whose continues_pattern_id is the row
 * before, so one series can be several rows; this follows that chain back to
 * the first row and forward to the last. Mirrors shift_series_lineage().
 */
export function seriesRows<T extends SeriesRow>(rows: T[], id: string): T[] {
  const byId = new Map(rows.map(r => [r.id, r]));
  let first = byId.get(id);
  if (!first) return [];
  const back = new Set<string>([first.id]);
  while (first.continues_pattern_id && byId.has(first.continues_pattern_id) && !back.has(first.continues_pattern_id)) {
    first = byId.get(first.continues_pattern_id)!;
    back.add(first.id);
  }
  const next = new Map<string, T>();
  for (const r of rows) if (r.continues_pattern_id) next.set(r.continues_pattern_id, r);
  const chain: T[] = [];
  const seen = new Set<string>();
  for (let r: T | undefined = first; r && !seen.has(r.id); r = next.get(r.id)) {
    seen.add(r.id);
    chain.push(r);
  }
  return chain;
}
