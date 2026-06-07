import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ChevronLeft, ChevronRight, Palmtree, Check, AlertCircle, ZoomIn, ZoomOut } from "lucide-react";
import {
  addDays,
  addMonths,
  differenceInCalendarDays,
  eachDayOfInterval,
  endOfMonth,
  format,
  getDay,
  isSameDay,
  parseISO,
  startOfMonth,
} from "date-fns";

interface TimelineRequest {
  id: string;
  user_id: string;
  request_type: string;
  swap_with_user_id: string | null;
  start_date: string;
  end_date: string;
  status: string;
  linked_holiday_id: string | null;
  details: string | null;
}

interface UserProfile {
  user_id: string;
  display_name: string | null;
  email: string | null;
}

interface RequestsTimelineProps {
  requests: TimelineRequest[];
  userProfiles: UserProfile[];
  onSelectRequest?: (id: string) => void;
}

const ROW_HEIGHT = 48;
const ROW_GAP = 10;
const LANE_PADDING = 16;
const MIN_LANES = 6;
const HOLIDAY_TYPES = ["holiday", "holiday_paid", "holiday_unpaid"];
const ZOOM_STEPS = [0.5, 0.75, 1, 1.5, 2, 3, 4];
const BASE_DAY_WIDTH = 40; // base px per day at zoom=1

