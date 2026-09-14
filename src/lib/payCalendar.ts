import { format, startOfMonth, subMonths } from "date-fns";

/**
 * The pay calendar: payroll is run on the 1st for the month just finished, and
 * anything that changes what somebody is paid lands on the 2nd — the day after
 * payday, once the run it must not disturb has been and gone.
 *
 * Salary and rating changes are decided on one day and held until the 2nd
 * (pendingSalary.ts, pendingRating.ts). A year of service is reached on one day
 * and counts from the 2nd too (bonusTenureYears). This answers the other side of
 * that: on a given day, which month's figures are the live ones — and, for a
 * month paid late, which figures it was worked on.
 */

/** The day of the month a change to pay takes effect: the day after payday. */
export const PAY_CHANGE_DAY = 2;

/**
 * The payroll month whose figures are in force on `today`.
 *
 * From the 2nd that is the calendar month. On the 1st it is still the month
 * before — that is the day its payroll is run, and nothing that has happened
 * since has landed yet.
 */
export function payrollMonthInForce(today: Date = new Date()): Date {
  const month = startOfMonth(today);
  return today.getDate() < PAY_CHANGE_DAY ? subMonths(month, 1) : month;
}

/** The day a payroll month's figures come into force: its 2nd. */
export function inForceFrom(payrollMonth: Date): Date {
  return new Date(payrollMonth.getFullYear(), payrollMonth.getMonth(), PAY_CHANGE_DAY);
}

/**
 * A change to a pay term that has landed: the 2nd it took effect, and the value
 * it replaced. The applied rows of pending_salary_changes and
 * pending_rating_changes are exactly this, so they double as each term's history.
 */
export interface LandedChange<T> {
  effective_date: string;
  previous: T;
}

/**
 * The value of a pay term for a given payroll month.
 *
 * Today's value is the one in force now. A change that landed in a later month
 * than this one carries the value it replaced, so the earliest such change says
 * what this month was on; with none, the month is on today's value.
 *
 * Landing on the 2nd only protects a month that is finished by the 2nd, and
 * months aren't always — people have been marked paid on the 2nd, and once on
 * the 13th — while reverting a payment reopens a month at any time. Reading the
 * terms this way keeps a late or reopened month on the figures it was worked
 * at, whenever it is paid.
 */
export function inForceFor<T>(payrollMonth: Date, current: T, landed: readonly LandedChange<T>[]): T {
  const month = format(payrollMonth, "yyyy-MM");
  let earliest: LandedChange<T> | null = null;
  for (const change of landed) {
    if (change.effective_date.slice(0, 7) <= month) continue;
    if (!earliest || change.effective_date < earliest.effective_date) earliest = change;
  }
  return earliest ? earliest.previous : current;
}

/** One person's landed changes to one term, from pending_*_changes rows. */
export function landedChangesFor<R extends { user_id: string; effective_date: string }, K extends keyof R>(
  rows: readonly R[] | null | undefined,
  userId: string,
  previousField: K,
): LandedChange<R[K]>[] {
  return (rows ?? [])
    .filter((r) => r.user_id === userId)
    .map((r) => ({ effective_date: r.effective_date, previous: r[previousField] }));
}
