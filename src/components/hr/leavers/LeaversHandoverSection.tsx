import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { format, parseISO, differenceInCalendarDays } from "date-fns";
import { Loader2, UserMinus, AlertTriangle } from "lucide-react";
import {
  clientsToHandOver, summarise, seedDepartureTasks, DEPARTURE_STATUS_LABEL,
  type DepartureHandoverStatus,
} from "@/lib/departureHandover";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

/**
 * Who is leaving, and how far their handover has got.
 *
 * The counterpart to the switch on the profile: turning a handover on and then
 * having nowhere to watch it is the same as not asking for one. Ordered by last
 * day, because that is the deadline — a handover at 80% with a fortnight left is
 * fine, and the same handover with two days left is not.
 *
 * Only people whose handover was actually requested appear. Somebody with an end
 * date and the switch off is not listed at all, which is the point of the switch:
 * this page must not become the place a dismissal is discovered.
 */

const CHASE_WITHIN_DAYS = 14;

interface LeaverRow {
  userId: string;
  name: string;
  email: string | null;
  lastDay: string;
  daysLeft: number;
  handover: DepartureHandoverStatus;
}

export function LeaversHandoverSection() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<LeaverRow[]>([]);
  const [seeding, setSeeding] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  /**
   * Build a checklist for somebody who is opted in but has none.
   *
   * The request and the checklist are written by the same save, so normally
   * this never happens — but they are two writes, and the second can fail or be
   * made by an older client. Without this the person sits at "nothing recorded"
   * with no way forward, which is worse than not having asked at all.
   */
  const createChecklist = async (row: LeaverRow) => {
    setSeeding(row.userId);
    try {
      const uid = (await supabase.auth.getUser()).data.user?.id ?? null;
      const created = await seedDepartureTasks(row.userId, row.lastDay, uid);
      toast({
        title: created > 0 ? "Checklist created" : "Nothing to create",
        description: created > 0
          ? `${created} task${created === 1 ? "" : "s"} for ${row.name}.`
          : `${row.name} has no clients on the rota before their last day.`,
      });
      setReloadKey((k) => k + 1);
    } catch (e) {
      toast({ title: "Could not create the checklist",
        description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    } finally {
      setSeeding(null);
    }
  };

  useEffect(() => {
    (async () => {
      setLoading(true);
      const today = new Date();
      const todayIso = today.toISOString().slice(0, 10);

      const { data: hr } = await supabase
        .from("hr_profiles")
        .select("user_id, employment_end_date, departure_handover_required")
        .eq("departure_handover_required", true)
        .not("employment_end_date", "is", null);

      const leavers = (hr ?? []).filter((h) => h.employment_end_date);
      if (leavers.length === 0) { setRows([]); setLoading(false); return; }

      const ids = leavers.map((l) => l.user_id);
      const [{ data: profiles }, { data: tasks }] = await Promise.all([
        supabase.from("profiles").select("user_id, display_name, email").in("user_id", ids),
        supabase.from("client_handover_tasks")
          .select("client_name, progress, leaver_user_id").in("leaver_user_id", ids),
      ]);

      const built: LeaverRow[] = [];
      for (const l of leavers) {
        const endDate = l.employment_end_date as string;
        const clients = await clientsToHandOver(l.user_id, endDate, today);
        const mine = (tasks ?? []).filter((t) => t.leaver_user_id === l.user_id);
        const p = (profiles ?? []).find((x) => x.user_id === l.user_id);
        built.push({
          userId: l.user_id,
          name: p?.display_name || p?.email || "Unknown",
          email: p?.email ?? null,
          lastDay: endDate,
          daysLeft: differenceInCalendarDays(parseISO(endDate), parseISO(todayIso)),
          handover: summarise(mine, clients),
        });
      }

      // Soonest last day first; anyone already gone sits at the top, because a
      // handover that never finished is a bigger problem after they have left.
      built.sort((a, b) => a.daysLeft - b.daysLeft);
      setRows(built);
      setLoading(false);
    })();
  }, [reloadKey]);

  const outstanding = useMemo(
    () => rows.filter((r) => r.handover.status !== "complete"), [rows]);
  const urgent = useMemo(
    () => outstanding.filter((r) => r.daysLeft <= CHASE_WITHIN_DAYS), [outstanding]);

  if (loading) {
    return <div className="flex items-center gap-2 py-16 text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" /> Loading leavers…
    </div>;
  }

  return (
    <div className="space-y-6">
      <div className="max-w-2xl">
        <h2 className="text-xl font-bold">Leavers</h2>
        <p className="text-sm text-muted-foreground">
          People with a last day set who have been asked to complete a handover. Anyone whose handover
          was not requested is not listed — turning the request on is a separate decision, made on
          their profile.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card><CardContent className="p-4">
          <p className="text-2xl font-bold">{rows.length}</p>
          <p className="text-xs text-muted-foreground">Handovers requested</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className={cn("text-2xl font-bold", outstanding.length > 0 && "text-amber-600")}>{outstanding.length}</p>
          <p className="text-xs text-muted-foreground">Still incomplete</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className={cn("text-2xl font-bold", urgent.length > 0 && "text-destructive")}>{urgent.length}</p>
          <p className="text-xs text-muted-foreground">Incomplete, {CHASE_WITHIN_DAYS} days or less to go</p>
        </CardContent></Card>
      </div>

      <Card>
        <CardContent className="p-0">
          {rows.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-muted-foreground">
              Nobody has been asked to complete a departure handover. The request is turned on from a
              staff member&rsquo;s profile, under their employment end date.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Leaver</TableHead>
                  <TableHead>Last day</TableHead>
                  <TableHead>Clients to hand over</TableHead>
                  <TableHead className="w-[220px]">Progress</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {rows.map((r) => {
                    const late = r.daysLeft < 0 && r.handover.status !== "complete";
                    const soon = r.daysLeft >= 0 && r.daysLeft <= CHASE_WITHIN_DAYS && r.handover.status !== "complete";
                    return (
                      <TableRow key={r.userId} className={cn(late && "bg-destructive/5", soon && "bg-amber-500/5")}>
                        <TableCell className="font-medium">
                          <span className="flex items-center gap-2">
                            <UserMinus className="h-3.5 w-3.5 text-muted-foreground" />
                            {r.name}
                          </span>
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-sm">
                          {format(parseISO(r.lastDay), "d MMM yyyy")}
                          <span className={cn("ml-1.5 text-xs",
                            late ? "font-medium text-destructive" : soon ? "font-medium text-amber-600" : "text-muted-foreground")}>
                            {r.daysLeft < 0 ? `${Math.abs(r.daysLeft)}d ago`
                              : r.daysLeft === 0 ? "today" : `in ${r.daysLeft}d`}
                          </span>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {r.handover.clients.length === 0
                            ? <span className="italic">No clients on the rota</span>
                            : r.handover.clients.map((c) => (
                                <span key={c.client} className={cn("block",
                                  c.taskCount === 0 && "text-destructive")}>
                                  {c.client}
                                  {c.taskCount === 0
                                    ? " — nothing recorded"
                                    : ` — ${c.avgProgress}%`}
                                </span>
                              ))}
                        </TableCell>
                        <TableCell>
                          {r.handover.clients.every((c) => c.taskCount === 0) && r.handover.clients.length > 0 ? (
                            <Button size="sm" variant="outline" disabled={seeding === r.userId}
                              onClick={() => createChecklist(r)}>
                              {seeding === r.userId ? "Creating…" : "Create checklist"}
                            </Button>
                          ) : (
                            <>
                              <Progress value={r.handover.overallProgress} className="h-2" />
                              <span className="text-xs text-muted-foreground tabular-nums">
                                {r.handover.overallProgress}%
                              </span>
                            </>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={cn("whitespace-nowrap text-[10px]",
                            r.handover.status === "complete" && "border-emerald-300 text-emerald-600",
                            r.handover.status === "in_progress" && "border-amber-300 text-amber-600",
                            r.handover.status === "not_started" && "border-destructive/40 text-destructive")}>
                            {DEPARTURE_STATUS_LABEL[r.handover.status]}
                          </Badge>
                          {late && (
                            <span className="mt-1 flex items-center gap-1 text-[11px] text-destructive">
                              <AlertTriangle className="h-3 w-3" /> Already left
                            </span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
