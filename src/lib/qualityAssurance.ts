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
export type Outcome = "outstanding" | "good" | "requires_improvement" | "inadequate";

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
  etq_within_three_rings?: boolean | null;
  etq_gave_name_and_company?: boolean | null;
  etq_verified_caller?: boolean | null;
  etq_specific_callback?: boolean | null;
  etq_calm_and_professional?: boolean | null;
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

/** The CQC scale, so a check is read in the language the whole sector uses. */
export const OUTCOME_LABELS: Record<Outcome, string> = {
  outstanding: "Outstanding",
  good: "Good",
  requires_improvement: "Requires Improvement",
  inadequate: "Inadequate",
};

/** What each rating means here, so nobody has to infer it. */
export const OUTCOME_HINTS: Record<Outcome, string> = {
  outstanding: "Went beyond the standard — handled something well that they did not have to.",
  good: "Everything as it should be.",
  requires_improvement: "Reachable and safe, but something needs saying.",
  inadequate: "Did not answer, or the call was handled in a way a client would notice.",
};

/** Everyone on a monitoring shift is checked once a month. */
export const CHECK_DUE_AFTER_DAYS = 30;

/** How far ahead the rota is read when deciding who is in scope. */
export const SCOPE_AHEAD_DAYS = 28;

/**
 * The rota already says which shifts these are, so nothing is inferred.
 *
 * An earlier version worked it out from the hours — anything outside the office
 * day — which landed on roughly the right people for the wrong reason and would
 * have drifted the moment somebody scheduled a monitoring shift at noon.
 */
export const MONITORING_SHIFT_TYPE = "Call Monitoring";

/**
 * Whether this shift is one to check.
 *
 * Overtime is excluded: covering somebody else's monitoring shift now and again
 * is not the same as holding one, and checking a person on the strength of an
 * occasional Saturday says more about the rota than about them.
 */
export function isMonitoringShift(shiftType: string | null, isOvertime?: boolean | null): boolean {
  if (isOvertime) return false;
  return (shiftType ?? "").trim().toLowerCase() === MONITORING_SHIFT_TYPE.toLowerCase();
}

export interface ShiftPattern {
  shift_type?: string | null;
  start_time: string | null;
  end_time: string | null;
  start_date: string | null;
  end_date: string | null;
  days_of_week: number[] | null;
  is_overtime?: boolean | null;
}

/**
 * Whether this pattern actually puts somebody on shift between two dates.
 *
 * Over four weeks every weekday comes round at least twice, so for any pattern
 * that repeats there is no need to walk the calendar: it runs in the window if
 * its dates overlap the window and it has any days at all. That holds whether
 * the pattern is weekly or fortnightly, which is why the interval is not read.
 */
export function runsBetween(p: ShiftPattern, from: Date, to: Date): boolean {
  if (!p.days_of_week?.length) return false;
  const fromIso = from.toISOString().slice(0, 10);
  const toIso = to.toISOString().slice(0, 10);
  if (p.end_date && p.end_date < fromIso) return false;     // already finished
  if (p.start_date && p.start_date > toIso) return false;   // not started yet
  return true;
}

/** "07:00–10:00" — so whoever is checking knows when to ring. */
export function describeWindow(startTime: string | null, endTime: string | null): string {
  if (!startTime || !endTime) return "";
  return `${startTime.slice(0, 5)}–${endTime.slice(0, 5)}`;
}

/**
 * The five things you can hear on a call, from the phone etiquette guide, in
 * the order they happen.
 *
 * Written as a checklist rather than a judgement because whoever is doing the
 * checks this month may never have done one before. Reading these while the
 * call happens is the training — there is nothing else to brief them on.
 */
export const ETIQUETTE_POINTS = [
  { key: "etq_within_three_rings", label: "Picked up within three rings",
    hint: "Longer than that and a worried caller starts to think nobody is there." },
  { key: "etq_gave_name_and_company", label: "Gave their name and said Care Cuddle",
    hint: "Not just \u201chello\u201d. The caller should know who they have reached." },
  { key: "etq_verified_caller", label: "Checked who they were speaking to",
    hint: "Before discussing anything about a service user \u2014 name, and relationship to them." },
  { key: "etq_specific_callback", label: "Gave a specific time for any callback",
    hint: "\u201cBy 2pm\u201d, not \u201cshortly\u201d. Only counts if a callback came up." },
  { key: "etq_calm_and_professional", label: "Sounded calm and unhurried",
    hint: "No sense of being caught out or wanting the call to end." },
] as const;

export type EtiquettePoint = (typeof ETIQUETTE_POINTS)[number]["key"];

/**
 * Turn the ticks into the one-word summary stored alongside them.
 *
 * A point left blank is one that did not come up — a callback time cannot be
 * judged on a call where nothing needed calling back — so blanks are ignored
 * rather than counted against anybody.
 */
export function etiquetteFromChecklist(ticks: Partial<Record<EtiquettePoint, boolean | null>>): Etiquette {
  const answered = ETIQUETTE_POINTS.map(p => ticks[p.key]).filter(v => v === true || v === false);
  if (answered.length === 0) return "not_applicable";
  const missed = answered.filter(v => v === false).length;
  if (missed === 0) return "followed";
  if (missed === 1) return "partly";
  return "not_followed";
}

/**
 * What the check adds up to, offered as a starting point rather than imposed.
 *
 * No answer is a fail on its own — being reachable is the whole job of the
 * shift, and nothing else on the form can make up for it. Everything short of
 * that is a judgement, so the person doing the check can override this.
 */
export function suggestOutcome(a: Answered, e: Etiquette, n: Noise): Outcome {
  if (a !== "answered") return "inadequate";
  if (e === "not_followed" || n === "disruptive") return "inadequate";
  if (e === "partly" || n === "some") return "requires_improvement";
  // Good is the best the form can work out on its own. Outstanding means
  // somebody did more than the standard asks, which is a judgement only the
  // person who heard the call can make — so it is never suggested, only chosen.
  return "good";
}

/** Whether this check is one somebody should be spoken to about. */
export function worthRaising(check: Pick<QaCheck, "outcome" | "raised_warning_id">): boolean {
  return (check.outcome === "requires_improvement" || check.outcome === "inadequate")
    && !check.raised_warning_id;
}

/** A rating below Good has to be explained — the note is what gets said to them. */
export function needsExplaining(outcome: Outcome | ""): boolean {
  return outcome === "requires_improvement" || outcome === "inadequate";
}

export interface DueRow {
  userId: string;
  name: string;
  clients: string[];
  /** The monitoring windows they cover, so a checker knows when to ring. */
  windows: string[];
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
