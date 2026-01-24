import { format, parseISO, differenceInMinutes } from "date-fns";
import { Clock, Infinity, Palmtree } from "lucide-react";

interface Schedule {
  id: string;
  user_id: string;
  client_name: string;
  start_datetime: string;
  end_datetime: string;
  shift_type?: string | null;
}

interface StaffMember {
  user_id: string;
  display_name: string | null;
  email: string | null;
}

interface LiveTimelineViewProps {
  viewMode: "staff" | "client";
  filteredStaff: StaffMember[];
  filteredClients: string[];
  allSchedules: Schedule[];
  isStaffOnHoliday: (userId: string, date: Date) => boolean;
  getStaffName: (userId: string) => string;
  canEditSchedule: boolean;
  scheduleEditHint: string;
  onScheduleClick: (schedule: Schedule) => void;
}

export function LiveTimelineView({
  viewMode,
  filteredStaff,
  filteredClients,
  allSchedules,
  isStaffOnHoliday,
  getStaffName,
  canEditSchedule,
  scheduleEditHint,
  onScheduleClick,
}: LiveTimelineViewProps) {
  const now = new Date();
  const currentHour = now.getHours();
  const currentMinute = now.getMinutes();
  
  // Timeline spans 9 hours starting from current hour
  const TIMELINE_HOURS = 9;
  const HOUR_WIDTH = 100; // pixels per hour
  const TIMELINE_WIDTH = TIMELINE_HOURS * HOUR_WIDTH;
  const NAME_COLUMN_WIDTH = 160;
  const ROW_HEIGHT = 50;
  
  // Calculate timeline start (beginning of current hour)
  const timelineStart = new Date(now);
  timelineStart.setMinutes(0, 0, 0);
  
  // Timeline end
  const timelineEnd = new Date(timelineStart);
  timelineEnd.setHours(timelineEnd.getHours() + TIMELINE_HOURS);
  
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
  
  // Helper to render a schedule bar
  const renderScheduleBar = (
    schedule: Schedule,
    isCurrentlyWorking: boolean,
    showClientName: boolean
  ) => {
    const start = parseISO(schedule.start_datetime);
    const end = parseISO(schedule.end_datetime);
    const isFromPattern = schedule.id.startsWith('pattern-');
    
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
    const endsThisTimeline = end <= timelineEnd;
    const startsBeforeTimeline = start < timelineStart;
    
    return (
      <div
        key={schedule.id}
        className={`absolute top-1 bottom-1 rounded-md flex flex-col justify-center px-2 overflow-hidden text-xs ${
          canEditSchedule ? 'cursor-pointer hover:ring-2 hover:ring-primary/50' : ''
        } ${
          isCurrentlyWorking
            ? 'ring-2 ring-green-500 shadow-lg z-10'
            : ''
        } ${
          isFromPattern
            ? 'bg-violet-100 border-2 border-violet-400'
            : 'bg-primary/20 border-2 border-primary/60'
        }`}
        style={{
          left: `${leftPercent}%`,
          width: `${widthPercent}%`,
          minWidth: '60px',
        }}
        onClick={() => onScheduleClick(schedule)}
        title={`${displayName}: ${format(start, "HH:mm")} - ${format(end, "HH:mm")}${scheduleEditHint ? `\n${scheduleEditHint}` : ''}`}
      >
        <div className="font-semibold truncate flex items-center gap-1">
          {displayName}
          {isFromPattern && <Infinity className="h-3 w-3 text-violet-500 flex-shrink-0" />}
        </div>
        <div className={`text-[10px] ${isCurrentlyWorking ? 'text-green-700 font-semibold' : 'text-muted-foreground'}`}>
          {isCurrentlyWorking ? (
            <>Working now · Ends {format(end, "HH:mm")}</>
          ) : endsThisTimeline ? (
            <>Ends {format(end, "HH:mm")}</>
          ) : startsBeforeTimeline ? (
            <>Until {format(end, "HH:mm")}+</>
          ) : null}
        </div>
      </div>
    );
  };
  
  // Get staff currently working or with shifts in timeline
  const getRelevantStaff = () => {
    return filteredStaff.filter(staff => {
      if (isStaffOnHoliday(staff.user_id, now)) return false;
      
      return allSchedules.some(s => {
        if (s.user_id !== staff.user_id) return false;
        const start = parseISO(s.start_datetime);
        const end = parseISO(s.end_datetime);
        // Check if shift overlaps with current moment (working now)
        return now >= start && now < end;
      });
    });
  };
  
  // Get clients with staff currently working
  const getRelevantClients = () => {
    return filteredClients.filter(clientName => {
      return allSchedules.some(s => {
        if (s.client_name !== clientName) return false;
        if (isStaffOnHoliday(s.user_id, now)) return false;
        const start = parseISO(s.start_datetime);
        const end = parseISO(s.end_datetime);
        return now >= start && now < end;
      });
    });
  };
  
  const relevantStaff = viewMode === "staff" ? getRelevantStaff() : [];
  const relevantClients = viewMode === "client" ? getRelevantClients() : [];
  
  const isEmpty = viewMode === "staff" ? relevantStaff.length === 0 : relevantClients.length === 0;
  
  if (isEmpty) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        {viewMode === "staff" ? "No staff working right now" : "No clients with staff working right now"}
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
              {hourMarkers.slice(0, -1).map((hour, idx) => (
                <div 
                  key={hour.toISOString()}
                  className={`flex-1 text-center p-2 text-sm font-medium border-l ${
                    idx === 0 ? 'bg-primary text-primary-foreground rounded-l' : 'bg-muted'
                  }`}
                  style={{ width: HOUR_WIDTH }}
                >
                  <div>{format(hour, "HH:mm")}</div>
                  {idx === 0 && <div className="text-xs opacity-80">NOW</div>}
                </div>
              ))}
            </div>
          </div>
        </div>
        
        {/* Staff rows */}
        {viewMode === "staff" && relevantStaff.map(staff => {
          const staffSchedules = allSchedules.filter(s => {
            if (s.user_id !== staff.user_id) return false;
            const start = parseISO(s.start_datetime);
            const end = parseISO(s.end_datetime);
            // Only include shifts that overlap with the timeline
            return start < timelineEnd && end > timelineStart;
          });
          
          const onHoliday = isStaffOnHoliday(staff.user_id, now);
          
          return (
            <div key={staff.user_id} className="flex mb-1">
              {/* Name column */}
              <div 
                className={`flex-shrink-0 p-2 text-sm font-medium truncate border-r flex items-center gap-1 ${
                  onHoliday ? 'text-amber-700' : ''
                }`}
                style={{ width: NAME_COLUMN_WIDTH }}
              >
                {staff.display_name || staff.email}
                {onHoliday && <Palmtree className="h-3 w-3 text-amber-600" />}
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
                <div
                  className="absolute top-0 bottom-0 w-0.5 bg-red-500 z-20"
                  style={{ left: `${nowPositionPercent}%` }}
                >
                  <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-red-500 rounded-full" />
                </div>
                
                {/* Schedule bars */}
                {!onHoliday && staffSchedules.map(schedule => {
                  const start = parseISO(schedule.start_datetime);
                  const end = parseISO(schedule.end_datetime);
                  const isCurrentlyWorking = now >= start && now < end;
                  return renderScheduleBar(schedule, isCurrentlyWorking, true);
                })}
                
                {onHoliday && (
                  <div className="absolute inset-0 flex items-center justify-center text-amber-700 text-sm bg-amber-50/80 rounded">
                    <Palmtree className="h-4 w-4 mr-1" /> On holiday
                  </div>
                )}
              </div>
            </div>
          );
        })}
        
        {/* Client rows */}
        {viewMode === "client" && relevantClients.map(clientName => {
          const clientSchedules = allSchedules.filter(s => {
            if (s.client_name !== clientName) return false;
            if (isStaffOnHoliday(s.user_id, now)) return false;
            const start = parseISO(s.start_datetime);
            const end = parseISO(s.end_datetime);
            return start < timelineEnd && end > timelineStart;
          });
          
          // Group by staff to show multiple bars
          const schedulesByStaff = new Map<string, Schedule[]>();
          clientSchedules.forEach(s => {
            const existing = schedulesByStaff.get(s.user_id) || [];
            existing.push(s);
            schedulesByStaff.set(s.user_id, existing);
          });
          
          const rowCount = Math.max(1, schedulesByStaff.size);
          
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
                style={{ width: TIMELINE_WIDTH, minHeight: ROW_HEIGHT * Math.min(rowCount, 3) }}
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
                <div
                  className="absolute top-0 bottom-0 w-0.5 bg-red-500 z-20"
                  style={{ left: `${nowPositionPercent}%` }}
                >
                  <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-red-500 rounded-full" />
                </div>
                
                {/* Schedule bars - stacked by staff */}
                {Array.from(schedulesByStaff.entries()).map(([userId, schedules], rowIdx) => (
                  <div
                    key={userId}
                    className="absolute left-0 right-0"
                    style={{ 
                      top: `${(rowIdx / rowCount) * 100}%`,
                      height: `${100 / rowCount}%`,
                    }}
                  >
                    {schedules.map(schedule => {
                      const start = parseISO(schedule.start_datetime);
                      const end = parseISO(schedule.end_datetime);
                      const isCurrentlyWorking = now >= start && now < end;
                      
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
                            canEditSchedule ? 'cursor-pointer hover:ring-2 hover:ring-primary/50' : ''
                          } ${
                            isCurrentlyWorking
                              ? 'ring-2 ring-green-500 shadow-lg z-10'
                              : ''
                          } ${
                            isFromPattern
                              ? 'bg-violet-100 border-2 border-violet-400'
                              : 'bg-primary/20 border-2 border-primary/60'
                          }`}
                          style={{
                            left: `${leftPercent}%`,
                            width: `${widthPercent}%`,
                            minWidth: '60px',
                          }}
                          onClick={() => onScheduleClick(schedule)}
                          title={`${staffName}: ${format(start, "HH:mm")} - ${format(end, "HH:mm")}`}
                        >
                          <div className="font-semibold truncate flex items-center gap-1">
                            {staffName}
                            {isFromPattern && <Infinity className="h-3 w-3 text-violet-500 flex-shrink-0" />}
                          </div>
                          <div className={`text-[10px] ${isCurrentlyWorking ? 'text-green-700 font-semibold' : 'text-muted-foreground'}`}>
                            {isCurrentlyWorking ? (
                              <>Working now · Ends {format(end, "HH:mm")}</>
                            ) : (
                              <>Ends {format(end, "HH:mm")}</>
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
        
        {/* Scrollbar indicator */}
        <div className="h-2 bg-muted rounded-full mt-2" style={{ marginLeft: NAME_COLUMN_WIDTH }} />
      </div>
    </div>
  );
}
