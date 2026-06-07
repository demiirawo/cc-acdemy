import { useMemo, useRef, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ChevronLeft, ChevronRight, Palmtree, Check, AlertCircle } from "lucide-react";
import {
  addMonths,
  differenceInCalendarDays,
  eachMonthOfInterval,
  endOfMonth,
  format,
  max as maxDate,
  min as minDate,
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

const ZOOM_LEVELS: Record<string, number> = { month: 8, week: 18, day: 36 };
const ROW_HEIGHT = 30;
const ROW_GAP = 6;
const LANE_PADDING = 10;
const HOLIDAY_TYPES = ["holiday", "holiday_paid", "holiday_unpaid"];

export function RequestsTimeline({ requests, userProfiles, onSelectRequest }: RequestsTimelineProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState<"month" | "week" | "day">("week");
  const DAY_WIDTH = ZOOM_LEVELS[zoom];

  const getName = (id: string | null) => {
    if (!id) return "Unknown";
    const p = userProfiles.find((u) => u.user_id === id);
    return p?.display_name || p?.email?.split("@")[0] || "Unknown";
  };

  const { months, rangeStart, rangeEnd, lanes, totalWidth } = useMemo(() => {
    const holidays = requests.filter(
      (r) => r.status !== "rejected" && HOLIDAY_TYPES.includes(r.request_type)
    );

    if (holidays.length === 0) {
      const today = new Date();
      const start = startOfMonth(today);
      const end = endOfMonth(addMonths(today, 5));
      return {
        months: eachMonthOfInterval({ start, end }),
        rangeStart: start,
        rangeEnd: end,
        lanes: [] as TimelineRequest[][],
        totalWidth: (differenceInCalendarDays(end, start) + 1) * DAY_WIDTH,
      };
    }

    const dates = holidays.flatMap((r) => [parseISO(r.start_date), parseISO(r.end_date)]);
    const minD = startOfMonth(minDate(dates));
    const maxD = endOfMonth(maxDate(dates));
    const months = eachMonthOfInterval({ start: minD, end: maxD });

    // Pack holidays into lanes (greedy, sorted by start)
    const sorted = [...holidays].sort((a, b) => a.start_date.localeCompare(b.start_date));
    const lanes: TimelineRequest[][] = [];
    sorted.forEach((req) => {
      const lane = lanes.find((l) => l[l.length - 1].end_date < req.start_date);
      if (lane) lane.push(req);
      else lanes.push([req]);
    });

    return {
      months,
      rangeStart: minD,
      rangeEnd: maxD,
      lanes,
      totalWidth: (differenceInCalendarDays(maxD, minD) + 1) * DAY_WIDTH,
    };
  }, [requests]);

  // Map holiday id -> cover requests
  const coversByHoliday = useMemo(() => {
    const m = new Map<string, TimelineRequest[]>();
    requests.forEach((r) => {
      if (r.status === "rejected") return;
      if (r.request_type !== "shift_swap") return;
      // Match via linked_holiday_id, else by covered user + overlap
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

  const dayOffset = (iso: string) => differenceInCalendarDays(parseISO(iso), rangeStart);

  useEffect(() => {
    if (!scrollRef.current) return;
    const today = new Date();
    if (today >= rangeStart && today <= rangeEnd) {
      const offset = differenceInCalendarDays(today, rangeStart) * DAY_WIDTH;
      scrollRef.current.scrollLeft = Math.max(0, offset - 200);
    }
  }, [rangeStart, rangeEnd]);

  const scrollByMonths = (n: number) => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollBy({ left: n * 30 * DAY_WIDTH, behavior: "smooth" });
  };

  const todayOffset =
    new Date() >= rangeStart && new Date() <= rangeEnd
      ? differenceInCalendarDays(new Date(), rangeStart) * DAY_WIDTH
      : null;

  const laneHeight = ROW_HEIGHT + ROW_GAP;
  const contentHeight = Math.max(lanes.length, 1) * laneHeight + LANE_PADDING * 2;

  return (
    <Card>
      <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle className="text-base flex items-center gap-2">
            <Palmtree className="h-4 w-4 text-primary" />
            Who's On Holiday
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            Approved &amp; pending holidays across upcoming months. Each bar shows whether the shift is covered.
          </p>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => scrollByMonths(-1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => scrollByMonths(1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <TooltipProvider delayDuration={150}>
          <div ref={scrollRef} className="overflow-x-auto border-t">
            <div style={{ width: totalWidth, position: "relative" }}>
              {/* Month header */}
              <div className="h-9 border-b flex sticky top-0 bg-card z-10">
                {months.map((m) => {
                  const days = differenceInCalendarDays(endOfMonth(m), startOfMonth(m)) + 1;
                  return (
                    <div
                      key={m.toISOString()}
                      className="border-r text-xs font-medium flex items-center justify-center text-muted-foreground"
                      style={{ width: days * DAY_WIDTH, minWidth: days * DAY_WIDTH }}
                    >
                      {format(m, "MMMM yyyy")}
                    </div>
                  );
                })}
              </div>

              <div className="relative" style={{ height: contentHeight, paddingTop: LANE_PADDING }}>
                {/* Month grid lines */}
                <div className="absolute inset-0 flex pointer-events-none">
                  {months.map((m) => {
                    const days = differenceInCalendarDays(endOfMonth(m), startOfMonth(m)) + 1;
                    return (
                      <div
                        key={m.toISOString()}
                        className="border-r border-dashed border-muted"
                        style={{ width: days * DAY_WIDTH }}
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
                    No upcoming holidays
                  </div>
                )}

                {/* Holiday bars */}
                {lanes.map((lane, laneIdx) =>
                  lane.map((req) => {
                    const startOff = dayOffset(req.start_date);
                    const endOff = dayOffset(req.end_date);
                    const width = Math.max(DAY_WIDTH * 2, (endOff - startOff + 1) * DAY_WIDTH);
                    const top = LANE_PADDING + laneIdx * laneHeight;
                    const isPending = req.status === "pending";
                    const isUnpaid = req.request_type === "holiday_unpaid";
                    const covers = coversByHoliday.get(req.id) || [];
                    const isCovered = covers.length > 0;
                    const name = getName(req.user_id);
                    const days = endOff - startOff + 1;

                    const palette = isUnpaid
                      ? "bg-amber-50 dark:bg-amber-900/30 border-amber-400 text-amber-900 dark:text-amber-100"
                      : "bg-emerald-50 dark:bg-emerald-900/30 border-emerald-500 text-emerald-900 dark:text-emerald-100";

                    return (
                      <Tooltip key={req.id}>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            onClick={() => onSelectRequest?.(req.id)}
                            className={`absolute rounded-md border-2 ${palette} ${
                              isPending ? "opacity-70 border-dashed" : ""
                            } flex items-center gap-1.5 px-2 text-xs font-medium overflow-hidden hover:ring-2 hover:ring-primary hover:z-10 transition`}
                            style={{ left: startOff * DAY_WIDTH, top, width, height: ROW_HEIGHT }}
                          >
                            <Palmtree className="h-3.5 w-3.5 flex-shrink-0" />
                            <span className="truncate flex-1 text-left">{name}</span>
                            {isCovered ? (
                              <span className="flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full bg-cyan-100 dark:bg-cyan-900/50 text-cyan-800 dark:text-cyan-100 border border-cyan-300 flex-shrink-0">
                                <Check className="h-2.5 w-2.5" /> Covered
                              </span>
                            ) : (
                              <span className="flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full bg-rose-100 dark:bg-rose-900/40 text-rose-800 dark:text-rose-100 border border-rose-300 flex-shrink-0">
                                <AlertCircle className="h-2.5 w-2.5" /> Open
                              </span>
                            )}
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="text-xs">
                          <div className="font-semibold">{name}</div>
                          <div>
                            {format(parseISO(req.start_date), "dd MMM")} → {format(parseISO(req.end_date), "dd MMM yyyy")} ({days} day{days === 1 ? "" : "s"})
                          </div>
                          <div className="capitalize text-muted-foreground">
                            {isUnpaid ? "Unpaid holiday" : "Holiday"} · {req.status}
                          </div>
                          {covers.length > 0 ? (
                            <div className="mt-1 pt-1 border-t">
                              Covered by: {covers.map((c) => getName(c.user_id)).join(", ")}
                            </div>
                          ) : (
                            <div className="mt-1 pt-1 border-t text-rose-600">No cover assigned</div>
                          )}
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
            <div className="w-3 h-3 rounded border-2 bg-emerald-50 border-emerald-500" />
            Paid holiday
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded border-2 bg-amber-50 border-amber-400" />
            Unpaid holiday
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded border-2 border-dashed border-muted-foreground" />
            Pending
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-cyan-100 text-cyan-800 border border-cyan-300">Covered</span>
            Shift has cover
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-rose-100 text-rose-800 border border-rose-300">Open</span>
            Needs cover
          </div>
          <div className="flex items-center gap-1.5 ml-auto">
            <div className="w-px h-3 bg-red-500" /> Today
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
