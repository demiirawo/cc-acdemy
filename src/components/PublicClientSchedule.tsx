import { useState, useMemo } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { format, addDays, startOfWeek, endOfWeek, eachDayOfInterval, isWithinInterval, parseISO, differenceInHours, getDay, addWeeks, parse, isBefore, isAfter, differenceInWeeks, getDate, addMonths, startOfDay, endOfDay } from "date-fns";
import { ChevronLeft, ChevronRight, Calendar, Loader2 } from "lucide-react";

interface Schedule {
  id: string;
  user_id: string;
  client_name: string;
  start_datetime: string;
  end_datetime: string;
  notes: string | null;
  shift_type: string | null;
}

interface RecurringPattern {
  id: string;
  user_id: string;
  client_name: string;
  days_of_week: number[];
  start_time: string;
  end_time: string;
  is_overtime: boolean;
  notes: string | null;
  start_date: string;
  end_date: string | null;
  recurrence_interval: 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'one_off';
  shift_type: string | null;
}

interface StaffMember {
  user_id: string;
  display_name: string;
  email: string;
}

const SHIFT_TYPES = [
  "Call Monitoring",
  "Supervisions",
  "Floating Support",
  "General Admin"
];

const SHIFT_TYPE_COLORS: Record<string, { bg: string; border: string; text: string; badge: string }> = {
  "Call Monitoring": { 
    bg: "bg-violet-100", 
    border: "border-violet-300", 
    text: "text-violet-900",
    badge: "bg-violet-500 text-white"
  },
  "Supervisions": { 
    bg: "bg-pink-100", 
    border: "border-pink-300", 
    text: "text-pink-900",
    badge: "bg-pink-500 text-white"
  },
  "Floating Support": { 
    bg: "bg-emerald-100", 
    border: "border-emerald-300", 
    text: "text-emerald-900",
    badge: "bg-emerald-500 text-white"
  },
  "General Admin": { 
    bg: "bg-sky-100", 
    border: "border-sky-300", 
    text: "text-sky-900",
    badge: "bg-sky-500 text-white"
  },
  "default": { 
    bg: "bg-gray-100", 
    border: "border-gray-300", 
    text: "text-gray-900",
    badge: "bg-gray-500 text-white"
  }
};

const getShiftTypeColors = (shiftType: string | null | undefined) => {
  return SHIFT_TYPE_COLORS[shiftType || ""] || SHIFT_TYPE_COLORS["default"];
};