export function RequestsTimeline({ requests, userProfiles, onSelectRequest }: RequestsTimelineProps) {
  const [monthCursor, setMonthCursor] = useState(() => startOfMonth(new Date()));
  const [zoomIdx, setZoomIdx] = useState(2); // 1.0x

  const getName = (id: string | null) => {
    if (!id) return "Unknown";
    const p = userProfiles.find((u) => u.user_id === id);
    return p?.display_name || p?.email?.split("@")[0] || "Unknown";
  };

  const monthStart = monthCursor;
  const monthEnd = endOfMonth(monthCursor);
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const daysInMonth = days.length;

  // Holidays overlapping the current month
  const monthHolidays = useMemo(() => {
    const monthStartStr = format(monthStart, "yyyy-MM-dd");
    const monthEndStr = format(monthEnd, "yyyy-MM-dd");
    return requests
      .filter(
        (r) =>
          r.status !== "rejected" &&
          HOLIDAY_TYPES.includes(r.request_type) &&
          r.start_date <= monthEndStr &&
          r.end_date >= monthStartStr
      )
      .sort((a, b) => a.start_date.localeCompare(b.start_date));
  }, [requests, monthStart, monthEnd]);

  // Fetch shift patterns for users with holidays in this month, so we can show only
  // their actual working days (a holiday spanning a non-working day shouldn't be drawn solid).
  const userIdsForMonth = useMemo(
    () => Array.from(new Set(monthHolidays.map((h) => h.user_id))),
    [monthHolidays]
  );

  const { data: shiftPatterns = [] } = useQuery({
    queryKey: ["timeline-shift-patterns", userIdsForMonth],
    enabled: userIdsForMonth.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("recurring_shift_patterns")
        .select("id, user_id, days_of_week, start_date, end_date, recurrence_interval")
        .in("user_id", userIdsForMonth);
      if (error) throw error;
      return (data || []) as Array<{
        id: string;
        user_id: string;
        days_of_week: number[];
        start_date: string;
        end_date: string | null;
        recurrence_interval: string;
      }>;
    },
  });

  const patternIds = useMemo(() => shiftPatterns.map((p) => p.id), [shiftPatterns]);
  const { data: shiftExceptions = [] } = useQuery({
    queryKey: ["timeline-shift-exceptions", patternIds],
    enabled: patternIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("shift_pattern_exceptions")
        .select("pattern_id, exception_date")
        .in("pattern_id", patternIds);
      if (error) throw error;
      return (data || []) as Array<{ pattern_id: string; exception_date: string }>;
    },
  });

  const isWorkingDay = useMemo(() => {
    const exceptionSet = new Set(shiftExceptions.map((e) => `${e.pattern_id}:${e.exception_date}`));
    const byUser = new Map<string, typeof shiftPatterns>();
    shiftPatterns.forEach((p) => {
      const list = byUser.get(p.user_id) || [];
      list.push(p);
      byUser.set(p.user_id, list);
    });
    return (userId: string, date: Date): boolean => {
      const patterns = byUser.get(userId);
      if (!patterns || patterns.length === 0) return true; // fallback: treat all days as working
      const dStr = format(date, "yyyy-MM-dd");
      const dow = date.getDay();
      for (const p of patterns) {
        if (!p.days_of_week?.includes(dow)) continue;
        if (dStr < p.start_date) continue;
        if (p.end_date && dStr > p.end_date) continue;
        if (p.recurrence_interval !== "weekly") {
          const ps = parseISO(p.start_date);
          const diffWeeks = Math.floor(differenceInCalendarDays(date, ps) / 7);
          if (p.recurrence_interval === "biweekly" && diffWeeks % 2 !== 0) continue;
          if (p.recurrence_interval === "monthly" && diffWeeks % 4 !== 0) continue;
        }
        if (exceptionSet.has(`${p.id}:${dStr}`)) continue;
        return true;
      }
      return false;
    };
  }, [shiftPatterns, shiftExceptions]);

  // Compute contiguous working-day segments for a holiday within the current month.
  const segmentsFor = (req: TimelineRequest): Array<{ startIso: string; endIso: string }> => {
    const rangeStart = req.start_date > format(monthStart, "yyyy-MM-dd") ? parseISO(req.start_date) : monthStart;
    const rangeEnd = req.end_date < format(monthEnd, "yyyy-MM-dd") ? parseISO(req.end_date) : monthEnd;
    if (rangeStart > rangeEnd) return [];
    const segments: Array<{ startIso: string; endIso: string }> = [];
    let cur: { startIso: string; endIso: string } | null = null;
    let d = rangeStart;
    while (d <= rangeEnd) {
      if (isWorkingDay(req.user_id, d)) {
        const iso = format(d, "yyyy-MM-dd");
        if (cur) cur.endIso = iso;
        else cur = { startIso: iso, endIso: iso };
      } else if (cur) {
        segments.push(cur);
        cur = null;
      }
      d = addDays(d, 1);
    }
    if (cur) segments.push(cur);
    return segments;
  };

  // Lane packing (still based on full request range so visually grouped)
  const lanes = useMemo(() => {
    const ls: TimelineRequest[][] = [];
    monthHolidays.forEach((req) => {
      const lane = ls.find((l) => l[l.length - 1].end_date < req.start_date);
      if (lane) lane.push(req);
      else ls.push([req]);
    });
    return ls;
  }, [monthHolidays]);


  // Cover map
  const coversByHoliday = useMemo(() => {
    const m = new Map<string, TimelineRequest[]>();
    requests.forEach((r) => {
      if (r.status === "rejected" || r.request_type !== "shift_swap") return;
      const holiday = requests.find(
        (h) =>
          HOLIDAY_TYPES.includes(h.request_type) &&
          h.status !== "rejected" &&
          h.user_id === r.swap_with_user_id &&
          h.start_date <= r.end_date &&
          h.end_date >= r.start_date
      );
      if (!holiday) return;
      const list = m.get(holiday.id) || [];
      list.push(r);
      m.set(holiday.id, list);
    });
    return m;
  }, [requests]);

  const zoom = ZOOM_STEPS[zoomIdx];
  const DAY_WIDTH = BASE_DAY_WIDTH * zoom;
  const totalWidth = daysInMonth * DAY_WIDTH;

  const dayOffsetInMonth = (iso: string) => {
    const d = parseISO(iso);
    if (d < monthStart) return 0;
    if (d > monthEnd) return daysInMonth - 1;
    return differenceInCalendarDays(d, monthStart);
  };

  const today = new Date();
  const todayInMonth = today >= monthStart && today <= monthEnd;
  const todayOffset = todayInMonth ? differenceInCalendarDays(today, monthStart) * DAY_WIDTH + DAY_WIDTH / 2 : null;

  const laneHeight = ROW_HEIGHT + ROW_GAP;
  const contentHeight = Math.max(lanes.length, MIN_LANES) * laneHeight + LANE_PADDING * 2;

  return (
    <Card>
      <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0 gap-4">
        <div className="min-w-0">
          <CardTitle className="text-base flex items-center gap-2">
            <Palmtree className="h-4 w-4 text-primary" />
            Who's On Holiday
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            One month at a time. Use the arrows to navigate, zoom to fit.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <div className="flex items-center gap-1 border rounded-md">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setZoomIdx((i) => Math.max(0, i - 1))}
              disabled={zoomIdx === 0}
            >
              <ZoomOut className="h-4 w-4" />
            </Button>
            <span className="text-xs font-medium tabular-nums w-10 text-center">
              {Math.round(zoom * 100)}%
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setZoomIdx((i) => Math.min(ZOOM_STEPS.length - 1, i + 1))}
              disabled={zoomIdx === ZOOM_STEPS.length - 1}
            >
              <ZoomIn className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex items-center gap-1 border rounded-md px-1">
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setMonthCursor((m) => addMonths(m, -1))}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="text-sm font-semibold min-w-[130px] text-center">
              {format(monthCursor, "MMMM yyyy")}
            </div>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setMonthCursor((m) => addMonths(m, 1))}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="h-8"
            onClick={() => setMonthCursor(startOfMonth(new Date()))}
          >
            Today
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <TooltipProvider delayDuration={150}>
          <div className="overflow-x-auto border-t">
            <div style={{ width: totalWidth, minWidth: "100%", position: "relative" }}>
              {/* Day header */}
              <div className="h-10 border-b flex sticky top-0 bg-card z-10">
                {days.map((d) => {
                  const isToday = isSameDay(d, today);
                  const isWeekend = getDay(d) === 0 || getDay(d) === 6;
                  return (
                    <div
                      key={d.toISOString()}
                      className={`border-r text-[10px] flex flex-col items-center justify-center ${
                        isWeekend ? "bg-muted/40" : ""
                      } ${isToday ? "bg-red-50 dark:bg-red-950/40 font-semibold text-red-700 dark:text-red-300" : "text-muted-foreground"}`}
                      style={{ width: DAY_WIDTH, minWidth: DAY_WIDTH }}
                    >
                      <div className="uppercase tracking-wide">{format(d, "EEE")[0]}</div>
                      <div className="text-xs font-medium text-foreground">{format(d, "d")}</div>
                    </div>
                  );
                })}
              </div>

              <div className="relative" style={{ height: contentHeight, paddingTop: LANE_PADDING }}>
                {/* Day grid */}
                <div className="absolute inset-0 flex pointer-events-none">
                  {days.map((d) => {
                    const isWeekend = getDay(d) === 0 || getDay(d) === 6;
                    return (
                      <div
                        key={d.toISOString()}
                        className={`border-r border-dashed border-muted ${isWeekend ? "bg-muted/20" : ""}`}
                        style={{ width: DAY_WIDTH }}
                      />
                    );
                  })}
                </div>

                {/* Today line */}
                {todayOffset !== null && (
                  <div
                    className="absolute top-0 bottom-0 w-px bg-red-500 z-20 pointer-events-none"
                    style={{ left: todayOffset }}
                  >
                    <div className="absolute -top-1 -left-[3px] w-[7px] h-[7px] rounded-full bg-red-500" />
                  </div>
                )}

                {lanes.length === 0 && (
                  <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
                    No holidays in {format(monthCursor, "MMMM yyyy")}
                  </div>
                )}

                {/* Bars */}
                {lanes.map((lane, laneIdx) =>
                  lane.map((req) => {
                    const startOff = dayOffsetInMonth(req.start_date);
                    const endOff = dayOffsetInMonth(req.end_date);
                    const spanDays = endOff - startOff + 1;
                    const width = Math.max(DAY_WIDTH, spanDays * DAY_WIDTH) - 4;
                    const top = LANE_PADDING + laneIdx * laneHeight;
                    const isPending = req.status === "pending";
                    const isUnpaid = req.request_type === "holiday_unpaid";
                    const covers = coversByHoliday.get(req.id) || [];
                    const name = getName(req.user_id);
                    const totalDays =
                      differenceInCalendarDays(parseISO(req.end_date), parseISO(req.start_date)) + 1;

                    // Coverage status: count unique covered days vs holiday days
                    const coveredDays = new Set<string>();
                    covers.forEach((c) => {
                      const cStart = c.start_date > req.start_date ? c.start_date : req.start_date;
                      const cEnd = c.end_date < req.end_date ? c.end_date : req.end_date;
                      if (cStart > cEnd) return;
                      eachDayOfInterval({ start: parseISO(cStart), end: parseISO(cEnd) }).forEach((d) =>
                        coveredDays.add(format(d, "yyyy-MM-dd"))
                      );
                    });
                    let coverage: "covered" | "partial" | "open";
                    if (coveredDays.size === 0) coverage = "open";
                    else if (coveredDays.size >= totalDays) coverage = "covered";
                    else coverage = "partial";

                    // Color-code by coverage status
                    let palette: string;
                    if (coverage === "covered") {
                      palette = "bg-cyan-100 dark:bg-cyan-900/40 border-cyan-500 text-cyan-900 dark:text-cyan-50";
                    } else if (coverage === "partial") {
                      palette = "bg-amber-100 dark:bg-amber-900/40 border-amber-500 text-amber-900 dark:text-amber-50";
                    } else {
                      palette = "bg-rose-100 dark:bg-rose-900/40 border-rose-500 text-rose-900 dark:text-rose-50";
                    }

                    return (
                      <Tooltip key={req.id}>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            onClick={() => onSelectRequest?.(req.id)}
                            className={`absolute rounded-md border-2 ${palette} ${
                              isPending ? "opacity-70 border-dashed" : ""
                            } flex items-center gap-2 px-2.5 text-xs font-medium overflow-hidden hover:ring-2 hover:ring-primary hover:z-10 transition`}
                            style={{ left: startOff * DAY_WIDTH + 2, top, width, height: ROW_HEIGHT }}
                          >
                            <Palmtree className={`h-4 w-4 flex-shrink-0 ${isUnpaid ? "opacity-60" : ""}`} />
                            <span className="truncate flex-1 text-left">{name}</span>
                            {isUnpaid && (
                              <span className="text-[9px] uppercase tracking-wider opacity-70 flex-shrink-0">Unpaid</span>
                            )}
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="text-xs">
                          <div className="font-semibold">{name}</div>
                          <div>
                            {format(parseISO(req.start_date), "dd MMM")} → {format(parseISO(req.end_date), "dd MMM yyyy")} ({totalDays} day{totalDays === 1 ? "" : "s"})
                          </div>
                          <div className="capitalize text-muted-foreground">
                            {isUnpaid ? "Unpaid holiday" : "Holiday"} · {req.status}
                          </div>
                          <div className="mt-1 pt-1 border-t">
                            {coverage === "covered" && (
                              <span className="text-cyan-700 dark:text-cyan-300">Fully covered by: {covers.map((c) => getName(c.user_id)).join(", ")}</span>
                            )}
                            {coverage === "partial" && (
                              <span className="text-amber-700 dark:text-amber-300">
                                Partially covered ({coveredDays.size}/{totalDays} days) by: {covers.map((c) => getName(c.user_id)).join(", ")}
                              </span>
                            )}
                            {coverage === "open" && (
                              <span className="text-rose-600 dark:text-rose-400">No cover assigned</span>
                            )}
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    );
                  })
                )}

              </div>
            </div>
          </div>
        </TooltipProvider>

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-3 px-4 py-2 border-t text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded border-2 bg-cyan-100 border-cyan-500" />
            Fully covered
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded border-2 bg-amber-100 border-amber-500" />
            Partially covered
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded border-2 bg-rose-100 border-rose-500" />
            Needs cover
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded border-2 border-dashed border-muted-foreground" />
            Pending
          </div>
          <div className="flex items-center gap-1.5 ml-auto">
            <div className="w-px h-3 bg-red-500" /> Today
          </div>
        </div>

      </CardContent>
    </Card>
  );
}
