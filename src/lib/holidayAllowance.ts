/**
 * Holiday entitlement — one rule, in one place.
 *
 * This lived in three copies: the staff-facing figure on a profile, the June
 * payroll reconciliation, and the accrual breakdown shown alongside it. All
 * three asked "has this person completed a year?" and all three picked a
 * different moment to ask it, so the same person could be told 15 days on their
 * profile and reconciled at 18 by payroll for the very same holiday year.
 *
 * The rule, settled 31 August 2026:
 *
 *   Your allowance for a holiday year is fixed on the day that year starts,
 *   by the service you already have. Complete a year part-way through and the
 *   rise applies from the following 1 June, not from the anniversary itself.
 *
 * Fixing it at the start is what makes the figure quotable. An allowance that
 * moves mid-year means the number somebody was told in December is not the
 * number they are held to in January, and every conversation about it starts
 * with working out which one applied when.
 */

/** Days per holiday year before one year's service. */
export const HOLIDAY_ALLOWANCE_FIRST_YEAR = 15;

/** Days per holiday year once a year's service is complete. */
export const HOLIDAY_ALLOWANCE_AFTER_1_YEAR = 18;

const DAY_MS = 86_400_000;
const YEAR_MS = DAY_MS * 365;

/** The holiday year (1 June – 31 May) that the given date falls inside. */
export function holidayYearOf(d: Date): { start: Date; end: Date } {
  const startYear = d.getFullYear() - (d.getMonth() < 5 ? 1 : 0);
  return { start: new Date(startYear, 5, 1), end: new Date(startYear + 1, 4, 31) };
}

/**
 * The allowance for one holiday year: decided once, on the day it starts.
 *
 * Somebody who joins part-way through that year has negative service at its
 * start, which is the first-year rate — correct, and the reason the comparison
 * is written this way rather than clamped at zero.
 */
export function annualAllowanceFor(employmentStart: Date | null, holidayYearStart: Date): number {
  if (!employmentStart) return HOLIDAY_ALLOWANCE_FIRST_YEAR;
  const service = (holidayYearStart.getTime() - employmentStart.getTime()) / YEAR_MS;
  return service >= 1 ? HOLIDAY_ALLOWANCE_AFTER_1_YEAR : HOLIDAY_ALLOWANCE_FIRST_YEAR;
}

/**
 * How much of that allowance has been earned by a given date.
 *
 * Entitlement is not granted whole on 1 June — it builds up across the year, so
 * what somebody may actually book is this rather than the annual figure. A
 * joiner accrues from their start date rather than from 1 June, which is what
 * makes a first part-year proportionately smaller.
 *
 * Rounded to one decimal because that is how it is shown, and a balance that
 * displays as 3.8 but validates as 3.7999 rejects a booking for no visible
 * reason.
 */
export function accruedHolidayDays(
  employmentStart: Date,
  holidayYearStart: Date,
  holidayYearEnd: Date,
  upTo: Date,
): number {
  const annual = annualAllowanceFor(employmentStart, holidayYearStart);
  const accrualStart = employmentStart > holidayYearStart ? employmentStart : holidayYearStart;
  if (upTo <= accrualStart) return 0;
  const totalDaysInYear = Math.ceil((holidayYearEnd.getTime() - holidayYearStart.getTime()) / DAY_MS);
  const daysAccruing = Math.max(0, Math.ceil((upTo.getTime() - accrualStart.getTime()) / DAY_MS));
  return Math.round(annual * Math.min(daysAccruing / totalDaysInYear, 1) * 10) / 10;
}

/** What a person earns per month at their rate — the figure that explains the rest. */
export function monthlyAccrualRate(annualAllowance: number): number {
  return Math.round((annualAllowance / 12) * 100) / 100;
}
