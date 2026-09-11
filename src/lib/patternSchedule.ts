import { differenceInWeeks, format, getDate, getDay, parseISO, startOfWeek } from "date-fns";

/**
 * WHEN A SHIFT PATTERN ACTUALLY HAPPENS, AND WHAT KIND OF DAY IT IS.
 *
 * One rule for every screen that turns a recurring pattern into dated shifts:
 * the rota, payroll, the staff member's own pay forecast, and the shift bonus.
 * Before this there were four copies and they disagreed. The rota honoured
 * `recurrence_interval`; payroll's day loops ignored it entirely, and the one
 * payroll path that did check it (cover) used a different biweekly rule from
 * the rota — days counted from the start date rather than weeks counted from
 * the start date's Monday. So a fortnightly Saturday series showed on the rota
 * two or three times a month while payroll counted it on every Saturday, and
 * paid the public-holiday uplift for off-week Saturdays nobody worked.
 *
 * The rota is the reference because it is what admins and staff actually look
 * at. If this and the rota ever disagree, the rota is right and this is the bug.
 */

export interface SchedulablePattern {
  /** yyyy-MM-dd */
  start_date: string;
  /** yyyy-MM-dd, inclusive; null = open-ended */
  end_date: string | null;
  /** 0 = Sunday … 6 = Saturday */
  days_of_week: number[];
  /** 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'one_off'; null reads as weekly */
  recurrence_interval: string | null;
}

/**
 * Is `day` an occurrence of this pattern? Mirrors StaffScheduleManager's rota.
 *
 * Range is compared as calendar-date strings rather than Date objects, so a
 * caller passing a Date that carries a time of day cannot fall off the end of
 * a pattern whose last day is today. Every existing caller passes local
 * midnight, where the two readings agree.
 *
 * Deleted exceptions are not considered here: whether an occurrence was
 * cancelled is a separate question from whether the pattern produces one, and
 * callers need both answers.
 */
export function patternOccursOn(pattern: SchedulablePattern, day: Date): boolean {
  const dateStr = format(day, "yyyy-MM-dd");
  if (dateStr < pattern.start_date) return false;
  if (pattern.end_date && dateStr > pattern.end_date) return false;

  const dow = getDay(day);
  switch (pattern.recurrence_interval || "weekly") {
    case "daily":
      // The rota includes every day for a daily pattern, whatever days_of_week
      // says. Creation always stores [0..6] for daily, so the two agree today.
      return true;
    case "one_off":
    case "weekly":
      return pattern.days_of_week.includes(dow);
    case "biweekly": {
      if (!pattern.days_of_week.includes(dow)) return false;
      // Weeks between the Mondays, not days between the dates. The two differ
      // for a series whose start date is not one of its own weekdays: a
      // Saturday series starting on a Sunday skips its first Saturday on the
      // rota, and payroll's old day-count rule paid it.
      const weeks = differenceInWeeks(
        startOfWeek(day, { weekStartsOn: 1 }),
        startOfWeek(parseISO(pattern.start_date), { weekStartsOn: 1 }),
      );
      return weeks % 2 === 0;
    }
    case "monthly": {
      if (!pattern.days_of_week.includes(dow)) return false;
      // Same week of the month as the start (days 1-7 are week 1, 8-14 week 2 …).
      return Math.ceil(getDate(parseISO(pattern.start_date)) / 7) === Math.ceil(getDate(day) / 7);
    }
    default:
      // The rota includes nothing for an interval it does not recognise, and the
      // database only admits the five above.
      return false;
  }
}

/** What a single pattern occurrence is, for pay. */
export type DayKind = "normal" | "standard" | "double_up" | "bonus";

/** The stored value that marks a series as bonus shifts. */
export const BONUS_SUBTYPE = "bonus";

export interface DayOverride {
  /** 'overtime' | 'not_overtime' (a 'deleted' exception is handled by the caller) */
  type: string;
  subtype: string | null;
}

/**
 * Overtime subtype to pay kind. Anything that is not In or Bonus pays as Out,
 * because that is what a blank subtype has always meant here: fifteen early
 * overtime patterns predate the subtype column and are paid at 1.5x.
 */
export function kindOfSubtype(subtype: string | null | undefined): Exclude<DayKind, "normal"> {
  if (subtype === "double_up") return "double_up";
  if (subtype === BONUS_SUBTYPE) return "bonus";
  return "standard";
}

/**
 * The kind of one occurrence: a per-day override wins, then the series.
 *
 * `bonus` sits under `is_overtime = true` on purpose. About ten readers treat
 * is_overtime as "an extra shift, not part of the contracted week" — it is not
 * charged to holiday allowance, not in QA scope, not a cover target, not part
 * of team leave clashes — and a bonus shift is exactly that kind of shift. What
 * it must NOT inherit is overtime pay, and every pay path now asks this
 * function rather than reading is_overtime directly.
 */
export function resolveDayKind(
  pattern: { is_overtime: boolean; overtime_subtype: string | null },
  override?: DayOverride | null,
): DayKind {
  if (override?.type === "overtime") return kindOfSubtype(override.subtype);
  if (override?.type === "not_overtime") return "normal";
  return pattern.is_overtime ? kindOfSubtype(pattern.overtime_subtype) : "normal";
}

/** A series whose every occurrence is a bonus shift unless overridden. */
export const isBonusSeries = (pattern: { is_overtime: boolean; overtime_subtype: string | null }) =>
  pattern.is_overtime && pattern.overtime_subtype === BONUS_SUBTYPE;
