import { useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Trash2, ClipboardList, Plane, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { ClientHandoverTracker } from "./ClientHandoverTracker";
import { getUpcomingLeaveByAllClients, type UpcomingClientLeave } from "@/lib/handoverStatus";

const APP_URL = "https://www.care-cuddle-academy.co.uk";
const HANDOVER_VIDEO_URL = "https://www.youtube.com/watch?v=VGzR7cR1npA";

interface HandoverTaskRow {
  id: string;
  client_name: string;
  progress: number;
  target_date: string | null;
}

interface GroupItem {
  client: string;
  count: number;
  overallProgress: number;
  latestTargetDate: string | null;
  leave: UpcomingClientLeave | null;
  notStarted: boolean;
}

const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

/**
 * Ready-to-paste WhatsApp nudge for a staff member's outstanding handovers —
 * "start" wording when nothing is underway, "finish" wording otherwise, with
 * a tracker link per client.
 */
function buildWhatsAppMessage(staffName: string, leave: UpcomingClientLeave, items: GroupItem[]): string {
  const firstName = staffName.trim().split(/\s+/)[0];
  const dates = leave.startDate === leave.endDate
    ? fmtDate(leave.startDate)
    : `${fmtDate(leave.startDate)} – ${fmtDate(leave.endDate)}`;
  const timing = leave.ongoing
    ? "your leave has already started"
    : leave.daysUntil === 0
      ? "your leave starts today"
      : `your leave starts in ${leave.daysUntil} day${leave.daysUntil === 1 ? "" : "s"}`;
  const anyStarted = items.some(i => !i.notStarted && i.overallProgress > 0);
  const clientLines = items.map(i => {
    const status = i.notStarted || i.overallProgress === 0 ? "not started" : `${i.overallProgress}% complete`;
    return `• ${i.client} — ${status}\n${APP_URL}/public/schedule/${encodeURIComponent(i.client.trim())}`;
  });
  const ask = anyStarted
    ? `Please complete the outstanding handover tasks before your leave begins${items.length > 1 ? " — each client needs its own handover finished" : ""}.`
    : `Please start your handover${items.length > 1 ? "s" : ""} as soon as you can so everything is covered before you go.`;
  return [
    `Hi ${firstName}, ${timing} (${dates}) and your client handover${items.length > 1 ? "s" : ""} ${items.length > 1 ? "aren't" : "isn't"} complete yet.`,
    clientLines.join("\n\n"),
    `📺 Not sure how the Handover Tracker works? Watch this short guide:\n${HANDOVER_VIDEO_URL}`,
    `${ask} Thank you! 🙏`,
  ].join("\n\n");
}

export function HandoverTrackerSummaryCard() {
  const qc = useQueryClient();

  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ["handover-summary-all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_handover_tasks")
        .select("id, client_name, progress, target_date");
      if (error) throw error;
      return (data || []) as HandoverTaskRow[];
    },
  });

  const clearMutation = useMutation({
    mutationFn: async (clientName: string) => {
      const { error } = await supabase
        .from("client_handover_tasks")
        .delete()
        .eq("client_name", clientName);
      if (error) throw error;
    },
    onSuccess: (_d, clientName) => {
      qc.invalidateQueries({ queryKey: ["handover-summary-all"] });
      qc.invalidateQueries({ queryKey: ["client-handover-tasks", clientName] });
      toast.success(`Cleared handover tracker for ${clientName}`);
    },
    onError: (e: any) => toast.error(e.message || "Failed to clear tracker"),
  });

  const { clientsWithAnyTasks, groupedBase } = useMemo(() => {
    const map = new Map<string, HandoverTaskRow[]>();
    for (const t of tasks) {
      if (!t.client_name) continue;
      if (!map.has(t.client_name)) map.set(t.client_name, []);
      map.get(t.client_name)!.push(t);
    }
    const base = Array.from(map.entries())
      .map(([client, rows]) => {
        const activeRows = rows.filter((r) => (r.progress ?? 0) < 100);
        const activeCount = activeRows.length;
        const overallProgress = rows.length
          ? Math.round(
              rows.reduce((sum, r) => sum + (r.progress ?? 0), 0) / rows.length
            )
          : 0;
        const latestTargetDate = activeRows
          .map((r) => r.target_date)
          .filter((d): d is string => !!d)
          .sort()
          .pop() ?? null;
        return { client, count: activeCount, overallProgress, latestTargetDate, notStarted: false as const };
      })
      .filter((g) => g.count > 0);
    return { clientsWithAnyTasks: new Set(map.keys()), groupedBase: base };
  }, [tasks]);

  const { data: leaveByAllClients = new Map<string, UpcomingClientLeave>(), isLoading: leaveLoading } = useQuery({
    queryKey: ["handover-summary-upcoming-leave-all"],
    queryFn: getUpcomingLeaveByAllClients,
    staleTime: 60 * 1000,
  });

  // Client names are free-text in both source tables and can differ by
  // whitespace (e.g. "Carelink Services " vs "Carelink Services") — match on
  // trimmed names so a client never shows both a real row and a placeholder.
  const grouped = useMemo(() => {
    const leaveFor = (client: string) => leaveByAllClients.get(client.trim()) ?? null;
    const taskClientKeys = new Set(Array.from(clientsWithAnyTasks).map((c) => c.trim()));
    const withTasks = groupedBase.map((g) => ({ ...g, leave: leaveFor(g.client) }));
    // Clients with staff on/approaching leave but no handover tasks recorded
    // at all yet — these never show up via client_handover_tasks grouping.
    const notStarted = Array.from(leaveByAllClients.entries())
      .filter(([client]) => !taskClientKeys.has(client))
      .map(([client, leave]) => ({
        client,
        count: 0,
        overallProgress: 0,
        latestTargetDate: null as string | null,
        leave: leave as UpcomingClientLeave | null,
        notStarted: true as const,
      }));
    return [...withTasks, ...notStarted].sort((a, b) => {
      const aUrgent = a.leave ? (a.leave.ongoing ? -1 : a.leave.daysUntil) : Infinity;
      const bUrgent = b.leave ? (b.leave.ongoing ? -1 : b.leave.daysUntil) : Infinity;
      if (aUrgent !== bUrgent) return aUrgent - bUrgent;
      return b.count - a.count;
    });
  }, [groupedBase, leaveByAllClients, clientsWithAnyTasks]);

  // Group the client rows by the staff member whose leave drives them — one
  // holiday can need several handovers (one per client), and this shows them
  // as a single unit of work. Clients with no linked leave sit in a trailing
  // "no upcoming leave" group.
  const staffGroups = useMemo(() => {
    const map = new Map<string, { staffName: string | null; leave: UpcomingClientLeave | null; items: typeof grouped }>();
    for (const g of grouped) {
      const key = g.leave ? `${g.leave.userId}` : "__no_leave__";
      if (!map.has(key)) map.set(key, { staffName: g.leave?.staffName ?? null, leave: g.leave, items: [] });
      const entry = map.get(key)!;
      entry.items.push(g);
      // Keep the group's headline leave as the most urgent among its clients.
      if (g.leave && entry.leave && g.leave.startDate < entry.leave.startDate) entry.leave = g.leave;
    }
    return Array.from(map.values());
    // `grouped` is already urgency-sorted, so insertion order keeps the most
    // urgent staff group first and the no-leave group last.
  }, [grouped]);

  if (isLoading || leaveLoading || grouped.length === 0) return null;

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle className="text-lg sm:text-xl flex items-center gap-2">
          <ClipboardList className="h-5 w-5" />
          Active Handover Trackers
          <Badge variant="secondary" className="ml-1">
            {grouped.length}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Accordion type="multiple" className="w-full space-y-3">
          {staffGroups.map(({ staffName, leave, items }) => {
            const groupKey = staffName ?? "__no_leave__";
            const notStartedCount = items.filter((i) => i.notStarted || i.overallProgress === 0).length;
            const avgProgress = items.length
              ? Math.round(items.reduce((s, i) => s + i.overallProgress, 0) / items.length)
              : 0;
            const urgent = leave && (leave.ongoing || leave.daysUntil <= 3);
            const soon = leave && !urgent && leave.daysUntil <= 7;
            return (
              <AccordionItem
                key={groupKey}
                value={groupKey}
                className={`border rounded-lg px-3 ${
                  urgent ? "border-destructive/40" : soon ? "border-amber-500/40" : ""
                }`}
              >
                <div className="flex items-center gap-2">
                  <AccordionTrigger className="flex-1 hover:no-underline py-3">
                    <div className="flex items-center justify-between gap-2 w-full pr-2">
                      <div className="flex items-center gap-2 flex-wrap min-w-0">
                        {leave ? (
                          <>
                            <Plane
                              className={`h-4 w-4 flex-shrink-0 ${
                                urgent
                                  ? "text-destructive"
                                  : soon
                                  ? "text-amber-600 dark:text-amber-400"
                                  : "text-primary"
                              }`}
                            />
                            <span className="font-semibold text-foreground">{staffName}</span>
                            <Badge
                              variant="outline"
                              className={`font-normal ${
                                urgent
                                  ? "bg-destructive/10 text-destructive border-destructive/30"
                                  : soon
                                  ? "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30"
                                  : "bg-primary/5 text-primary border-primary/20"
                              }`}
                            >
                              {leave.ongoing ? "On leave now" : `Leave in ${leave.daysUntil}d`}
                            </Badge>
                            <span className="text-xs text-muted-foreground hidden sm:inline">
                              {fmtDate(leave.startDate)}
                              {leave.startDate !== leave.endDate ? ` – ${fmtDate(leave.endDate)}` : ""}
                            </span>
                            <Badge variant="secondary" className="font-normal">
                              {items.length} client{items.length === 1 ? "" : "s"}
                            </Badge>
                            {notStartedCount > 0 && (
                              <Badge variant="outline" className="font-normal bg-destructive/10 text-destructive border-destructive/30">
                                {notStartedCount} not started
                              </Badge>
                            )}
                          </>
                        ) : (
                          <>
                            <ClipboardList className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                            <span className="font-semibold text-muted-foreground">No upcoming leave linked</span>
                            <Badge variant="secondary" className="font-normal">
                              {items.length} client{items.length === 1 ? "" : "s"}
                            </Badge>
                          </>
                        )}
                      </div>
                      <div className="flex items-center gap-2 min-w-[140px] flex-shrink-0">
                        <div className="h-2 flex-1 rounded-full bg-muted overflow-hidden">
                          <div
                            className="h-full bg-primary transition-all"
                            style={{ width: `${avgProgress}%` }}
                          />
                        </div>
                        <span className="text-xs text-muted-foreground tabular-nums w-10 text-right">
                          {avgProgress}%
                        </span>
                      </div>
                    </div>
                  </AccordionTrigger>
                  {leave && staffName && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-shrink-0"
                      title="Copy a WhatsApp message asking them to start or finish their handover"
                      onClick={(e) => {
                        e.stopPropagation();
                        const msg = buildWhatsAppMessage(staffName, leave, items);
                        navigator.clipboard
                          .writeText(msg)
                          .then(() => toast.success(`WhatsApp message for ${staffName} copied — paste it into your chat`))
                          .catch(() => toast.error("Couldn't copy to clipboard"));
                      }}
                    >
                      <MessageCircle className="h-4 w-4 mr-1" />
                      Copy message
                    </Button>
                  )}
                </div>
                <AccordionContent className="pb-2">
                  <Accordion type="multiple" className="w-full pl-4 sm:pl-6">
                    {items.map(({ client, count, overallProgress, latestTargetDate, leave: itemLeave, notStarted }) => (
                      <AccordionItem key={client} value={`${groupKey}::${client}`} className={notStarted ? "border-dashed" : undefined}>
                        <div className="flex items-center gap-2">
                          <AccordionTrigger className="flex-1">
                            <div className="flex items-center justify-between gap-2 w-full pr-2">
                              <div className="flex items-center gap-2 flex-wrap">
                                <a
                                  href={`/public/schedule/${encodeURIComponent(client.trim())}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  onClick={(e) => e.stopPropagation()}
                                  className="font-medium text-foreground hover:text-primary hover:underline"
                                  title={`Open ${client}'s public page`}
                                >
                                  {client}
                                </a>
                                {notStarted ? (
                                  <Badge variant="outline" className="font-normal bg-destructive/10 text-destructive border-destructive/30">
                                    Not started
                                  </Badge>
                                ) : (
                                  <Badge variant="outline">
                                    {count} active task{count === 1 ? "" : "s"}
                                  </Badge>
                                )}
                                {latestTargetDate && (
                                  <Badge variant="secondary" className="font-normal">
                                    Due {fmtDate(latestTargetDate)}
                                  </Badge>
                                )}
                              </div>
                              <div className="flex items-center gap-2 min-w-[140px]">
                                <div className="h-2 flex-1 rounded-full bg-muted overflow-hidden">
                                  <div
                                    className="h-full bg-primary transition-all"
                                    style={{ width: `${overallProgress}%` }}
                                  />
                                </div>
                                <span className="text-xs text-muted-foreground tabular-nums w-10 text-right">
                                  {overallProgress}%
                                </span>
                              </div>
                            </div>
                          </AccordionTrigger>
                          {!notStarted && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (
                                  confirm(
                                    `Clear all handover tasks for ${client}? This cannot be undone.`
                                  )
                                ) {
                                  clearMutation.mutate(client);
                                }
                              }}
                              disabled={clearMutation.isPending}
                            >
                              <Trash2 className="h-4 w-4 mr-1" />
                              Clear
                            </Button>
                          )}
                        </div>
                        <AccordionContent>
                          <ClientHandoverTracker clientName={client} upcomingLeave={itemLeave} />
                        </AccordionContent>
                      </AccordionItem>
                    ))}
                  </Accordion>
                </AccordionContent>
              </AccordionItem>
            );
          })}
        </Accordion>
      </CardContent>
    </Card>
  );
}
