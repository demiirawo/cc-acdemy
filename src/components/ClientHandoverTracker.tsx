import { useEffect, useMemo, useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { parseISO } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Ban, Check, ChevronRight, ExternalLink, MoveRight, Plane, RotateCcw, UserMinus, X } from "lucide-react";
import { toast } from "sonner";
import {
  ensureHandoverRow,
  getClientHandovers,
  groupHandoversByLeave,
  handoverKey,
  handoverTitle,
  moveHandoverTasks,
  setHandoverRequirement,
  type ClientHandover,
  type HandoverKind,
  type HandoverRequirement,
  type LeaveHandoverGroup,
} from "@/lib/handoverStatus";
import { HandoverTaskGrid } from "@/components/handover/HandoverTaskGrid";
import { HandoverTaskLibrary } from "@/components/handover/HandoverTaskLibrary";
import { newDraft, type DraftRow, type HandoverTask } from "@/components/handover/handoverTasks";
import { useHandoverTemplates, type HandoverTemplate } from "@/components/handover/useHandoverTemplates";
import { useHandoverUsers } from "@/components/handover/useHandoverUsers";
import { useHandoverNotifications } from "@/components/handover/useHandoverNotifications";

/**
 * The client's handover tracker: one checklist per handover — one person
 * handing this client to one colleague for one leave — grouped by the leave,
 * so everything Funmi has to hand over here before September AND before
 * October is on the page at once, each with its own progress and its own
 * "not required" decision.
 *
 * Which handovers exist comes from the rota and the cover requests (see
 * src/lib/handoverStatus.ts); the checklists and decisions live in
 * client_handovers / client_handover_tasks and are laid over the top here.
 */

interface Props {
  clientName: string;
  /** Open (and scroll to) a particular handover or leave instead of the soonest. */
  focus?: { holidayId?: string | null; departureUserId?: string | null; handoverId?: string | null };
}

/** The parts of a client_handovers row the handover list doesn't carry. */
interface StoredHandoverRow {
  id: string;
  kind: string;
  from_user_id: string;
  holiday_id: string | null;
  to_user_id: string | null;
  status_changed_by: string | null;
  status_changed_at: string | null;
}

/** A handover as shown here: the lib's handover, with its checklist attached. */
interface TrackedHandover extends ClientHandover {
  tasks: HandoverTask[];
  /** Required, has tasks, and every one of them is at 100%. */
  complete: boolean;
  /** Who last decided it was (not) required, when we know. */
  statusChangedBy: string | null;
  statusChangedAt: string | null;
}

interface TrackedGroup extends Omit<LeaveHandoverGroup, "handovers"> {
  handovers: TrackedHandover[];
}

/** The leave (or departure) a handover belongs to, among those on the page. */
const findGroup = (groups: TrackedGroup[], h: TrackedHandover) =>
  groups.find((g) => g.kind === h.kind && g.from.userId === h.from.userId && g.holidayId === h.holidayId);

/** Everything a section can do, so the sections stay dumb and stable. */
interface TrackerActions {
  createTask: (h: TrackedHandover, draft: DraftRow, onDone: () => void) => void;
  createPending: boolean;
  updateTask: (id: string, patch: Partial<HandoverTask>) => void;
  deleteTask: (id: string) => void;
  reassignTask: (task: HandoverTask, next: string) => void;
  clearTasks: (h: TrackedHandover) => void;
  markNotRequired: (h: TrackedHandover) => void;
  reinstate: (h: TrackedHandover) => void;
  moveTasks: (from: TrackedHandover, to: TrackedHandover) => void;
  addTemplate: (h: TrackedHandover, t: HandoverTemplate) => void;
  /** A decision, clear or move is in flight — hold the other buttons. */
  busy: boolean;
}

