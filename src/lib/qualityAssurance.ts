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

export const OUTCOME_LABELS: Record<Outcome, string> = {
  pass: "Pass",
  concerns: "Concerns",
  fail: "Fail",
};

/** Everyone on a monitoring shift is checked once a month. */
export const CHECK_DUE_AFTER_DAYS = 30;

/** How far ahead the rota is read when deciding who is in scope. */
export const SCOPE_AHEAD_DAYS = 28;

/**
 * The ordinary admin day. A shift that sits inside it is desk work; one that
 * starts before it or runs past it is out-of-hours cover, which is what the
 * monitoring shifts are.
 *
 * This is a rule about the rota rather than a flag on it, because nothing in
 * the data says "monitoring" — but the shape is unmistakable. 09:00–17:00 is
 * the standard shift across every client; the early and late cover belongs to
 * the handful of clients who are watched outside office hours. Change these two
 * times if the working day changes.
 */
export const OFFICE_DAY_START = "09:00";
export const OFFICE_DAY_END = "17:00";

/**
 * The hours that mark a client out as monitored rather than merely staffed.
 *
 * Somebody starting at 07:00 or still on at 21:00 is covering a visit run;
 * somebody finishing at 17:30 is finishing late. The gap between these and the
 * office day is deliberate — it is what separates a client with genuine
 * out-of-hours cover from one whose day happens to be shifted by half an hour.
 */
export const OUT_OF_HOURS_BEFORE = "08:00";
export const OUT_OF_HOURS_AFTER = "20:00";

interface ClientShift { client_name: string | null; start_time: string | null; end_time: string | null }

/**
 * Which clients are actually monitored: the ones somebody covers well outside
 * the office day.
 *
 * Judged per client rather than per shift, because a monitoring client's middle
 * shift is still a monitoring shift. Doing it the other way round pulled in an
 * ordinary day that happened to run to 17:30 and missed nothing in return.
 */
export function monitoringClients(shifts: ClientShift[]): Set<string> {
  const out = new Set<string>();
  for (const s of shifts) {
    const name = (s.client_name ?? "").trim();
    if (!name || name.toLowerCase() === "care cuddle") continue;
    const from = s.start_time?.slice(0, 5), to = s.end_time?.slice(0, 5);
    if ((from && from < OUT_OF_HOURS_BEFORE) || (to && to > OUT_OF_HOURS_AFTER)) out.add(name);
  }
  return out;
}

/**
 * Whether this particular shift is one to check: outside the office day, for a
 * client that is monitored out of hours.
 */
export function isMonitoringShift(
  startTime: string | null, endTime: string | null,
  clientName?: string | null, monitored?: Set<string>,
): boolean {
  if (!startTime || !endTime) return false;
  if (monitored && !monitored.has((clientName ?? "").trim())) return false;
  return startTime.slice(0, 5) < OFFICE_DAY_START || endTime.slice(0, 5) > OFFICE_DAY_END;
}

export interface ShiftPattern {
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
