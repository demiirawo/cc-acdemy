import { supabase } from "@/integrations/supabase/client";
import { patternDatesInWindow, type PatternWindow, PATTERN_WINDOW_COLS } from "@/lib/handoverStatus";

/**
 * Handover when somebody leaves.
 *
 * Deliberately opt-in, and off by default. Setting an end date is how every
 * departure gets recorded, but not every departure is a resignation — where
 * somebody is being dismissed, a checklist appearing in their profile would
 * announce it before a manager has, and would announce it in writing. So
 * nothing here happens until an admin turns it on for that person.
 *
 * The shape mirrors holiday handover: the clients that matter are the ones the
 * person actually has shifts for, and the job is only done when every one of
 * them is handed over. The difference is the window — a leaver hands over
 * everything they still hold between now and their last day, not the span of
 * one period of leave.
 */

export type DepartureStatus = "off" | "not_started" | "in_progress" | "complete";

export const DEPARTURE_STATUS_LABEL: Record<DepartureStatus, string> = {
  off: "Not requested",
  not_started: "Not started",
  in_progress: "In progress",
  complete: "Complete",
};

export interface DepartureClientProgress {
  client: string;
  avgProgress: number;
  taskCount: number;
}

export interface DepartureHandoverStatus {
  status: DepartureStatus;
  clients: DepartureClientProgress[];
  /** Whole-handover completion, 0–100, averaged across clients. */
  overallProgress: number;
}

/**
 * The clients this person still holds between today and their last day.
 *
 * Read from the rota rather than from a stored list, for the same reason the
 * quality-assurance page reads it: a list typed by hand goes stale the first
 * time somebody is moved, and a handover built on a stale list quietly misses
 * a client.
 */
export async function clientsToHandOver(userId: string, endDate: string, from = new Date()): Promise<string[]> {
  const fromIso = from.toISOString().slice(0, 10);
  if (endDate < fromIso) return [];
  const { data } = await supabase
    .from("recurring_shift_patterns")
    .select(PATTERN_WINDOW_COLS)
    .eq("user_id", userId);

  const clients = new Set<string>();
  for (const p of (data ?? []) as unknown as PatternWindow[]) {
    const name = (p.client_name ?? "").trim();
    if (!name) continue;
    if (patternDatesInWindow(p, fromIso, endDate).length > 0) clients.add(name);
  }
  return [...clients].sort();
}

/** Roll per-task progress up into per-client, then into one number. */
export function summarise(
  tasks: Array<{ client_name: string; progress: number | null }>,
  clients: string[],
): DepartureHandoverStatus {
  const per: DepartureClientProgress[] = clients.map((client) => {
    const mine = tasks.filter((t) => t.client_name === client);
    const avg = mine.length === 0 ? 0
      : Math.round(mine.reduce((s, t) => s + (Number(t.progress) || 0), 0) / mine.length);
    return { client, avgProgress: avg, taskCount: mine.length };
  });

  // A client with no tasks counts as nothing done rather than as done — the
  // goal is a confirmed handover, not an empty checklist.
  const overall = per.length === 0 ? 0
    : Math.round(per.reduce((s, c) => s + c.avgProgress, 0) / per.length);

  const status: DepartureStatus =
    per.length > 0 && per.every((c) => c.taskCount > 0 && c.avgProgress >= 100) ? "complete"
    : overall > 0 ? "in_progress"
    : "not_started";

  return { status, clients: per, overallProgress: overall };
}

/** Where a person's departure handover has got to. */
export async function departureHandoverStatus(
  userId: string, endDate: string | null, required: boolean,
): Promise<DepartureHandoverStatus> {
  if (!required || !endDate) return { status: "off", clients: [], overallProgress: 0 };
  const clients = await clientsToHandOver(userId, endDate);
  const { data } = await supabase
    .from("client_handover_tasks")
    .select("client_name, progress")
    .eq("leaver_user_id", userId);
  return summarise((data ?? []) as Array<{ client_name: string; progress: number | null }>, clients);
}

/**
 * Create the checklist, one copy of every template per client they hold.
 *
 * Only ever called when an admin turns the handover on. Existing rows are left
 * alone so turning it off and on again does not wipe work already done.
 */
export async function seedDepartureTasks(userId: string, endDate: string, byUserId?: string | null): Promise<number> {
  const clients = await clientsToHandOver(userId, endDate);
  if (clients.length === 0) return 0;

  const [{ data: templates }, { data: existing }] = await Promise.all([
    supabase.from("handover_task_templates").select("id, name, description, link, category, sort_order"),
    supabase.from("client_handover_tasks").select("client_name, template_id").eq("leaver_user_id", userId),
  ]);

  const already = new Set((existing ?? []).map((e) => `${e.client_name}|${e.template_id ?? ""}`));
  const rows = clients.flatMap((client) =>
    (templates ?? [])
      .filter((t) => !already.has(`${client}|${t.id}`))
      .map((t) => ({
        client_name: client,
        leaver_user_id: userId,
        template_id: t.id,
        category: t.category,
        task_name: t.name,
        task_description: t.description,
        link: t.link,
        handed_over_by: null,
        handed_over_to: null,
        progress: 0,
        target_date: endDate,
        sort_order: t.sort_order,
        created_by: byUserId ?? null,
      })));

  if (rows.length === 0) return 0;
  const { error } = await supabase.from("client_handover_tasks").insert(rows);
  if (error) throw error;
  return rows.length;
}
