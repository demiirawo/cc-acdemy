import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ChevronLeft, ChevronRight, Palmtree, Check, AlertCircle, ZoomIn, ZoomOut } from "lucide-react";
import {
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

const ROW_HEIGHT = 32;
const ROW_GAP = 6;
const LANE_PADDING = 12;
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

  // Lane packing
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
  const contentHeight = Math.max(lanes.length, 1) * laneHeight + LANE_PADDING * 2;

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
                    const isCovered = covers.length > 0;
                    const name = getName(req.user_id);
                    const totalDays =
                      differenceInCalendarDays(parseISO(req.end_date), parseISO(req.start_date)) + 1;

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
                            style={{ left: startOff * DAY_WIDTH + 2, top, width, height: ROW_HEIGHT }}
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
                            {format(parseISO(req.start_date), "dd MMM")} → {format(parseISO(req.end_date), "dd MMM yyyy")} ({totalDays} day{totalDays === 1 ? "" : "s"})
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
