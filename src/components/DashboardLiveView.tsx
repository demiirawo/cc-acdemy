import { useMemo, useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { format, startOfDay, endOfDay, parseISO, isSameDay, isWithinInterval, getDay, differenceInWeeks, startOfWeek, isBefore, isAfter, differenceInMinutes } from "date-fns";
import { Infinity, UserCheck, Loader2 } from "lucide-react";
interface Schedule {
  id: string;
  user_id: string;
  client_name: string;
  start_datetime: string;
  end_datetime: string;
  shift_type?: string | null;
  is_cover_shift?: boolean;
  covering_for_name?: string;
}
interface RecurringPattern {
  id: string;
  user_id: string;
  client_name: string;
  days_of_week: number[];
  start_time: string;
  end_time: string;
  start_date: string;
  end_date: string | null;
  recurrence_interval: string;
  shift_type: string | null;
  is_overtime: boolean;
}
interface StaffMember {
  user_id: string;
  display_name: string | null;
  email: string | null;
}
interface Holiday {
  id: string;
  user_id: string;
  start_date: string;
  end_date: string;
  status: string;
}
interface StaffRequest {
  id: string;
  user_id: string;
  request_type: string;
  swap_with_user_id: string | null;
  start_date: string;
  end_date: string;
  status: string;
  linked_holiday_id: string | null;
}
export function DashboardLiveView() {
  // Use state for current time to enable updates
  const [currentTime, setCurrentTime] = useState(() => new Date());
  
  // Update current time every minute
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 60000); // Update every minute
    return () => clearInterval(interval);
  }, []);

  const today = startOfDay(currentTime);
  const todayEnd = endOfDay(currentTime);

  // Timeline configuration
  const TIMELINE_START_HOUR = 6;
  const TIMELINE_END_HOUR = 23;
  const TIMELINE_HOURS = TIMELINE_END_HOUR - TIMELINE_START_HOUR;
  const HOUR_WIDTH = 60;
  const TIMELINE_WIDTH = TIMELINE_HOURS * HOUR_WIDTH;
  const NAME_COLUMN_WIDTH = 160;
  // Use currentTime as base to ensure same date context
  const timelineStart = new Date(currentTime);
  timelineStart.setHours(TIMELINE_START_HOUR, 0, 0, 0);
  const timelineEnd = new Date(currentTime);
  timelineEnd.setHours(TIMELINE_END_HOUR, 0, 0, 0);

  // Fetch all data needed for the live view
  const {
    data: schedules = [],
    isLoading: schedulesLoading
  } = useQuery({
    queryKey: ["dashboard-live-schedules", format(today, "yyyy-MM-dd")],
    queryFn: async () => {
      const {
        data,
        error
      } = await supabase.from("staff_schedules").select("id, user_id, client_name, start_datetime, end_datetime, shift_type").gte("start_datetime", today.toISOString()).lte("start_datetime", todayEnd.toISOString());
      if (error) throw error;
      return data || [];
    }
  });
  const {
    data: recurringPatterns = [],
    isLoading: patternsLoading
  } = useQuery({
    queryKey: ["dashboard-live-patterns"],
    queryFn: async () => {
      const {
        data,
        error
      } = await supabase.from("recurring_shift_patterns").select("*").lte("start_date", format(today, "yyyy-MM-dd")).or(`end_date.is.null,end_date.gte.${format(today, "yyyy-MM-dd")}`);
      if (error) throw error;
      return data || [];
    }
  });
  const {
    data: staffProfiles = [],
    isLoading: staffLoading
  } = useQuery({
    queryKey: ["dashboard-live-staff"],
    queryFn: async () => {
      const {
        data,
        error
      } = await supabase.from("profiles").select("user_id, display_name, email");
      if (error) throw error;
      return data || [];
    }
  });
  const {
    data: holidays = []
  } = useQuery({
    queryKey: ["dashboard-live-holidays", format(today, "yyyy-MM-dd")],
    queryFn: async () => {
      const {
        data,
        error
      } = await supabase.from("staff_holidays").select("id, user_id, start_date, end_date, status").eq("status", "approved").lte("start_date", format(today, "yyyy-MM-dd")).gte("end_date", format(today, "yyyy-MM-dd"));
      if (error) throw error;
      return data || [];
    }
  });
  const {
    data: staffRequests = []
  } = useQuery({
    queryKey: ["dashboard-live-requests", format(today, "yyyy-MM-dd")],
    queryFn: async () => {
      const {
        data,
        error
      } = await supabase.from("staff_requests").select("id, user_id, request_type, swap_with_user_id, start_date, end_date, status, linked_holiday_id").eq("status", "approved").lte("start_date", format(today, "yyyy-MM-dd")).gte("end_date", format(today, "yyyy-MM-dd"));
      if (error) throw error;
      return data || [];
    }
  });
  const getStaffName = (userId: string): string => {
    const staff = staffProfiles.find(s => s.user_id === userId);
    return staff?.display_name || staff?.email?.split("@")[0] || "Unknown";
  };

  // Check if staff member is on approved holiday today
  const isStaffOnHoliday = (userId: string): boolean => {
    return holidays.some(h => {
      if (h.user_id !== userId || h.status !== "approved") return false;
      const start = parseISO(h.start_date);
      const end = parseISO(h.end_date);
      return isWithinInterval(today, {
        start,
        end
      });
    });
  };

  // Generate virtual schedules from recurring patterns
  const virtualSchedules = useMemo(() => {
    const virtual: Schedule[] = [];
    const dayOfWeek = getDay(today);
    const adjustedDayOfWeek = dayOfWeek === 0 ? 7 : dayOfWeek;
    recurringPatterns.forEach(pattern => {
      const patternStartDate = parseISO(pattern.start_date);
      const patternEndDate = pattern.end_date ? parseISO(pattern.end_date) : null;
      if (isBefore(today, patternStartDate)) return;
      if (patternEndDate && isAfter(today, patternEndDate)) return;
      let shouldGenerate = false;
      if (pattern.recurrence_interval === "daily") {
        shouldGenerate = true;
      } else if (pattern.recurrence_interval === "weekly") {
        shouldGenerate = pattern.days_of_week.includes(adjustedDayOfWeek);
      } else if (pattern.recurrence_interval === "biweekly") {
        const weeksDiff = differenceInWeeks(startOfWeek(today, {
          weekStartsOn: 1
        }), startOfWeek(patternStartDate, {
          weekStartsOn: 1
        }));
        shouldGenerate = pattern.days_of_week.includes(adjustedDayOfWeek) && weeksDiff % 2 === 0;
      } else if (pattern.recurrence_interval === "one_off") {
        shouldGenerate = isSameDay(today, patternStartDate);
      }
      if (shouldGenerate) {
        const hasManualSchedule = schedules.some(s => s.user_id === pattern.user_id && s.client_name === pattern.client_name && isSameDay(parseISO(s.start_datetime), today));
        if (!hasManualSchedule) {
          const startDateTime = new Date(today);
          const [startHour, startMin] = pattern.start_time.split(":").map(Number);
          startDateTime.setHours(startHour, startMin, 0, 0);
          const endDateTime = new Date(today);
          const [endHour, endMin] = pattern.end_time.split(":").map(Number);
          endDateTime.setHours(endHour, endMin, 0, 0);
          virtual.push({
            id: `pattern-${pattern.id}-${format(today, "yyyy-MM-dd")}`,
            user_id: pattern.user_id,
            client_name: pattern.client_name,
            start_datetime: startDateTime.toISOString(),
            end_datetime: endDateTime.toISOString(),
            shift_type: pattern.shift_type
          });
        }
      }
    });
    return virtual;
  }, [recurringPatterns, schedules, today]);

  // Generate cover shifts from approved requests
  const coverShifts = useMemo(() => {
    const covers: Schedule[] = [];
    staffRequests.forEach(req => {
      if (req.status !== "approved") return;
      if (!["overtime_standard", "overtime_double_up", "shift_swap"].includes(req.request_type)) return;
      const coveredUserId = req.swap_with_user_id || (req.linked_holiday_id ? holidays.find(h => h.id === req.linked_holiday_id)?.user_id : null);
      if (!coveredUserId) return;
      const allSchedulesForCover = [...schedules, ...virtualSchedules];
      const coveredSchedules = allSchedulesForCover.filter(s => s.user_id === coveredUserId && isSameDay(parseISO(s.start_datetime), today));
      coveredSchedules.forEach(coveredSchedule => {
        covers.push({
          id: `cover-${req.id}-${coveredSchedule.id}`,
          user_id: req.user_id,
          client_name: coveredSchedule.client_name,
          start_datetime: coveredSchedule.start_datetime,
          end_datetime: coveredSchedule.end_datetime,
          shift_type: coveredSchedule.shift_type,
          is_cover_shift: true,
          covering_for_name: getStaffName(coveredUserId)
        });
      });
    });
    return covers;
  }, [staffRequests, holidays, schedules, virtualSchedules, today, getStaffName]);
  const allSchedules: Schedule[] = useMemo(() => {
    const combined: Schedule[] = [...schedules.map(s => ({
      ...s,
      is_cover_shift: false
    })), ...virtualSchedules.map(s => ({
      ...s,
      is_cover_shift: false
    })), ...coverShifts];
    const seen = new Set<string>();
    return combined.filter(s => {
      const key = `${s.user_id}-${s.client_name}-${s.start_datetime}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [schedules, virtualSchedules, coverShifts]);

  // Filter to today's schedules only, excluding staff on holiday
  const todaySchedules = useMemo(() => {
    return allSchedules.filter(schedule => {
      // Exclude staff on holiday (unless it's a cover shift)
      if (!schedule.is_cover_shift && isStaffOnHoliday(schedule.user_id)) {
        return false;
      }
      const start = parseISO(schedule.start_datetime);
      const end = parseISO(schedule.end_datetime);
      return start < timelineEnd && end > timelineStart;
    });
  }, [allSchedules, timelineStart, timelineEnd, holidays]);

  // Get unique clients with shifts today
  const uniqueClients = useMemo(() => {
    const clients = [...new Set(todaySchedules.map(s => s.client_name))];
    return clients.sort();
  }, [todaySchedules]);

  // Generate hour markers
  const hourMarkers = Array.from({
    length: TIMELINE_HOURS + 1
  }, (_, i) => {
    const hour = new Date(timelineStart);
    hour.setHours(hour.getHours() + i);
    return hour;
  });
  const isLoading = schedulesLoading || patternsLoading || staffLoading;

  // Calculate now indicator position
  const nowPosition = currentTime >= timelineStart && currentTime <= timelineEnd ? differenceInMinutes(currentTime, timelineStart) / (TIMELINE_HOURS * 60) * 100 : null;
  return <Card className="mb-6 border-primary/30">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-lg">
          
          Live View - {format(currentTime, "EEEE, MMMM d")} (Now: {format(currentTime, "HH:mm")})
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div> : <div className="border rounded-lg bg-card overflow-hidden">
            <div className="overflow-x-auto">
              <div style={{
            minWidth: `${NAME_COLUMN_WIDTH + TIMELINE_WIDTH}px`
          }}>
                {/* Header row with time markers */}
                <div className="flex border-b bg-muted/50 sticky top-0 z-10">
                  <div className="flex-shrink-0 p-2 font-medium text-sm border-r" style={{
                width: NAME_COLUMN_WIDTH
              }}>
                    Client
                  </div>
                  <div className="flex-shrink-0 relative" style={{
                width: TIMELINE_WIDTH
              }}>
                    <div className="flex">
                      {hourMarkers.slice(0, -1).map((hour, i) => {
                    const isNow = currentTime.getHours() === hour.getHours();
                    return <div key={i} className={`text-xs text-center border-r ${isNow ? 'bg-primary/20 font-bold text-primary' : ''}`} style={{
                      width: HOUR_WIDTH
                    }}>
                            <div className={`py-1 ${isNow ? 'bg-primary text-primary-foreground rounded-t' : ''}`}>
                              {format(hour, "HH:mm")}
                              {isNow && <div className="text-[10px]">NOW</div>}
                            </div>
                          </div>;
                  })}
                    </div>
                  </div>
                </div>

                {/* Client rows */}
                {uniqueClients.length === 0 ? <div className="p-8 text-center text-muted-foreground">
                    No shifts scheduled for today
                  </div> : uniqueClients.map(client => {
              const clientSchedules = todaySchedules.filter(s => s.client_name === client).sort((a, b) => parseISO(a.start_datetime).getTime() - parseISO(b.start_datetime).getTime());

              // Allocate schedules to rows - pack sequential shifts on same row
              // Only create new row if shift truly overlaps (not just touches) an existing shift
              const rows: Schedule[][] = [];
              clientSchedules.forEach(schedule => {
                const scheduleStart = parseISO(schedule.start_datetime);
                const scheduleEnd = parseISO(schedule.end_datetime);

                // Find a row where this schedule can fit (doesn't overlap)
                let assignedRow = -1;
                for (let rowIdx = 0; rowIdx < rows.length; rowIdx++) {
                  const row = rows[rowIdx];
                  // Check if schedule overlaps with any shift in this row
                  const hasOverlap = row.some(existingSchedule => {
                    const existingStart = parseISO(existingSchedule.start_datetime);
                    const existingEnd = parseISO(existingSchedule.end_datetime);
                    // Overlap means: new shift starts before existing ends AND new shift ends after existing starts
                    return scheduleStart < existingEnd && scheduleEnd > existingStart;
                  });
                  if (!hasOverlap) {
                    assignedRow = rowIdx;
                    break;
                  }
                }
                if (assignedRow === -1) {
                  // Create new row
                  rows.push([schedule]);
                } else {
                  rows[assignedRow].push(schedule);
                }
              });
              const rowCount = Math.max(1, rows.length);
              const ROW_HEIGHT = 50;
              return <div key={client} className="flex border-b last:border-b-0">
                        <div className="flex-shrink-0 p-2 text-sm font-medium border-r truncate" style={{
                  width: NAME_COLUMN_WIDTH
                }} title={client}>
                          {client}
                        </div>
                        <div className="flex-shrink-0 relative" style={{
                  width: TIMELINE_WIDTH,
                  minHeight: ROW_HEIGHT * rowCount
                }}>
                          {/* Hour grid lines */}
                          <div className="absolute inset-0 flex pointer-events-none">
                            {hourMarkers.slice(0, -1).map((_, i) => <div key={i} className="border-r border-dashed border-muted" style={{
                      width: HOUR_WIDTH
                    }} />)}
                          </div>

                          {/* Now indicator */}
                          {nowPosition !== null && <div className="absolute top-0 bottom-0 w-0.5 bg-red-500 z-20" style={{
                    left: `${nowPosition}%`
                  }}>
                              <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-red-500 rounded-full" />
                            </div>}

                          {/* Schedule bars - packed into minimum rows */}
                          {rows.map((rowSchedules, rowIdx) => <div key={rowIdx} className="absolute left-0 right-0" style={{
                    top: `${rowIdx / rowCount * 100}%`,
                    height: `${100 / rowCount}%`
                  }}>
                              {rowSchedules.map(schedule => {
                      const start = parseISO(schedule.start_datetime);
                      const end = parseISO(schedule.end_datetime);
                      const isCurrentlyWorking = currentTime >= start && currentTime < end;
                      const isPast = currentTime >= end;
                      const isFromPattern = schedule.id.startsWith("pattern-");
                      const isCover = schedule.is_cover_shift;
                      const leftPercent = Math.max(0, differenceInMinutes(start, timelineStart) / (TIMELINE_HOURS * 60) * 100);
                      const widthPercent = Math.min(100 - leftPercent, differenceInMinutes(end, start) / (TIMELINE_HOURS * 60) * 100);
                      const staffName = getStaffName(schedule.user_id);
                      return <div key={schedule.id} className={`absolute top-1 bottom-1 rounded-md flex flex-col justify-center px-2 overflow-hidden text-xs ${isCurrentlyWorking ? 'ring-2 ring-green-500 shadow-lg z-10' : isPast ? 'opacity-60' : ''} ${isCover ? 'bg-cyan-100 border-2 border-cyan-500' : isFromPattern ? 'bg-violet-100 border-2 border-violet-400' : 'bg-primary/20 border-2 border-primary/60'}`} style={{
                        left: `${leftPercent}%`,
                        width: `${widthPercent}%`,
                        minWidth: '60px'
                      }} title={`${staffName}: ${format(start, "HH:mm")} - ${format(end, "HH:mm")}`}>
                                    <div className="font-semibold truncate flex items-center gap-1">
                                      {staffName}
                                      {isCover && <UserCheck className="h-3 w-3 text-cyan-600 flex-shrink-0" />}
                                      {isFromPattern && !isCover && <Infinity className="h-3 w-3 text-violet-500 flex-shrink-0" />}
                                    </div>
                                    <div className={`text-[10px] ${isCurrentlyWorking ? 'text-green-700 font-semibold' : 'text-muted-foreground'}`}>
                                      {isCurrentlyWorking ? <>Working now · Ends {format(end, "HH:mm")}</> : isPast ? <>Ended {format(end, "HH:mm")}</> : <>Starts {format(start, "HH:mm")}</>}
                                    </div>
                                  </div>;
                    })}
                            </div>)}
                        </div>
                      </div>;
            })}
              </div>
            </div>
          </div>}
      </CardContent>
    </Card>;
}