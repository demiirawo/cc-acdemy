import { useState, useMemo, useEffect, useRef } from "react";
import { useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format, addDays, startOfWeek, endOfWeek, eachDayOfInterval, isWithinInterval, parseISO, differenceInHours, getDay, addWeeks, parse, isBefore, isAfter, differenceInWeeks, getDate, addMonths, startOfDay, endOfDay } from "date-fns";
import { ChevronLeft, ChevronRight, ChevronUp, ChevronDown, Calendar, Loader2, MessageSquare, Key, Plus, Eye, EyeOff, Copy, Check, ExternalLink, Link, Pencil, Trash2, Palmtree, AlertTriangle, Clock, GripVertical } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { toast } from "sonner";

interface ClientWhiteboard {
  id: string;
  client_name: string;
  content: string;
  last_updated_by: string | null;
  updated_at: string;
}

interface ClientPassword {
  id: string;
  client_name: string;
  software_name: string;
  username: string;
  password: string;
  url: string | null;
  notes: string | null;
  created_at: string;
  category: string | null;
  sort_order: number | null;
}
interface Schedule {
  id: string;
  user_id: string;
  client_name: string;
  start_datetime: string;
  end_datetime: string;
  notes: string | null;
  shift_type: string | null;
  is_pattern_overtime?: boolean;
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

interface StaffHoliday {
  id: string;
  user_id: string;
  start_date: string;
  end_date: string;
  status: string;
  absence_type: string;
  days_taken: number;
  notes: string | null;
  no_cover_required: boolean;
}

interface StaffRequest {
  id: string;
  user_id: string;
  request_type: string;
  status: string;
  start_date: string;
  end_date: string;
  linked_holiday_id: string | null;
  swap_with_user_id: string | null;
}

const ABSENCE_TYPES = [
  { value: 'holiday', label: 'Holiday' },
  { value: 'sick', label: 'Sick Leave' },
  { value: 'personal', label: 'Personal Leave' },
  { value: 'maternity', label: 'Maternity Leave' },
  { value: 'paternity', label: 'Paternity Leave' },
  { value: 'unpaid', label: 'Unpaid Leave' },
  { value: 'other', label: 'Other' },
];

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
  const queryClient = useQueryClient();
  
  const [weekOffset, setWeekOffset] = useState(0);
  
  // Holiday management state
  const [selectedHoliday, setSelectedHoliday] = useState<StaffHoliday | null>(null);
  const [holidayDialogOpen, setHolidayDialogOpen] = useState(false);
  const [holidayDeleteConfirmOpen, setHolidayDeleteConfirmOpen] = useState(false);
  const [isEditingHoliday, setIsEditingHoliday] = useState(false);
  const [holidayFormData, setHolidayFormData] = useState({
    absence_type: 'holiday',
    start_date: '',
    end_date: '',
    days_taken: 1,
    notes: '',
    no_cover_required: false
  });
  
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
        .eq("client_name", decodedClientName);
      
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

