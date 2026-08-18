/**
 * One answer to "is this person still with us?".
 *
 * Employment dates were being interpreted separately — or not at all — in each
 * screen that lists staff, so someone whose last day had passed carried on
 * appearing in cover pickers, training matrices and reminder emails. There are
 * three ways that happened, and this handles all three:
 *
 *   • a list that never looked at the end date;
 *   • a list that looked at `employment_status` instead, which stays "active"
 *     when a leaving date is recorded — the date is what's maintained, not the
 *     status, so the status is not a reliable test;
 *   • a list built from `profiles` alone, which contains sign-in accounts that
 *     were never staff and so have no HR record at all.
 *
 * The window is inclusive at both ends, matching payroll: someone leaving on
 * the 14th is employed on the 14th and gone on the 15th.
 */

export interface EmploymentWindow {
  start_date?: string | null;
  employment_end_date?: string | null;
}

/** Today as YYYY-MM-DD in local time — never a UTC shift across midnight. */
export function todayIso(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * Employed on a given day. No HR record means not staff — a sign-in account on
 * its own has never been evidence that somebody works here.
 */
export function isEmployedOn(w: EmploymentWindow | null | undefined, isoDate: string): boolean {
  if (!w) return false;
  const from = w.start_date || null;
  const until = w.employment_end_date || null;
  return (!from || isoDate >= from) && (!until || isoDate <= until);
}

/** Employed today. The test for "who can be picked right now". */
export function isCurrentlyEmployed(w: EmploymentWindow | null | undefined): boolean {
  return isEmployedOn(w, todayIso());
}

/**
 * Employed at any point between two dates. Use this for anything scheduled —
 * cover for next month should offer someone who starts next week, and should
 * not offer someone whose notice expires before the work begins.
 */
export function isEmployedDuring(
  w: EmploymentWindow | null | undefined,
  startIso: string,
  endIso: string,
): boolean {
  if (!w) return false;
  const from = w.start_date || null;
  const until = w.employment_end_date || null;
  return (!until || until >= startIso) && (!from || from <= endIso);
}

/** Their last day has passed. */
export function hasLeft(w: EmploymentWindow | null | undefined): boolean {
  const until = w?.employment_end_date;
  return Boolean(until && until < todayIso());
}

/** Leaving, but still here — worth showing with a note rather than hiding. */
export function isLeavingSoon(w: EmploymentWindow | null | undefined, withinDays = 30): boolean {
  const until = w?.employment_end_date;
  if (!until || hasLeft(w)) return false;
  const limit = new Date();
  limit.setDate(limit.getDate() + withinDays);
  const pad = (n: number) => String(n).padStart(2, "0");
  const limitIso = `${limit.getFullYear()}-${pad(limit.getMonth() + 1)}-${pad(limit.getDate())}`;
  return until <= limitIso;
}

/**
 * Keeps only the people employed on `isoDate` (today by default), given a
 * lookup of HR windows keyed by user_id.
 */
export function employedOnly<T extends { user_id: string }>(
  people: T[],
  windows: Map<string, EmploymentWindow>,
  isoDate: string = todayIso(),
): T[] {
  return people.filter((p) => isEmployedOn(windows.get(p.user_id), isoDate));
}
