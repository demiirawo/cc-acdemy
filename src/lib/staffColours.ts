/**
 * A colour per person on a client's rota, so that within one client's block
 * the names can be told apart at a glance rather than by reading each one.
 *
 * The card itself is already spoken for: its background and border say what
 * kind of shift this is and what state it is in (overtime, holiday, covered,
 * no cover), and there is a legend for that. So the person's colour goes on
 * the name alone, with a dot beside it, and nothing else on the card changes.
 *
 * Colours are assigned per client, not globally. Fifty admins cannot have
 * fifty colours anyone could tell apart, but one client rarely has more than
 * a handful, and telling people apart within a client is what was asked for.
 * The same person may be a different colour at a different client; the
 * colours are for separating names, not for recognising them.
 */

import { isPlaceholderShift } from "./placeholderShift";

export interface StaffColour {
  /** The name. */
  text: string;
  /** The dot before it. */
  dot: string;
}

/**
 * Twelve hues, ordered so that the first few — the ones almost every client
 * uses — sit far apart and mean nothing else on the rota. Red, amber and
 * orange come late: a red name on a "no cover" card, or an amber one on a
 * holiday card, would read as part of the warning rather than as a person,
 * and orange is the overtime badge. The greens are spread out and kept off
 * the top spots for the same reason, since a covered shift is green.
 *
 * Shades were checked against every card tint on both pages: -700 clears the
 * 4.5:1 text contrast everywhere except for the three pale hues (orange, lime,
 * yellow), which drop to -800. No card has a dark-mode tint — they stay light
 * on a dark page — so the same shades hold in dark mode, and a lighter
 * dark-mode text would be unreadable on them.
 *
 * Past twelve the palette repeats. A client with thirteen people on one
 * block is the Care Cuddle bench page, where the names are read anyway.
 */
export const STAFF_COLOUR_PALETTE: StaffColour[] = [
  { text: "text-sky-700", dot: "bg-sky-700" },
  { text: "text-fuchsia-700", dot: "bg-fuchsia-700" },
  { text: "text-teal-700", dot: "bg-teal-700" },
  { text: "text-violet-700", dot: "bg-violet-700" },
  { text: "text-orange-800", dot: "bg-orange-800" },
  { text: "text-lime-800", dot: "bg-lime-800" },
  { text: "text-rose-700", dot: "bg-rose-700" },
  { text: "text-indigo-700", dot: "bg-indigo-700" },
  { text: "text-emerald-700", dot: "bg-emerald-700" },
  { text: "text-pink-700", dot: "bg-pink-700" },
  { text: "text-cyan-700", dot: "bg-cyan-700" },
  { text: "text-yellow-800", dot: "bg-yellow-800" },
];

/**
 * One colour per person among `userIds`, keyed by user id.
 *
 * Deterministic, so a person is coloured the same on every reload and on
 * both the staff rota and the client's own page: people are sorted by name
 * (case-insensitively, in a fixed collation so the viewer's browser locale
 * cannot reorder them, with the id as the tie-break so two people with the
 * same name never swap between renders) and take palette colours in that
 * order. Callers pass the client's whole current team, not just the week on
 * screen, so a colour only changes when somebody joins or leaves the client
 * — not every week somebody happens to be off. Placeholders have nobody on
 * them and keep their own dashed styling, so they are skipped; a caller can
 * pass every shift's user_id as is, and an id that is not in the map simply
 * gets no colour.
 */
const byName = new Intl.Collator("en", { sensitivity: "base" }).compare;

export function buildStaffColourMap(
  userIds: Iterable<string | null | undefined>,
  nameOf: (userId: string) => string
): Map<string, StaffColour> {
  const names = new Map<string, string>();
  for (const id of userIds) {
    if (!id || isPlaceholderShift(id) || names.has(id)) continue;
    names.set(id, nameOf(id));
  }
  const ordered = [...names].sort(
    ([idA, nameA], [idB, nameB]) => byName(nameA, nameB) || (idA < idB ? -1 : idA > idB ? 1 : 0)
  );
  const colours = new Map<string, StaffColour>();
  ordered.forEach(([id], i) => {
    colours.set(id, STAFF_COLOUR_PALETTE[i % STAFF_COLOUR_PALETTE.length]);
  });
  return colours;
}
