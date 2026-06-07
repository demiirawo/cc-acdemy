import { useMemo, useRef, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ChevronLeft, ChevronRight, Palmtree, RefreshCw, Clock, Link2 } from "lucide-react";
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

const DAY_WIDTH = 18; // px per day
const ROW_HEIGHT = 28;
const ROW_GAP = 6;
const LANE_PADDING = 8;

const typeStyles: Record<string, { bg: string; border: string; icon: typeof Palmtree; label: string }> = {
  holiday: { bg: "bg-green-100 dark:bg-green-900/40", border: "border-green-500", icon: Palmtree, label: "Holiday" },
  holiday_paid: { bg: "bg-green-100 dark:bg-green-900/40", border: "border-green-500", icon: Palmtree, label: "Paid Holiday" },
  holiday_unpaid: { bg: "bg-yellow-100 dark:bg-yellow-900/40", border: "border-yellow-500", icon: Palmtree, label: "Unpaid Holiday" },
  shift_swap: { bg: "bg-cyan-100 dark:bg-cyan-900/40", border: "border-cyan-500", icon: RefreshCw, label: "Shift Cover" },
  overtime: { bg: "bg-orange-100 dark:bg-orange-900/40", border: "border-orange-500", icon: Clock, label: "Overtime" },
  overtime_standard: { bg: "bg-orange-100 dark:bg-orange-900/40", border: "border-orange-500", icon: Clock, label: "Overtime (Outside)" },
  overtime_double_up: { bg: "bg-amber-100 dark:bg-amber-900/40", border: "border-amber-500", icon: Clock, label: "Overtime (Inside)" },
};

