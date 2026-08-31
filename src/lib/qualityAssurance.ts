import { differenceInCalendarDays } from "date-fns";

/**
 * Quality assurance spot checks on the people covering monitoring shifts.
 *
 * A check is one call: somebody rings the admin who is on shift and records
 * what happened. Three questions, in the order they matter — did they answer,
 * was the call handled properly, and could you hear them over the background.
 *
 * The standards being checked are not new. They are the phone etiquette guide
 * and clause 11 of the contract; what was missing was anybody writing down
 * whether they were met.
 */

export type Answered = "answered" | "no_answer" | "voicemail" | "engaged";
export type Etiquette = "followed" | "partly" | "not_followed" | "not_applicable";
export type Noise = "none" | "some" | "disruptive" | "not_applicable";
export type Outcome = "pass" | "concerns" | "fail";

export interface QaCheck {
  id: string;
  staff_user_id: string;
  check_type: string;
  client_name: string | null;
  checked_at: string;
  checked_by: string | null;
  answered: Answered;
  rings_to_answer: number | null;
  etiquette: Etiquette;
  background_noise: Noise;
  notes: string | null;
  outcome: Outcome;
  raised_warning_id: string | null;
}

export const ANSWERED_LABELS: Record<Answered, string> = {
  answered: "Answered",
  no_answer: "No answer",
  voicemail: "Went to voicemail",
  engaged: "Engaged",
};

export const ETIQUETTE_LABELS: Record<Etiquette, string> = {
  followed: "Followed",
  partly: "Partly followed",
  not_followed: "Not followed",
  not_applicable: "—",
};

export const NOISE_LABELS: Record<Noise, string> = {
  none: "Quiet",
  some: "Some noise",
  disruptive: "Disruptive",
  not_applicable: "—",
};

export const OUTCOME_LABELS: Record<Outcome, string> = {
  pass: "Pass",
  concerns: "Concerns",
  fail: "Fail",
};

/** How long a monitoring shift can go unchecked before it is worth a look. */
export const CHECK_DUE_AFTER_DAYS = 14;

/**
 * What the check adds up to, offered as a starting point rather than imposed.
 *
 * No answer is a fail on its own — being reachable is the whole job of the
 * shift, and nothing else on the form can make up for it. Everything short of
 * that is a judgement, so the person doing the check can override this.
 */
export function suggestOutcome(a: Answered, e: Etiquette, n: Noise): Outcome {
  if (a !== "answered") return "fail";
  if (e === "not_followed" || n === "disruptive") return "fail";
  if (e === "partly" || n === "some") return "concerns";
  return "pass";
}

/** Whether this check is one somebody should be spoken to about. */
export function worthRaising(check: Pick<QaCheck, "outcome" | "raised_warning_id">): boolean {
  return check.outcome !== "pass" && !check.raised_warning_id;
}

export interface DueRow {
  userId: string;
  name: string;
  clients: string[];
  lastCheckedAt: string | null;
  lastOutcome: Outcome | null;
  daysSince: number | null;
}

/**
 * Who is furthest from a check, longest wait first, never-checked at the top.
 *
 * Sorting by how overdue somebody is rather than alphabetically is the whole
 * point of the list: it answers "who should I ring today", which is the only
 * question anybody opens it to ask.
 */
export function orderByOverdue(rows: DueRow[]): DueRow[] {
  return [...rows].sort((a, b) => {
    if (a.daysSince === null && b.daysSince === null) return a.name.localeCompare(b.name);
    if (a.daysSince === null) return -1;
    if (b.daysSince === null) return 1;
    return b.daysSince - a.daysSince;
  });
}

export function daysSince(iso: string | null, now: Date = new Date()): number | null {
  if (!iso) return null;
  return Math.max(0, differenceInCalendarDays(now, new Date(iso)));
}

/** Never checked counts as due — that is the case most worth surfacing. */
export function isDue(daysSinceLast: number | null): boolean {
  return daysSinceLast === null || daysSinceLast >= CHECK_DUE_AFTER_DAYS;
}
