import { format } from "date-fns";

/**
 * RECURRING BONUSES, as payroll pays them.
 *
 * The same amount every month from a start month until stopped. While a month
 * is unpaid the bonus is added live; when the month is paid, buildPaymentRecords
 * writes it into staff_pay_records as a 'bonus' tagged with RECURRING_BONUS_TAG,
 * and from then on the record is what counts. A bonus added, backdated,
 * stopped or deleted afterwards cannot move a paid month. This is the same
 * arrangement as @/lib/recurringDeductions, read the same way by payroll and
 * by the staff member's own pay view.
 */

/** Leads the description of every captured instalment, so it can be told from a one-off. */
export const RECURRING_BONUS_TAG = "Recurring bonus";

/** The rows that apply to any part of the month. */
export function activeRecurringBonuses<T extends { user_id: string; start_date: string; end_date: string | null }>(
  rows: T[], userId: string, monthStart: Date, monthEnd: Date,
): T[] {
  const s = format(monthStart, "yyyy-MM-dd");
  const e = format(monthEnd, "yyyy-MM-dd");
  return rows.filter(r => r.user_id === userId && r.start_date <= e && (!r.end_date || r.end_date >= s));
}

/** What a captured instalment says after the tag: its description, or the tag again. */
export function recurringBonusLine(row: { description: string | null }): string {
  return (row.description || "").trim() || RECURRING_BONUS_TAG;
}
