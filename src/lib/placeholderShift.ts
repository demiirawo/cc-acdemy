/**
 * A placeholder shift: on the rota, committed to the client, nobody on it yet.
 *
 * user_id NULL is the whole definition. It is deliberately not a status column —
 * a shift stops being a placeholder the moment somebody is named on it, and
 * there is no third state to get out of step.
 *
 * The label and the styling live here rather than in each view because five
 * components render shifts and three of them had their own name lookup that
 * returned "Unknown" for a null user — which reads as a person the app failed
 * to identify rather than a gap nobody has filled. One definition, so a
 * placeholder cannot look like one thing on the staff rota and another on the
 * page the client sees.
 */

export const PLACEHOLDER_LABEL = "Placeholder";

/** The form-state sentinel. Never stored — the writer maps it back to NULL. */
export const PLACEHOLDER = "__placeholder__";

export const isPlaceholderShift = (userId: string | null | undefined): boolean =>
  !userId || userId === PLACEHOLDER;

export interface PlaceholderStyle {
  /** Grid cells and day cards, which use a 1px border. */
  block: string;
  /** The live timeline, which uses border-2. */
  timeline: string;
  text: string;
}

/**
 * One colour per placeholder series on a client, so two unfilled slots side by
 * side on the same day are told apart at a glance rather than by reading the
 * number off each one.
 *
 * Yellow first, as the colour of the thing that still needs doing. After that
 * the order maximises the hue gap between neighbours, because it is
 * consecutive series that appear next to each other. Beyond six the palette
 * repeats — a client with seven unfilled series has a bigger problem than a
 * colour clash, and the number on the label still separates them.
 *
 * Every entry is dashed. That is what distinguishes a placeholder from a real
 * shift, and it means none of these hues has to avoid the eight the shift-type
 * palette already spends — nothing else on the rota is dashed, so a placeholder
 * never has to be identified by colour alone.
 */
export const PLACEHOLDER_PALETTE: PlaceholderStyle[] = [
  {
    block: "bg-yellow-100 border-yellow-400 border-dashed",
    timeline: "bg-yellow-100 border-2 border-dashed border-yellow-500",
    text: "text-yellow-900",
  },
  {
    block: "bg-teal-100 border-teal-400 border-dashed",
    timeline: "bg-teal-100 border-2 border-dashed border-teal-500",
    text: "text-teal-900",
  },
  {
    block: "bg-fuchsia-100 border-fuchsia-400 border-dashed",
    timeline: "bg-fuchsia-100 border-2 border-dashed border-fuchsia-500",
    text: "text-fuchsia-900",
  },
  {
    block: "bg-lime-100 border-lime-400 border-dashed",
    timeline: "bg-lime-100 border-2 border-dashed border-lime-500",
    text: "text-lime-900",
  },
  {
    block: "bg-indigo-100 border-indigo-400 border-dashed",
    timeline: "bg-indigo-100 border-2 border-dashed border-indigo-500",
    text: "text-indigo-900",
  },
  {
    block: "bg-rose-100 border-rose-400 border-dashed",
    timeline: "bg-rose-100 border-2 border-dashed border-rose-500",
    text: "text-rose-900",
  },
];

/** What an unnumbered placeholder wears — a one-off, with no series behind it. */
export const PLACEHOLDER_STYLES = PLACEHOLDER_PALETTE[0];

/** A recurring pattern, as far as numbering needs to know. */
export interface PlaceholderSeries {
  id: string;
  user_id: string | null;
  client_name: string | null;
  start_time?: string | null;
}

export interface PlaceholderInfo {
  label: string;
  style: PlaceholderStyle;
}

/**
 * Label and colour for each placeholder pattern, keyed by pattern id.
 *
 * Numbered per client, and only where a client has more than one — a single
 * placeholder is just "Placeholder", because "Placeholder 1" implies a second
 * one somewhere that the reader then goes looking for. It still gets the first
 * colour, so one placeholder anywhere is always yellow.
 *
 * Built from the patterns rather than from whatever shifts a view happens to
 * be showing, so the same series is "Placeholder 2", in the same colour, on the
 * staff rota, on the client's page and on the live timeline. Numbering off the
 * visible shifts would renumber as soon as a day had a gap in it.
 */
export function placeholderSeriesInfo(
  patterns: PlaceholderSeries[]
): Map<string, PlaceholderInfo> {
  const byClient = new Map<string, PlaceholderSeries[]>();
  for (const p of patterns) {
    if (!isPlaceholderShift(p.user_id)) continue;
    const key = (p.client_name ?? "").trim().toLowerCase();
    const list = byClient.get(key);
    if (list) list.push(p);
    else byClient.set(key, [p]);
  }

  const info = new Map<string, PlaceholderInfo>();
  for (const list of byClient.values()) {
    // Earliest start first, so "Placeholder 1" is the first slot of the day.
    // Id as the tie-break: two 09:00 placeholders must keep the same number and
    // colour between renders rather than swapping depending on fetch order.
    list.sort(
      (a, b) =>
        (a.start_time ?? "").localeCompare(b.start_time ?? "") || a.id.localeCompare(b.id)
    );
    list.forEach((p, i) => {
      info.set(p.id, {
        label: list.length > 1 ? `${PLACEHOLDER_LABEL} ${i + 1}` : PLACEHOLDER_LABEL,
        style: PLACEHOLDER_PALETTE[i % PLACEHOLDER_PALETTE.length],
      });
    });
  }
  return info;
}

/**
 * The pattern a rendered shift came from. Views expand a recurring pattern into
 * one virtual shift per day with the id `pattern-{uuid}-{yyyy-MM-dd}`; a one-off
 * shift out of staff_schedules has no pattern behind it and returns null.
 */
export function patternIdOf(scheduleId: string): string | null {
  if (!scheduleId.startsWith("pattern-")) return null;
  const rest = scheduleId.slice("pattern-".length);
  if (rest.length < 11) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(rest.slice(-10))) return null;
  return rest.slice(0, -11) || null;
}

/**
 * The label and colour a shift should wear, or null if somebody is on it. A
 * one-off placeholder has no series to number and falls back to plain
 * "Placeholder" in the first colour.
 */
export function placeholderInfoFor(
  schedule: { id: string; user_id: string | null },
  series: Map<string, PlaceholderInfo>
): PlaceholderInfo | null {
  if (!isPlaceholderShift(schedule.user_id)) return null;
  const patternId = patternIdOf(schedule.id);
  return (
    (patternId ? series.get(patternId) : undefined) ?? {
      label: PLACEHOLDER_LABEL,
      style: PLACEHOLDER_PALETTE[0],
    }
  );
}

/**
 * The name to show on a shift: the numbered placeholder label where it is one,
 * otherwise whatever the view's own staff lookup returns.
 */
export function shiftDisplayName(
  schedule: { id: string; user_id: string | null },
  series: Map<string, PlaceholderInfo>,
  staffName: (userId: string | null) => string
): string {
  return placeholderInfoFor(schedule, series)?.label ?? staffName(schedule.user_id);
}
