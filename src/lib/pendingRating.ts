import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import type { Rank } from "@/components/hr/PerformanceRankBadge";

/**
 * Rating changes are decided now and take effect on the 2nd of the month.
 *
 * A rating that moves the day after a hard conversation reads as a reaction to
 * that conversation. The same rating landing on the 2nd, once payroll has run,
 * reads as what it is meant to be — an assessment of the month just finished.
 *
 * So nothing here writes to hr_profiles. The change is recorded, and the
 * apply-pending-ratings function moves it and sends the email on the day. Until
 * then the staff member sees their old rating, the bonus pot uses their old
 * rating, and no email has gone out.
 */

export interface PendingRatingChange {
  id: string;
  user_id: string;
  previous_rating: string | null;
  new_rating: string;
  reason: string;
  effective_date: string;
  created_at: string;
}

/**
 * The next 2nd of a month, strictly after today.
 *
 * Strictly, so a rating entered on the 2nd waits for the following month rather
 * than landing the same morning it was decided. One entered on the 1st still
 * lands on the 2nd — it is assessing the month that just ended, and holding it
 * another four weeks would make it stale.
 *
 * Mirrors next_rating_effective_date() in the database, which is what the
 * scheduled job actually goes by.
 */
export function nextRatingEffectiveDate(from: Date = new Date()): Date {
  if (from.getDate() < 2) return new Date(from.getFullYear(), from.getMonth(), 2);
  return new Date(from.getFullYear(), from.getMonth() + 1, 2);
}

/** "takes effect on Friday 2 October" — for telling an admin when it lands. */
export function describeEffectiveDate(d: Date): string {
  return format(d, "EEEE d MMMM");
}

export async function fetchPendingRatingChanges(userIds?: string[]): Promise<PendingRatingChange[]> {
  let q = supabase
    .from("pending_rating_changes")
    .select("id, user_id, previous_rating, new_rating, reason, effective_date, created_at")
    .is("applied_at", null)
    .is("cancelled_at", null);
  if (userIds?.length) q = q.in("user_id", userIds);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as PendingRatingChange[];
}

/**
 * Record a rating change to take effect on the 2nd.
 *
 * Replaces any change already waiting for the same person, so a second thought
 * during the month overwrites the first rather than queueing two moves for the
 * same morning.
 */
export async function schedulePendingRatingChange(opts: {
  userId: string;
  previousRating: Rank | null;
  newRating: Rank;
  reason: string;
  createdBy?: string | null;
}): Promise<{ effectiveDate: Date }> {
  const effective = nextRatingEffectiveDate();

  const { error: clearError } = await supabase
    .from("pending_rating_changes")
    .update({ cancelled_at: new Date().toISOString(), cancelled_by: opts.createdBy ?? null })
    .eq("user_id", opts.userId)
    .is("applied_at", null)
    .is("cancelled_at", null);
  if (clearError) throw clearError;

  const { error } = await supabase.from("pending_rating_changes").insert({
    user_id: opts.userId,
    previous_rating: opts.previousRating,
    new_rating: opts.newRating,
    reason: opts.reason,
    effective_date: format(effective, "yyyy-MM-dd"),
    created_by: opts.createdBy ?? null,
  });
  if (error) throw error;

  return { effectiveDate: effective };
}

/** Withdraw a change that has not landed yet. */
export async function cancelPendingRatingChange(id: string, byUserId?: string | null): Promise<void> {
  const { error } = await supabase
    .from("pending_rating_changes")
    .update({ cancelled_at: new Date().toISOString(), cancelled_by: byUserId ?? null })
    .eq("id", id)
    .is("applied_at", null);
  if (error) throw error;
}