export function RequestsTimeline({ requests, userProfiles, onSelectRequest }: RequestsTimelineProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollLeft, setScrollLeft] = useState(0);

  const getName = (id: string | null) => {
    if (!id) return "Unknown";
    const p = userProfiles.find((u) => u.user_id === id);
    return p?.display_name || p?.email?.split("@")[0] || "Unknown";
  };

  const { months, rangeStart, rangeEnd, lanes, totalWidth } = useMemo(() => {
    const active = requests.filter((r) => r.status !== "rejected");
    if (active.length === 0) {
      const today = new Date();
      const start = startOfMonth(today);
      const end = endOfMonth(addMonths(today, 5));
      return {
        months: eachMonthOfInterval({ start, end }),
        rangeStart: start,
        rangeEnd: end,
        lanes: [] as Array<{ user_id: string; items: TimelineRequest[] }>,
        totalWidth: differenceInCalendarDays(end, start) * DAY_WIDTH,
      };
    }

    const dates = active.flatMap((r) => [parseISO(r.start_date), parseISO(r.end_date)]);
    const minD = startOfMonth(minDate(dates));
    const maxD = endOfMonth(maxDate(dates));
    const months = eachMonthOfInterval({ start: minD, end: maxD });

    // Group by user
    const byUser = new Map<string, TimelineRequest[]>();
    active.forEach((r) => {
      const list = byUser.get(r.user_id) || [];
      list.push(r);
      byUser.set(r.user_id, list);
    });
    const lanes = Array.from(byUser.entries())
      .map(([user_id, items]) => ({ user_id, items }))
      .sort((a, b) => getName(a.user_id).localeCompare(getName(b.user_id)));

    return {
      months,
      rangeStart: minD,
      rangeEnd: maxD,
      lanes,
      totalWidth: (differenceInCalendarDays(maxD, minD) + 1) * DAY_WIDTH,
    };
  }, [requests, userProfiles]);

  const requestById = useMemo(() => {
    const m = new Map<string, TimelineRequest>();
    requests.forEach((r) => m.set(r.id, r));
    return m;
  }, [requests]);

  // Compute dependency lines: cover request -> linked holiday
  const dependencies = useMemo(() => {
    const deps: Array<{ from: TimelineRequest; to: TimelineRequest }> = [];
    requests.forEach((r) => {
      if (r.status === "rejected") return;
      if (r.request_type === "shift_swap" && r.linked_holiday_id) {
        // linked_holiday_id is a staff_holidays id; we look for the holiday request matching covered user
        const covered = r.swap_with_user_id;
        const holiday = requests.find(
          (h) =>
            h.user_id === covered &&
            ["holiday", "holiday_paid", "holiday_unpaid"].includes(h.request_type) &&
            h.start_date <= r.end_date &&
            h.end_date >= r.start_date &&
            h.status !== "rejected"
        );
        if (holiday) deps.push({ from: r, to: holiday });
      }
    });
    return deps;
  }, [requests]);

  const dayOffset = (iso: string) => differenceInCalendarDays(parseISO(iso), rangeStart);

  const laneIndexByUser = useMemo(() => {
    const m = new Map<string, number>();
    lanes.forEach((l, i) => m.set(l.user_id, i));
    return m;
  }, [lanes]);

  // Scroll to today on mount
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
  const contentHeight = lanes.length * laneHeight + LANE_PADDING * 2;
  const NAME_COL = 160;

  return (
    <Card>
      <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle className="text-base flex items-center gap-2">
            <Link2 className="h-4 w-4 text-primary" />
            Request Timeline
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            Holidays and their shift covers, plotted across months. Lines link covers to the holiday they cover.
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
          <div className="flex border-t">
            {/* Sticky name column */}
            <div className="flex-shrink-0 border-r bg-muted/30" style={{ width: NAME_COL }}>
              <div className="h-10 border-b flex items-center px-3 text-xs font-medium text-muted-foreground">
                Staff Member
              </div>
              <div style={{ paddingTop: LANE_PADDING, paddingBottom: LANE_PADDING }}>
                {lanes.length === 0 ? (
                  <div className="px-3 py-6 text-xs text-muted-foreground">No requests</div>
                ) : (
                  lanes.map((lane) => (
                    <div
                      key={lane.user_id}
                      className="px-3 text-sm truncate flex items-center"
                      style={{ height: ROW_HEIGHT, marginBottom: ROW_GAP }}
                      title={getName(lane.user_id)}
                    >
                      {getName(lane.user_id)}
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Scrollable timeline */}
            <div
              ref={scrollRef}
              className="overflow-x-auto flex-1"
              onScroll={(e) => setScrollLeft((e.target as HTMLDivElement).scrollLeft)}
            >
              <div style={{ width: totalWidth, position: "relative" }}>
                {/* Month header */}
                <div className="h-10 border-b flex sticky top-0 bg-card z-10">
                  {months.map((m) => {
                    const days = differenceInCalendarDays(endOfMonth(m), startOfMonth(m)) + 1;
                    return (
                      <div
                        key={m.toISOString()}
                        className="border-r text-xs font-medium flex items-center justify-center text-muted-foreground"
                        style={{ width: days * DAY_WIDTH, minWidth: days * DAY_WIDTH }}
                      >
                        {format(m, "MMM yyyy")}
                      </div>
                    );
                  })}
                </div>

                {/* Body with bars + dependencies */}
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

                  {/* Dependency arrows */}
                  <svg
                    className="absolute inset-0 pointer-events-none"
                    width={totalWidth}
                    height={contentHeight}
                    style={{ top: 0 }}
                  >
                    {dependencies.map(({ from, to }, i) => {
                      const fromLane = laneIndexByUser.get(from.user_id);
                      const toLane = laneIndexByUser.get(to.user_id);
                      if (fromLane === undefined || toLane === undefined) return null;
                      const fromX = (dayOffset(from.start_date) + 0.5) * DAY_WIDTH;
                      const toX = (dayOffset(to.start_date) + 0.5) * DAY_WIDTH;
                      const fromY = LANE_PADDING + fromLane * laneHeight + ROW_HEIGHT / 2;
                      const toY = LANE_PADDING + toLane * laneHeight + ROW_HEIGHT / 2;
                      const midY = (fromY + toY) / 2;
                      return (
                        <g key={i}>
                          <path
                            d={`M ${fromX} ${fromY} C ${fromX} ${midY}, ${toX} ${midY}, ${toX} ${toY}`}
                            stroke="hsl(var(--primary))"
                            strokeWidth={1.2}
                            strokeDasharray="3 3"
                            fill="none"
                            opacity={0.6}
                          />
                          <circle cx={toX} cy={toY} r={2.5} fill="hsl(var(--primary))" opacity={0.7} />
                        </g>
                      );
                    })}
                  </svg>

                  {/* Bars */}
                  {lanes.map((lane, laneIdx) =>
                    lane.items.map((req) => {
                      const style = typeStyles[req.request_type] || typeStyles.holiday;
                      const Icon = style.icon;
                      const startOff = dayOffset(req.start_date);
                      const endOff = dayOffset(req.end_date);
                      const width = Math.max(DAY_WIDTH, (endOff - startOff + 1) * DAY_WIDTH);
                      const top = LANE_PADDING + laneIdx * laneHeight;
                      const isPending = req.status === "pending";
                      const isCover = req.request_type === "shift_swap";
                      const coveringName = isCover && req.swap_with_user_id ? getName(req.swap_with_user_id) : null;

                      return (
                        <Tooltip key={req.id}>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              onClick={() => onSelectRequest?.(req.id)}
                              className={`absolute rounded-md border-2 ${style.bg} ${style.border} ${
                                isPending ? "opacity-70 border-dashed" : ""
                              } flex items-center gap-1 px-2 text-xs font-medium overflow-hidden hover:ring-2 hover:ring-primary hover:z-10 transition`}
                              style={{
                                left: startOff * DAY_WIDTH,
                                top,
                                width,
                                height: ROW_HEIGHT,
                              }}
                            >
                              <Icon className="h-3 w-3 flex-shrink-0" />
                              <span className="truncate">
                                {style.label}
                                {coveringName ? ` · ${coveringName}` : ""}
                              </span>
                            </button>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="text-xs">
                            <div className="font-semibold">{getName(req.user_id)} — {style.label}</div>
                            <div>{format(parseISO(req.start_date), "dd MMM yyyy")} → {format(parseISO(req.end_date), "dd MMM yyyy")}</div>
                            {coveringName && <div>Covering: {coveringName}</div>}
                            <div className="capitalize text-muted-foreground">Status: {req.status}</div>
                          </TooltipContent>
                        </Tooltip>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          </div>
        </TooltipProvider>

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-3 px-4 py-2 border-t text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded border-2 bg-green-100 border-green-500" />
            Holiday
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded border-2 bg-yellow-100 border-yellow-500" />
            Unpaid Holiday
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded border-2 bg-cyan-100 border-cyan-500" />
            Shift Cover
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded border-2 bg-orange-100 border-orange-500" />
            Overtime
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded border-2 border-dashed border-muted-foreground" />
            Pending
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-px bg-primary" style={{ borderTop: "1px dashed" }} />
            Cover → Holiday link
          </div>
          <div className="flex items-center gap-1.5 ml-auto">
            <div className="w-px h-3 bg-red-500" /> Today
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