// ---------------------------------------------------------------------------
// Wording
// ---------------------------------------------------------------------------

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** "22 Sept 2026" — parsed as a local date, so it never slips a day west of Greenwich. */
const fmtDate = (iso: string) =>
  parseISO(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

/** "22 Sept–29 Sept 2026"; the year is only repeated when it changes. */
const fmtRange = (start: string, end: string) => {
  if (start === end) return fmtDate(start);
  const s = parseISO(start);
  const sameYear = s.getFullYear() === parseISO(end).getFullYear();
  const startLabel = sameYear ? s.toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : fmtDate(start);
  return `${startLabel}–${fmtDate(end)}`;
};

/** "24, 26 Oct" — a coverer's share of the leave; "30 Sept, 1 Oct" across a month end. */
const fmtCoveredDates = (dates: string[]) =>
  dates
    .map((d, i) => {
      const day = parseISO(d);
      const next = dates[i + 1] ? parseISO(dates[i + 1]) : null;
      const lastOfMonth = !next || next.getMonth() !== day.getMonth() || next.getFullYear() !== day.getFullYear();
      return lastOfMonth ? day.toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : String(day.getDate());
    })
    .join(", ");

const leaveTiming = (g: { kind: HandoverKind; ongoing: boolean; daysUntil: number; endDate: string }) => {
  if (g.kind === "departure") {
    return g.daysUntil > 0 ? `in ${plural(g.daysUntil, "day")}` : g.daysUntil === 0 ? "today" : `${plural(-g.daysUntil, "day")} ago`;
  }
  if (g.ongoing) return `on leave now — returns ${fmtDate(g.endDate)}`;
  if (g.daysUntil === 0) return "leave starts today";
  return `${plural(g.daysUntil, "day")} until leave starts`;
};

// The tone the leave banner always had: red once the leave is under way or
// within three days, amber within a week, calm otherwise.
const leaveTone = (g: { ongoing: boolean; daysUntil: number }) => {
  const urgent = g.ongoing || g.daysUntil <= 3;
  const soon = !urgent && g.daysUntil <= 7;
  return urgent
    ? "bg-destructive/10 text-destructive border-destructive/30"
    : soon
    ? "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30"
    : "bg-primary/5 text-primary border-primary/20";
};

const chevronClass = (open: boolean) =>
  `h-4 w-4 shrink-0 transition-transform ${open ? "rotate-90" : ""}`;

const toName = (h: Pick<ClientHandover, "to">) => (h.to ? h.to.name : "cover not assigned yet");

// The grid order: explicit sort_order first (nulls last), then creation time —
// what the old single query asked the database for.
const taskOrder = (a: HandoverTask, b: HandoverTask) => {
  const ao = a.sort_order ?? Number.MAX_SAFE_INTEGER;
  const bo = b.sort_order ?? Number.MAX_SAFE_INTEGER;
  if (ao !== bo) return ao - bo;
  return a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0;
};

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------

/** One leave (or departure): its banner, and its handovers underneath. */
function LeaveGroupSection({
  group, open, onOpenChange, children,
}: { group: TrackedGroup; open: boolean; onOpenChange: (open: boolean) => void; children: ReactNode }) {
  const Icon = group.kind === "departure" ? UserMinus : Plane;
  const required = group.handovers.filter((h) => h.requirement === "required");
  const progress = required.length
    ? Math.round(required.reduce((s, h) => s + h.avgProgress, 0) / required.length)
    : 0;
  const coverers = group.handovers.filter((h) => h.to).length;
  const who = group.kind === "departure"
    ? (coverers ? plural(coverers, "successor") : "successor not assigned yet")
    : (coverers ? plural(coverers, "coverer") : "cover not assigned yet");
  return (
    <Collapsible open={open} onOpenChange={onOpenChange}>
      <div className={`flex items-center gap-2 px-4 sm:px-6 py-2 border-b text-xs sm:text-sm font-medium ${leaveTone(group)}`}>
        <CollapsibleTrigger asChild>
          <button type="button" className="flex flex-1 items-center gap-2 min-w-0 text-left">
            <ChevronRight className={chevronClass(open)} />
            <Icon className="h-4 w-4 shrink-0" />
            <span className="truncate">
              {group.kind === "departure" ? (
                <><span className="font-semibold">{group.from.name}</span> leaves · last day {fmtDate(group.endDate)} · {leaveTiming(group)}</>
              ) : (
                <><span className="font-semibold">{group.from.name}</span>'s leave · {fmtRange(group.startDate, group.endDate)} · {leaveTiming(group)}</>
              )}
              {" · "}{who}
            </span>
          </button>
        </CollapsibleTrigger>
        <div className="flex items-center gap-2 shrink-0">
          {required.length === 0 ? (
            <Badge variant="outline" className="text-muted-foreground font-medium">Not required</Badge>
          ) : (
            <>
              <Progress value={progress} className="h-1.5 w-20 sm:w-28 bg-background/60" />
              <span className="text-xs font-semibold tabular-nums w-9 text-right">{progress}%</span>
            </>
          )}
        </div>
      </div>
      <CollapsibleContent>{children}</CollapsibleContent>
    </Collapsible>
  );
}

interface HandoverSectionProps {
  h: TrackedHandover;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** In the "earlier" list the leave itself has to be named. */
  showLeave?: boolean;
  /** "24, 26 Oct" — only when this coverer takes part of the leave. */
  coveredHint?: string | null;
  /** Live handovers of the same leave the checklist can be moved to. */
  moveTargets?: TrackedHandover[];
  moveHint?: string;
  /** Leave out and there is no Task Library — a stale checklist only gets moved or cleared. */
  templates?: HandoverTemplate[];
  onAddToAll?: (t: HandoverTemplate) => void;
  usedByAllTemplateIds?: Set<string>;
  actions: TrackerActions;
  sectionRef?: (el: HTMLDivElement | null) => void;
}

/** One handover: its header line, and (when open) its library and checklist. */
function HandoverSection({
  h, open, onOpenChange, showLeave = false, coveredHint, moveTargets, moveHint = "Move these",
  templates, onAddToAll, usedByAllTemplateIds, actions, sectionRef,
}: HandoverSectionProps) {
  const title = showLeave ? handoverTitle(h) : `→ ${toName(h)}`;
  const leaveLabel = showLeave
    ? `${h.kind === "departure" ? "departure" : "leave"} ${fmtRange(h.startDate, h.endDate)}`
    : null;
  const usedTemplateIds = new Set(h.tasks.map((t) => t.template_id).filter((id): id is string => !!id));

  if (h.requirement === "not_required") {
    // Decided against — the header says so and by whom; the checklist is kept
    // but out of the way until somebody reinstates it.
    const decided = [
      h.statusChangedBy ? `by ${h.statusChangedBy}` : null,
      h.statusChangedAt ? fmtDate(h.statusChangedAt) : null,
    ].filter(Boolean).join(", ");
    return (
      <div ref={sectionRef} className="flex items-center gap-2 flex-wrap px-4 sm:px-6 py-2 border-b border-border/60 bg-muted/10 text-sm text-muted-foreground">
        <Ban className="h-4 w-4 shrink-0" />
        <span className="font-medium">{title}</span>
        {leaveLabel && <span className="text-xs">· {leaveLabel}</span>}
        <Badge variant="outline" className="text-muted-foreground font-medium">Not required</Badge>
        {(h.notRequiredReason || decided) && (
          <span className="text-xs truncate min-w-0">
            {h.notRequiredReason}{h.notRequiredReason && decided ? " · " : ""}{decided}
          </span>
        )}
        <span className="ml-auto flex items-center gap-2 shrink-0">
          {h.taskCount > 0 && <span className="text-xs">{plural(h.taskCount, "task")} kept</span>}
          <Button
            variant="ghost" size="sm" className="h-7 px-2 text-xs text-primary"
            onClick={() => actions.reinstate(h)} disabled={actions.busy}
          >
            <RotateCcw className="h-3.5 w-3.5" /> Reinstate
          </Button>
        </span>
      </div>
    );
  }

  return (
    <Collapsible open={open} onOpenChange={onOpenChange}>
      <div ref={sectionRef} className="border-b border-border/60">
        <div className="flex items-center gap-2 flex-wrap px-4 sm:px-6 py-2">
          <CollapsibleTrigger asChild>
            <button type="button" className="flex flex-1 items-center gap-2 min-w-0 text-left text-sm">
              <ChevronRight className={`${chevronClass(open)} text-muted-foreground`} />
              <span className="font-semibold truncate">{title}</span>
              {leaveLabel && <span className="text-xs text-muted-foreground shrink-0">· {leaveLabel}</span>}
              {coveredHint && <span className="text-xs text-muted-foreground shrink-0">covers {coveredHint}</span>}
              {h.complete && (
                <Badge variant="outline" className="gap-1 border-success/40 bg-success/10 text-success font-medium">
                  <Check className="h-3 w-3" /> Complete
                </Badge>
              )}
              <span className="ml-auto flex items-center gap-2 text-xs text-muted-foreground shrink-0">
                {h.taskCount > 0
                  ? `${h.completedCount} of ${plural(h.taskCount, "task")} · ${h.avgProgress}%`
                  : "No tasks yet"}
                <Progress value={h.avgProgress} className="h-1.5 w-20 sm:w-28" />
              </span>
            </button>
          </CollapsibleTrigger>
          <div className="flex items-center gap-1 shrink-0">
            {h.derived && (
              <Button
                variant="ghost" size="sm" className="h-7 px-2 text-xs text-muted-foreground"
                onClick={() => actions.markNotRequired(h)} disabled={actions.busy}
                title="This handover isn't needed — keep it out of the way"
              >
                <Ban className="h-3.5 w-3.5" /> Mark not required
              </Button>
            )}
            {h.taskCount > 0 && (
              <Button
                variant="ghost" size="sm" className="h-7 px-2 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
                onClick={() => actions.clearTasks(h)} disabled={actions.busy}
                title="Delete every task in this handover"
              >
                <X className="h-3.5 w-3.5" /> Clear
              </Button>
            )}
          </div>
        </div>
        {moveTargets && moveTargets.length > 0 && h.taskCount > 0 && (
          <div className="flex items-center gap-2 flex-wrap px-4 sm:px-6 pb-2 text-xs text-muted-foreground">
            <span>{moveHint} {plural(h.taskCount, "task")} to</span>
            {moveTargets.map((target) => (
              <Button
                key={target.key} variant="outline" size="sm" className="h-7 px-2 text-xs"
                onClick={() => actions.moveTasks(h, target)} disabled={actions.busy}
              >
                <MoveRight className="h-3.5 w-3.5" /> {toName(target)}
              </Button>
            ))}
          </div>
        )}
        <CollapsibleContent>
          {templates && (
            <HandoverTaskLibrary
              templates={templates}
              usedTemplateIds={usedTemplateIds}
              onAdd={(t) => actions.addTemplate(h, t)}
              onAddToAll={onAddToAll}
              usedByAllTemplateIds={usedByAllTemplateIds}
            />
          )}
          <HandoverTaskGrid
            tasks={h.tasks}
            onUpdate={actions.updateTask}
            onDelete={actions.deleteTask}
            onReassign={actions.reassignTask}
            // Only a live handover takes new tasks; a stale checklist is history.
            onCreate={h.derived ? (draft, onDone) => actions.createTask(h, draft, onDone) : undefined}
            createPending={actions.createPending}
            defaultFrom={h.from.name}
            defaultTo={h.to?.name ?? ""}
          />
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

/** A muted, closed-by-default section: earlier handovers, unlinked tasks. */
function HistorySection({
  title, hint, open, onOpenChange, actions, children,
}: { title: string; hint?: string; open: boolean; onOpenChange: (open: boolean) => void; actions?: ReactNode; children: ReactNode }) {
  return (
    <Collapsible open={open} onOpenChange={onOpenChange}>
      <div className="flex items-center gap-2 px-4 sm:px-6 py-2 border-b bg-muted/20 text-sm">
        <CollapsibleTrigger asChild>
          <button type="button" className="flex flex-1 items-center gap-2 min-w-0 text-left">
            <ChevronRight className={`${chevronClass(open)} text-muted-foreground`} />
            <span className="font-medium text-muted-foreground">{title}</span>
            {hint && <span className="hidden sm:inline text-xs text-muted-foreground/80 truncate">{hint}</span>}
          </button>
        </CollapsibleTrigger>
        {actions}
      </div>
      <CollapsibleContent>{children}</CollapsibleContent>
    </Collapsible>
  );
}

// ---------------------------------------------------------------------------
// The tracker
// ---------------------------------------------------------------------------

export function ClientHandoverTracker({ clientName, focus }: Props) {
  const client = (clientName || "").trim();
  const qc = useQueryClient();
  // Null on the client's public page: decisions made there are recorded without a name.
  const { user } = useAuth();
  const { notifyAssignment, notifyCoverChange } = useHandoverNotifications(clientName);
  const { data: users = [] } = useHandoverUsers();
  const { data: templates = [] } = useHandoverTemplates();

  // Which handovers exist here, from the rota and cover requests — plus stale
  // stored ones whose leave has passed or whose cover changed.
  const handoversQuery = useQuery({
    queryKey: ["client-handovers", clientName],
    queryFn: () => getClientHandovers(clientName),
  });

  // The stored rows at this client: who decided a handover wasn't required,
  // and when (the handover list doesn't carry that), and the row id of a
  // handover whose first task was written a moment ago, before the list has
  // caught up.
  const rowsQuery = useQuery({
    queryKey: ["client-handovers", clientName, "rows"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_handovers")
        .select("id, kind, from_user_id, holiday_id, to_user_id, status_changed_by, status_changed_at")
        .eq("client_name", client);
      if (error) throw error;
      return (data || []) as StoredHandoverRow[];
    },
  });

  // Every task at this client: those of the handovers stored here, and the
  // pre-rebuild ones never linked to a leave. The handover ids are looked up
  // inside the query so it never depends on another query having refreshed.
  const tasksQuery = useQuery({
    queryKey: ["client-handover-tasks", clientName],
    queryFn: async () => {
      const { data: rows, error: rowsError } = await supabase.from("client_handovers").select("id").eq("client_name", client);
      if (rowsError) throw rowsError;
      const ids = (rows || []).map((r) => r.id);
      const linked = async (): Promise<HandoverTask[]> => {
        if (ids.length === 0) return [];
        const { data, error } = await supabase.from("client_handover_tasks").select("*").in("handover_id", ids);
        if (error) throw error;
        return (data || []) as HandoverTask[];
      };
      const unlinked = async (): Promise<HandoverTask[]> => {
        const { data, error } = await supabase.from("client_handover_tasks").select("*").eq("client_name", client).is("handover_id", null);
        if (error) throw error;
        return (data || []) as HandoverTask[];
      };
      const [a, b] = await Promise.all([linked(), unlinked()]);
      return [...a, ...b].sort(taskOrder);
    },
  });

  const handovers = handoversQuery.data;
  const rows = rowsQuery.data;
  const tasks = tasksQuery.data;
  // The stored rows only decorate the list, so they needn't hold the page up.
  const loading = handoversQuery.isPending || tasksQuery.isPending;
  const loadError = handoversQuery.error || tasksQuery.error;

  // Lay the checklists over the handover list. Progress is worked out from
  // the tasks here, so a slider moved a moment ago is reflected as soon as
  // the tasks come back, not only once the (heavier) handover list has.
  const tracked = useMemo<TrackedHandover[]>(() => {
    const rowByKey = new Map((rows ?? []).map((r) => [handoverKey(client, r.kind as HandoverKind, r.from_user_id, r.holiday_id, r.to_user_id), r]));
    const rowById = new Map((rows ?? []).map((r) => [r.id, r]));
    const tasksByHandover = new Map<string, HandoverTask[]>();
    for (const t of tasks ?? []) {
      if (!t.handover_id) continue;
      if (!tasksByHandover.has(t.handover_id)) tasksByHandover.set(t.handover_id, []);
      tasksByHandover.get(t.handover_id)!.push(t);
    }
    const nameOf = (userId: string | null | undefined) => (userId ? users.find((u) => u.id === userId)?.name ?? null : null);
    return (handovers ?? []).map((h) => {
      const id = h.id ?? rowByKey.get(h.key)?.id ?? null;
      const row = id ? rowById.get(id) : undefined;
      const own = id ? tasksByHandover.get(id) ?? [] : [];
      const taskCount = own.length;
      const completedCount = own.filter((t) => t.progress >= 100).length;
      const avgProgress = taskCount ? Math.round(own.reduce((s, t) => s + (t.progress || 0), 0) / taskCount) : 0;
      return {
        ...h,
        id,
        taskCount,
        completedCount,
        avgProgress,
        latestTargetDate: own.map((t) => t.target_date).filter((d): d is string => !!d).sort().pop() ?? null,
        tasks: own,
        complete: h.requirement === "required" && taskCount > 0 && completedCount === taskCount,
        statusChangedBy: nameOf(row?.status_changed_by),
        statusChangedAt: row?.status_changed_at ?? null,
      };
    });
  }, [client, handovers, rows, tasks, users]);

  const unlinkedTasks = useMemo(() => (tasks ?? []).filter((t) => !t.handover_id), [tasks]);

  // The page's shape: live handovers by leave; stale ones with a checklist
  // either back under their leave (a checklist prepared before cover was
  // assigned, to be moved to whoever covers now) or in the "earlier" list.
  const { groups, staleInGroup, earlier } = useMemo(() => {
    const current = tracked.filter((h) => h.derived);
    // groupHandoversByLeave keeps the objects it is given, so the cast is
    // safe: these are the TrackedHandovers built above, tasks and all.
    const groups: TrackedGroup[] = groupHandoversByLeave(current).map((g) => ({ ...g, handovers: g.handovers as TrackedHandover[] }));
    const staleInGroup = new Map<string, TrackedHandover[]>();
    const earlier: TrackedHandover[] = [];
    for (const h of tracked) {
      if (h.derived || h.taskCount === 0) continue;
      const g = findGroup(groups, h);
      if (g && !h.to && g.handovers.some((x) => x.to)) {
        if (!staleInGroup.has(g.key)) staleInGroup.set(g.key, []);
        staleInGroup.get(g.key)!.push(h);
      } else {
        earlier.push(h);
      }
    }
    return { groups, staleInGroup, earlier };
  }, [tracked]);

  // Where a stale checklist can go: the live, required handovers of its leave.
  const moveTargetsFor = (h: TrackedHandover) =>
    (findGroup(groups, h)?.handovers ?? []).filter((x) => x.requirement === "required" && x.key !== h.key);

  // "covers 24, 26 Oct" — only worth saying when the coverer takes part of the leave.
  const coveredHintFor = (g: TrackedGroup, h: TrackedHandover) => {
    if (h.coveredDates.length === 0) return null;
    const all = new Set(g.handovers.flatMap((x) => x.coveredDates));
    return h.coveredDates.length < all.size ? fmtCoveredDates(h.coveredDates) : null;
  };

  // Summary line: the live handovers, and the tasks across the required ones.
  const current = tracked.filter((h) => h.derived);
  const currentRequired = current.filter((h) => h.requirement === "required");
  const summaryTasks = currentRequired.flatMap((h) => h.tasks);
  const summaryDone = summaryTasks.filter((t) => t.progress >= 100).length;
  const overallProgress = currentRequired.length
    ? Math.round(currentRequired.reduce((s, h) => s + h.avgProgress, 0) / currentRequired.length)
    : 0;

  // -------------------------------------------------------------------------
  // Open / closed
  // -------------------------------------------------------------------------

  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set());
  const [openHandovers, setOpenHandovers] = useState<Set<string>>(new Set());
  const [earlierOpen, setEarlierOpen] = useState(false);
  const [unlinkedOpen, setUnlinkedOpen] = useState(false);
  const sectionRefs = useRef(new Map<string, HTMLDivElement>());
  const toggle = (set: Dispatch<SetStateAction<Set<string>>>, key: string, open: boolean) =>
    set((prev) => {
      const next = new Set(prev);
      if (open) next.add(key); else next.delete(key);
      return next;
    });

  // ?handover=<client_handovers.id or key> — links from emails and the dashboard.
  const [urlHandover] = useState(() => {
    try { return new URLSearchParams(window.location.search).get("handover"); } catch { return null; }
  });

  // Start with the soonest leave open, or the one we were pointed at.
  const focusSig = [focus?.handoverId, focus?.holidayId, focus?.departureUserId, urlHandover].map((v) => v ?? "").join("|");
  const appliedFocus = useRef<string | null>(null);
  useEffect(() => {
    if (loading || appliedFocus.current === focusSig) return;
    appliedFocus.current = focusSig;

    const wanted = focus?.handoverId || urlHandover;
    const target = wanted ? tracked.find((h) => h.id === wanted || h.key === wanted) : undefined;
    const nextGroups = new Set<string>();
    const nextHandovers = new Set<string>();

    if (target && earlier.includes(target)) {
      setEarlierOpen(true);
      nextHandovers.add(target.key);
    } else {
      let group = target ? findGroup(groups, target) : undefined;
      if (!group && focus?.holidayId) group = groups.find((g) => g.holidayId === focus.holidayId);
      if (!group && focus?.departureUserId) group = groups.find((g) => g.kind === "departure" && g.from.userId === focus.departureUserId);
      if (!group) group = groups[0];
      if (group) {
        nextGroups.add(group.key);
        const shown = target ? [target] : [...group.handovers, ...(staleInGroup.get(group.key) ?? [])];
        for (const h of shown) if (h.requirement === "required") nextHandovers.add(h.key);
      }
    }
    setOpenGroups(nextGroups);
    setOpenHandovers(nextHandovers);
    if (target) {
      // After the sections have rendered open.
      setTimeout(() => sectionRefs.current.get(target.key)?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, focusSig, tracked, groups, staleInGroup, earlier]);

  const refFor = (key: string) => (el: HTMLDivElement | null) => {
    if (el) sectionRefs.current.set(key, el);
    else sectionRefs.current.delete(key);
  };

  // -------------------------------------------------------------------------
  // Writes
  // -------------------------------------------------------------------------

  // Every write can change what the handover list, this client's checklists
  // and the dashboard say, so all three are refreshed together.
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["client-handovers"] });
    qc.invalidateQueries({ queryKey: ["client-handover-tasks", clientName] });
    qc.invalidateQueries({ queryKey: ["handovers-all"] });
  };

  // Template ids with an insert currently in flight, per handover. The
  // "already added" guard reads from the task list, which only refreshes after
  // a round-trip — every click in that gap used to get through, 34 times in
  // one recorded case. This ref is synchronous, so the second click is stopped
  // before it starts. The database enforces the same rule with a unique index
  // as the last line of defence.
  const inFlightTemplates = useRef<Set<string>>(new Set());

  const createMutation = useMutation({
    mutationFn: async ({ handover, draft }: { handover: TrackedHandover; draft: DraftRow }) => {
      // The first task creates the handover's row.
      const handoverId = handover.id ?? await ensureHandoverRow(handover);
      const payload = {
        client_name: client,
        handover_id: handoverId,
        template_id: draft.template_id,
        category: draft.category.trim() || null,
        task_name: draft.task_name.trim() || "Untitled task",
        task_description: draft.task_description.trim() || null,
        link: draft.link.trim() || null,
        handed_over_by: draft.handed_over_by.trim() || null,
        handed_over_to: draft.handed_over_to.trim() || null,
        progress: Math.max(0, Math.min(100, Number(draft.progress) || 0)),
        target_date: draft.target_date || null,
      };
      const { error } = await supabase.from("client_handover_tasks").insert(payload);
      if (error) throw error;
    },
    onSuccess: (_data, { draft }) => {
      refresh();
      const assignee = draft.handed_over_to?.trim();
      if (assignee) {
        notifyAssignment(assignee, {
          task_name: draft.task_name.trim() || "Untitled task",
          task_description: draft.task_description?.trim() || null,
          link: draft.link?.trim() || null,
          target_date: draft.target_date || null,
          handed_over_by: draft.handed_over_by?.trim() || null,
        });
      }
    },
    onError: (e: Error) => toast.error(e.message || "Failed to add row"),
    // Hook-level, not per call: TanStack only fires the callbacks passed to
    // mutate() for the LAST call, and "Add to all coverers" fires several
    // back to back — a per-call onSettled left the earlier guards locked.
    onSettled: (_d, _e, { handover, draft }) => {
      if (draft.template_id) inFlightTemplates.current.delete(`${handover.key}|${draft.template_id}`);
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<HandoverTask> }) => {
      const { error } = await supabase.from("client_handover_tasks").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: refresh,
    onError: (e: Error) => toast.error(e.message || "Update failed"),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("client_handover_tasks").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: refresh,
  });

  const clearMutation = useMutation({
    mutationFn: async (h: TrackedHandover) => {
      if (!h.id) return;
      const { error } = await supabase.from("client_handover_tasks").delete().eq("handover_id", h.id);
      if (error) throw error;
    },
    onSuccess: (_data, h) => {
      refresh();
      toast.success(`Cleared the handover to ${toName(h)}`);
    },
    onError: (e: Error) => toast.error(e.message || "Failed to clear tasks"),
  });

  const clearUnlinkedMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("client_handover_tasks").delete().eq("client_name", client).is("handover_id", null);
      if (error) throw error;
    },
    onSuccess: () => {
      refresh();
      toast.success("Cleared the tasks not linked to a leave");
    },
    onError: (e: Error) => toast.error(e.message || "Failed to clear tasks"),
  });

  const requirementMutation = useMutation({
    mutationFn: ({ handover, requirement, reason }: { handover: TrackedHandover; requirement: HandoverRequirement; reason: string | null }) =>
      setHandoverRequirement(handover, requirement, reason, user?.id ?? null),
    onSuccess: (_data, { handover, requirement }) => {
      refresh();
      toast.success(requirement === "not_required"
        ? `Handover to ${toName(handover)} marked not required`
        : `Handover to ${toName(handover)} reinstated`);
    },
    onError: (e: Error) => toast.error(e.message || "Couldn't update the handover"),
  });

  const moveMutation = useMutation({
    mutationFn: ({ from, to }: { from: TrackedHandover; to: TrackedHandover }) => moveHandoverTasks(from.id!, to),
    onSuccess: (_data, { from, to }) => {
      refresh();
      toast.success(`Moved ${plural(from.taskCount, "task")} to ${toName(to)}`);
    },
    onError: (e: Error) => toast.error(e.message || "Couldn't move the tasks"),
  });


  const addTemplate = (h: TrackedHandover, t: HandoverTemplate) => {
    if (h.tasks.some((x) => x.template_id === t.id)) {
      toast.info(`"${t.name}" is already in this handover.`);
      return;
    }
    const flight = `${h.key}|${t.id}`;
    if (inFlightTemplates.current.has(flight)) return; // already being added
    inFlightTemplates.current.add(flight);
    createMutation.mutate({
      handover: h,
      draft: {
        ...newDraft(),
        template_id: t.id,
        category: t.category || "",
        task_name: t.name,
        task_description: t.description || "",
        link: t.link || "",
        // From the person going, to whoever covers this handover.
        handed_over_by: h.from.name,
        handed_over_to: h.to?.name ?? "",
      },
    });
  };

  // The same template on every required handover of the leave that lacks it.
  const addTemplateToAll = (g: TrackedGroup, t: HandoverTemplate) => {
    for (const h of g.handovers) {
      if (h.requirement !== "required" || h.tasks.some((x) => x.template_id === t.id)) continue;
      addTemplate(h, t);
    }
  };

  // Template ids every required handover of the leave already has.
  const usedByAllFor = (g: TrackedGroup) => {
    const required = g.handovers.filter((h) => h.requirement === "required");
    const ids = new Set<string>();
    for (const t of templates) {
      if (required.every((h) => h.tasks.some((x) => x.template_id === t.id))) ids.add(t.id);
    }
    return ids;
  };

  const actions: TrackerActions = {
    // mutateAsync, for the same reason as the hook-level onSettled above.
    createTask: (h, draft, onDone) => { createMutation.mutateAsync({ handover: h, draft }).then(onDone).catch(() => undefined); },
    createPending: createMutation.isPending,
    updateTask: (id, patch) => updateMutation.mutate({ id, patch }),
    deleteTask: (id) => deleteMutation.mutate(id),
    reassignTask: (t, next) => {
      const prev = (t.handed_over_to || "").trim();
      updateMutation.mutate({ id: t.id, patch: { handed_over_to: next || null } });

      const notified: string[] = [];
      // 1. The new assignee — they've picked up the cover.
      if (next) {
        notifyAssignment(next, {
          task_name: t.task_name,
          task_description: t.task_description,
          link: t.link,
          target_date: t.target_date,
          handed_over_by: t.handed_over_by,
        });
        notified.push(next);
      }
      // 2. The previous assignee — they're off it (also fires when cleared).
      if (prev) {
        notifyCoverChange("removed", prev, t, { previousAssignee: prev, newAssignee: next || null });
        notified.push(prev);
      }
      // 3. The person whose leave is being covered — their cover changed.
      const coveredFor = (t.handed_over_by || "").trim();
      if (coveredFor && coveredFor.toLowerCase() !== next.toLowerCase() && coveredFor.toLowerCase() !== prev.toLowerCase()) {
        notifyCoverChange("cover_changed", coveredFor, t, { previousAssignee: prev || null, newAssignee: next || null });
        notified.push(coveredFor);
      }
      if (notified.length) toast.success(`Notified ${notified.join(", ")}`);
    },
    clearTasks: (h) => {
      if (!h.id || h.taskCount === 0) return;
      if (confirm(`Clear all ${plural(h.taskCount, "task")} in the handover to ${toName(h)}? This cannot be undone.`)) {
        clearMutation.mutate(h);
      }
    },
    markNotRequired: (h) => {
      const reason = window.prompt(
        `Mark the handover to ${toName(h)} as not required?\n\nReason (optional):`,
        h.notRequiredReason ?? "",
      );
      if (reason === null) return; // cancelled
      requirementMutation.mutate({ handover: h, requirement: "not_required", reason });
    },
    reinstate: (h) => requirementMutation.mutate({ handover: h, requirement: "required", reason: null }),
    moveTasks: (from, to) => {
      if (!from.id || from.taskCount === 0) return;
      if (confirm(`Move ${plural(from.taskCount, "task")} to the handover to ${toName(to)}?`)) {
        moveMutation.mutate({ from, to });
      }
    },
    addTemplate,
    busy: requirementMutation.isPending || clearMutation.isPending || clearUnlinkedMutation.isPending || moveMutation.isPending,
  };

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  const summary = current.length === 0
    ? "No upcoming handovers"
    : `${plural(current.length, "handover")}${summaryTasks.length > 0 ? ` · ${summaryDone} of ${plural(summaryTasks.length, "task")} complete` : ""}`;

  return (
    <Card className="mt-4 sm:mt-6">
      <CardHeader className="px-4 sm:px-6 pt-4 pb-3 border-b">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <CardTitle className="text-lg sm:text-xl">Handover Tracker</CardTitle>
            <a
              href="https://www.youtube.com/watch?v=VGzR7cR1npA"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-primary hover:underline mt-0.5"
            >
              <ExternalLink className="h-3 w-3" />
              Handover Tracker Explained
            </a>
            {!loading && <p className="text-xs text-muted-foreground mt-1">{summary}</p>}
          </div>
          {summaryTasks.length > 0 && (
            <div className="hidden sm:flex items-center gap-2 min-w-[180px]">
              <Progress value={overallProgress} className="h-2 w-32" />
              <span className="text-xs font-semibold text-muted-foreground">{overallProgress}%</span>
            </div>
          )}
        </div>
      </CardHeader>

      <CardContent className="p-0">
        {loading ? (
          <p className="px-4 sm:px-6 py-6 text-sm text-muted-foreground">Loading handovers…</p>
        ) : loadError ? (
          <p className="px-4 sm:px-6 py-6 text-sm text-destructive">
            Couldn't load the handovers: {(loadError as Error).message || "unknown error"}
          </p>
        ) : (
          <>
            {groups.length === 0 && (
              <div className="px-6 py-8 text-center border-b border-border/60">
                <p className="text-sm font-medium text-foreground">No upcoming leave needs handing over here</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Handovers appear from approved leave and the rota — one per person going, per colleague covering.
                </p>
              </div>
            )}

            {groups.map((g) => {
              const requiredCoverers = g.handovers.filter((h) => h.requirement === "required" && h.to);
              const onAddToAll = requiredCoverers.length >= 2 ? (t: HandoverTemplate) => addTemplateToAll(g, t) : undefined;
              const usedByAll = onAddToAll ? usedByAllFor(g) : undefined;
              return (
                <LeaveGroupSection
                  key={g.key}
                  group={g}
                  open={openGroups.has(g.key)}
                  onOpenChange={(open) => toggle(setOpenGroups, g.key, open)}
                >
                  {g.handovers.map((h) => (
                    <HandoverSection
                      key={h.key}
                      h={h}
                      open={openHandovers.has(h.key)}
                      onOpenChange={(open) => toggle(setOpenHandovers, h.key, open)}
                      coveredHint={coveredHintFor(g, h)}
                      templates={templates}
                      onAddToAll={onAddToAll}
                      usedByAllTemplateIds={usedByAll}
                      actions={actions}
                      sectionRef={refFor(h.key)}
                    />
                  ))}
                  {/* A checklist prepared before anyone was assigned: now there is cover, it belongs with them. */}
                  {(staleInGroup.get(g.key) ?? []).map((h) => (
                    <HandoverSection
                      key={h.key}
                      h={h}
                      open={openHandovers.has(h.key)}
                      onOpenChange={(open) => toggle(setOpenHandovers, h.key, open)}
                      moveTargets={moveTargetsFor(h)}
                      moveHint="Cover has been assigned — move these"
                      actions={actions}
                      sectionRef={refFor(h.key)}
                    />
                  ))}
                </LeaveGroupSection>
              );
            })}

            {earlier.length > 0 && (
              <HistorySection
                title={`Earlier handovers (${earlier.length})`}
                hint="a leave that has passed, or a cover that changed"
                open={earlierOpen}
                onOpenChange={setEarlierOpen}
              >
                {earlier.map((h) => (
                  <HandoverSection
                    key={h.key}
                    h={h}
                    open={openHandovers.has(h.key)}
                    onOpenChange={(open) => toggle(setOpenHandovers, h.key, open)}
                    showLeave
                    moveTargets={moveTargetsFor(h)}
                    moveHint="Move these"
                    actions={actions}
                    sectionRef={refFor(h.key)}
                  />
                ))}
              </HistorySection>
            )}

            {unlinkedTasks.length > 0 && (
              <HistorySection
                title={`Tasks not linked to a leave (${unlinkedTasks.length})`}
                hint="recorded before handovers were tied to a leave"
                open={unlinkedOpen}
                onOpenChange={setUnlinkedOpen}
                actions={
                  <Button
                    variant="ghost" size="sm" className="h-7 px-2 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
                    onClick={() => {
                      if (confirm(`Clear all ${plural(unlinkedTasks.length, "task")} not linked to a leave? This cannot be undone.`)) {
                        clearUnlinkedMutation.mutate();
                      }
                    }}
                    disabled={actions.busy}
                  >
                    <X className="h-3.5 w-3.5" /> Clear
                  </Button>
                }
              >
                <HandoverTaskGrid
                  tasks={unlinkedTasks}
                  onUpdate={actions.updateTask}
                  onDelete={actions.deleteTask}
                  onReassign={actions.reassignTask}
                />
              </HistorySection>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
