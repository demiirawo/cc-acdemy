import { format, parseISO, differenceInMinutes, startOfDay, endOfDay, isSameDay, isWithinInterval, getDay, differenceInWeeks, startOfWeek, isBefore, isAfter } from "date-fns";
import { Infinity, UserCheck } from "lucide-react";
import { useMemo } from "react";

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
}

interface LiveTimelineViewProps {
  viewMode: "staff" | "client";
  filteredStaff: StaffMember[];
  filteredClients: string[];
  allSchedules: Schedule[];
  isStaffOnHoliday: (userId: string, date: Date) => boolean;
  getStaffName: (userId: string) => string;
  holidays: Holiday[];
  staffRequests: StaffRequest[];
  recurringPatterns: RecurringPattern[];
}

export function LiveTimelineView({
  viewMode,
  filteredStaff,
  filteredClients,
  allSchedules,
  isStaffOnHoliday,
  getStaffName,
  holidays,
  staffRequests,
  recurringPatterns,
}: LiveTimelineViewProps) {
  const now = new Date();
  const today = startOfDay(now);
  const todayEnd = endOfDay(now);
  
  // Timeline spans full day: 06:00 to 23:00 (17 hours for typical working hours)
  const TIMELINE_START_HOUR = 6;
  const TIMELINE_END_HOUR = 23;
  const TIMELINE_HOURS = TIMELINE_END_HOUR - TIMELINE_START_HOUR;
  const HOUR_WIDTH = 60; // pixels per hour
  const TIMELINE_WIDTH = TIMELINE_HOURS * HOUR_WIDTH;
  const NAME_COLUMN_WIDTH = 160;
  const ROW_HEIGHT = 50;
  
  // Calculate timeline start and end for today - use 'now' as base to ensure same date context
  const timelineStart = new Date(now);
  timelineStart.setHours(TIMELINE_START_HOUR, 0, 0, 0);
  
  const timelineEnd = new Date(now);
  timelineEnd.setHours(TIMELINE_END_HOUR, 0, 0, 0);
  
  // Generate hour markers
  const hourMarkers = Array.from({ length: TIMELINE_HOURS + 1 }, (_, i) => {
    const hour = new Date(timelineStart);
    hour.setHours(hour.getHours() + i);
    return hour;
  });
  
  // Calculate position as percentage of timeline
  const getPositionPercent = (date: Date): number => {
    const totalMinutes = TIMELINE_HOURS * 60;
    const minutesFromStart = differenceInMinutes(date, timelineStart);
    return Math.max(0, Math.min(100, (minutesFromStart / totalMinutes) * 100));
  };
  
  // Get "now" indicator position
  const nowPositionPercent = getPositionPercent(now);
  const showNowIndicator = now >= timelineStart && now <= timelineEnd;
  
  // Get current hour for highlighting
  const currentHour = now.getHours();
  
  // Generate cover shifts for staff who are providing holiday cover today
  const coverShifts = useMemo(() => {
    const covers: Schedule[] = [];
    const dateStr = format(today, "yyyy-MM-dd");
    const dayOfWeek = getDay(today);
    
    // Find all approved cover requests for today
    staffRequests.forEach(req => {
      if (req.status !== 'approved') return;
      
      const reqStart = startOfDay(parseISO(req.start_date));
      const reqEnd = endOfDay(parseISO(req.end_date));
      if (!isWithinInterval(today, { start: reqStart, end: reqEnd })) return;
      
      let coveredUserId: string | null = null;
      
      // Overtime covering a holiday
      if (['overtime', 'overtime_standard', 'overtime_double_up'].includes(req.request_type) && req.linked_holiday_id) {
        const linkedHoliday = holidays.find(h => h.id === req.linked_holiday_id);
        if (linkedHoliday) {
          coveredUserId = linkedHoliday.user_id;
        }
      }
      
      // Shift swap covering someone
      if (req.request_type === 'shift_swap' && req.swap_with_user_id) {
        coveredUserId = req.swap_with_user_id;
      }
      
      if (!coveredUserId) return;
      
      // Find what shifts the covered person would have had today
      // First check allSchedules for their regular shifts
      let coveredSchedules = allSchedules.filter(s => {
        if (s.user_id !== coveredUserId) return false;
        const scheduleDate = format(parseISO(s.start_datetime), "yyyy-MM-dd");
        return scheduleDate === dateStr;
      });
      
      // If no schedules found, check recurring patterns
      if (coveredSchedules.length === 0) {
        const matchingPatterns = recurringPatterns.filter(pattern => {
          if (pattern.user_id !== coveredUserId) return false;
          const patternStartDate = parseISO(pattern.start_date);
          const patternEndDate = pattern.end_date ? parseISO(pattern.end_date) : null;
          
          if (isBefore(today, patternStartDate)) return false;
          if (patternEndDate && isAfter(today, patternEndDate)) return false;
          
          if (pattern.recurrence_interval === 'daily') return true;
          if (pattern.recurrence_interval === 'weekly') return pattern.days_of_week.includes(dayOfWeek);
          if (pattern.recurrence_interval === 'biweekly') {
            if (!pattern.days_of_week.includes(dayOfWeek)) return false;
            const weeksDiff = differenceInWeeks(startOfWeek(today, { weekStartsOn: 1 }), startOfWeek(patternStartDate, { weekStartsOn: 1 }));
            return weeksDiff % 2 === 0;
          }
          return false;
        });
        
        coveredSchedules = matchingPatterns.map(pattern => ({
          id: `pattern-cover-${pattern.id}-${dateStr}`,
          user_id: pattern.user_id,
          client_name: pattern.client_name,
          start_datetime: `${dateStr}T${pattern.start_time}`,
          end_datetime: `${dateStr}T${pattern.end_time}`,
          shift_type: pattern.shift_type
        }));
      }
      
      // Create cover shifts for the covering staff member
      coveredSchedules.forEach(coveredSchedule => {
        covers.push({
          id: `cover-${req.id}-${coveredSchedule.id}`,
          user_id: req.user_id, // The person doing the covering
          client_name: coveredSchedule.client_name,
          start_datetime: coveredSchedule.start_datetime,
          end_datetime: coveredSchedule.end_datetime,
          shift_type: coveredSchedule.shift_type,
          is_cover_shift: true,
          covering_for_name: getStaffName(coveredUserId!)
        });
      });
    });
    
    return covers;
  }, [staffRequests, holidays, allSchedules, recurringPatterns, today, getStaffName]);
  
  // Combine regular schedules with cover shifts for today
  const todaySchedules = useMemo(() => {
    const regularSchedules = allSchedules.filter(s => {
      const start = parseISO(s.start_datetime);
      const end = parseISO(s.end_datetime);
      return start < todayEnd && end > today;
    });
    
    // Filter out duplicate cover shifts (if the cover shift matches an existing schedule)
    const existingKeys = new Set(
      regularSchedules.map(s => `${s.user_id}-${format(parseISO(s.start_datetime), "yyyy-MM-dd-HH:mm")}`)
    );
    
    const uniqueCoverShifts = coverShifts.filter(cs => {
      const key = `${cs.user_id}-${format(parseISO(cs.start_datetime), "yyyy-MM-dd-HH:mm")}`;
      return !existingKeys.has(key);
    });
    
    return [...regularSchedules, ...uniqueCoverShifts];
  }, [allSchedules, coverShifts, today, todayEnd]);
  
  // Helper to render a schedule bar
  const renderScheduleBar = (
    schedule: Schedule,
    isCurrentlyWorking: boolean,
    showClientName: boolean
  ) => {
    const start = parseISO(schedule.start_datetime);
    const end = parseISO(schedule.end_datetime);
    const isFromPattern = schedule.id.startsWith('pattern-');
    const isCoverShift = schedule.is_cover_shift;
    
    // Clamp to timeline bounds
    const clampedStart = start < timelineStart ? timelineStart : start;
    const clampedEnd = end > timelineEnd ? timelineEnd : end;
    
    // Don't render if completely outside timeline
    if (clampedEnd <= timelineStart || clampedStart >= timelineEnd) {
      return null;
    }
    
    const leftPercent = getPositionPercent(clampedStart);
    const rightPercent = getPositionPercent(clampedEnd);
    const widthPercent = rightPercent - leftPercent;
    
    // Skip very small bars
    if (widthPercent < 1) return null;
    
    const displayName = showClientName ? schedule.client_name : getStaffName(schedule.user_id);
    const isPast = end < now;
    const isFuture = start > now;
    
    // Determine bar styling
    let barClasses = '';
    if (isCoverShift) {
      barClasses = 'bg-cyan-100 border-2 border-cyan-500';
    } else if (isFromPattern) {
      barClasses = 'bg-violet-100 border-2 border-violet-400';
    } else {
      barClasses = 'bg-primary/20 border-2 border-primary/60';
    }
    
    return (
      <div
        key={schedule.id}
        className={`absolute top-1 bottom-1 rounded-md flex flex-col justify-center px-2 overflow-hidden text-xs ${
          isCurrentlyWorking
            ? 'ring-2 ring-green-500 shadow-lg z-10'
            : isPast
            ? 'opacity-60'
            : ''
        } ${barClasses}`}
        style={{
          left: `${leftPercent}%`,
          width: `${widthPercent}%`,
          minWidth: '50px',
        }}
        title={`${displayName}: ${format(start, "HH:mm")} - ${format(end, "HH:mm")}${isCoverShift ? ` (Covering for ${schedule.covering_for_name})` : ''}`}
      >
        <div className="font-semibold truncate flex items-center gap-1">
          {displayName}
          {isFromPattern && !isCoverShift && <Infinity className="h-3 w-3 text-violet-500 flex-shrink-0" />}
          {isCoverShift && <UserCheck className="h-3 w-3 text-cyan-600 flex-shrink-0" />}
        </div>
        <div className={`text-[10px] ${isCurrentlyWorking ? 'text-green-700 font-semibold' : isCoverShift ? 'text-cyan-700' : 'text-muted-foreground'}`}>
          {isCoverShift ? (
            isCurrentlyWorking ? (
              <>Covering · Ends {format(end, "HH:mm")}</>
            ) : isPast ? (
              <>Covered · Ended {format(end, "HH:mm")}</>
            ) : (
              <>Cover · {format(start, "HH:mm")} - {format(end, "HH:mm")}</>
            )
          ) : isCurrentlyWorking ? (
            <>Working now · Ends {format(end, "HH:mm")}</>
          ) : isPast ? (
            <>Ended {format(end, "HH:mm")}</>
          ) : isFuture ? (
            <>Starts {format(start, "HH:mm")}</>
          ) : (
            <>{format(start, "HH:mm")} - {format(end, "HH:mm")}</>
          )}
        </div>
      </div>
    );
  };
  
  // Get all staff with shifts today (excluding those on holiday)
  const getRelevantStaff = () => {
    return filteredStaff.filter(staff => {
      // Exclude staff on holiday
      if (isStaffOnHoliday(staff.user_id, now)) return false;
      return todaySchedules.some(s => s.user_id === staff.user_id);
    });
  };
  
  // Get all clients with shifts today
  const getRelevantClients = () => {
    return filteredClients.filter(clientName => {
      return todaySchedules.some(s => s.client_name === clientName);
    });
  };
  
  const relevantStaff = viewMode === "staff" ? getRelevantStaff() : [];
  const relevantClients = viewMode === "client" ? getRelevantClients() : [];
  
  const isEmpty = viewMode === "staff" ? relevantStaff.length === 0 : relevantClients.length === 0;
  
  if (isEmpty) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        {viewMode === "staff" ? "No staff shifts scheduled for today" : "No clients with shifts scheduled for today"}
      </div>
    );
  }
  
  return (
    <div className="overflow-x-auto">
      <div style={{ minWidth: `${NAME_COLUMN_WIDTH + TIMELINE_WIDTH}px` }}>
        {/* Header with time markers */}
        <div className="flex mb-2">
          {/* Name column header */}
          <div 
            className="flex-shrink-0 font-medium text-sm text-muted-foreground p-2 border-r"
            style={{ width: NAME_COLUMN_WIDTH }}
          >
            {viewMode === "staff" ? "Staff" : "Client"}
          </div>
          
          {/* Timeline header */}
          <div className="flex-1 relative" style={{ width: TIMELINE_WIDTH }}>
            {/* Hour grid lines and labels */}
            <div className="flex h-full">
              {hourMarkers.slice(0, -1).map((hour, idx) => {
                const hourValue = hour.getHours();
                const isCurrentHour = hourValue === currentHour;
                
                return (
                  <div 
                    key={hour.toISOString()}
                    className={`flex-1 text-center p-2 text-sm font-medium border-l ${
                      isCurrentHour ? 'bg-primary text-primary-foreground rounded-t' : 'bg-muted'
                    }`}
                    style={{ width: HOUR_WIDTH }}
                  >
                    <div>{format(hour, "HH:mm")}</div>
                    {isCurrentHour && <div className="text-xs opacity-80">NOW</div>}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
        
        {/* Staff rows */}
        {viewMode === "staff" && relevantStaff.map(staff => {
          const staffSchedules = todaySchedules.filter(s => {
            if (s.user_id !== staff.user_id) return false;
            const start = parseISO(s.start_datetime);
            const end = parseISO(s.end_datetime);
            // Only include shifts that overlap with the timeline
            return start < timelineEnd && end > timelineStart;
          });
          
          return (
            <div key={staff.user_id} className="flex mb-1">
              {/* Name column */}
              <div 
                className="flex-shrink-0 p-2 text-sm font-medium truncate border-r flex items-center gap-1"
                style={{ width: NAME_COLUMN_WIDTH }}
              >
                {staff.display_name || staff.email}
              </div>
              
              {/* Timeline row */}
              <div 
                className="flex-1 relative bg-muted/30 rounded border"
                style={{ width: TIMELINE_WIDTH, height: ROW_HEIGHT }}
              >
                {/* Hour grid lines */}
                {hourMarkers.slice(1).map((hour, idx) => (
                  <div
                    key={hour.toISOString()}
                    className="absolute top-0 bottom-0 border-l border-border/50"
                    style={{ left: `${((idx + 1) / TIMELINE_HOURS) * 100}%` }}
                  />
                ))}
                
                {/* "Now" indicator line */}
                {showNowIndicator && (
                  <div
                    className="absolute top-0 bottom-0 w-0.5 bg-red-500 z-20"
                    style={{ left: `${nowPositionPercent}%` }}
                  >
                    <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-red-500 rounded-full" />
                  </div>
                )}
                
                {/* Schedule bars */}
                {staffSchedules.map(schedule => {
                  const start = parseISO(schedule.start_datetime);
                  const end = parseISO(schedule.end_datetime);
                  const isCurrentlyWorking = now >= start && now < end;
                  return renderScheduleBar(schedule, isCurrentlyWorking, true);
                })}
              </div>
            </div>
          );
        })}
        
        {/* Client rows */}
        {viewMode === "client" && relevantClients.map(clientName => {
          // Get all schedules for this client, excluding staff on holiday
          const clientSchedules = todaySchedules
            .filter(s => {
              if (s.client_name !== clientName) return false;
              if (isStaffOnHoliday(s.user_id, now)) return false;
              const start = parseISO(s.start_datetime);
              const end = parseISO(s.end_datetime);
              return start < timelineEnd && end > timelineStart;
            })
            .sort((a, b) => parseISO(a.start_datetime).getTime() - parseISO(b.start_datetime).getTime());
          
          // Allocate schedules to rows - pack sequential shifts on same row
          // Only create new row if shift truly overlaps (not just touches) an existing shift
          const rows: Schedule[][] = [];
          
          clientSchedules.forEach(schedule => {
            const scheduleStart = parseISO(schedule.start_datetime);
            
            // Find a row where this schedule can fit (doesn't overlap)
            let assignedRow = -1;
            for (let rowIdx = 0; rowIdx < rows.length; rowIdx++) {
              const row = rows[rowIdx];
              // Check if schedule overlaps with any shift in this row
              const hasOverlap = row.some(existingSchedule => {
                const existingStart = parseISO(existingSchedule.start_datetime);
                const existingEnd = parseISO(existingSchedule.end_datetime);
                // Overlap means: new shift starts before existing ends AND new shift ends after existing starts
                // NOT overlap if: new starts at same time as existing ends (sequential)
                const scheduleEnd = parseISO(schedule.end_datetime);
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
          
          return (
            <div key={clientName} className="flex mb-1">
              {/* Name column */}
              <div 
                className="flex-shrink-0 p-2 text-sm font-medium truncate border-r"
                style={{ width: NAME_COLUMN_WIDTH }}
              >
                {clientName}
              </div>
              
              {/* Timeline row */}
              <div 
                className="flex-1 relative bg-muted/30 rounded border"
                style={{ width: TIMELINE_WIDTH, minHeight: ROW_HEIGHT * rowCount }}
              >
                {/* Hour grid lines */}
                {hourMarkers.slice(1).map((hour, idx) => (
                  <div
                    key={hour.toISOString()}
                    className="absolute top-0 bottom-0 border-l border-border/50"
                    style={{ left: `${((idx + 1) / TIMELINE_HOURS) * 100}%` }}
                  />
                ))}
                
                {/* "Now" indicator line */}
                {showNowIndicator && (
                  <div
                    className="absolute top-0 bottom-0 w-0.5 bg-red-500 z-20"
                    style={{ left: `${nowPositionPercent}%` }}
                  >
                    <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-red-500 rounded-full" />
                  </div>
                )}
                
                {/* Schedule bars - packed into minimum rows */}
                {rows.map((rowSchedules, rowIdx) => (
                  <div
                    key={rowIdx}
                    className="absolute left-0 right-0"
                    style={{ 
                      top: `${(rowIdx / rowCount) * 100}%`,
                      height: `${100 / rowCount}%`,
                    }}
                  >
                    {rowSchedules.map(schedule => {
                      const start = parseISO(schedule.start_datetime);
                      const end = parseISO(schedule.end_datetime);
                      const isCurrentlyWorking = now >= start && now < end;
                      const isPast = end < now;
                      const isFuture = start > now;
                      
                      const clampedStart = start < timelineStart ? timelineStart : start;
                      const clampedEnd = end > timelineEnd ? timelineEnd : end;
                      
                      if (clampedEnd <= timelineStart || clampedStart >= timelineEnd) {
                        return null;
                      }
                      
                      const leftPercent = getPositionPercent(clampedStart);
                      const rightPercent = getPositionPercent(clampedEnd);
                      const widthPercent = rightPercent - leftPercent;
                      
                      if (widthPercent < 1) return null;
                      
                      const isFromPattern = schedule.id.startsWith('pattern-');
                      const staffName = getStaffName(schedule.user_id);
                      
                      return (
                        <div
                          key={schedule.id}
                          className={`absolute top-0.5 bottom-0.5 rounded-md flex flex-col justify-center px-2 overflow-hidden text-xs ${
                            isCurrentlyWorking
                              ? 'ring-2 ring-green-500 shadow-lg z-10'
                              : isPast
                              ? 'opacity-60'
                              : ''
                          } ${
                            isFromPattern
                              ? 'bg-violet-100 border-2 border-violet-400'
                              : 'bg-primary/20 border-2 border-primary/60'
                          }`}
                          style={{
                            left: `${leftPercent}%`,
                            width: `${widthPercent}%`,
                            minWidth: '50px',
                          }}
                          title={`${staffName}: ${format(start, "HH:mm")} - ${format(end, "HH:mm")}`}
                        >
                          <div className="font-semibold truncate flex items-center gap-1">
                            {staffName}
                            {isFromPattern && <Infinity className="h-3 w-3 text-violet-500 flex-shrink-0" />}
                          </div>
                          <div className={`text-[10px] ${isCurrentlyWorking ? 'text-green-700 font-semibold' : 'text-muted-foreground'}`}>
                            {isCurrentlyWorking ? (
                              <>Working now · Ends {format(end, "HH:mm")}</>
                            ) : isPast ? (
                              <>Ended {format(end, "HH:mm")}</>
                            ) : isFuture ? (
                              <>Starts {format(start, "HH:mm")}</>
                            ) : (
                              <>{format(start, "HH:mm")} - {format(end, "HH:mm")}</>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