  // Fetch approved holidays for the week
  const { data: holidays = [], refetch: refetchHolidays } = useQuery({
    queryKey: ["public-staff-holidays", currentWeekStart.toISOString()],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("staff_holidays")
        .select("id, user_id, start_date, end_date, status, absence_type, days_taken, notes, no_cover_required")
        .eq("status", "approved")
        .lte("start_date", format(currentWeekEnd, "yyyy-MM-dd"))
        .gte("end_date", format(currentWeekStart, "yyyy-MM-dd"));
      if (error) throw error;
      return (data || []) as StaffHoliday[];
    },
  });

  // Holiday click handler
  const handleHolidayClick = (holiday: StaffHoliday, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedHoliday(holiday);
    setHolidayFormData({
      absence_type: holiday.absence_type,
      start_date: holiday.start_date,
      end_date: holiday.end_date,
      days_taken: holiday.days_taken,
      notes: holiday.notes || '',
      no_cover_required: holiday.no_cover_required
    });
    setIsEditingHoliday(false);
    setHolidayDialogOpen(true);
  };

  // Calculate days when dates change
  const calculateDays = () => {
    if (holidayFormData.start_date && holidayFormData.end_date) {
      const start = new Date(holidayFormData.start_date);
      const end = new Date(holidayFormData.end_date);
      const diffTime = Math.abs(end.getTime() - start.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
      setHolidayFormData(prev => ({ ...prev, days_taken: diffDays }));
    }
  };

  useEffect(() => {
    calculateDays();
  }, [holidayFormData.start_date, holidayFormData.end_date]);

  // Update holiday mutation
  const updateHolidayMutation = useMutation({
    mutationFn: async () => {
      if (!selectedHoliday) throw new Error("No holiday selected");
      
      const { error } = await supabase
        .from("staff_holidays")
        .update({
          absence_type: holidayFormData.absence_type as any,
          start_date: holidayFormData.start_date,
          end_date: holidayFormData.end_date,
          days_taken: holidayFormData.days_taken,
          notes: holidayFormData.notes || null,
          no_cover_required: holidayFormData.no_cover_required
        })
        .eq("id", selectedHoliday.id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Holiday updated successfully");
      setHolidayDialogOpen(false);
      setIsEditingHoliday(false);
      refetchHolidays();
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to update holiday");
    }
  });

  // Delete holiday mutation
  const deleteHolidayMutation = useMutation({
    mutationFn: async () => {
      if (!selectedHoliday) throw new Error("No holiday selected");
      
      const { error } = await supabase
        .from("staff_holidays")
        .delete()
        .eq("id", selectedHoliday.id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Holiday deleted successfully");
      setHolidayDeleteConfirmOpen(false);
      setHolidayDialogOpen(false);
      refetchHolidays();
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to delete holiday");
    }
  });

  // Fetch approved staff requests for coverage info
  const { data: staffRequests = [] } = useQuery({
    queryKey: ["public-staff-requests", currentWeekStart.toISOString()],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("staff_requests")
        .select("id, user_id, request_type, status, start_date, end_date, linked_holiday_id, swap_with_user_id")
        .eq("status", "approved")
        .lte("start_date", format(currentWeekEnd, "yyyy-MM-dd"))
        .gte("end_date", format(currentWeekStart, "yyyy-MM-dd"));
      if (error) throw error;
      return (data || []) as StaffRequest[];
    },
  });

  // Check if a staff member is on holiday for a specific day
  const isStaffOnHoliday = (userId: string, day: Date) => {
    return holidays.some(h => {
      if (h.user_id !== userId) return false;
      const start = parseISO(h.start_date);
      const end = parseISO(h.end_date);
      return isWithinInterval(day, { start: startOfDay(start), end: endOfDay(end) });
    });
  };

  // Get holiday info for a staff member on a specific day
  const getHolidayInfo = (userId: string, day: Date) => {
    return holidays.find(h => {
      if (h.user_id !== userId) return false;
      const start = parseISO(h.start_date);
      const end = parseISO(h.end_date);
      return isWithinInterval(day, { start: startOfDay(start), end: endOfDay(end) });
    });
  };

  // Get coverage for a holiday
  const getCoverageForHoliday = (holidayUserId: string, day: Date) => {
    const holiday = getHolidayInfo(holidayUserId, day);
    if (!holiday) return null;
    
    // Find approved overtime/shift_swap requests linked to this holiday
    const coverageRequests = staffRequests.filter(r => 
      (r.linked_holiday_id === holiday.id || 
       (r.swap_with_user_id === holidayUserId && r.request_type === 'shift_swap')) &&
      r.status === 'approved' &&
      isWithinInterval(day, { 
        start: startOfDay(parseISO(r.start_date)), 
        end: endOfDay(parseISO(r.end_date)) 
      })
    );
    
    if (coverageRequests.length === 0) return null;
    
    return coverageRequests.map(r => ({
      userId: r.user_id,
      name: getStaffName(r.user_id),
      type: r.request_type
    }));
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
          is_pattern_overtime: pattern.is_overtime,
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

  // Mobile view: list of days with schedules
  const MobileScheduleView = () => (
    <div className="space-y-4 md:hidden">
      {weekDays.map(day => {
        const daySchedules = getSchedulesForDay(day);
        const isToday = format(day, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd');
        
        return (
          <div 
            key={day.toISOString()} 
            className={`rounded-lg border ${isToday ? 'border-primary bg-primary/5' : 'border-border bg-background'}`}
          >
            <div className={`px-4 py-3 border-b ${isToday ? 'bg-primary/10 border-primary/20' : 'bg-muted/50'}`}>
              <div className="flex items-center justify-between">
                <div>
                  <span className="font-semibold">{format(day, "EEEE")}</span>
                  <span className="text-muted-foreground ml-2">{format(day, "d MMM")}</span>
                </div>
                {isToday && (
                  <Badge variant="default" className="text-xs">Today</Badge>
                )}
              </div>
            </div>
            
            <div className="p-3">
              {daySchedules.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-2">No shifts scheduled</p>
              ) : (
                <div className="space-y-2">
                  {daySchedules.map(schedule => {
                    const colors = getShiftTypeColors(schedule.shift_type);
                    const staffOnHoliday = isStaffOnHoliday(schedule.user_id, day);
                    const holidayInfo = staffOnHoliday ? getHolidayInfo(schedule.user_id, day) : null;
                    const coverage = staffOnHoliday ? getCoverageForHoliday(schedule.user_id, day) : null;
                    const isOvertime = schedule.is_pattern_overtime;
                    
                    return (
                      <div 
                        key={schedule.id}
                        onClick={staffOnHoliday && holidayInfo ? (e) => handleHolidayClick(holidayInfo, e) : undefined}
                        className={`p-3 rounded-lg border ${
                          staffOnHoliday 
                            ? 'bg-amber-50 border-amber-200 cursor-pointer' 
                            : isOvertime
                              ? 'bg-orange-50 border-orange-200'
                              : `${colors.bg} ${colors.border}`
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            {staffOnHoliday && <Palmtree className="h-4 w-4 text-amber-600 flex-shrink-0" />}
                            {isOvertime && !staffOnHoliday && <Clock className="h-4 w-4 text-orange-600 flex-shrink-0" />}
                            <span className={`font-medium truncate ${
                              staffOnHoliday ? 'text-amber-900' : isOvertime ? 'text-orange-900' : colors.text
                            }`}>
                              {getStaffName(schedule.user_id)}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            {schedule.shift_type && (
                              <span className={`text-xs px-2 py-0.5 rounded-full ${colors.badge}`}>
                                {schedule.shift_type}
                              </span>
                            )}
                            {isOvertime && !staffOnHoliday && (
                              <span className="text-xs bg-orange-200 text-orange-800 px-2 py-0.5 rounded-full">OT</span>
                            )}
                          </div>
                        </div>
                        
                        {staffOnHoliday ? (
                          <div className="mt-2 space-y-1">
                            <div className="text-sm text-amber-700 capitalize">
                              {holidayInfo?.absence_type?.replace('_', ' ') || 'On holiday'}
                            </div>
                            {coverage && coverage.length > 0 ? (
                              <div className="text-sm text-green-700 bg-green-100 rounded px-2 py-1">
                                <span className="font-medium">Cover:</span> {coverage.map(c => c.name).join(', ')}
                              </div>
                            ) : holidayInfo?.no_cover_required ? (
                              <div className="text-sm text-blue-600 bg-blue-50 rounded px-2 py-1">
                                No cover needed
                              </div>
                            ) : (
                              <div className="text-sm text-red-600 bg-red-50 rounded px-2 py-1 flex items-center gap-1">
                                <AlertTriangle className="h-3 w-3" />
                                <span>No cover arranged</span>
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className={`mt-1 text-sm ${isOvertime ? 'text-orange-800' : colors.text} opacity-80`}>
                            {format(parseISO(schedule.start_datetime), "HH:mm")} - {format(parseISO(schedule.end_datetime), "HH:mm")}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );

  // Desktop view: original grid
  const DesktopScheduleView = () => (
    <div className="hidden md:block overflow-x-auto">
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
                    {daySchedules.map(schedule => {
                      const staffOnHoliday = isStaffOnHoliday(schedule.user_id, day);
                      const holidayInfo = staffOnHoliday ? getHolidayInfo(schedule.user_id, day) : null;
                      const coverage = staffOnHoliday ? getCoverageForHoliday(schedule.user_id, day) : null;
                      const isOvertime = schedule.is_pattern_overtime;
                      
                      return (
                        <div 
                          key={schedule.id} 
                          onClick={staffOnHoliday && holidayInfo ? (e) => handleHolidayClick(holidayInfo, e) : undefined}
                          className={`rounded p-1.5 mb-1 text-xs border ${
                            staffOnHoliday 
                              ? 'bg-amber-100 border-amber-300 cursor-pointer hover:bg-amber-200 transition-colors' 
                              : isOvertime
                                ? 'bg-orange-100 border-orange-300'
                                : `${colors.bg} ${colors.border}`
                          }`}
                        >
                          <div className={`font-semibold truncate flex items-center gap-1 ${
                            staffOnHoliday 
                              ? 'text-amber-900' 
                              : isOvertime 
                                ? 'text-orange-900'
                                : colors.text
                          }`}>
                            {staffOnHoliday && <Palmtree className="h-3 w-3 text-amber-600 flex-shrink-0" />}
                            {isOvertime && !staffOnHoliday && <Clock className="h-3 w-3 text-orange-600 flex-shrink-0" />}
                            {getStaffName(schedule.user_id)}
                            {isOvertime && !staffOnHoliday && (
                              <span className="text-[9px] bg-orange-200 text-orange-800 px-1 rounded ml-auto">OT</span>
                            )}
                          </div>
                          
                          {staffOnHoliday ? (
                            <div className="mt-0.5">
                              <div className="text-[10px] text-amber-700 capitalize">
                                {holidayInfo?.absence_type?.replace('_', ' ') || 'On holiday'}
                              </div>
                              {coverage && coverage.length > 0 ? (
                                <div className="text-[10px] text-green-700 bg-green-50 rounded px-1 py-0.5 mt-0.5">
                                  <span className="font-medium">Cover:</span> {coverage.map(c => c.name).join(', ')}
                                </div>
                              ) : holidayInfo?.no_cover_required ? (
                                <div className="text-[10px] text-blue-600 bg-blue-50 rounded px-1 py-0.5 mt-0.5">
                                  No cover needed
                                </div>
                              ) : (
                                <div className="text-[10px] text-red-600 bg-red-50 rounded px-1 py-0.5 mt-0.5 flex items-center gap-1">
                                  <AlertTriangle className="h-2.5 w-2.5" />
                                  <span>No cover</span>
                                </div>
                              )}
                            </div>
                          ) : (
                            <div className={`${isOvertime ? 'text-orange-900' : colors.text} opacity-80`}>
                              {format(parseISO(schedule.start_datetime), "HH:mm")} - {format(parseISO(schedule.end_datetime), "HH:mm")}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          );
        })
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 p-2 sm:p-4 md:p-8">
      <div className="max-w-6xl mx-auto">
        {/* Updates Section - at the top */}
        <ClientNoticeboard clientName={decodedClientName} />

        <Card className="mt-4 sm:mt-6">
          <CardHeader className="pb-3 px-3 sm:px-6">
            <div className="flex flex-col gap-3">
              <div>
                <CardTitle className="text-xl sm:text-2xl">{decodedClientName}</CardTitle>
                <p className="text-xs sm:text-sm text-muted-foreground mt-1">Weekly Schedule</p>
              </div>
              
              {/* Week Navigation - Mobile optimized */}
              <div className="flex items-center justify-between gap-2">
                <Button
                  variant="outline"
                  size="icon"
                  className="h-9 w-9"
                  onClick={() => setWeekOffset(prev => prev - 1)}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setWeekOffset(0)}
                  className="flex-1 max-w-[200px] text-xs sm:text-sm"
                >
                  <Calendar className="h-4 w-4 mr-1 sm:mr-2" />
                  <span className="hidden sm:inline">
                    {weekOffset === 0 ? "This Week" : format(currentWeekStart, "MMM d")} - {format(currentWeekEnd, "MMM d")}
                  </span>
                  <span className="sm:hidden">
                    {weekOffset === 0 ? "This Week" : `${format(currentWeekStart, "d MMM")}`}
                  </span>
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-9 w-9"
                  onClick={() => setWeekOffset(prev => prev + 1)}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardHeader>
          
          <CardContent className="px-2 sm:px-6">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <>
                <MobileScheduleView />
                <DesktopScheduleView />
              </>
            )}
          </CardContent>
        </Card>

        {/* Upcoming Holidays Section */}
        <UpcomingHolidaysCard 
          clientName={decodedClientName}
          getStaffName={getStaffName} 
        />


        {/* Password Manager Section */}
        <ClientPasswordManager clientName={decodedClientName} />
        
        {/* Footer */}
        <div className="text-center mt-4 sm:mt-6 pb-4 text-xs sm:text-sm text-muted-foreground">
          Last updated: {format(new Date(), "PPp")}
        </div>
      </div>

      {/* Holiday View/Edit Dialog */}
      <Dialog open={holidayDialogOpen} onOpenChange={setHolidayDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Palmtree className="h-5 w-5 text-amber-600" />
              {isEditingHoliday ? 'Edit Holiday/Absence' : 'Holiday/Absence Details'}
            </DialogTitle>
            <DialogDescription>
              {selectedHoliday && getStaffName(selectedHoliday.user_id)}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {isEditingHoliday ? (
              <>
                <div className="space-y-2">
                  <Label>Absence Type</Label>
                  <Select
                    value={holidayFormData.absence_type}
                    onValueChange={(value) => setHolidayFormData({ ...holidayFormData, absence_type: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ABSENCE_TYPES.map(type => (
                        <SelectItem key={type.value} value={type.value}>
                          {type.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Start Date</Label>
                    <Input
                      type="date"
                      value={holidayFormData.start_date}
                      onChange={(e) => setHolidayFormData({ ...holidayFormData, start_date: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>End Date</Label>
                    <Input
                      type="date"
                      value={holidayFormData.end_date}
                      onChange={(e) => setHolidayFormData({ ...holidayFormData, end_date: e.target.value })}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Days Taken</Label>
                  <Input
                    type="number"
                    value={holidayFormData.days_taken}
                    onChange={(e) => setHolidayFormData({ ...holidayFormData, days_taken: parseFloat(e.target.value) || 0 })}
                    step="0.5"
                  />
                  <p className="text-xs text-muted-foreground">Auto-calculated from dates, adjust for half days</p>
                </div>

                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="no_cover_required"
                    checked={holidayFormData.no_cover_required}
                    onCheckedChange={(checked) => setHolidayFormData({ ...holidayFormData, no_cover_required: !!checked })}
                  />
                  <Label htmlFor="no_cover_required" className="text-sm font-normal cursor-pointer">
                    No cover required for this absence
                  </Label>
                </div>

                <div className="space-y-2">
                  <Label>Notes</Label>
                  <Textarea
                    value={holidayFormData.notes}
                    onChange={(e) => setHolidayFormData({ ...holidayFormData, notes: e.target.value })}
                    placeholder="Additional notes..."
                    rows={2}
                  />
                </div>
              </>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Type</p>
                    <p className="font-medium capitalize">
                      {ABSENCE_TYPES.find(t => t.value === selectedHoliday?.absence_type)?.label || selectedHoliday?.absence_type}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Days</p>
                    <p className="font-medium">{selectedHoliday?.days_taken}</p>
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Start Date</p>
                    <p className="font-medium">
                      {selectedHoliday?.start_date && format(parseISO(selectedHoliday.start_date), 'dd MMM yyyy')}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">End Date</p>
                    <p className="font-medium">
                      {selectedHoliday?.end_date && format(parseISO(selectedHoliday.end_date), 'dd MMM yyyy')}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Status</p>
                    <Badge variant="outline" className="bg-success/20 text-success border-success">
                      {selectedHoliday?.status}
                    </Badge>
                  </div>
                  {selectedHoliday?.no_cover_required && (
                    <div>
                      <p className="text-sm text-muted-foreground">Cover</p>
                      <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                        No cover needed
                      </Badge>
                    </div>
                  )}
                </div>

                {selectedHoliday?.notes && (
                  <div>
                    <p className="text-sm text-muted-foreground">Notes</p>
                    <p className="text-sm">{selectedHoliday.notes}</p>
                  </div>
                )}
              </>
            )}
          </div>

          <DialogFooter className="flex-col sm:flex-row gap-2">
            {isEditingHoliday ? (
              <>
                <Button 
                  variant="outline" 
                  onClick={() => setIsEditingHoliday(false)}
                >
                  Cancel
                </Button>
                <Button 
                  onClick={() => updateHolidayMutation.mutate()}
                  disabled={updateHolidayMutation.isPending}
                >
                  {updateHolidayMutation.isPending ? (
                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Saving...</>
                  ) : 'Save Changes'}
                </Button>
              </>
            ) : (
              <>
                <Button 
                  variant="destructive" 
                  onClick={() => setHolidayDeleteConfirmOpen(true)}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete
                </Button>
                <Button 
                  variant="outline"
                  onClick={() => setIsEditingHoliday(true)}
                >
                  <Pencil className="h-4 w-4 mr-2" />
                  Edit
                </Button>
                <Button onClick={() => setHolidayDialogOpen(false)}>
                  Close
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={holidayDeleteConfirmOpen} onOpenChange={setHolidayDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Holiday/Absence?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this holiday/absence record. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteHolidayMutation.mutate()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteHolidayMutation.isPending ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Deleting...</>
              ) : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

// Upcoming Holidays Card Component
const UpcomingHolidaysCard = ({ 
  clientName,
  getStaffName 
}: { 
  clientName: string;
  getStaffName: (userId: string) => string;
}) => {
  const today = new Date();
  
  // Fetch upcoming approved holidays for staff assigned to this client
  const { data: upcomingHolidays = [], isLoading } = useQuery({
    queryKey: ["upcoming-holidays", clientName],
    queryFn: async () => {
      // First get staff assigned to this client
      const { data: assignments, error: assignError } = await supabase
        .from('staff_client_assignments')
        .select('staff_user_id')
        .eq('client_name', clientName);
      
      if (assignError) throw assignError;
      if (!assignments || assignments.length === 0) return [];
      
      const staffUserIds = assignments.map(a => a.staff_user_id);
      
      const { data, error } = await supabase
        .from("staff_holidays")
        .select("id, user_id, start_date, end_date, status, absence_type, days_taken, notes, no_cover_required")
        .eq("status", "approved")
        .in("user_id", staffUserIds)
        .gte("end_date", format(today, "yyyy-MM-dd"))
        .order("start_date", { ascending: true })
        .limit(10);
      
      if (error) throw error;
      return (data || []) as StaffHoliday[];
    },
    enabled: !!clientName,
  });

  const getAbsenceLabel = (type: string) => {
    const found = ABSENCE_TYPES.find(t => t.value === type);
    return found?.label || type;
  };

  const getAbsenceBadgeColor = (type: string) => {
    switch (type) {
      case 'holiday':
        return 'bg-amber-100 text-amber-800 border-amber-200';
      case 'sick':
        return 'bg-red-100 text-red-800 border-red-200';
      case 'personal':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'maternity':
      case 'paternity':
        return 'bg-pink-100 text-pink-800 border-pink-200';
      case 'unpaid':
        return 'bg-gray-100 text-gray-800 border-gray-200';
      default:
        return 'bg-slate-100 text-slate-800 border-slate-200';
    }
  };

  if (isLoading) {
    return (
      <Card className="mt-4 sm:mt-6">
        <CardHeader className="pb-2 px-3 sm:px-6">
          <CardTitle className="text-lg sm:text-xl">
            Upcoming Holidays
          </CardTitle>
        </CardHeader>
        <CardContent className="px-3 sm:px-6">
          <div className="flex items-center justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (upcomingHolidays.length === 0) {
    return (
      <Card className="mt-4 sm:mt-6">
        <CardHeader className="pb-2 px-3 sm:px-6">
          <CardTitle className="text-lg sm:text-xl">
            Upcoming Holidays
          </CardTitle>
        </CardHeader>
        <CardContent className="px-3 sm:px-6">
          <p className="text-sm text-muted-foreground text-center py-4">
            No upcoming approved holidays
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="mt-4 sm:mt-6">
      <CardHeader className="pb-2 px-3 sm:px-6">
        <CardTitle className="text-lg sm:text-xl">
          Upcoming Holidays
        </CardTitle>
      </CardHeader>
      <CardContent className="px-3 sm:px-6">
        <div className="space-y-2 sm:space-y-3">
          {upcomingHolidays.map((holiday) => {
            const startDate = parseISO(holiday.start_date);
            const endDate = parseISO(holiday.end_date);
            const isStartingToday = format(startDate, 'yyyy-MM-dd') === format(today, 'yyyy-MM-dd');
            const isOngoing = startDate <= today && endDate >= today;
            
            return (
              <div 
                key={holiday.id} 
                className={`flex items-start gap-3 p-3 rounded-lg border ${
                  isOngoing ? 'bg-amber-50 border-amber-200' : 'bg-muted/30 border-border'
                }`}
              >
                <div className="flex-shrink-0 mt-0.5">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm">
                      {getStaffName(holiday.user_id)}
                    </span>
                    {isOngoing ? (
                      <span className="font-bold text-sm text-amber-700">(Currently Away)</span>
                    ) : isStartingToday ? (
                      <span className="font-bold text-sm text-green-700">(Starts Today)</span>
                    ) : (
                      <span className="font-bold text-sm text-muted-foreground">(Upcoming)</span>
                    )}
                  </div>
                  <div className="text-sm text-muted-foreground mt-1">
                    {format(startDate, 'EEE, d MMM')}
                    {holiday.start_date !== holiday.end_date && (
                      <> — {format(endDate, 'EEE, d MMM')}</>
                    )}
                    <span className="ml-2 text-xs">
                      ({holiday.days_taken} {holiday.days_taken === 1 ? 'day' : 'days'})
                    </span>
                  </div>
                  {holiday.notes && (
                    <p className="text-xs text-muted-foreground mt-1 truncate">
                      {holiday.notes}
                    </p>
                  )}
                </div>
                {holiday.no_cover_required && (
                  <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700 border-blue-200 flex-shrink-0">
                    No cover needed
                  </Badge>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
};

// Whiteboard Component - rich text editable shared notepad with CMD+B bold support
const ClientNoticeboard = ({ clientName }: { clientName: string }) => {
  const queryClient = useQueryClient();
  const [content, setContent] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const hasInitialized = useRef(false);
  const editorRef = useRef<HTMLDivElement | null>(null);

  const { data: whiteboard, isLoading } = useQuery({
    queryKey: ["client-whiteboard", clientName],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_whiteboards")
        .select("*")
        .eq("client_name", clientName)
        .maybeSingle();
      
      if (error) throw error;
      return data as ClientWhiteboard | null;
    },
    staleTime: 5000,
  });

  // Set initial content when data loads
  useEffect(() => {
    if (whiteboard?.content !== undefined && !hasInitialized.current) {
      setContent(whiteboard.content);
      hasInitialized.current = true;
      // Set the editor content after initialization
      if (editorRef.current) {
        editorRef.current.innerHTML = whiteboard.content;
      }
    }
  }, [whiteboard?.content]);

  // Sync content to editor when it updates externally
  useEffect(() => {
    if (editorRef.current && hasInitialized.current && whiteboard?.content !== undefined) {
      // Only update if the content differs and we're not currently editing
      if (document.activeElement !== editorRef.current && editorRef.current.innerHTML !== whiteboard.content) {
        editorRef.current.innerHTML = whiteboard.content;
      }
    }
  }, [whiteboard?.content]);

  const saveContent = async (newContent: string) => {
    setIsSaving(true);
    try {
      if (whiteboard) {
        // Update existing
        const { error } = await supabase
          .from("client_whiteboards")
          .update({ content: newContent })
          .eq("client_name", clientName);
        
        if (error) throw error;
      } else {
        // Create new
        const { error } = await supabase
          .from("client_whiteboards")
          .insert({ client_name: clientName, content: newContent });
        
        if (error) throw error;
      }
      
      setLastSaved(new Date());
      queryClient.invalidateQueries({ queryKey: ["client-whiteboard", clientName] });
    } catch (error) {
      toast.error("Failed to save");
    } finally {
      setIsSaving(false);
    }
  };

  const handleContentChange = () => {
    if (!editorRef.current) return;
    const newContent = editorRef.current.innerHTML;
    setContent(newContent);
    
    // Clear existing timeout
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    
    // Debounce save (save after 1 second of no typing)
    saveTimeoutRef.current = setTimeout(() => {
      saveContent(newContent);
    }, 1000);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    // CMD+B (Mac) or Ctrl+B (Windows) for bold
    if ((e.metaKey || e.ctrlKey) && e.key === 'b') {
      e.preventDefault();
      document.execCommand('bold', false);
      handleContentChange();
    }
  };

  return (
    <Card className="mt-4 sm:mt-6">
      <CardHeader className="pb-2 px-3 sm:px-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
          <CardTitle className="text-lg sm:text-xl">
            Updates
          </CardTitle>
          <div className="text-xs text-muted-foreground">
            {isSaving ? (
              <span className="flex items-center gap-1">
                <Loader2 className="h-3 w-3 animate-spin" />
                Saving...
              </span>
            ) : lastSaved ? (
              <span>Saved {format(lastSaved, "HH:mm")}</span>
            ) : whiteboard?.updated_at ? (
              <span className="hidden sm:inline">Last updated {format(parseISO(whiteboard.updated_at), "PPp")}</span>
            ) : null}
          </div>
        </div>
      </CardHeader>
      <CardContent className="px-3 sm:px-6">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-2">
            <div
              ref={editorRef}
              contentEditable
              onInput={handleContentChange}
              onKeyDown={handleKeyDown}
              data-placeholder="Type your notes here... Changes are saved automatically."
              className="min-h-[150px] sm:min-h-[200px] p-3 rounded-md font-mono text-sm bg-amber-50/50 border border-amber-200 focus:border-amber-300 focus:outline-none focus:ring-2 focus:ring-amber-200 overflow-auto whitespace-pre-wrap empty:before:content-[attr(data-placeholder)] empty:before:text-muted-foreground"
            />
            <p className="text-xs text-muted-foreground hidden sm:block">
              Tip: Select text and press <kbd className="px-1 py-0.5 bg-muted rounded text-[10px]">⌘B</kbd> or <kbd className="px-1 py-0.5 bg-muted rounded text-[10px]">Ctrl+B</kbd> to bold
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

// Links Manager Component
const LINK_CATEGORIES = [
  { value: 'software', label: 'Software' },
  { value: 'guidance', label: 'Guidance' },
  { value: 'training', label: 'Training' },
  { value: 'other', label: 'Other' },
] as const;

type LinkCategory = 'software' | 'guidance' | 'training' | 'other';

const ClientPasswordManager = ({ clientName }: { clientName: string }) => {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [softwareName, setSoftwareName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [url, setUrl] = useState("");
  const [notes, setNotes] = useState("");
  const [category, setCategory] = useState<LinkCategory>("other");
  const [visiblePasswords, setVisiblePasswords] = useState<Set<string>>(new Set());
  const [copiedId, setCopiedId] = useState<string | null>(null);
  
  // Edit state
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<ClientPassword | null>(null);
  const [editForm, setEditForm] = useState({
    software_name: "",
    username: "",
    password: "",
    url: "",
    notes: "",
    category: "other" as LinkCategory,
  });
  
  // Delete confirmation state
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [deletingEntry, setDeletingEntry] = useState<ClientPassword | null>(null);

  const { data: passwords = [], isLoading } = useQuery({
    queryKey: ["client-passwords", clientName],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_passwords")
        .select("*")
        .eq("client_name", clientName)
        .order("category", { ascending: true })
        .order("sort_order", { ascending: true });
      
      if (error) throw error;
      return data as ClientPassword[];
    },
  });

  const addPasswordMutation = useMutation({
    mutationFn: async () => {
      // Get max sort_order for this category
      const { data: existingEntries } = await supabase
        .from("client_passwords")
        .select("sort_order")
        .eq("client_name", clientName)
        .eq("category", category)
        .order("sort_order", { ascending: false })
        .limit(1);
      
      const nextSortOrder = (existingEntries?.[0]?.sort_order ?? -1) + 1;
      
      const { error } = await supabase
        .from("client_passwords")
        .insert({
          client_name: clientName,
          software_name: softwareName.trim(),
          username: username.trim() || "",
          password: password.trim() || "",
          url: url.trim() || null,
          notes: notes.trim() || null,
          category: category,
          sort_order: nextSortOrder,
        });
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["client-passwords", clientName] });
      setSoftwareName("");
      setUsername("");
      setPassword("");
      setUrl("");
      setNotes("");
      setCategory("other");
      setShowForm(false);
      toast.success("Entry added successfully");
    },
    onError: () => {
      toast.error("Failed to add entry");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!softwareName.trim()) {
      toast.error("Please provide a name for this entry");
      return;
    }
    addPasswordMutation.mutate();
  };

  // Update mutation
  const updatePasswordMutation = useMutation({
    mutationFn: async (data: { id: string; software_name: string; username: string; password: string; url: string | null; notes: string | null; category: string }) => {
      const { error } = await supabase
        .from("client_passwords")
        .update({
          software_name: data.software_name,
          username: data.username,
          password: data.password,
          url: data.url,
          notes: data.notes,
          category: data.category,
        })
        .eq("id", data.id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["client-passwords", clientName] });
      setIsEditDialogOpen(false);
      setEditingEntry(null);
      toast.success("Entry updated successfully");
    },
    onError: () => {
      toast.error("Failed to update entry");
    },
  });

  // Reorder mutation
  const reorderMutation = useMutation({
    mutationFn: async ({ id, newSortOrder }: { id: string; newSortOrder: number }) => {
      const { error } = await supabase
        .from("client_passwords")
        .update({ sort_order: newSortOrder })
        .eq("id", id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["client-passwords", clientName] });
    },
  });

  // Move item up within category
  const moveUp = (entry: ClientPassword) => {
    const categoryEntries = passwords.filter(p => (p.category || 'other') === (entry.category || 'other'));
    const currentIndex = categoryEntries.findIndex(p => p.id === entry.id);
    
    if (currentIndex <= 0) return;
    
    const prevEntry = categoryEntries[currentIndex - 1];
    const currentSortOrder = entry.sort_order ?? currentIndex;
    const prevSortOrder = prevEntry.sort_order ?? (currentIndex - 1);
    
    // Swap sort orders
    reorderMutation.mutate({ id: entry.id, newSortOrder: prevSortOrder });
    reorderMutation.mutate({ id: prevEntry.id, newSortOrder: currentSortOrder });
  };

  // Move item down within category
  const moveDown = (entry: ClientPassword) => {
    const categoryEntries = passwords.filter(p => (p.category || 'other') === (entry.category || 'other'));
    const currentIndex = categoryEntries.findIndex(p => p.id === entry.id);
    
    if (currentIndex >= categoryEntries.length - 1) return;
    
    const nextEntry = categoryEntries[currentIndex + 1];
    const currentSortOrder = entry.sort_order ?? currentIndex;
    const nextSortOrder = nextEntry.sort_order ?? (currentIndex + 1);
    
    // Swap sort orders
    reorderMutation.mutate({ id: entry.id, newSortOrder: nextSortOrder });
    reorderMutation.mutate({ id: nextEntry.id, newSortOrder: currentSortOrder });
  };

  // Group passwords by category
  const groupedPasswords = useMemo(() => {
    const groups: Record<string, ClientPassword[]> = {
      software: [],
      guidance: [],
      training: [],
      other: [],
    };
    
    passwords.forEach(pw => {
      const cat = (pw.category || 'other') as string;
      if (groups[cat]) {
        groups[cat].push(pw);
      } else {
        groups.other.push(pw);
      }
    });
    
    // Sort each category by sort_order
    Object.keys(groups).forEach(key => {
      groups[key].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    });
    
    return groups;
  }, [passwords]);

  // Delete mutation
  const deletePasswordMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("client_passwords")
        .delete()
        .eq("id", id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["client-passwords", clientName] });
      setIsDeleteDialogOpen(false);
      setDeletingEntry(null);
      toast.success("Entry deleted successfully");
    },
    onError: () => {
      toast.error("Failed to delete entry");
    },
  });

  const openEditDialog = (entry: ClientPassword) => {
    setEditingEntry(entry);
    setEditForm({
      software_name: entry.software_name,
      username: entry.username,
      password: entry.password,
      url: entry.url || "",
      notes: entry.notes || "",
      category: (entry.category as LinkCategory) || "other",
    });
    setIsEditDialogOpen(true);
  };

  const handleEditSubmit = () => {
    if (!editingEntry) return;
    if (!editForm.software_name.trim()) {
      toast.error("Please provide a name for this entry");
      return;
    }
    updatePasswordMutation.mutate({
      id: editingEntry.id,
      software_name: editForm.software_name.trim(),
      username: editForm.username.trim(),
      password: editForm.password.trim(),
      url: editForm.url.trim() || null,
      notes: editForm.notes.trim() || null,
      category: editForm.category,
    });
  };

  const openDeleteDialog = (entry: ClientPassword) => {
    setDeletingEntry(entry);
    setIsDeleteDialogOpen(true);
  };

  const togglePasswordVisibility = (id: string) => {
    const newVisible = new Set(visiblePasswords);
    if (newVisible.has(id)) {
      newVisible.delete(id);
    } else {
      newVisible.add(id);
    }
    setVisiblePasswords(newVisible);
  };

  const copyToClipboard = async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      toast.success("Copied to clipboard");
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      toast.error("Failed to copy");
    }
  };

  return (
    <Card className="mt-4 sm:mt-6">
      <CardHeader className="pb-3 px-3 sm:px-6">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-lg sm:text-xl">
            Links
          </CardTitle>
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => setShowForm(!showForm)}
            className="text-xs sm:text-sm"
          >
            <Plus className="h-4 w-4 sm:mr-1" />
            <span className="hidden sm:inline">Add Entry</span>
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 sm:space-y-6 px-3 sm:px-6">
        {/* Add Entry Form */}
        {showForm && (
          <form onSubmit={handleSubmit} className="space-y-3 p-3 sm:p-4 bg-muted/30 rounded-lg border">
            <div className="grid grid-cols-1 gap-3">
              <div className="space-y-1.5">
                <Label className="text-sm">Category</Label>
                <Select value={category} onValueChange={(val) => setCategory(val as LinkCategory)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {LINK_CATEGORIES.map(cat => (
                      <SelectItem key={cat.value} value={cat.value}>{cat.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Input
                placeholder="Name (e.g., Care Planner)"
                value={softwareName}
                onChange={(e) => setSoftwareName(e.target.value)}
              />
              <Input
                placeholder="URL / Link (optional)"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                type="url"
              />
              <Input
                placeholder="Username (optional)"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
              <Input
                type="password"
                placeholder="Password (optional)"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <Input
                placeholder="Notes (optional)"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setShowForm(false)}>
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={addPasswordMutation.isPending}>
                Save
              </Button>
            </div>
          </form>
        )}

        {/* Entries List - Grouped by Category */}
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : passwords.length === 0 ? (
          <div className="text-center py-6 sm:py-8 text-muted-foreground text-sm">
            No entries stored yet
          </div>
        ) : (
          <div className="space-y-4">
            {LINK_CATEGORIES.map(cat => {
              const entries = groupedPasswords[cat.value];
              if (!entries || entries.length === 0) return null;
              
              return (
                <div key={cat.value} className="space-y-2">
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">{cat.label}</h3>
                  <div className="space-y-2">
                    {entries.map((pw, index) => (
                      <div key={pw.id} className="p-3 sm:p-4 bg-background rounded-lg border">
                        <div className="flex items-start justify-between gap-2">
                          {/* Reorder buttons */}
                          <div className="flex flex-col items-center gap-0 flex-shrink-0">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-5 w-5"
                              onClick={() => moveUp(pw)}
                              disabled={index === 0 || reorderMutation.isPending}
                            >
                              <ChevronUp className="h-3 w-3" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-5 w-5"
                              onClick={() => moveDown(pw)}
                              disabled={index === entries.length - 1 || reorderMutation.isPending}
                            >
                              <ChevronDown className="h-3 w-3" />
                            </Button>
                          </div>
                          
                          <div className="flex-1 space-y-2 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-semibold text-sm">{pw.software_name}</span>
                              {pw.url && (
                                <a
                                  href={pw.url.startsWith('http') ? pw.url : `https://${pw.url}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                                >
                                  <ExternalLink className="h-3 w-3" />
                                  <span className="hidden sm:inline">Open</span>
                                </a>
                              )}
                            </div>
                            
                            {/* Credentials - stacked on mobile */}
                            {(pw.username || pw.password) && (
                              <div className="space-y-1.5 text-sm">
                                {pw.username && (
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="text-muted-foreground text-xs sm:text-sm">Username:</span>
                                    <span className="font-mono text-xs sm:text-sm truncate max-w-[150px] sm:max-w-none">{pw.username}</span>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-6 w-6 flex-shrink-0"
                                      onClick={() => copyToClipboard(pw.username, `user-${pw.id}`)}
                                    >
                                      {copiedId === `user-${pw.id}` ? (
                                        <Check className="h-3 w-3 text-green-500" />
                                      ) : (
                                        <Copy className="h-3 w-3" />
                                      )}
                                    </Button>
                                  </div>
                                )}
                                {pw.password && (
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="text-muted-foreground text-xs sm:text-sm">Password:</span>
                                    <span className="font-mono text-xs sm:text-sm">
                                      {visiblePasswords.has(pw.id) ? pw.password : "••••••••"}
                                    </span>
                                    <div className="flex items-center gap-0 flex-shrink-0">
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-6 w-6"
                                        onClick={() => togglePasswordVisibility(pw.id)}
                                      >
                                        {visiblePasswords.has(pw.id) ? (
                                          <EyeOff className="h-3 w-3" />
                                        ) : (
                                          <Eye className="h-3 w-3" />
                                        )}
                                      </Button>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-6 w-6"
                                        onClick={() => copyToClipboard(pw.password, `pass-${pw.id}`)}
                                      >
                                        {copiedId === `pass-${pw.id}` ? (
                                          <Check className="h-3 w-3 text-green-500" />
                                        ) : (
                                          <Copy className="h-3 w-3" />
                                        )}
                                      </Button>
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}
                            
                            {pw.notes && (
                              <p className="text-xs text-muted-foreground">{pw.notes}</p>
                            )}
                          </div>
                          
                          {/* Edit/Delete buttons */}
                          <div className="flex flex-col sm:flex-row items-center gap-0 flex-shrink-0">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 sm:h-8 sm:w-8"
                              onClick={() => openEditDialog(pw)}
                            >
                              <Pencil className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 sm:h-8 sm:w-8 text-destructive hover:text-destructive"
                              onClick={() => openDeleteDialog(pw)}
                            >
                              <Trash2 className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>

      {/* Edit Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Entry</DialogTitle>
            <DialogDescription>
              Update the details of this link entry.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-sm">Category</Label>
              <Select 
                value={editForm.category} 
                onValueChange={(val) => setEditForm(prev => ({ ...prev, category: val as LinkCategory }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LINK_CATEGORIES.map(cat => (
                    <SelectItem key={cat.value} value={cat.value}>{cat.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Input
              placeholder="Name (e.g., Care Planner, Medication App)"
              value={editForm.software_name}
              onChange={(e) => setEditForm(prev => ({ ...prev, software_name: e.target.value }))}
            />
            <Input
              placeholder="URL / Link (optional)"
              value={editForm.url}
              onChange={(e) => setEditForm(prev => ({ ...prev, url: e.target.value }))}
              type="url"
            />
            <Input
              placeholder="Username (optional)"
              value={editForm.username}
              onChange={(e) => setEditForm(prev => ({ ...prev, username: e.target.value }))}
            />
            <Input
              type="password"
              placeholder="Password (optional)"
              value={editForm.password}
              onChange={(e) => setEditForm(prev => ({ ...prev, password: e.target.value }))}
            />
            <Input
              placeholder="Notes (optional)"
              value={editForm.notes}
              onChange={(e) => setEditForm(prev => ({ ...prev, notes: e.target.value }))}
            />
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleEditSubmit}
              disabled={updatePasswordMutation.isPending}
            >
              {updatePasswordMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Entry</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{deletingEntry?.software_name}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deletingEntry && deletePasswordMutation.mutate(deletingEntry.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deletePasswordMutation.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
};
