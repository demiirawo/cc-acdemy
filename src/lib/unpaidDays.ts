import { differenceInCalendarDays, parseISO, startOfDay } from "date-fns";

/**
 * UNPAID DAYS IN A MONTH.
 *
 * Unpaid holiday and sickness are deducted at monthly salary ÷ 20 a day. A
 * request that sits inside the month counts every day it asked for. One that
 * crosses into another month is shared out in proportion to calendar days,
 * and the months' shares always add up to the days asked for.
 *
 * Payroll and the staff member's own pay view both call this. The pay view had
 * its own formula, and staff raise their invoice from it, so a sickness that
 * ran into the next month was forecast at one figure and deducted at another.
 * One function, one answer.
 *
 * Payroll's own formula, which this replaces, over-deducted. It measured the
 * month to its last instant (23:59:59.999) and rounded up, so a month the
 * request ran on past gained an extra calendar day; and each month's share was
 * rounded on its own. 24 Sep – 7 Oct, 10 days asked for, deducted 6 + 5 = 11.
 * Now shares are taken on calendar dates, and each month gets the rounded
 * running total up to its end minus the rounded running total before it, so
 * the shares add up to exactly the days asked for (5 + 5).
 */
export interface UnpaidRequest {
  start_date: string;
  end_date: string;
  /** The working days the request is for. */
  days_requested: number;
}

export function unpaidDaysInMonth(req: UnpaidRequest, monthStart: Date, monthEnd: Date): number {
  const startDate = parseISO(req.start_date);
  const endDate = parseISO(req.end_date);
  // Calendar dates, not instants: monthEnd is usually endOfMonth(), 23:59:59.999.
  const first = startOfDay(monthStart);
  const last = startOfDay(monthEnd);
  // Payroll only asks about requests that touch the month, but the pay view
  // asks about every request for every month: none of it falls in this one.
  if (startDate > last || endDate < first) return 0;
  if (startDate >= first && endDate <= last) return req.days_requested;

  const totalDays = differenceInCalendarDays(endDate, startDate) + 1;
  const sliceStart = startDate < first ? first : startDate;
  const sliceEnd = endDate > last ? last : endDate;
  const before = differenceInCalendarDays(sliceStart, startDate);
  const through = before + differenceInCalendarDays(sliceEnd, sliceStart) + 1;
  const share = (calendarDays: number) => Math.round((calendarDays / totalDays) * req.days_requested);
  return share(through) - share(before);
}
