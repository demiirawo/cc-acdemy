import { useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useHandoverUsers } from "./useHandoverUsers";

/** The parts of a task an email about it mentions. */
export interface NotifiableTask {
  task_name: string;
  task_description?: string | null;
  link?: string | null;
  target_date?: string | null;
  handed_over_by?: string | null;
}

/**
 * The emails a task sends when it changes hands. Names on tasks are display
 * names, so each is resolved to an email here; an unknown name, or a failed
 * send, is silent — the change to the task itself still goes through.
 */
export function useHandoverNotifications(clientName: string) {
  const { data: users = [] } = useHandoverUsers();

  // Resolve a display name to a staff record (case-insensitive).
  const userByName = (name?: string | null) => {
    const trimmed = (name || "").trim();
    if (!trimmed) return undefined;
    return users.find((u) => u.name.toLowerCase() === trimmed.toLowerCase());
  };

  // Tell the previous assignee they've been taken off a handover task, and tell
  // the person whose leave is being covered that their cover has changed.
  // Both are silent on failure — the reassignment itself still succeeds.
  const notifyCoverChange = async (
    type: "removed" | "cover_changed",
    recipientName: string,
    task: { task_name: string; target_date?: string | null },
    change: { previousAssignee?: string | null; newAssignee?: string | null },
  ) => {
    const user = userByName(recipientName);
    if (!user?.email) return;
    try {
      await supabase.functions.invoke("send-handover-change-email", {
        body: {
          type,
          recipientEmail: user.email,
          recipientName: user.name,
          clientName,
          taskName: task.task_name || "Untitled task",
          previousAssignee: change.previousAssignee ?? null,
          newAssignee: change.newAssignee ?? null,
          targetDate: task.target_date ?? null,
        },
      });
    } catch (e) {
      console.warn("Handover cover-change email failed", e);
    }
  };

  // Notify an assignee (by display name) that they have new handover tasks.
  // Batched per person: assigning a whole template set used to fire one email
  // per task within seconds — dozens of emails, tripping the mail provider's
  // rate limit and raising a failure alert for every rejected send. Tasks
  // assigned to the same person within a few seconds now leave as one email.
  // Silent on failure — assignment still succeeds.
  const pendingNotifies = useRef<Map<string, {
    user: { email: string; name: string };
    tasks: NotifiableTask[];
    timer: ReturnType<typeof setTimeout>;
  }>>(new Map());

  const notifyAssignment = (assigneeName: string, task: NotifiableTask) => {
    const trimmed = (assigneeName || "").trim();
    if (!trimmed) return;
    const user = userByName(trimmed);
    if (!user?.email) return;

    const key = user.email.toLowerCase();
    const existing = pendingNotifies.current.get(key);
    if (existing) {
      clearTimeout(existing.timer);
      existing.tasks.push(task);
    }
    const entry = existing ?? { user: { email: user.email, name: user.name }, tasks: [task], timer: 0 as unknown as ReturnType<typeof setTimeout> };
    entry.timer = setTimeout(async () => {
      pendingNotifies.current.delete(key);
      const [first, ...rest] = entry.tasks;
      try {
        await supabase.functions.invoke("send-handover-assignment-email", {
          body: {
            assigneeEmail: entry.user.email,
            assigneeName: entry.user.name,
            clientName,
            taskName: first.task_name,
            taskDescription: rest.length === 0 ? (first.task_description ?? null) : null,
            link: rest.length === 0 ? (first.link ?? null) : null,
            handedOverBy: first.handed_over_by ?? null,
            targetDate: rest.length === 0 ? (first.target_date ?? null) : null,
            // Extra task names, so the email reads "and N more" as one message
            // instead of N separate sends.
            additionalTaskNames: rest.map((t) => t.task_name),
          },
        });
      } catch (e) {
        console.warn("Handover assignment email failed", e);
      }
    }, 4000);
    pendingNotifies.current.set(key, entry);
  };

  return { notifyAssignment, notifyCoverChange };
}
