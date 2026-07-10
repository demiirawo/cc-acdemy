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
import { Trash2, ClipboardList, Plane } from "lucide-react";
import { toast } from "sonner";
import { ClientHandoverTracker } from "./ClientHandoverTracker";
import { getUpcomingLeaveForClients, type UpcomingClientLeave } from "@/lib/handoverStatus";

interface HandoverTaskRow {
  id: string;
  client_name: string;
  progress: number;
  target_date: string | null;
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

  const groupedBase = useMemo(() => {
    const map = new Map<string, HandoverTaskRow[]>();
    for (const t of tasks) {
      if (!t.client_name) continue;
      if (!map.has(t.client_name)) map.set(t.client_name, []);
      map.get(t.client_name)!.push(t);
    }
    return Array.from(map.entries())
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
        return { client, count: activeCount, overallProgress, latestTargetDate };
      })
      .filter((g) => g.count > 0);
  }, [tasks]);

  const clientNamesKey = groupedBase.map((g) => g.client).sort().join("|");
  const { data: leaveByClient = new Map<string, UpcomingClientLeave>() } = useQuery({
    queryKey: ["handover-summary-upcoming-leave", clientNamesKey],
    queryFn: () => getUpcomingLeaveForClients(groupedBase.map((g) => g.client)),
    enabled: groupedBase.length > 0,
    staleTime: 60 * 1000,
  });

  const grouped = useMemo(() => {
    return groupedBase
      .map((g) => ({ ...g, leave: leaveByClient.get(g.client) ?? null }))
      .sort((a, b) => {
        const aUrgent = a.leave ? (a.leave.ongoing ? -1 : a.leave.daysUntil) : Infinity;
        const bUrgent = b.leave ? (b.leave.ongoing ? -1 : b.leave.daysUntil) : Infinity;
        if (aUrgent !== bUrgent) return aUrgent - bUrgent;
        return b.count - a.count;
      });
  }, [groupedBase, leaveByClient]);

  if (isLoading || grouped.length === 0) return null;

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
        <Accordion type="multiple" className="w-full">
          {grouped.map(({ client, count, overallProgress, latestTargetDate, leave }) => (
            <AccordionItem key={client} value={client}>
              <div className="flex items-center gap-2">
                <AccordionTrigger className="flex-1">
                  <div className="flex items-center justify-between gap-2 w-full pr-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-foreground">{client}</span>
                      <Badge variant="outline">
                        {count} active task{count === 1 ? "" : "s"}
                      </Badge>
                      {latestTargetDate && (
                        <Badge variant="secondary" className="font-normal">
                          Due {new Date(latestTargetDate).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                        </Badge>
                      )}
                      {leave && (
                        <Badge
                          className={`font-normal gap-1 ${
                            leave.ongoing || leave.daysUntil <= 3
                              ? "bg-destructive/10 text-destructive border-destructive/30 hover:bg-destructive/10"
                              : leave.daysUntil <= 7
                              ? "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30 hover:bg-amber-500/10"
                              : "bg-primary/5 text-primary border-primary/20 hover:bg-primary/5"
                          }`}
                          variant="outline"
                        >
                          <Plane className="h-3 w-3" />
                          {leave.staffName}
                          {leave.ongoing ? " · on leave now" : ` · leave in ${leave.daysUntil}d`}
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2 min-w-[160px]">
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
              </div>
              <AccordionContent>
                <ClientHandoverTracker clientName={client} upcomingLeave={leave} />
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </CardContent>
    </Card>
  );
}