export const PublicClientSchedule = () => {
  const { clientName } = useParams<{ clientName: string }>();
  const decodedClientName = decodeURIComponent(clientName || "");
  
  const [weekOffset, setWeekOffset] = useState(0);
  
  const currentWeekStart = useMemo(() => {
    return startOfWeek(addWeeks(new Date(), weekOffset), { weekStartsOn: 1 });
  }, [weekOffset]);
  
  const currentWeekEnd = useMemo(() => {
    return endOfWeek(currentWeekStart, { weekStartsOn: 1 });
  }, [currentWeekStart]);
  
  const weekDays = useMemo(() => {
    return eachDayOfInterval({ start: currentWeekStart, end: currentWeekEnd });
  }, [currentWeekStart, currentWeekEnd]);

  // Fetch schedules for this client
  const { data: schedules = [], isLoading: schedulesLoading } = useQuery({
    queryKey: ["public-client-schedules", decodedClientName, currentWeekStart.toISOString()],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("staff_schedules")
        .select("id, user_id, client_name, start_datetime, end_datetime, notes, shift_type")
        .eq("client_name", decodedClientName)
        .gte("start_datetime", currentWeekStart.toISOString())
        .lte("end_datetime", currentWeekEnd.toISOString());
      
      if (error) throw error;
      return (data || []) as Schedule[];
    },
    enabled: !!decodedClientName,
  });

  // Fetch recurring patterns for this client
  const { data: patterns = [], isLoading: patternsLoading } = useQuery({
    queryKey: ["public-client-patterns", decodedClientName],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("recurring_shift_patterns")
        .select("*")
        .eq("client_name", decodedClientName)
        .eq("is_overtime", false);
      
      if (error) throw error;
      return (data || []) as RecurringPattern[];
    },
    enabled: !!decodedClientName,
  });

  // Fetch staff profiles
  const { data: staffMembers = [], isLoading: staffLoading } = useQuery({
    queryKey: ["public-staff-profiles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("user_id, display_name, email");
      
      if (error) throw error;
      return (data || []) as StaffMember[];
    },
  });

  const getStaffName = (userId: string) => {
    const staff = staffMembers.find(s => s.user_id === userId);
    return staff?.display_name || staff?.email?.split('@')[0] || 'Unknown';
  };

  // Generate virtual schedules from patterns
  const virtualSchedulesFromPatterns = useMemo(() => {
    const virtualSchedules: Schedule[] = [];
    
    patterns.forEach(pattern => {
      const patternStart = parseISO(pattern.start_date);
      const patternEnd = pattern.end_date ? parseISO(pattern.end_date) : null;
      
      weekDays.forEach(day => {
        const dayOfWeek = getDay(day);
        
        // Check if this day matches the pattern
        if (!pattern.days_of_week.includes(dayOfWeek)) return;
        
        // Check if day is within pattern date range
        if (isBefore(day, patternStart)) return;
        if (patternEnd && isAfter(day, patternEnd)) return;
        
        // Check recurrence interval
        if (pattern.recurrence_interval === 'biweekly') {
          const weeksDiff = differenceInWeeks(day, patternStart);
          if (weeksDiff % 2 !== 0) return;
        } else if (pattern.recurrence_interval === 'monthly') {
          const patternDayOfMonth = getDate(patternStart);
          if (getDate(day) !== patternDayOfMonth) return;
        }
        
        // Check if there's already a manual schedule that overlaps
        const dayStr = format(day, 'yyyy-MM-dd');
        const hasManualSchedule = schedules.some(s => {
          const scheduleDate = format(parseISO(s.start_datetime), 'yyyy-MM-dd');
          return scheduleDate === dayStr && s.user_id === pattern.user_id;
        });
        
        if (hasManualSchedule) return;
        
        // Create virtual schedule
        const startDatetime = parse(
          `${dayStr} ${pattern.start_time}`,
          'yyyy-MM-dd HH:mm:ss',
          new Date()
        );
        const endDatetime = parse(
          `${dayStr} ${pattern.end_time}`,
          'yyyy-MM-dd HH:mm:ss',
          new Date()
        );
        
        virtualSchedules.push({
          id: `pattern-${pattern.id}-${dayStr}`,
          user_id: pattern.user_id,
          client_name: pattern.client_name,
          start_datetime: startDatetime.toISOString(),
          end_datetime: endDatetime.toISOString(),
          notes: pattern.notes,
          shift_type: pattern.shift_type,
        });
      });
    });
    
    return virtualSchedules;
  }, [patterns, weekDays, schedules]);

  // Combine manual and virtual schedules
  const allSchedules = useMemo(() => {
    return [...schedules, ...virtualSchedulesFromPatterns];
  }, [schedules, virtualSchedulesFromPatterns]);

  const getSchedulesForDay = (day: Date) => {
    return allSchedules.filter(schedule => {
      const scheduleStart = parseISO(schedule.start_datetime);
      return format(scheduleStart, 'yyyy-MM-dd') === format(day, 'yyyy-MM-dd');
    }).sort((a, b) => {
      return parseISO(a.start_datetime).getTime() - parseISO(b.start_datetime).getTime();
    });
  };

  // Get unique shift types for this client
  const shiftTypesForClient = useMemo(() => {
    const types = [...new Set(allSchedules.map(s => s.shift_type || "Other"))];
    return [
      ...SHIFT_TYPES.filter(st => types.includes(st)),
      ...types.filter(st => !SHIFT_TYPES.includes(st))
    ];
  }, [allSchedules]);

  const isLoading = schedulesLoading || patternsLoading || staffLoading;

  if (!decodedClientName) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Card className="max-w-md">
          <CardContent className="pt-6">
            <p className="text-center text-muted-foreground">Invalid client link</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-8">
      <div className="max-w-6xl mx-auto">
        <Card>
          <CardHeader className="pb-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <CardTitle className="text-2xl">{decodedClientName}</CardTitle>
                <p className="text-sm text-muted-foreground mt-1">Weekly Schedule</p>
              </div>
              
              {/* Week Navigation */}
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setWeekOffset(prev => prev - 1)}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setWeekOffset(0)}
                  className="min-w-[140px]"
                >
                  <Calendar className="h-4 w-4 mr-2" />
                  {weekOffset === 0 ? "This Week" : format(currentWeekStart, "MMM d")} - {format(currentWeekEnd, "MMM d")}
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setWeekOffset(prev => prev + 1)}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardHeader>
          
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="overflow-x-auto">
                {/* Day headers */}
                <div className="grid grid-cols-8 gap-1 mb-2">
                  <div className="p-2 text-xs font-medium text-muted-foreground">Shift Type</div>
                  {weekDays.map(day => (
                    <div key={day.toISOString()} className="p-2 text-center">
                      <div className="text-xs font-medium text-muted-foreground">{format(day, "EEE")}</div>
                      <div className="text-sm font-semibold">{format(day, "d")}</div>
                    </div>
                  ))}
                </div>
                
                {/* Shift type rows */}
                {shiftTypesForClient.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    No schedules for this week
                  </div>
                ) : (
                  shiftTypesForClient.map(shiftType => {
                    const colors = getShiftTypeColors(shiftType);
                    
                    return (
                      <div key={shiftType} className="grid grid-cols-8 gap-1 mb-1">
                        <div className="p-2 text-xs font-medium truncate border-r bg-muted/20 flex items-center">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${colors.badge}`}>
                            {shiftType}
                          </span>
                        </div>
                        {weekDays.map(day => {
                          const daySchedules = getSchedulesForDay(day).filter(
                            s => (s.shift_type || "Other") === shiftType
                          );
                          
                          return (
                            <div 
                              key={day.toISOString()} 
                              className="min-h-[60px] p-1 rounded border bg-background border-border"
                            >
                              {daySchedules.map(schedule => (
                                <div 
                                  key={schedule.id} 
                                  className={`rounded p-1.5 mb-1 text-xs border ${colors.bg} ${colors.border}`}
                                >
                                  <div className={`font-semibold truncate ${colors.text}`}>
                                    {getStaffName(schedule.user_id)}
                                  </div>
                                  <div className={`${colors.text} opacity-80`}>
                                    {format(parseISO(schedule.start_datetime), "HH:mm")} - {format(parseISO(schedule.end_datetime), "HH:mm")}
                                  </div>
                                </div>
                              ))}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </CardContent>
        </Card>
        
        {/* Footer */}
        <div className="text-center mt-6 text-sm text-muted-foreground">
          Last updated: {format(new Date(), "PPp")}
        </div>
      </div>
    </div>
  );
};
