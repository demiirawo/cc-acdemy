/**
 * A client's fee over time.
 *
 * The fee is not a single number with an undo button — it is a timeline. A
 * client signed three years ago may have had an uplift each April, a reduction
 * when they dropped a service, and a rise scheduled for next quarter, and all
 * five of those facts are true at once. What the finance page needs to answer
 * is "what were they paying in March 2025", and only a timeline can answer it.
 *
 * The timeline is the source of truth. clients.mrr is a cache of whatever this
 * says is in force today, rewritten whenever the timeline changes — never the
 * other way round.
 *
 * This replaces a model that stored each change's "previous" figure as the live
 * fee at the moment somebody typed it. That only held while changes were
 * entered in date order and never edited. Enter a backdated change, or correct
 * one, and the chain broke silently: Ignite Healthcare had a change from £398
 * recorded as a change from £228, and nothing on the page showed the
 * contradiction.
 */

export interface PriceChangeRow {
  id: string;
  client_id: string;
  previous_mrr: number | null;
  new_mrr: number;
  effective_date: string;   // yyyy-mm-dd
  reason: string | null;
  created_at?: string;
}

/**
 * Date order, with insertion order breaking ties.
 *
 * Two changes on the same date is not a mistake worth rejecting — a correction
 * entered twice in a day is ordinary — so the later-created one wins, which is
 * what somebody fixing a typo expects.
 */
export function sortChanges<T extends PriceChangeRow>(changes: T[]): T[] {
  return [...changes].sort((a, b) =>
    a.effective_date.localeCompare(b.effective_date) ||
    (a.created_at ?? "").localeCompare(b.created_at ?? ""));
}

/**
 * The fee the client started on, before any recorded change.
 *
 * Held as the first change's `previous_mrr` rather than a column of its own, so
 * there is one place a fee can be written down and no chance of a base figure
 * disagreeing with the chain built on it. With no changes at all, the live fee
 * is the base by definition.
 */
export function baseFee(changes: PriceChangeRow[], liveMrr: number): number {
  const sorted = sortChanges(changes);
  if (sorted.length === 0) return liveMrr;
  return Number(sorted[0].previous_mrr ?? 0);
}

/**
 * Re-link every change to the one before it.
 *
 * Returns only the rows whose `previous_mrr` is wrong, so a caller can write
 * back the few that moved instead of rewriting the whole history on every edit.
 */
export function rebuildChain(changes: PriceChangeRow[], base: number): Array<{ id: string; previous_mrr: number }> {
  const sorted = sortChanges(changes);
  const fixes: Array<{ id: string; previous_mrr: number }> = [];
  let running = base;
  for (const c of sorted) {
    if (Number(c.previous_mrr ?? NaN) !== running) fixes.push({ id: c.id, previous_mrr: running });
    running = Number(c.new_mrr);
  }
  return fixes;
}

/**
 * What they were paying on a given date.
 *
 * A change takes effect ON its effective date, so a change dated 1 March is
 * already in force on 1 March — the same reading the revenue chart uses when it
 * attributes a month's income.
 */
export function feeOn(date: string, changes: PriceChangeRow[], liveMrr: number): number {
  const sorted = sortChanges(changes).filter(c => c.effective_date <= date);
  if (sorted.length === 0) return baseFee(changes, liveMrr);
  return Number(sorted[sorted.length - 1].new_mrr);
}

/** The fee in force today — what clients.mrr should be set to. */
export function currentFee(changes: PriceChangeRow[], liveMrr: number, today: string): number {
  return feeOn(today, changes, liveMrr);
}

/** Changes that have not started yet, soonest first. */
export function scheduledChanges<T extends PriceChangeRow>(changes: T[], today: string): T[] {
  return sortChanges(changes).filter(c => c.effective_date > today);
}

/**
 * Whether a proposed change says anything.
 *
 * A change to the same figure it was already on is not history, it is noise —
 * and it makes the timeline harder to read for no gain.
 */
export function isRedundant(newMrr: number, effectiveDate: string, changes: PriceChangeRow[], liveMrr: number,
                            ignoreId?: string): boolean {
  const others = changes.filter(c => c.id !== ignoreId);
  return feeOn(effectiveDate, others, liveMrr) === newMrr;
}
