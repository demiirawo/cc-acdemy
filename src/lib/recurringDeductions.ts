import { addMonths, differenceInCalendarMonths, endOfMonth, format, parseISO, startOfMonth } from "date-fns";

/**
 * RECURRING DEDUCTIONS.
 *
 * A deduction that runs for a term: the same amount every month from a start
 * month to an end month, or until stopped. Recovering a laptop over three
 * months is one row here, not three pay records typed in by hand.
 *
 * Payroll and the staff member's own pay view both read these through the
 * functions below, so the two cannot disagree. While a month is unpaid the
 * instalment is added live; when the month is paid, buildPaymentRecords
 * writes it into staff_pay_records as a 'deduction' tagged with
 * RECURRING_DEDUCTION_TAG, and from then on the record is what counts — a
 * later change to the row cannot move a paid month.
 */

/** Leads the description of every captured instalment, so it can be told from a one-off. */
export const RECURRING_DEDUCTION_TAG = "Recurring deduction";

export interface RecurringDeduction {
  id: string;
  user_id: string;
  amount: number;
  currency: string;
  /** The reason, shown to the staff member. */
  description: string | null;
  /** First day of the first month it applies to. */
  start_date: string;
  /** Last day of the last month it applies to; null = until stopped. */
  end_date: string | null;
}

/** The rows that apply to any part of the month — the same overlap test recurring bonuses use. */
export function activeRecurringDeductions<T extends Pick<RecurringDeduction, "user_id" | "start_date" | "end_date">>(
  rows: T[], userId: string, monthStart: Date, monthEnd: Date,
): T[] {
  const s = format(monthStart, "yyyy-MM-dd");
  const e = format(monthEnd, "yyyy-MM-dd");
  return rows.filter(r => r.user_id === userId && r.start_date <= e && (!r.end_date || r.end_date >= s));
}

/** Where a month falls in the term: "month 2 of 3", or "month 4" when it runs until stopped. */
export function deductionTerm(row: Pick<RecurringDeduction, "start_date" | "end_date">, month: Date): { index: number; total: number | null } {
  const index = differenceInCalendarMonths(startOfMonth(month), parseISO(row.start_date)) + 1;
  const total = row.end_date ? differenceInCalendarMonths(parseISO(row.end_date), parseISO(row.start_date)) + 1 : null;
  return { index, total };
}

export function deductionTermLabel(row: Pick<RecurringDeduction, "start_date" | "end_date">, month: Date): string {
  const { index, total } = deductionTerm(row, month);
  return total ? `month ${index} of ${total}` : `month ${index}, until stopped`;
}

/** "Laptop Deduction · month 2 of 3" — the line shown on pay breakdowns. */
export function recurringDeductionLine(row: Pick<RecurringDeduction, "description" | "start_date" | "end_date">, month: Date): string {
  return `${(row.description || "").trim() || "Recurring deduction"} · ${deductionTermLabel(row, month)}`;
}

/** The end_date for a deduction of `months` months starting in `start`'s month. */
export function endDateForMonths(start: Date, months: number): string {
  return format(endOfMonth(addMonths(startOfMonth(start), months - 1)), "yyyy-MM-dd");
}

/** Money in the row's own currency, to two places. */
export const amountOf = (row: Pick<RecurringDeduction, "amount">) => Number(row.amount) || 0;
