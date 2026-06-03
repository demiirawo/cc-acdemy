import { useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Trash2, ClipboardList, Calendar } from "lucide-react";
import { toast } from "sonner";
import { format, isPast, parseISO } from "date-fns";

interface HandoverTaskRow {
  id: string;
  client_name: string;
  task_name: string;
  progress: number;
  target_date: string | null;
}

export function HandoverTrackerSummaryCard() {
  const qc = useQueryClient();

  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ["handover-summary-active"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_handover_tasks")
        .select("id, client_name, task_name, progress, target_date")
        .lt("progress", 100);
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
      qc.invalidateQueries({ queryKey: ["handover-summary-active"] });
      qc.invalidateQueries({ queryKey: ["client-handover-tasks", clientName] });
      toast.success(`Cleared handover tracker for ${clientName}`);
    },
    onError: (e: any) => toast.error(e.message || "Failed to clear tracker"),
  });

  const grouped = useMemo(() => {
    const map = new Map<string, HandoverTaskRow[]>();
    for (const t of tasks) {
      if (!t.client_name) continue;
      if (!map.has(t.client_name)) map.set(t.client_name, []);
      map.get(t.client_name)!.push(t);
    }
    return Array.from(map.entries())
      .map(([client, rows]) => ({
        client,
        rows,
        overdue: rows.filter(
          (r) => r.target_date && isPast(parseISO(r.target_date))
        ).length,
      }))
      .sort((a, b) => b.rows.length - a.rows.length);
  }, [tasks]);

  if (isLoading || grouped.length === 0) return null;

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle className="text-lg sm:text-xl flex items-center gap-2">
          <ClipboardList className="h-5 w-5" />
          Active Handover Trackers
          <Badge variant="secondary" className="ml-1">{grouped.length}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="divide-y">
          {grouped.map(({ client, rows, overdue }) => (
            <div
              key={client}
              className="flex items-center justify-between py-3 gap-4"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-foreground">{client}</span>
                  <Badge variant="outline">
                    {rows.length} active task{rows.length === 1 ? "" : "s"}
                  </Badge>
                  {overdue > 0 && (
                    <Badge variant="destructive">{overdue} overdue</Badge>
                  )}
                </div>
                <div className="mt-1 text-xs text-muted-foreground flex flex-wrap gap-x-3 gap-y-1">
                  {rows.slice(0, 3).map((r) => (
                    <span key={r.id} className="inline-flex items-center gap-1">
                      <span className="truncate max-w-[200px]">{r.task_name || "Untitled"}</span>
                      {r.target_date && (
                        <span className="inline-flex items-center gap-0.5 opacity-80">
                          <Calendar className="h-3 w-3" />
                          {format(parseISO(r.target_date), "d MMM")}
                        </span>
                      )}
                    </span>
                  ))}
                  {rows.length > 3 && <span>+{rows.length - 3} more</span>}
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
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
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
