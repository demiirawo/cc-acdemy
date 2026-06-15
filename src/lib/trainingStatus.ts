import { addMonths, parseISO, differenceInCalendarDays } from "date-fns";

/** Is a single training item currently in date for a given completion date? */
export function trainingItemUpToDate(
  refreshMonths: number | null,
  completedDate: string | null | undefined
): boolean {
  if (!completedDate) return false;
  if (refreshMonths == null) return true; // never expires
  const expires = addMonths(parseISO(completedDate), refreshMonths);
  return differenceInCalendarDays(expires, new Date()) >= 0;
}

/**
 * True when every active training item is in date for the user.
 * No active items → vacuously up to date (nothing required).
 */
export function allTrainingUpToDate(
  items: { id: string; refresh_frequency_months: number | null }[],
  completedDateByItemId: Map<string, string>
): boolean {
  if (items.length === 0) return true;
  return items.every(it => trainingItemUpToDate(it.refresh_frequency_months, completedDateByItemId.get(it.id)));
}
