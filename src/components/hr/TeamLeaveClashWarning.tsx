import { format, parseISO } from "date-fns";

export interface TeamLeaveClash {
  user_id: string;
  display_name: string;
  start_date: string;
  end_date: string;
  status: string;
  request_type: string;
  shared_clients: string[];
}

/**
 * Says out loud that somebody covering the same client is already off over
 * these dates. It never blocks the request — whether two people can be away at
 * once is a judgement for whoever approves it, not a rule the form can enforce.
 * The point is that nobody finds out after the fact.
 */
export function TeamLeaveClashWarning({ clashes }: { clashes: TeamLeaveClash[] }) {
  if (clashes.length === 0) return null;

  return (
    <div className="rounded-lg border border-amber-400/50 bg-amber-500/10 p-3 space-y-2">
      <p className="text-sm font-medium text-amber-700 dark:text-amber-300">
        {clashes.length === 1
          ? "Someone you work with is already off then"
          : `${clashes.length} people you work with are already off then`}
      </p>
      <ul className="space-y-1.5">
        {clashes.map((c) => (
          <li key={`${c.user_id}-${c.start_date}`} className="text-sm text-foreground">
            <span className="font-medium">{c.display_name}</span>
            {" — "}
            {format(parseISO(c.start_date), "d MMM")} to {format(parseISO(c.end_date), "d MMM")}
            {c.status === "pending" && (
              <span className="text-muted-foreground"> (requested, not yet approved)</span>
            )}
            {c.shared_clients?.length > 0 && (
              <span className="block text-xs text-muted-foreground">
                You both work on {c.shared_clients.join(", ")}
              </span>
            )}
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted-foreground">
        You can still send this request. It is less likely to be approved while someone
        covering the same client is away, so it is worth a word with them first.
      </p>
    </div>
  );
}
