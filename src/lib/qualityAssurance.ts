import { differenceInCalendarDays } from "date-fns";

/**
 * Quality assurance spot checks on the people covering monitoring shifts.
 *
 * A check is one call: somebody rings the line an admin is covering and records
 * what happened. Five questions, and no more — a checker who was half of the
 * conversation can answer these honestly from memory, which is the only kind of
 * answer worth recording.
 *
 *   1. Did they pick up?
 *   2. If not straight away, did they call back?
 *   3. Did they answer in a professional manner?
 *   4. Could you hear them clearly?
 *   5. Anything else worth noting?
 *
 * Question 3 is the whole Admin Phone Etiquette Guide in one question. The
 * guide is linked from the form rather than restated as a checklist: it is the
 * definition of professional here, and the standard has not changed — what the
 * form asks for is a judgement, not an audit.
 */

export type Answered = "answered" | "no_answer" | "voicemail" | "engaged";
/** Whether a missed call was returned — only meaningful when they missed it. */
export type CalledBack = "yes" | "no" | "not_applicable";

export type Etiquette = "followed" | "partly" | "not_followed" | "not_applicable";
export type Noise = "none" | "some" | "disruptive" | "driving" | "not_applicable";
export type Outcome = "outstanding" | "good" | "requires_improvement" | "inadequate";

export interface QaCheck {
  id: string;
  staff_user_id: string;
  check_type: string;
  client_name: string | null;
  checked_at: string;
  checked_by: string | null;
  answered: Answered;
  called_back: CalledBack;
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

export const CALLED_BACK_LABELS: Record<CalledBack, string> = {
  yes: "Called back",
  no: "Never called back",
  not_applicable: "—",
};

/** Question 3, in the words it is asked in: was this handled professionally? */
export const ETIQUETTE_LABELS: Record<Etiquette, string> = {
  followed: "Professional",
  partly: "Mostly",
  not_followed: "Not professional",
  not_applicable: "—",
};

export const NOISE_LABELS: Record<Noise, string> = {
  none: "Quiet",
  some: "Some noise",
  disruptive: "Disruptive",
  driving: "Driving",
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

/** Every monitoring line is checked once a fortnight. */
export const CHECK_DUE_AFTER_DAYS = 14;

/**
 * Where the standard being checked is written down.
 *
 * The checklist below is a summary of this page, not a separate rulebook. When
 * the two disagree, the guide is right and the checklist needs updating.
 */
export const ETIQUETTE_GUIDE_URL = "/public/51999292-c701-45c5-a4db-37efee32e66d";
export const ETIQUETTE_GUIDE_TITLE = "Admin Phone Etiquette Guide";

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
 * What the check adds up to, offered as a starting point rather than imposed.
 *
 * Missing a call and missing a call are not the same thing. One where they rang
 * back a few minutes later is a lapse; one where the phone simply went
 * unanswered and stayed that way is the failure the whole shift exists to
 * prevent. The old form flattened both into "no answer", which is exactly the
 * distinction this asks about — so it is the distinction the rating turns on.
 *
 * Everything short of that is a judgement, so it can be overridden.
 */
export function suggestOutcome(a: Answered, cb: CalledBack, e: Etiquette, n: Noise): Outcome {
  if (a !== "answered") return cb === "yes" ? "requires_improvement" : "inadequate";
  // Driving is not a shade of background noise. The guide bans it outright —
  // unsafe, illegal on a mobile, and poor call quality — so it fails on its own.
  if (e === "not_followed" || n === "disruptive" || n === "driving") return "inadequate";
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

/**
 * One line to be checked: a person on one client's monitoring shift.
 *
 * Not one row per person. An admin who covers two clients is answering two
 * different lines at two different times, and being reachable on one says
 * nothing about the other — so each is checked, and falls due, separately.
 * Rolling them into a single row per person also silently mispaired the
 * columns, listing one client's hours against another client's name.
 */
export interface DueRow {
  userId: string;
  name: string;
  /** The one client whose line this row is about. */
  client: string;
  /** That client's monitoring windows, so a checker knows when to ring. */
  windows: string[];
  lastCheckedAt: string | null;
  lastOutcome: Outcome | null;
  daysSince: number | null;
  /** When the next check falls due — a fortnight after the last one. */
  nextDueAt: Date | null;
}

/** A row is identified by the line, not the person. */
export function assignmentKey(userId: string, client: string): string {
  return `${userId}|${client}`;
}

/**
 * When this line is next due, given when it was last checked.
 *
 * Null means it has never been checked, which is not "due in a fortnight" but
 * due now — the caller renders that as its own state rather than showing a
 * date invented from an employment start or the day the page was opened.
 */
export function nextDueDate(lastCheckedAt: string | null): Date | null {
  if (!lastCheckedAt) return null;
  const d = new Date(lastCheckedAt);
  d.setDate(d.getDate() + CHECK_DUE_AFTER_DAYS);
  return d;
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
    if (a.daysSince === null && b.daysSince === null) {
      return a.name.localeCompare(b.name) || a.client.localeCompare(b.client);
    }
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
