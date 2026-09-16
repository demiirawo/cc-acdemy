import { supabase } from "@/integrations/supabase/client";
import { format, parseISO } from "date-fns";
import type { Rank } from "@/components/hr/PerformanceRankBadge";

/**
 * A rating changes today; the bonus pot counts it from next month.
 *
 * Ratings used to wait for the 2nd of the following month, so that one landed
 * after payroll rather than in the middle of the month it was assessing. The
 * owner's rule (16 September 2026) separates the two things that date was
 * doing: the rating a person holds is true the moment it is decided, and they
 * are told the same day; the rating a month's pot is shared out on is the one
 * they worked that month under.
 *
 * So the profile is written now, and the row in pending_rating_changes — which
 * is how every month's pot knows the rating in force for it — is dated the 1st
 * of next month. This month is shared out on the old rating, next month on the
 * new one, and a month already paid is untouchable either way.
 *
 * Changes queued under the old scheme still sit in that table waiting for
 * apply-pending-ratings. Setting a new rating for the same person withdraws
 * theirs, so it cannot land later and overwrite this one.
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
 * Apply a rating change now: the profile, the history row and the email.
 *
 * The first two happen in one statement in the database, so a rating never
 * moves without the record that says what it replaced. The email follows, and
 * a failure to send it is reported without pretending the rating didn't change
 * — the rating is the record, the email is the courtesy.
 */
export async function applyRatingChange(opts: {
  userId: string;
  newRating: Rank;
  reason: string;
  recipient?: { email: string | null; name: string | null } | null;
}): Promise<{ previousRating: string | null; potFrom: Date; emailSent: boolean }> {
  const { data, error } = await (supabase as any).rpc("apply_rating_change", {
    p_user_id: opts.userId,
    p_new_rating: opts.newRating,
    p_reason: opts.reason,
  });
  if (error) throw error;

  const previousRating = (data?.[0]?.previous_rating ?? null) as string | null;
  // The month from which this rating counts towards the bonus pot.
  const potFrom = parseISO(String(data?.[0]?.effective_date));

  let emailSent = false;
  if (opts.recipient?.email) {
    const { error: mailError } = await supabase.functions.invoke("send-rank-change-email", {
      body: {
        recipientEmail: opts.recipient.email,
        recipientName: opts.recipient.name,
        oldRank: previousRating,
        newRank: opts.newRating,
        reason: opts.reason,
        potFrom: format(potFrom, "yyyy-MM-dd"),
      },
    });
    emailSent = !mailError;
  }

  return { previousRating, potFrom, emailSent };
}

/** A change already made that the pot has not started counting, if there is one. */
export async function fetchUndoableRatingChange(
  userId: string,
): Promise<{ previous_rating: string | null; new_rating: string; effective_date: string } | null> {
  const { data, error } = await supabase
    .from("pending_rating_changes")
    .select("previous_rating, new_rating, effective_date")
    .eq("user_id", userId)
    .not("applied_at", "is", null)
    .is("cancelled_at", null)
    .gt("effective_date", format(new Date(), "yyyy-MM-dd"))
    .order("applied_at", { ascending: false })
    .limit(1);
  if (error) throw error;
  return (data?.[0] as { previous_rating: string | null; new_rating: string; effective_date: string } | undefined) ?? null;
}

/**
 * Undo a rating change while the bonus pot has not started counting it.
 *
 * The rating goes back to what it was and the history row is cancelled, so no
 * month's pot ever reads it. Once next month arrives the change is part of how
 * that month was shared out, and the database refuses: from then on the answer
 * is a new rating, not an undo.
 */
export async function cancelRatingChange(userId: string): Promise<{ restoredRating: string | null; undoneRating: string | null }> {
  const { data, error } = await (supabase as any).rpc("cancel_rating_change", { p_user_id: userId });
  if (error) throw error;
  return {
    restoredRating: (data?.[0]?.restored_rating ?? null) as string | null,
    undoneRating: (data?.[0]?.undone_rating ?? null) as string | null,
  };
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
