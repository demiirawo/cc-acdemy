import { format, parseISO, eachDayOfInterval, startOfDay } from "date-fns";

export interface TeamLeaveClash {
  user_id: string;
  display_name: string;
  start_date: string;
  end_date: string;
  status: string;
  request_type: string;
  shared_clients: string[];
}

export interface ClashBreakdown {
  /** Days in the request where a colleague on the same client is already off. */
  blocked: string[];
  /** Days in the request with nobody else off — what they can still book. */
  free: string[];
  /** Who is off, and on which of the requested days. */
  people: Array<{ name: string; days: string[]; clients: string[]; pending: boolean }>;
}

const iso = (d: Date) => format(d, "yyyy-MM-dd");

/**
 * Which days of a request a colleague on the same client has already taken.
 *
 * Worked out day by day rather than as a whole-range yes/no, because the useful
 * answer is almost never "no". Someone asking for a fortnight where a colleague
 * is off for two days of it should be told those two days and allowed to book
 * the other twelve, not simply refused.
 */
export function clashBreakdown(
  clashes: TeamLeaveClash[],
  start: Date | undefined,
  end: Date | undefined,
): ClashBreakdown {
  const empty: ClashBreakdown = { blocked: [], free: [], people: [] };
  if (!start) return empty;

  const requested = eachDayOfInterval({ start: startOfDay(start), end: startOfDay(end ?? start) }).map(iso);
  const takenBy = new Map<string, Set<string>>();

  for (const c of clashes) {
    const overlap = requested.filter(d => d >= c.start_date && d <= (c.end_date ?? c.start_date));
    if (overlap.length === 0) continue;
    if (!takenBy.has(c.display_name)) takenBy.set(c.display_name, new Set());
    overlap.forEach(d => takenBy.get(c.display_name)!.add(d));
  }

  const blockedSet = new Set<string>();
  const people = clashes
    .filter(c => takenBy.has(c.display_name))
    .reduce<ClashBreakdown["people"]>((acc, c) => {
      if (acc.some(p => p.name === c.display_name)) return acc;
      const days = [...takenBy.get(c.display_name)!].sort();
      days.forEach(d => blockedSet.add(d));
      acc.push({
        name: c.display_name,
        days,
        clients: c.shared_clients ?? [],
        pending: c.status === "pending",
      });
      return acc;
    }, []);

  return {
    blocked: [...blockedSet].sort(),
    free: requested.filter(d => !blockedSet.has(d)),
    people,
  };
}

/** "3, 4 and 5 January" — a run of dates without repeating the month five times. */
function listDays(days: string[]): string {
  const parts = days.map((d, i) => {
    const next = days[i + 1];
    const sameMonth = next && parseISO(next).getMonth() === parseISO(d).getMonth();
    return format(parseISO(d), sameMonth ? "d" : "d MMMM");
  });
  if (parts.length === 1) return parts[0];
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

/**
 * Says which days are already taken by someone covering the same client, and
 * refuses those days.
 *
 * This one does block. Two people off the same client at once is the failure
 * the clients actually notice, and it is the one thing a form can tell for
 * certain without a manager's judgement. The block is per-day rather than
 * per-request, so it always leaves a way forward: change the dates to the days
 * that are free, and the request goes through.
 */
export function TeamLeaveClashWarning({ breakdown }: { breakdown: ClashBreakdown }) {
  if (breakdown.blocked.length === 0) return null;

  const everyDayTaken = breakdown.free.length === 0;

  return (
    <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 space-y-2">
      <p className="text-sm font-medium text-destructive">
        {breakdown.blocked.length === 1
          ? "One of these days is already covered by someone else's leave"
          : `${breakdown.blocked.length} of these days are already covered by someone else's leave`}
      </p>

      <ul className="space-y-1.5">
        {breakdown.people.map(p => (
          <li key={p.name} className="text-sm text-foreground">
            <span className="font-medium">{p.name}</span> is off {listDays(p.days)}
            {p.pending && <span className="text-muted-foreground"> (requested, not yet approved)</span>}
            {p.clients.length > 0 && (
              <span className="block text-xs text-muted-foreground">
                You both work on {p.clients.join(", ")}
              </span>
            )}
          </li>
        ))}
      </ul>

      <p className="text-sm text-foreground">
        {everyDayTaken ? (
          <>Every day you have asked for is already taken. Pick different dates, or speak to your
          manager if this one cannot move.</>
        ) : (
          <>
            <span className="font-medium">{listDays(breakdown.free)}</span>{" "}
            {breakdown.free.length === 1 ? "is" : "are"} free — change your dates to those and this
            request can go through.
          </>
        )}
      </p>

      <p className="text-xs text-muted-foreground">
        Two people away from the same client at once is what clients notice, so leave cannot be
        booked over a colleague's. If the dates genuinely cannot move, ask your manager to arrange
        it directly.
      </p>
    </div>
  );
}
