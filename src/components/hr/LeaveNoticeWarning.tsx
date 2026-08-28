import { format, eachDayOfInterval, differenceInCalendarDays, startOfDay } from "date-fns";

/**
 * The two notice rules in the absence policy, and what the form does about them.
 *
 * Ordinary leave needs a calendar month. Leave in the peak period — 15 December
 * to 15 January, when cover is hardest to find and the whole winter rota has to
 * be settled in one pass — has to be asked for by 30 September, whichever day
 * of that period it falls on. Anything outside the peak period follows the
 * ordinary month.
 *
 * Neither is enforced here. A form is the wrong place to refuse leave: the
 * reason for a late request is often exactly the reason to allow it, and that
 * judgement belongs to whoever approves it. What the form owes people is that
 * nobody submits a request without knowing it is outside policy, and nobody is
 * surprised later by a deduction they did not see coming.
 */

/** The peak window a date falls in, and the day requests for that window close. */
export function peakLeaveWindowFor(date: Date): { start: Date; end: Date; deadline: Date } | null {
  const month = date.getMonth(), day = date.getDate();
  const inDecemberHalf = month === 11 && day >= 15;
  const inJanuaryHalf = month === 0 && day <= 15;
  if (!inDecemberHalf && !inJanuaryHalf) return null;
  // A January date belongs to the window that opened the previous December.
  const openedIn = inDecemberHalf ? date.getFullYear() : date.getFullYear() - 1;
  return {
    start: new Date(openedIn, 11, 15),
    end: new Date(openedIn + 1, 0, 15),
    deadline: new Date(openedIn, 8, 30),             // 30 September
  };
}

export interface NoticeBreach {
  kind: "peak" | "short_notice";
  /** Peak: the window that has already closed. */
  window?: { start: Date; end: Date; deadline: Date };
  /** Short notice: days between today and the first day off. */
  daysAhead?: number;
}

/**
 * Whether these dates break either notice rule, judged as at today.
 * Returns the peak breach in preference — it is the more serious of the two,
 * and a peak request made late is nearly always short notice as well.
 */
export function checkLeaveNotice(start: Date | undefined, end: Date | undefined): NoticeBreach | null {
  if (!start) return null;
  const today = startOfDay(new Date());

  // Any day of the request that sits in a peak window whose deadline has gone.
  for (const day of eachDayOfInterval({ start, end: end ?? start })) {
    const window = peakLeaveWindowFor(day);
    if (window && today > window.deadline) return { kind: "peak", window };
  }

  const daysAhead = differenceInCalendarDays(startOfDay(start), today);
  const monthAway = new Date(today);
  monthAway.setMonth(monthAway.getMonth() + 1);
  if (startOfDay(start) < startOfDay(monthAway)) return { kind: "short_notice", daysAhead };

  return null;
}

export function LeaveNoticeWarning({ breach, paid }: { breach: NoticeBreach | null; paid: boolean }) {
  if (!breach) return null;

  const unpaidLine = paid
    ? " Leave booked outside the notice period is unpaid unless management agrees otherwise, so this may come off your pay."
    : " You are already requesting this as unpaid leave, so there is nothing further to deduct — but cover still has to be found.";

  return (
    <div className="rounded-lg border border-amber-400/50 bg-amber-500/10 p-3 space-y-2">
      {breach.kind === "peak" ? (
        <>
          <p className="text-sm font-medium text-amber-700 dark:text-amber-300">
            These dates are in the peak period, and it has already closed
          </p>
          <p className="text-sm text-foreground">
            Leave between{" "}
            <span className="font-medium">{format(breach.window!.start, "d MMMM yyyy")}</span> and{" "}
            <span className="font-medium">{format(breach.window!.end, "d MMMM yyyy")}</span> had to be
            requested by <span className="font-medium">{format(breach.window!.deadline, "d MMMM yyyy")}</span>.
            Christmas and the new year are when cover is hardest to find, which is why the whole winter
            rota is settled in one pass at the end of September.
          </p>
        </>
      ) : (
        <>
          <p className="text-sm font-medium text-amber-700 dark:text-amber-300">
            This is less than a month's notice
          </p>
          <p className="text-sm text-foreground">
            Leave needs at least one calendar month's notice so cover can be arranged. These dates start{" "}
            <span className="font-medium">
              {breach.daysAhead === 0
                ? "today"
                : breach.daysAhead === 1
                  ? "tomorrow"
                  : breach.daysAhead! < 0
                    ? `${Math.abs(breach.daysAhead!)} days ago`
                    : `in ${breach.daysAhead} days`}
            </span>.
          </p>
        </>
      )}
      <p className="text-xs text-muted-foreground">
        You can still send this request, and it will go to your manager as normal.{unpaidLine}
      </p>
    </div>
  );
}
