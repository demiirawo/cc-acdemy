import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CalendarClock, Check, CheckCircle2, Loader2, PlayCircle, Flag } from "lucide-react";
import { toast } from "sonner";
import { format, formatDistanceToNow, parseISO } from "date-fns";

interface AckRow {
  id: string;
  change_type: string;
  summary: string;
  client_name: string | null;
  effective_until: string | null;
  created_at: string;
  acknowledged_at: string | null;
  acknowledged_via: string | null;
  reminder_count: number;
}

interface UpcomingPattern {
  id: string;
  client_name: string | null;
  days_of_week: number[] | null;
  start_time: string | null;
  end_time: string | null;
  start_date: string | null;
  end_date: string | null;
  recurrence_interval: string | null;
}

const DAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const daysLabel = (days: number[] | null) =>
  (days ?? []).slice().sort((a, b) => (a === 0 ? 7 : a) - (b === 0 ? 7 : b)).map((d) => DAY_SHORT[d] ?? "").filter(Boolean).join(", ");
const timeLabel = (t: string | null) => (t ? t.slice(0, 5) : "");

/**
 * The last day someone actually works a pattern: the latest date inside the
 * end-date fence matching the pattern's days and recurrence. A Mon/Wed pattern
 * fenced at a Friday really ends on the Wednesday — same rule the ending-soon
 * emails use. Calendar arithmetic in UTC (elapsed-ms division loses a day
 * across BST).
 */
const lastRealShift = (p: UpcomingPattern): string | null => {
  if (!p.end_date) return null;
  const days = new Set<number>((p.days_of_week ?? []).map(Number));
  const end = new Date(`${p.end_date}T00:00:00Z`);
  const start = p.start_date ? new Date(`${p.start_date}T00:00:00Z`) : null;
  if (isNaN(end.getTime())) return null;
  const interval = p.recurrence_interval || "weekly";
  const mondayOf = (d: Date) => { const m = new Date(d); m.setUTCDate(m.getUTCDate() - ((m.getUTCDay() + 6) % 7)); return m; };
  const startMonday = start ? mondayOf(start) : null;
  for (let i = 0; i < 70; i++) {
    const d = new Date(end);
    d.setUTCDate(d.getUTCDate() - i);
    if (start && d < start) break;
    const dow = d.getUTCDay();
    let matches = false;
    if (interval === "daily") matches = true;
    else if (interval === "biweekly") {
      if (days.has(dow) && startMonday) {
        const weeks = Math.round((mondayOf(d).getTime() - startMonday.getTime()) / (7 * 24 * 3600 * 1000));
        matches = weeks % 2 === 0;
      }
    } else if (interval === "monthly") {
      if (days.has(dow) && start) matches = Math.ceil(d.getUTCDate() / 7) === Math.ceil(start.getUTCDate() / 7);
    } else matches = days.has(dow);
    if (matches) return d.toISOString().slice(0, 10);
  }
  return null;
};

const TYPE_META: Record<string, { label: string; cls: string }> = {
  new_shift: { label: "New shift", cls: "border-emerald-300 text-emerald-600" },
  cancelled: { label: "Cancelled", cls: "border-amber-300 text-amber-600" },
  changed: { label: "Changed", cls: "border-blue-300 text-blue-600" },
};

/**
 * Every schedule change this person has been emailed about, and whether they
 * confirmed seeing it. On your own profile the outstanding ones carry an
 * Acknowledge button — the same act as tapping the email link, recorded as
 * done from the portal. On a colleague's profile it is read-only: who has and
 * hasn't confirmed is the point, not confirming for them.
 */
export function ScheduleChangesCard({ userId, isSelf }: { userId: string; isSelf: boolean }) {
  const [rows, setRows] = useState<AckRow[]>([]);
  const [upcoming, setUpcoming] = useState<UpcomingPattern[]>([]);
  const [loading, setLoading] = useState(true);
  const [acking, setAcking] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await (supabase as any)
      .from("shift_change_acknowledgements")
      .select("id, change_type, summary, client_name, effective_until, created_at, acknowledged_at, acknowledged_via, reminder_count")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) console.error("Error loading schedule changes:", error);
    setRows((data as AckRow[]) ?? []);

    // Series about to start or finish for this person, looking 30 days out.
    const today = new Date().toISOString().slice(0, 10);
    const horizon = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString().slice(0, 10);
    const { data: pats } = await (supabase as any)
      .from("recurring_shift_patterns")
      .select("id, client_name, days_of_week, start_time, end_time, start_date, end_date, recurrence_interval")
      .eq("user_id", userId)
      .or(`and(start_date.gt.${today},start_date.lte.${horizon}),and(end_date.gte.${today},end_date.lte.${horizon})`);
    setUpcoming((pats as UpcomingPattern[]) ?? []);
    setLoading(false);
  }, [userId]);

  useEffect(() => { setLoading(true); load(); }, [load]);

  const acknowledge = async (ids: string[]) => {
    setAcking(ids.length === 1 ? ids[0] : "all");
    const { error } = await (supabase as any)
      .from("shift_change_acknowledgements")
      .update({ acknowledged_at: new Date().toISOString(), acknowledged_via: "portal" })
      .in("id", ids);
    setAcking(null);
    if (error) {
      toast.error("Couldn't record the acknowledgement — please try again");
      return;
    }
    toast.success(ids.length === 1 ? "Change acknowledged" : "All changes acknowledged");
    load();
  };

  const outstanding = rows.filter(r => !r.acknowledged_at);
  const done = rows.filter(r => !!r.acknowledged_at).slice(0, 15);

  // Nothing tracked at all: stay quiet rather than adding an empty card to an
  // already long profile.
  const today = new Date().toISOString().slice(0, 10);
  const starting = upcoming
    .filter(p => p.start_date && p.start_date > today)
    .sort((a, b) => (a.start_date! < b.start_date! ? -1 : 1));
  const ending = upcoming
    .map(p => ({ p, lastDay: lastRealShift(p) }))
    .filter(({ p, lastDay }) => !!lastDay && lastDay >= today && !(p.start_date && p.start_date > today))
    .sort((a, b) => (a.lastDay! < b.lastDay! ? -1 : 1));

  if (!loading && rows.length === 0 && starting.length === 0 && ending.length === 0) return null;

  return (
    <Accordion type="single" collapsible className="w-full">
      <AccordionItem value="schedule-changes" className="border rounded-lg bg-card">
        <AccordionTrigger className="px-6 py-4 hover:no-underline">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <CalendarClock className="h-5 w-5 text-primary flex-shrink-0" />
            <span className="text-lg font-semibold">Schedule Changes</span>
            {loading ? null : outstanding.length > 0 ? (
              <Badge variant="outline" className="font-normal bg-red-500/10 text-red-600 border-red-300">
                {outstanding.length} awaiting acknowledgement
              </Badge>
            ) : (starting.length + ending.length) > 0 ? (
              <Badge variant="outline" className="font-normal bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/30">
                {starting.length + ending.length} upcoming
              </Badge>
            ) : (
              <Badge variant="outline" className="font-normal bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30">
                <CheckCircle2 className="h-3 w-3 mr-1" /> All confirmed
              </Badge>
            )}
          </div>
        </AccordionTrigger>
        <AccordionContent className="px-6 pb-6 space-y-4">
          {loading ? (
            <div className="text-sm text-muted-foreground py-2">Loading…</div>
          ) : (
            <>
              {(starting.length > 0 || ending.length > 0) && (
                <div>
                  <h4 className="text-sm font-semibold mb-2">Upcoming schedule</h4>
                  <div className="space-y-2">
                    {starting.map(p => (
                      <div key={`s-${p.id}`} className="flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50/50 dark:bg-blue-950/20 dark:border-blue-900 px-3 py-2.5">
                        <PlayCircle className="h-4 w-4 text-blue-600 flex-shrink-0 mt-0.5" />
                        <div className="min-w-0 flex-1">
                          <span className="text-sm font-medium">
                            New regular shifts{p.client_name ? ` at ${p.client_name}` : ""} start {format(parseISO(p.start_date!), "EEEE d MMMM")}
                          </span>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {daysLabel(p.days_of_week)}{p.start_time ? ` · ${timeLabel(p.start_time)}–${timeLabel(p.end_time)}` : ""}
                          </p>
                        </div>
                      </div>
                    ))}
                    {ending.map(({ p, lastDay }) => (
                      <div key={`e-${p.id}`} className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50/50 dark:bg-amber-950/20 dark:border-amber-900 px-3 py-2.5">
                        <Flag className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />
                        <div className="min-w-0 flex-1">
                          <span className="text-sm font-medium">
                            Regular shifts{p.client_name ? ` at ${p.client_name}` : ""} are ending — last shift {format(parseISO(lastDay!), "EEEE d MMMM")}
                          </span>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {daysLabel(p.days_of_week)}{p.start_time ? ` · ${timeLabel(p.start_time)}–${timeLabel(p.end_time)}` : ""}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {outstanding.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-sm font-semibold">Awaiting acknowledgement</h4>
                    {isSelf && outstanding.length > 1 && (
                      <Button size="sm" variant="outline" disabled={acking === "all"}
                        onClick={() => acknowledge(outstanding.map(r => r.id))}>
                        {acking === "all" ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Check className="h-3.5 w-3.5 mr-1" />}
                        Acknowledge all
                      </Button>
                    )}
                  </div>
                  <div className="space-y-2">
                    {outstanding.map(r => {
                      const meta = TYPE_META[r.change_type] ?? TYPE_META.changed;
                      return (
                        <div key={r.id} className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50/50 dark:bg-red-950/20 dark:border-red-900 px-3 py-2.5">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-medium">{r.summary}</span>
                              <Badge variant="outline" className={`text-[10px] ${meta.cls}`}>{meta.label}</Badge>
                            </div>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              Changed {formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}
                              {r.reminder_count > 0 && ` · ${r.reminder_count} reminder${r.reminder_count === 1 ? "" : "s"} sent`}
                            </p>
                          </div>
                          {isSelf && (
                            <Button size="sm" className="flex-shrink-0" disabled={acking === r.id}
                              onClick={() => acknowledge([r.id])}>
                              {acking === r.id ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Check className="h-3.5 w-3.5 mr-1" />}
                              Acknowledge
                            </Button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {done.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold mb-2 text-muted-foreground">Acknowledged</h4>
                  <div className="space-y-2">
                    {done.map(r => {
                      const meta = TYPE_META[r.change_type] ?? TYPE_META.changed;
                      return (
                        <div key={r.id} className="flex items-start gap-3 rounded-lg border px-3 py-2.5 opacity-80">
                          <CheckCircle2 className="h-4 w-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm">{r.summary}</span>
                              <Badge variant="outline" className={`text-[10px] ${meta.cls}`}>{meta.label}</Badge>
                            </div>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              Acknowledged {formatDistanceToNow(new Date(r.acknowledged_at!), { addSuffix: true })}
                              {r.acknowledged_via === "email" ? " from the email" : " in the portal"}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}
