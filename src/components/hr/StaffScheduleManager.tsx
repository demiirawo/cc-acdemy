import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { format, addDays, startOfWeek, endOfWeek, eachDayOfInterval, isWithinInterval, parseISO, differenceInHours, getDay, addWeeks, parse, isBefore, isAfter, isSameDay, differenceInWeeks, getDate, addMonths } from "date-fns";
import { Plus, ChevronLeft, ChevronRight, Clock, Palmtree, Trash2, Users, Building2, Repeat, Infinity, RefreshCw, Send, AlertTriangle, Calendar } from "lucide-react";

interface Schedule {
  id: string;
  user_id: string;
  client_name: string;
  start_datetime: string;
  end_datetime: string;
  notes: string | null;
  hourly_rate: number | null;
  currency: string;
  is_pattern_overtime?: boolean; // For virtual schedules from overtime patterns
}

interface Overtime {
  id: string;
  user_id: string;
  schedule_id: string | null;
  overtime_date: string;
  hours: number;
  hourly_rate: number | null;
  currency: string;
  notes: string | null;
}

interface Holiday {
  id: string;
  user_id: string;
  start_date: string;
  end_date: string;
  status: string;
  absence_type: string;
  notes: string | null;
}

interface StaffMember {
  user_id: string;
  display_name: string;
  email: string;
}

interface HRProfile {
  user_id: string;
  base_salary: number | null;
  base_currency: string;
}

interface RecurringPattern {
  id: string;
  user_id: string;
  client_name: string;
  days_of_week: number[];
  start_time: string;
  end_time: string;
  hourly_rate: number | null;
  currency: string;
  is_overtime: boolean;
  notes: string | null;
  start_date: string;
  end_date: string | null; // null = indefinite
  recurrence_interval: 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'one_off';
}

interface Client {
  id: string;
  name: string;
}

interface StaffRequest {
  id: string;
  user_id: string;
  request_type: 'overtime_standard' | 'overtime_double_up' | 'holiday' | 'shift_swap';
  swap_with_user_id: string | null;
  start_date: string;
  end_date: string;
  days_requested: number;
  details: string | null;
  status: string;
}

type ViewMode = "staff" | "client";

const DAYS_OF_WEEK = [
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
  { value: 0, label: "Sun" },
];

export function StaffScheduleManager() {
  const queryClient = useQueryClient();
  const [currentWeekStart, setCurrentWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [isRecurringDialogOpen, setIsRecurringDialogOpen] = useState(false);
  const [isEditPatternDialogOpen, setIsEditPatternDialogOpen] = useState(false);
  const [editingPattern, setEditingPattern] = useState<RecurringPattern | null>(null);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; isPattern: boolean; patternId?: string; exceptionDate?: string } | null>(null);
  const [selectedStaff, setSelectedStaff] = useState<string>("all");
  const [viewMode, setViewMode] = useState<ViewMode>("staff");

  // Edit pattern form state
  const [editPatternForm, setEditPatternForm] = useState({
    user_id: "",
    client_name: "",
    start_time: "09:00",
    end_time: "17:00",
    selected_days: [] as number[],
    is_overtime: false,
    notes: "",
    hourly_rate: "",
    currency: "GBP",
    start_date: "",
    end_date: "",
    recurrence_interval: "weekly" as 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'one_off'
  });

  // Recurring schedule form state
  const [recurringForm, setRecurringForm] = useState({
    user_id: "",
    client_name: "",
    start_time: "09:00",
    end_time: "17:00",
    selected_days: [] as number[],
    weeks_to_create: 4,
    is_indefinite: false,
    is_overtime: false,
    notes: "",
    hourly_rate: "",
    currency: "GBP",
    start_date: format(new Date(), "yyyy-MM-dd"),
    end_date: format(new Date(), "yyyy-MM-dd"),
    recurrence_interval: "weekly" as 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'one_off'
  });

  const weekDays = useMemo(() => {
    return eachDayOfInterval({
      start: currentWeekStart,
      end: endOfWeek(currentWeekStart, { weekStartsOn: 1 })
    });
  }, [currentWeekStart]);

  // Fetch clients from database
  const { data: clients = [] } = useQuery({
    queryKey: ["clients"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("id, name")
        .order("name");
      
      if (error) throw error;
      return data as Client[];
    }
  });

  // Fetch staff members
  const { data: staffMembers = [] } = useQuery({
    queryKey: ["staff-members"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("user_id, display_name, email")
        .order("display_name");
      
      if (error) throw error;
      return data as StaffMember[];
    }
  });

  // Fetch HR profiles for rates
  const { data: hrProfiles = [] } = useQuery({
    queryKey: ["hr-profiles-for-schedule"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hr_profiles")
        .select("user_id, base_salary, base_currency");
      
      if (error) throw error;
      return data as HRProfile[];
    }
  });

  // Fetch schedules for current week
  const { data: schedules = [] } = useQuery({
    queryKey: ["staff-schedules", currentWeekStart.toISOString()],
    queryFn: async () => {
      const weekEnd = endOfWeek(currentWeekStart, { weekStartsOn: 1 });
      const { data, error } = await supabase
        .from("staff_schedules")
        .select("*")
        .gte("start_datetime", currentWeekStart.toISOString())
        .lte("start_datetime", weekEnd.toISOString())
        .order("start_datetime");
      
      if (error) throw error;
      return data as Schedule[];
    }
  });

  // Fetch overtime entries for current week
  const { data: overtimeEntries = [] } = useQuery({
    queryKey: ["staff-overtime", currentWeekStart.toISOString()],
    queryFn: async () => {
      const weekEnd = endOfWeek(currentWeekStart, { weekStartsOn: 1 });
      const { data, error } = await supabase
        .from("staff_overtime")
        .select("*")
        .gte("overtime_date", format(currentWeekStart, "yyyy-MM-dd"))
        .lte("overtime_date", format(weekEnd, "yyyy-MM-dd"))
        .order("overtime_date");
      
      if (error) throw error;
      return data as Overtime[];
    }
  });

  // Fetch holidays
  const { data: holidays = [] } = useQuery({
    queryKey: ["staff-holidays-for-schedule", currentWeekStart.toISOString()],
    queryFn: async () => {
      const weekEnd = endOfWeek(currentWeekStart, { weekStartsOn: 1 });
      const { data, error } = await supabase
        .from("staff_holidays")
        .select("*")
        .or(`start_date.lte.${format(weekEnd, "yyyy-MM-dd")},end_date.gte.${format(currentWeekStart, "yyyy-MM-dd")}`)
        .in("status", ["approved", "pending"]);
      
      if (error) throw error;
      return data as Holiday[];
    }
  });

  // Fetch staff requests (pending and approved)
  const { data: staffRequests = [] } = useQuery({
    queryKey: ["staff-requests-for-schedule", currentWeekStart.toISOString()],
    queryFn: async () => {
      const weekEnd = endOfWeek(currentWeekStart, { weekStartsOn: 1 });
      const { data, error } = await supabase
        .from("staff_requests")
        .select("*")
        .or(`start_date.lte.${format(weekEnd, "yyyy-MM-dd")},end_date.gte.${format(currentWeekStart, "yyyy-MM-dd")}`)
        .in("status", ["approved", "pending"]);
      
      if (error) throw error;
      return data as StaffRequest[];
    }
  });

  // Fetch recurring shift patterns
  const { data: recurringPatterns = [] } = useQuery({
    queryKey: ["recurring-shift-patterns"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("recurring_shift_patterns")
        .select("*")
        .order("created_at", { ascending: false });
      
      if (error) throw error;
      return data as RecurringPattern[];
    }
  });

  // Fetch shift pattern exceptions
  const { data: shiftExceptions = [] } = useQuery({
    queryKey: ["shift-pattern-exceptions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("shift_pattern_exceptions")
        .select("*");
      
      if (error) throw error;
      return data as { id: string; pattern_id: string; exception_date: string; exception_type: string }[];
    }
  });

  // Generate virtual schedules from recurring patterns for the current week
  const virtualSchedulesFromPatterns = useMemo(() => {
    const virtualSchedules: Schedule[] = [];
    
    // Create a set of exception keys for fast lookup
    const exceptionKeys = new Set(
      shiftExceptions.map(e => `${e.pattern_id}-${e.exception_date}`)
    );
    
    for (const pattern of recurringPatterns) {
      const patternStartDate = parseISO(pattern.start_date);
      const patternEndDate = pattern.end_date ? parseISO(pattern.end_date) : null;
      const recurrenceInterval = pattern.recurrence_interval || 'weekly';
      
      for (const day of weekDays) {
        const dayOfWeek = getDay(day);
        const dateStr = format(day, "yyyy-MM-dd");
        
        // Check if day is within the pattern's date range
        if (isBefore(day, patternStartDate)) continue;
        if (patternEndDate && isAfter(day, patternEndDate)) continue;
        
        // Check recurrence interval
        let shouldInclude = false;
        
        if (recurrenceInterval === 'daily') {
          // Daily: include every day
          shouldInclude = true;
        } else if (recurrenceInterval === 'weekly') {
          // Weekly: check if this day is in the pattern's days_of_week
          shouldInclude = pattern.days_of_week.includes(dayOfWeek);
        } else if (recurrenceInterval === 'biweekly') {
          // Biweekly: check if this day is in the pattern's days_of_week AND it's an even week from start
          if (pattern.days_of_week.includes(dayOfWeek)) {
            const weeksDiff = differenceInWeeks(startOfWeek(day, { weekStartsOn: 1 }), startOfWeek(patternStartDate, { weekStartsOn: 1 }));
            shouldInclude = weeksDiff % 2 === 0;
          }
        } else if (recurrenceInterval === 'monthly') {
          // Monthly: check if this day is in the pattern's days_of_week AND it's the same week of the month as the start
          if (pattern.days_of_week.includes(dayOfWeek)) {
            const startDayOfMonth = getDate(patternStartDate);
            const currentDayOfMonth = getDate(day);
            // Same week number in month (1-7 = week 1, 8-14 = week 2, etc.)
            const startWeekOfMonth = Math.ceil(startDayOfMonth / 7);
            const currentWeekOfMonth = Math.ceil(currentDayOfMonth / 7);
            shouldInclude = startWeekOfMonth === currentWeekOfMonth;
          }
        }
        
        if (!shouldInclude) continue;
        
        // Check if there's an exception for this date
        if (exceptionKeys.has(`${pattern.id}-${dateStr}`)) continue;
        
        // Create virtual schedule entry
        const startDatetime = `${dateStr}T${pattern.start_time}`;
        const endDatetime = `${dateStr}T${pattern.end_time}`;
        
        virtualSchedules.push({
          id: `pattern-${pattern.id}-${dateStr}`,
          user_id: pattern.user_id,
          client_name: pattern.client_name,
          start_datetime: startDatetime,
          end_datetime: endDatetime,
          notes: pattern.notes,
          hourly_rate: pattern.hourly_rate,
          currency: pattern.currency,
          is_pattern_overtime: pattern.is_overtime
        });
      }
    }
    
    return virtualSchedules;
  }, [recurringPatterns, weekDays, shiftExceptions]);

  // Combine real schedules with virtual ones from patterns
  const allSchedules = useMemo(() => {
    // Filter out duplicates - if there's a real schedule at the same time, use that
    const realScheduleKeys = new Set(
      schedules.map(s => `${s.user_id}-${format(parseISO(s.start_datetime), "yyyy-MM-dd-HH:mm")}`)
    );
    
    const uniqueVirtual = virtualSchedulesFromPatterns.filter(vs => {
      const key = `${vs.user_id}-${format(parseISO(vs.start_datetime), "yyyy-MM-dd-HH:mm")}`;
      return !realScheduleKeys.has(key);
    });
    
    return [...schedules, ...uniqueVirtual];
  }, [schedules, virtualSchedulesFromPatterns]);

  // Get unique clients from schedules
  const uniqueClients = useMemo(() => {
    const clients = new Set(allSchedules.map(s => s.client_name));
    return Array.from(clients).sort();
  }, [schedules]);

  // Create recurring schedule mutation
  const createRecurringScheduleMutation = useMutation({
    mutationFn: async (data: typeof recurringForm) => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error("Not authenticated");

      // Handle one-off (single shift) schedule
      if (data.recurrence_interval === 'one_off') {
        // Create schedules for each day in the date range
        const startDate = parseISO(data.start_date);
        const endDate = parseISO(data.end_date);
        const daysInRange = eachDayOfInterval({ start: startDate, end: endDate });
        
        if (data.is_overtime) {
          const overtimeToCreate = daysInRange.map(day => {
            const [startHour, startMin] = data.start_time.split(':').map(Number);
            const [endHour, endMin] = data.end_time.split(':').map(Number);
            const hours = (endHour + endMin / 60) - (startHour + startMin / 60);
            
            return {
              user_id: data.user_id,
              overtime_date: format(day, "yyyy-MM-dd"),
              hours: hours,
              hourly_rate: data.hourly_rate ? parseFloat(data.hourly_rate) : null,
              currency: data.currency,
              notes: data.notes ? `${data.client_name}: ${data.notes}` : data.client_name,
              created_by: userData.user.id
            };
          });
          
          const { error } = await supabase.from("staff_overtime").insert(overtimeToCreate);
          if (error) throw error;
          return { count: overtimeToCreate.length, type: 'overtime' };
        } else {
          const schedulesToCreate = daysInRange.map(day => ({
            user_id: data.user_id,
            client_name: data.client_name,
            start_datetime: `${format(day, "yyyy-MM-dd")}T${data.start_time}:00`,
            end_datetime: `${format(day, "yyyy-MM-dd")}T${data.end_time}:00`,
            notes: data.notes || null,
            hourly_rate: data.hourly_rate ? parseFloat(data.hourly_rate) : null,
            currency: data.currency,
            created_by: userData.user.id
          }));
          
          const { error } = await supabase.from("staff_schedules").insert(schedulesToCreate);
          if (error) throw error;
          return { count: schedulesToCreate.length, type: 'schedule' };
        }
      }

      // For true indefinite, save as a pattern (no end date)
      if (data.is_indefinite) {
        const { error } = await supabase.from("recurring_shift_patterns").insert({
          user_id: data.user_id,
          client_name: data.client_name,
          days_of_week: data.recurrence_interval === 'daily' ? [0, 1, 2, 3, 4, 5, 6] : data.selected_days,
          start_time: data.start_time,
          end_time: data.end_time,
          hourly_rate: data.hourly_rate ? parseFloat(data.hourly_rate) : null,
          currency: data.currency,
          is_overtime: data.is_overtime,
          notes: data.notes || null,
          start_date: data.start_date,
          end_date: null, // null = indefinite
          created_by: userData.user.id,
          recurrence_interval: data.recurrence_interval
        });

        if (error) throw error;
        return { type: 'pattern', indefinite: true };
      }

      // For fixed duration, create individual entries
      const weeksToCreate = data.weeks_to_create;
      const startDate = parseISO(data.start_date);

      if (data.is_overtime) {
        // Create overtime entries
        const overtimeToCreate: any[] = [];
        
        for (let week = 0; week < weeksToCreate; week++) {
          const weekStart = addWeeks(startOfWeek(startDate, { weekStartsOn: 1 }), week);
          
          for (const dayOfWeek of data.selected_days) {
            const daysToAdd = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
            const scheduleDate = addDays(weekStart, daysToAdd);
            
            // Skip if before start date
            if (isBefore(scheduleDate, startDate)) continue;
            
            // Calculate hours from start and end time
            const [startHour, startMin] = data.start_time.split(':').map(Number);
            const [endHour, endMin] = data.end_time.split(':').map(Number);
            const hours = (endHour + endMin / 60) - (startHour + startMin / 60);

            overtimeToCreate.push({
              user_id: data.user_id,
              overtime_date: format(scheduleDate, "yyyy-MM-dd"),
              hours: hours,
              hourly_rate: data.hourly_rate ? parseFloat(data.hourly_rate) : null,
              currency: data.currency,
              notes: data.notes ? `${data.client_name}: ${data.notes}` : data.client_name,
              created_by: userData.user.id
            });
          }
        }

        if (overtimeToCreate.length === 0) {
          throw new Error("No overtime entries to create. Please select at least one day.");
        }

        const { error } = await supabase.from("staff_overtime").insert(overtimeToCreate);
        if (error) throw error;

        return { count: overtimeToCreate.length, type: 'overtime' };
      } else {
        // Create regular schedule entries
        const schedulesToCreate: any[] = [];

        for (let week = 0; week < weeksToCreate; week++) {
          const weekStart = addWeeks(startOfWeek(startDate, { weekStartsOn: 1 }), week);
          
          for (const dayOfWeek of data.selected_days) {
            const daysToAdd = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
            const scheduleDate = addDays(weekStart, daysToAdd);
            
            // Skip if before start date
            if (isBefore(scheduleDate, startDate)) continue;
            
            const startDatetime = `${format(scheduleDate, "yyyy-MM-dd")}T${data.start_time}:00`;
            const endDatetime = `${format(scheduleDate, "yyyy-MM-dd")}T${data.end_time}:00`;

            schedulesToCreate.push({
              user_id: data.user_id,
              client_name: data.client_name,
              start_datetime: startDatetime,
              end_datetime: endDatetime,
              notes: data.notes || null,
              hourly_rate: data.hourly_rate ? parseFloat(data.hourly_rate) : null,
              currency: data.currency,
              created_by: userData.user.id
            });
          }
        }

        if (schedulesToCreate.length === 0) {
          throw new Error("No schedules to create. Please select at least one day.");
        }

        const { error } = await supabase.from("staff_schedules").insert(schedulesToCreate);
        if (error) throw error;

        return { count: schedulesToCreate.length, type: 'schedule' };
      }
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["staff-schedules"] });
      queryClient.invalidateQueries({ queryKey: ["staff-overtime"] });
      queryClient.invalidateQueries({ queryKey: ["recurring-shift-patterns"] });
      setIsRecurringDialogOpen(false);
      resetRecurringForm();
      if ('indefinite' in result) {
        toast.success("Created indefinite recurring pattern - shifts will generate automatically");
      } else {
        toast.success(`Created ${result.count} recurring ${result.type} entries`);
      }
    },
    onError: (error) => {
      toast.error("Failed to create recurring schedule: " + error.message);
    }
  });

  // Delete recurring pattern mutation
  const deletePatternMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("recurring_shift_patterns").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["recurring-shift-patterns"] });
      toast.success("Recurring pattern deleted");
    }
  });

  // Update recurring pattern mutation
  const updatePatternMutation = useMutation({
    mutationFn: async (data: typeof editPatternForm & { id: string }) => {
      const { error } = await supabase
        .from("recurring_shift_patterns")
        .update({
          user_id: data.user_id,
          client_name: data.client_name,
          days_of_week: data.recurrence_interval === 'daily' ? [0, 1, 2, 3, 4, 5, 6] : data.selected_days,
          start_time: data.start_time,
          end_time: data.end_time,
          hourly_rate: data.hourly_rate ? parseFloat(data.hourly_rate) : null,
          currency: data.currency,
          is_overtime: data.is_overtime,
          notes: data.notes || null,
          start_date: data.start_date,
          end_date: data.end_date || null,
          recurrence_interval: data.recurrence_interval
        })
        .eq("id", data.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["recurring-shift-patterns"] });
      setIsEditPatternDialogOpen(false);
      setEditingPattern(null);
      toast.success("Recurring pattern updated");
    },
    onError: (error) => {
      toast.error("Failed to update pattern: " + error.message);
    }
  });

  // Create shift exception mutation (for deleting single shift from pattern)
  const createExceptionMutation = useMutation({
    mutationFn: async ({ patternId, exceptionDate }: { patternId: string; exceptionDate: string }) => {
      const { data: userData } = await supabase.auth.getUser();
      const { error } = await supabase.from("shift_pattern_exceptions").insert({
        pattern_id: patternId,
        exception_date: exceptionDate,
        exception_type: 'deleted',
        created_by: userData.user?.id
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shift-pattern-exceptions"] });
      toast.success("Shift removed from schedule");
    },
    onError: (error) => {
      toast.error("Failed to remove shift: " + error.message);
    }
  });

  // Delete schedule mutation
  const deleteScheduleMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("staff_schedules").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["staff-schedules"] });
      toast.success("Schedule deleted");
    }
  });

  // Delete overtime mutation
  const deleteOvertimeMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("staff_overtime").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["staff-overtime"] });
      toast.success("Overtime entry deleted");
    }
  });

  // Handler for delete button clicks - shows confirmation for pattern-based shifts
  const handleDeleteClick = (scheduleId: string) => {
    const isFromPattern = scheduleId.startsWith('pattern-');
    if (isFromPattern) {
      // Extract pattern ID and date from the schedule ID (format: pattern-{patternId}-{date})
      const parts = scheduleId.split('-');
      const patternId = parts[1];
      const exceptionDate = parts.slice(2).join('-'); // Rejoin date parts (yyyy-MM-dd)
      setDeleteTarget({ id: scheduleId, isPattern: true, patternId, exceptionDate });
      setIsDeleteConfirmOpen(true);
    } else {
      // Direct delete for non-pattern schedules
      deleteScheduleMutation.mutate(scheduleId);
    }
  };

  const handleDeleteConfirm = (deleteEntireSeries: boolean) => {
    if (!deleteTarget) return;
    
    if (deleteEntireSeries && deleteTarget.patternId) {
      // Delete the entire pattern
      deletePatternMutation.mutate(deleteTarget.patternId);
    } else if (!deleteEntireSeries && deleteTarget.patternId && deleteTarget.exceptionDate) {
      // Create an exception for just this shift
      createExceptionMutation.mutate({
        patternId: deleteTarget.patternId,
        exceptionDate: deleteTarget.exceptionDate
      });
    }
    
    setIsDeleteConfirmOpen(false);
    setDeleteTarget(null);
  };

  const resetRecurringForm = () => {
    setRecurringForm({
      user_id: "",
      client_name: "",
      start_time: "09:00",
      end_time: "17:00",
      selected_days: [] as number[],
      weeks_to_create: 4,
      is_indefinite: false,
      is_overtime: false,
      notes: "",
      hourly_rate: "",
      currency: "GBP",
      start_date: format(new Date(), "yyyy-MM-dd"),
      end_date: format(new Date(), "yyyy-MM-dd"),
      recurrence_interval: "weekly"
    });
  };

  const toggleRecurringDay = (day: number) => {
    setRecurringForm(prev => ({
      ...prev,
      selected_days: prev.selected_days.includes(day)
        ? prev.selected_days.filter(d => d !== day)
        : [...prev.selected_days, day]
    }));
  };

  const toggleEditPatternDay = (day: number) => {
    setEditPatternForm(prev => ({
      ...prev,
      selected_days: prev.selected_days.includes(day)
        ? prev.selected_days.filter(d => d !== day)
        : [...prev.selected_days, day]
    }));
  };

  const openEditPatternDialog = (patternId: string) => {
    const pattern = recurringPatterns.find(p => p.id === patternId);
    if (!pattern) return;
    
    setEditingPattern(pattern);
    setEditPatternForm({
      user_id: pattern.user_id,
      client_name: pattern.client_name,
      start_time: pattern.start_time,
      end_time: pattern.end_time,
      selected_days: pattern.days_of_week || [],
      is_overtime: pattern.is_overtime,
      notes: pattern.notes || "",
      hourly_rate: pattern.hourly_rate?.toString() || "",
      currency: pattern.currency,
      start_date: pattern.start_date,
      end_date: pattern.end_date || "",
      recurrence_interval: (pattern.recurrence_interval || "weekly") as 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'one_off'
    });
    setIsEditPatternDialogOpen(true);
  };

  const handleScheduleClick = (scheduleId: string) => {
    if (scheduleId.startsWith('pattern-')) {
      // Extract pattern ID from the schedule ID (format: pattern-{patternId}-{date})
      const parts = scheduleId.split('-');
      const patternId = parts[1];
      openEditPatternDialog(patternId);
    }
    // For non-pattern schedules, we could add individual schedule editing later
  };

  const navigateWeek = (direction: "prev" | "next") => {
    setCurrentWeekStart(prev => addDays(prev, direction === "next" ? 7 : -7));
  };

  const getStaffName = (userId: string) => {
    const staff = staffMembers.find(s => s.user_id === userId);
    return staff?.display_name || staff?.email || "Unknown";
  };

  const getSchedulesForStaffDay = (userId: string, day: Date) => {
    return allSchedules.filter(s => {
      const scheduleDate = parseISO(s.start_datetime);
      return s.user_id === userId && format(scheduleDate, "yyyy-MM-dd") === format(day, "yyyy-MM-dd");
    });
  };

  const getSchedulesForClientDay = (clientName: string, day: Date) => {
    return allSchedules.filter(s => {
      const scheduleDate = parseISO(s.start_datetime);
      return s.client_name === clientName && format(scheduleDate, "yyyy-MM-dd") === format(day, "yyyy-MM-dd");
    });
  };

  const getOvertimeForStaffDay = (userId: string, day: Date) => {
    return overtimeEntries.filter(o => 
      o.user_id === userId && o.overtime_date === format(day, "yyyy-MM-dd")
    );
  };

  const isStaffOnHoliday = (userId: string, day: Date) => {
    return holidays.some(h => {
      if (h.user_id !== userId) return false;
      const start = parseISO(h.start_date);
      const end = parseISO(h.end_date);
      return isWithinInterval(day, { start, end });
    });
  };

  const getHolidayInfo = (userId: string, day: Date) => {
    return holidays.find(h => {
      if (h.user_id !== userId) return false;
      const start = parseISO(h.start_date);
      const end = parseISO(h.end_date);
      return isWithinInterval(day, { start, end });
    });
  };

  const getRequestsForStaffDay = (userId: string, day: Date) => {
    return staffRequests.filter(r => {
      if (r.user_id !== userId) return false;
      const start = parseISO(r.start_date);
      const end = parseISO(r.end_date);
      return isWithinInterval(day, { start, end }) || isSameDay(day, start) || isSameDay(day, end);
    });
  };

  const getRequestTypeInfo = (type: string, status: string) => {
    const isPending = status === 'pending';
    switch (type) {
      case 'overtime_standard':
        return { 
          label: 'OT - Standard', 
          color: isPending ? 'bg-orange-50 border-orange-200 border-dashed text-orange-600' : 'bg-orange-100 border-orange-300 text-orange-700', 
          icon: Clock 
        };
      case 'overtime_double_up':
        return { 
          label: 'OT - Double Up', 
          color: isPending ? 'bg-amber-50 border-amber-200 border-dashed text-amber-600' : 'bg-amber-100 border-amber-300 text-amber-700', 
          icon: Clock 
        };
      case 'holiday':
        return { 
          label: 'Holiday', 
          color: isPending ? 'bg-green-50 border-green-200 border-dashed text-green-600' : 'bg-green-100 border-green-300 text-green-700', 
          icon: Palmtree 
        };
      case 'shift_swap':
        return { 
          label: 'Shift Swap', 
          color: isPending ? 'bg-blue-50 border-blue-200 border-dashed text-blue-600' : 'bg-blue-100 border-blue-300 text-blue-700', 
          icon: RefreshCw 
        };
      default:
        return { 
          label: 'Request', 
          color: isPending ? 'bg-gray-50 border-gray-200 border-dashed text-gray-600' : 'bg-gray-100 border-gray-300 text-gray-700', 
          icon: Send 
        };
    }
  };

  // Check if staff has a holiday request for a specific day (coverage issue)
  const hasHolidayRequestForDay = (userId: string, day: Date) => {
    return staffRequests.some(r => {
      if (r.user_id !== userId) return false;
      if (r.request_type !== 'holiday') return false;
      if (r.status === 'rejected') return false;
      const start = parseISO(r.start_date);
      const end = parseISO(r.end_date);
      return isWithinInterval(day, { start, end }) || isSameDay(day, start) || isSameDay(day, end);
    });
  };

  const calculateScheduleCost = (schedule: Schedule) => {
    if (!schedule.hourly_rate) return null;
    const hours = differenceInHours(parseISO(schedule.end_datetime), parseISO(schedule.start_datetime));
    return hours * schedule.hourly_rate;
  };

  const filteredStaff = selectedStaff && selectedStaff !== "all"
    ? staffMembers.filter(s => s.user_id === selectedStaff)
    : staffMembers;

  return (
    <div className="space-y-6">
      {/* Header Controls */}
      <Card>
        <CardContent className="py-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" onClick={() => navigateWeek("prev")}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="font-medium min-w-[200px] text-center">
                {format(currentWeekStart, "MMM d")} - {format(endOfWeek(currentWeekStart, { weekStartsOn: 1 }), "MMM d, yyyy")}
              </span>
              <Button variant="outline" size="icon" onClick={() => navigateWeek("next")}>
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setCurrentWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }))}>
                Today
              </Button>
            </div>

            <div className="flex items-center gap-2">
              {/* View Mode Toggle */}
              <div className="flex border rounded-md">
                <Button
                  variant={viewMode === "staff" ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setViewMode("staff")}
                  className="rounded-r-none"
                >
                  <Users className="h-4 w-4 mr-1" />
                  Staff View
                </Button>
                <Button
                  variant={viewMode === "client" ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setViewMode("client")}
                  className="rounded-l-none"
                >
                  <Building2 className="h-4 w-4 mr-1" />
                  Client View
                </Button>
              </div>
            </div>

            <div className="flex items-center gap-4">
              {viewMode === "staff" && (
                <Select value={selectedStaff} onValueChange={setSelectedStaff}>
                  <SelectTrigger className="w-[200px]">
                    <SelectValue placeholder="All Staff" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Staff</SelectItem>
                    {staffMembers.map(staff => (
                      <SelectItem key={staff.user_id} value={staff.user_id}>
                        {staff.display_name || staff.email}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}

              {/* Recurring Schedule Dialog */}
              <Dialog open={isRecurringDialogOpen} onOpenChange={setIsRecurringDialogOpen}>
                <DialogTrigger asChild>
                  <Button>
                    <Repeat className="h-4 w-4 mr-2" />
                    Add Schedule
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>Create Recurring Schedule</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div>
                      <Label>Staff Member</Label>
                      <Select value={recurringForm.user_id} onValueChange={v => setRecurringForm(p => ({ ...p, user_id: v }))}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select staff" />
                        </SelectTrigger>
                        <SelectContent className="bg-background z-50">
                          {staffMembers.map(staff => (
                            <SelectItem key={staff.user_id} value={staff.user_id}>
                              {staff.display_name || staff.email}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Client</Label>
                      <Select value={recurringForm.client_name} onValueChange={v => setRecurringForm(p => ({ ...p, client_name: v }))}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select client" />
                        </SelectTrigger>
                        <SelectContent className="bg-background z-50">
                          {clients.map(client => (
                            <SelectItem key={client.id} value={client.name}>
                              {client.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {clients.length === 0 && (
                        <p className="text-xs text-muted-foreground mt-1">No clients found. Add clients in the system first.</p>
                      )}
                    </div>
                    
                    {/* Recurrence Interval */}
                    <div>
                      <Label>Schedule Type</Label>
                      <Select 
                        value={recurringForm.recurrence_interval} 
                        onValueChange={v => setRecurringForm(p => ({ ...p, recurrence_interval: v as 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'one_off' }))}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-background z-50">
                          <SelectItem value="one_off">One-off shift</SelectItem>
                          <SelectItem value="daily">Every day</SelectItem>
                          <SelectItem value="weekly">Every week</SelectItem>
                          <SelectItem value="biweekly">Every other week</SelectItem>
                          <SelectItem value="monthly">Every month (same week)</SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground mt-1">
                        {recurringForm.recurrence_interval === 'one_off' && 'A single shift or series of consecutive days'}
                        {recurringForm.recurrence_interval === 'daily' && 'The shift will repeat every single day'}
                        {recurringForm.recurrence_interval === 'weekly' && 'The shift will repeat on selected days every week'}
                        {recurringForm.recurrence_interval === 'biweekly' && 'The shift will repeat on selected days every other week'}
                        {recurringForm.recurrence_interval === 'monthly' && 'The shift will repeat on selected days in the same week of each month'}
                      </p>
                    </div>

                    {/* Select Days - hide for daily and one_off recurrence */}
                    {recurringForm.recurrence_interval !== 'daily' && recurringForm.recurrence_interval !== 'one_off' && (
                      <div>
                        <Label>Select Days</Label>
                        <div className="flex flex-wrap gap-2 mt-2">
                          {DAYS_OF_WEEK.map(day => (
                            <Button
                              key={day.value}
                              type="button"
                              variant={recurringForm.selected_days.includes(day.value) ? "default" : "outline"}
                              size="sm"
                              onClick={() => toggleRecurringDay(day.value)}
                            >
                              {day.label}
                            </Button>
                          ))}
                        </div>
                      </div>
                    )}
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label>Start Time</Label>
                        <Input
                          type="time"
                          value={recurringForm.start_time}
                          onChange={e => setRecurringForm(p => ({ ...p, start_time: e.target.value }))}
                        />
                      </div>
                      <div>
                        <Label>End Time</Label>
                        <Input
                          type="time"
                          value={recurringForm.end_time}
                          onChange={e => setRecurringForm(p => ({ ...p, end_time: e.target.value }))}
                        />
                      </div>
                    </div>
                    
                    {/* Start Date */}
                    <div className={recurringForm.recurrence_interval === 'one_off' ? 'grid grid-cols-2 gap-4' : ''}>
                      <div>
                        <Label>{recurringForm.recurrence_interval === 'one_off' ? 'Start Date' : 'Start Date'}</Label>
                        <Input
                          type="date"
                          value={recurringForm.start_date}
                          onChange={e => setRecurringForm(p => ({ ...p, start_date: e.target.value }))}
                        />
                      </div>
                      {recurringForm.recurrence_interval === 'one_off' && (
                        <div>
                          <Label>End Date</Label>
                          <Input
                            type="date"
                            value={recurringForm.end_date}
                            min={recurringForm.start_date}
                            onChange={e => setRecurringForm(p => ({ ...p, end_date: e.target.value }))}
                          />
                          <p className="text-xs text-muted-foreground mt-1">
                            Leave same as start date for a single day shift
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Indefinite Toggle - hide for one_off */}
                    {recurringForm.recurrence_interval !== 'one_off' && (
                      <div className="flex items-center space-x-2 p-3 border rounded-md bg-muted/30">
                        <Checkbox
                          id="is_indefinite"
                          checked={recurringForm.is_indefinite}
                          onCheckedChange={(checked) => setRecurringForm(p => ({ ...p, is_indefinite: checked === true }))}
                        />
                        <div className="flex-1">
                          <Label htmlFor="is_indefinite" className="text-sm font-medium cursor-pointer flex items-center gap-2">
                            <Infinity className="h-4 w-4" />
                            Run indefinitely (never-ending)
                          </Label>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            Shifts will automatically appear on any future week
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Number of Weeks - only show if not indefinite and not one_off */}
                    {!recurringForm.is_indefinite && recurringForm.recurrence_interval !== 'one_off' && (
                      <div>
                        <Label>Number of Weeks</Label>
                        <Select 
                          value={recurringForm.weeks_to_create.toString()} 
                          onValueChange={v => setRecurringForm(p => ({ ...p, weeks_to_create: parseInt(v) }))}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="bg-background z-50">
                            <SelectItem value="1">1 week</SelectItem>
                            <SelectItem value="2">2 weeks</SelectItem>
                            <SelectItem value="4">4 weeks</SelectItem>
                            <SelectItem value="8">8 weeks</SelectItem>
                            <SelectItem value="12">12 weeks</SelectItem>
                            <SelectItem value="26">26 weeks (6 months)</SelectItem>
                            <SelectItem value="52">52 weeks (1 year)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    )}

                    {/* Overtime Toggle */}
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="is_overtime"
                        checked={recurringForm.is_overtime}
                        onCheckedChange={(checked) => setRecurringForm(p => ({ ...p, is_overtime: checked === true }))}
                      />
                      <Label htmlFor="is_overtime" className="text-sm font-normal cursor-pointer">
                        Mark as overtime
                      </Label>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label>Hourly Rate (optional)</Label>
                        <Input
                          type="number"
                          step="0.01"
                          value={recurringForm.hourly_rate}
                          onChange={e => setRecurringForm(p => ({ ...p, hourly_rate: e.target.value }))}
                          placeholder="0.00"
                        />
                      </div>
                      <div>
                        <Label>Currency</Label>
                        <Select value={recurringForm.currency} onValueChange={v => setRecurringForm(p => ({ ...p, currency: v }))}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="bg-background z-50">
                            <SelectItem value="GBP">GBP</SelectItem>
                            <SelectItem value="USD">USD</SelectItem>
                            <SelectItem value="EUR">EUR</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div>
                      <Label>Notes (optional)</Label>
                      <Textarea
                        value={recurringForm.notes}
                        onChange={e => setRecurringForm(p => ({ ...p, notes: e.target.value }))}
                        placeholder="Add any notes..."
                      />
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {recurringForm.recurrence_interval === 'one_off' ? (
                        (() => {
                          const start = parseISO(recurringForm.start_date);
                          const end = parseISO(recurringForm.end_date);
                          const days = eachDayOfInterval({ start, end }).length;
                          return `This will create ${days} ${recurringForm.is_overtime ? 'overtime' : 'schedule'} ${days === 1 ? 'entry' : 'entries'} from ${format(start, "MMM d, yyyy")}${days > 1 ? ` to ${format(end, "MMM d, yyyy")}` : ''}`;
                        })()
                      ) : recurringForm.is_indefinite ? (
                        <span className="flex items-center gap-1">
                          <Infinity className="h-3 w-3" />
                          This will create a never-ending pattern starting from {recurringForm.start_date ? format(parseISO(recurringForm.start_date), "MMM d, yyyy") : "today"}
                        </span>
                      ) : (
                        `This will create ${(recurringForm.recurrence_interval === 'daily' ? 7 : recurringForm.selected_days.length) * recurringForm.weeks_to_create} ${recurringForm.is_overtime ? 'overtime' : 'schedule'} entries starting from ${recurringForm.start_date ? format(parseISO(recurringForm.start_date), "MMM d, yyyy") : "today"}`
                      )}
                    </div>
                    <Button 
                      onClick={() => createRecurringScheduleMutation.mutate(recurringForm)}
                      disabled={!recurringForm.user_id || !recurringForm.client_name || (recurringForm.recurrence_interval !== 'daily' && recurringForm.recurrence_interval !== 'one_off' && recurringForm.selected_days.length === 0)}
                      className="w-full"
                    >
                      {recurringForm.recurrence_interval === 'one_off' ? (
                        `Create ${recurringForm.is_overtime ? 'Overtime' : 'Shift'}`
                      ) : recurringForm.is_indefinite ? (
                        <>
                          <Infinity className="h-4 w-4 mr-2" />
                          Create Indefinite Pattern
                        </>
                      ) : (
                        `Create Recurring ${recurringForm.is_overtime ? 'Overtime' : 'Schedule'}`
                      )}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Gantt-style Timeline */}
      <Card>
        <CardHeader>
          <CardTitle>
            {viewMode === "staff" ? "Staff Schedule Timeline" : "Client Schedule Timeline"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <div className="min-w-[900px]">
              {/* Header Row */}
              <div className="grid grid-cols-8 gap-1 mb-2">
                <div className="font-medium text-sm text-muted-foreground p-2">
                  {viewMode === "staff" ? "Staff" : "Client"}
                </div>
                {weekDays.map(day => (
                  <div key={day.toISOString()} className="font-medium text-sm text-center p-2 bg-muted rounded">
                    <div>{format(day, "EEE")}</div>
                    <div className="text-xs">{format(day, "d MMM")}</div>
                  </div>
                ))}
              </div>

              {/* Staff View */}
              {viewMode === "staff" && filteredStaff.map(staff => (
                <div key={staff.user_id} className="grid grid-cols-8 gap-1 mb-1">
                  <div className="p-2 text-sm font-medium truncate border-r">
                    {staff.display_name || staff.email}
                  </div>
                  {weekDays.map(day => {
                    const daySchedules = getSchedulesForStaffDay(staff.user_id, day);
                    const dayOvertime = getOvertimeForStaffDay(staff.user_id, day);
                    const onHoliday = isStaffOnHoliday(staff.user_id, day);
                    const holidayInfo = getHolidayInfo(staff.user_id, day);

                    return (
                      <div 
                        key={day.toISOString()} 
                        className={`min-h-[80px] p-1 rounded border ${onHoliday ? 'bg-amber-50 border-amber-200' : 'bg-background border-border'}`}
                      >
                        {onHoliday && (
                          <div className="flex items-center gap-1 text-xs text-amber-700 mb-1">
                            <Palmtree className="h-3 w-3" />
                            <span className="capitalize">{holidayInfo?.absence_type || 'Holiday'}</span>
                            {holidayInfo?.status === 'pending' && (
                              <Badge variant="outline" className="text-[10px] py-0 px-1">Pending</Badge>
                            )}
                          </div>
                        )}
                        
                        {daySchedules.map(schedule => {
                          const cost = calculateScheduleCost(schedule);
                          const isFromPattern = schedule.id.startsWith('pattern-');
                          const isPatternOvertime = schedule.is_pattern_overtime;
                          const hasCoverageIssue = hasHolidayRequestForDay(staff.user_id, day);
                          
                          return (
                            <div 
                              key={schedule.id} 
                              className={`rounded p-1 mb-1 text-xs group relative cursor-pointer hover:ring-2 hover:ring-primary/50 ${
                                hasCoverageIssue
                                  ? 'bg-red-100 border-2 border-red-400 text-red-800'
                                  : isFromPattern 
                                    ? isPatternOvertime
                                      ? 'bg-orange-50 border border-orange-300'
                                      : 'bg-violet-50 border border-violet-300' 
                                    : 'bg-primary/10 border border-primary/30'
                              }`}
                              onClick={() => handleScheduleClick(schedule.id)}
                            >
                              {hasCoverageIssue && (
                                <div className="flex items-center gap-1 text-red-700 font-medium mb-0.5">
                                  <AlertTriangle className="h-3 w-3" />
                                  <span className="text-[10px]">Needs cover</span>
                                </div>
                              )}
                              <div className="font-medium truncate flex items-center gap-1">
                                {schedule.client_name}
                                {isFromPattern && !hasCoverageIssue && (
                                  <Infinity className={`h-3 w-3 ${isPatternOvertime ? 'text-orange-500' : 'text-violet-500'}`} />
                                )}
                                {isPatternOvertime && !hasCoverageIssue && (
                                  <Clock className="h-3 w-3 text-orange-500" />
                                )}
                              </div>
                              <div className={hasCoverageIssue ? 'text-red-600' : 'text-muted-foreground'}>
                                {format(parseISO(schedule.start_datetime), "HH:mm")} - {format(parseISO(schedule.end_datetime), "HH:mm")}
                              </div>
                              {cost !== null && (
                                <div className={hasCoverageIssue ? 'text-red-600' : 'text-muted-foreground'}>
                                  {schedule.currency} {cost.toFixed(2)}
                                </div>
                              )}
                              {schedule.notes && (
                                <div className={`italic truncate ${hasCoverageIssue ? 'text-red-600' : 'text-muted-foreground'}`}>{schedule.notes}</div>
                              )}
                              <Button
                                variant="ghost"
                                size="icon"
                                className="absolute top-0 right-0 h-5 w-5 opacity-0 group-hover:opacity-100"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeleteClick(schedule.id);
                                }}
                              >
                                <Trash2 className="h-3 w-3 text-destructive" />
                              </Button>
                            </div>
                          );
                        })}

                        {dayOvertime.map(ot => (
                          <div 
                            key={ot.id} 
                            className="bg-orange-100 border border-orange-300 rounded p-1 mb-1 text-xs group relative"
                          >
                            <div className="flex items-center gap-1 font-medium text-orange-700">
                              <Clock className="h-3 w-3" />
                              {ot.hours}h overtime
                            </div>
                            {ot.hourly_rate && (
                              <div className="text-orange-600">
                                {ot.currency} {(ot.hours * ot.hourly_rate).toFixed(2)}
                              </div>
                            )}
                            {ot.notes && (
                              <div className="text-orange-600 italic truncate">{ot.notes}</div>
                            )}
                            <Button
                              variant="ghost"
                              size="icon"
                              className="absolute top-0 right-0 h-5 w-5 opacity-0 group-hover:opacity-100"
                              onClick={() => deleteOvertimeMutation.mutate(ot.id)}
                            >
                              <Trash2 className="h-3 w-3 text-destructive" />
                            </Button>
                          </div>
                        ))}

                        {/* Staff Requests (Overtime, Holiday, Shift Swap) */}
                        {getRequestsForStaffDay(staff.user_id, day).map(request => {
                          const typeInfo = getRequestTypeInfo(request.request_type, request.status);
                          const IconComponent = typeInfo.icon;
                          return (
                            <div 
                              key={request.id} 
                              className={`${typeInfo.color} border rounded p-1 mb-1 text-xs`}
                            >
                              <div className="flex items-center gap-1 font-medium">
                                <IconComponent className="h-3 w-3 flex-shrink-0" />
                                <span className="truncate">{typeInfo.label}</span>
                              </div>
                              {request.request_type === 'shift_swap' && request.swap_with_user_id && (
                                <div className="text-[10px] truncate">
                                  with {getStaffName(request.swap_with_user_id)}
                                </div>
                              )}
                              {request.details && (
                                <div className="text-[10px] italic truncate">{request.details}</div>
                              )}
                            </div>
                          );
                        })}

                        {!onHoliday && daySchedules.length === 0 && dayOvertime.length === 0 && getRequestsForStaffDay(staff.user_id, day).length === 0 && (
                          <div className="text-xs text-muted-foreground italic flex items-center justify-center h-full">
                            No schedule
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}

              {/* Client View */}
              {viewMode === "client" && uniqueClients.map(clientName => (
                <div key={clientName} className="grid grid-cols-8 gap-1 mb-1">
                  <div className="p-2 text-sm font-medium truncate border-r">
                    {clientName}
                  </div>
                  {weekDays.map(day => {
                    const daySchedules = getSchedulesForClientDay(clientName, day);

                    return (
                      <div 
                        key={day.toISOString()} 
                        className="min-h-[80px] p-1 rounded border bg-background border-border"
                      >
                        {daySchedules.map(schedule => {
                          const cost = calculateScheduleCost(schedule);
                          const staffOnHoliday = isStaffOnHoliday(schedule.user_id, day);
                          const isFromPattern = schedule.id.startsWith('pattern-');
                          const isPatternOvertime = schedule.is_pattern_overtime;
                          
                          return (
                            <div 
                              key={schedule.id} 
                              className={`rounded p-1 mb-1 text-xs group relative ${
                                staffOnHoliday 
                                  ? 'bg-amber-100 border border-amber-300' 
                                  : isFromPattern
                                    ? isPatternOvertime
                                      ? 'bg-orange-50 border border-orange-300'
                                      : 'bg-violet-50 border border-violet-300'
                                    : 'bg-primary/10 border border-primary/30'
                              }`}
                            >
                              <div className="font-medium truncate flex items-center gap-1">
                                {getStaffName(schedule.user_id)}
                                {staffOnHoliday && <Palmtree className="h-3 w-3 text-amber-600" />}
                                {isFromPattern && (
                                  <Infinity className={`h-3 w-3 ${isPatternOvertime ? 'text-orange-500' : 'text-violet-500'}`} />
                                )}
                                {isPatternOvertime && <Clock className="h-3 w-3 text-orange-500" />}
                              </div>
                              <div className="text-muted-foreground">
                                {format(parseISO(schedule.start_datetime), "HH:mm")} - {format(parseISO(schedule.end_datetime), "HH:mm")}
                              </div>
                              {cost !== null && (
                                <div className="text-muted-foreground">
                                  {schedule.currency} {cost.toFixed(2)}
                                </div>
                              )}
                              {schedule.notes && (
                                <div className="text-muted-foreground italic truncate">{schedule.notes}</div>
                              )}
                              <Button
                                variant="ghost"
                                size="icon"
                                className="absolute top-0 right-0 h-5 w-5 opacity-0 group-hover:opacity-100"
                                onClick={() => handleDeleteClick(schedule.id)}
                              >
                                <Trash2 className="h-3 w-3 text-destructive" />
                              </Button>
                            </div>
                          );
                        })}

                        {daySchedules.length === 0 && (
                          <div className="text-xs text-muted-foreground italic flex items-center justify-center h-full">
                            No staff
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}

              {viewMode === "staff" && filteredStaff.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  No staff members found
                </div>
              )}

              {viewMode === "client" && uniqueClients.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  No client schedules found for this week
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Legend */}
      <div className="flex flex-wrap gap-4 text-sm">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-primary/10 border border-primary/30" />
          <span>Scheduled Shift</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-violet-50 border border-violet-300" />
          <span className="flex items-center gap-1">Recurring Shift <Infinity className="h-3 w-3 text-violet-500" /></span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-orange-50 border border-orange-300" />
          <span className="flex items-center gap-1">Recurring Overtime <Infinity className="h-3 w-3 text-orange-500" /> <Clock className="h-3 w-3 text-orange-500" /></span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-orange-100 border border-orange-300" />
          <span>One-off Overtime</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-amber-50 border border-amber-200" />
          <span>Holiday/Absence</span>
        </div>
      </div>

      {/* Delete Confirmation Dialog for Recurring Shifts */}
      <AlertDialog open={isDeleteConfirmOpen} onOpenChange={setIsDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Recurring Shift</AlertDialogTitle>
            <AlertDialogDescription>
              This shift is part of a recurring pattern. Would you like to delete just this shift or the entire series?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col sm:flex-row gap-2">
            <AlertDialogCancel onClick={() => setDeleteTarget(null)}>Cancel</AlertDialogCancel>
            <Button 
              variant="outline"
              onClick={() => handleDeleteConfirm(false)}
            >
              Delete Just This Shift
            </Button>
            <AlertDialogAction 
              onClick={() => handleDeleteConfirm(true)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete Entire Series
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Edit Recurring Pattern Dialog */}
      <Dialog open={isEditPatternDialogOpen} onOpenChange={setIsEditPatternDialogOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Recurring Schedule</DialogTitle>
            <DialogDescription>
              Modify this recurring shift pattern. Changes will affect all future occurrences.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Staff Member</Label>
              <Select value={editPatternForm.user_id} onValueChange={v => setEditPatternForm(p => ({ ...p, user_id: v }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Select staff" />
                </SelectTrigger>
                <SelectContent className="bg-background z-50">
                  {staffMembers.map(staff => (
                    <SelectItem key={staff.user_id} value={staff.user_id}>
                      {staff.display_name || staff.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Client</Label>
              <Select value={editPatternForm.client_name} onValueChange={v => setEditPatternForm(p => ({ ...p, client_name: v }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Select client" />
                </SelectTrigger>
                <SelectContent className="bg-background z-50">
                  {clients.map(client => (
                    <SelectItem key={client.id} value={client.name}>
                      {client.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            {/* Recurrence Interval */}
            <div>
              <Label>Recurrence Pattern</Label>
              <Select 
                value={editPatternForm.recurrence_interval} 
                onValueChange={v => setEditPatternForm(p => ({ ...p, recurrence_interval: v as 'daily' | 'weekly' | 'biweekly' | 'monthly' }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-background z-50">
                  <SelectItem value="daily">Every day</SelectItem>
                  <SelectItem value="weekly">Every week</SelectItem>
                  <SelectItem value="biweekly">Every other week</SelectItem>
                  <SelectItem value="monthly">Every month (same week)</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">
                {editPatternForm.recurrence_interval === 'daily' && 'The shift will repeat every single day'}
                {editPatternForm.recurrence_interval === 'weekly' && 'The shift will repeat on selected days every week'}
                {editPatternForm.recurrence_interval === 'biweekly' && 'The shift will repeat on selected days every other week'}
                {editPatternForm.recurrence_interval === 'monthly' && 'The shift will repeat on selected days in the same week of each month'}
              </p>
            </div>

            {/* Select Days - hide for daily recurrence */}
            {editPatternForm.recurrence_interval !== 'daily' && (
              <div>
                <Label>Select Days</Label>
                <div className="flex flex-wrap gap-2 mt-2">
                  {DAYS_OF_WEEK.map(day => (
                    <Button
                      key={day.value}
                      type="button"
                      variant={editPatternForm.selected_days.includes(day.value) ? "default" : "outline"}
                      size="sm"
                      onClick={() => toggleEditPatternDay(day.value)}
                    >
                      {day.label}
                    </Button>
                  ))}
                </div>
              </div>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Start Time</Label>
                <Input
                  type="time"
                  value={editPatternForm.start_time}
                  onChange={e => setEditPatternForm(p => ({ ...p, start_time: e.target.value }))}
                />
              </div>
              <div>
                <Label>End Time</Label>
                <Input
                  type="time"
                  value={editPatternForm.end_time}
                  onChange={e => setEditPatternForm(p => ({ ...p, end_time: e.target.value }))}
                />
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Start Date</Label>
                <Input
                  type="date"
                  value={editPatternForm.start_date}
                  onChange={e => setEditPatternForm(p => ({ ...p, start_date: e.target.value }))}
                />
              </div>
              <div>
                <Label>End Date (optional)</Label>
                <Input
                  type="date"
                  value={editPatternForm.end_date}
                  onChange={e => setEditPatternForm(p => ({ ...p, end_date: e.target.value }))}
                />
                <p className="text-xs text-muted-foreground mt-1">Leave empty for indefinite</p>
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="edit_is_overtime"
                checked={editPatternForm.is_overtime}
                onCheckedChange={(checked) => setEditPatternForm(p => ({ ...p, is_overtime: checked === true }))}
              />
              <Label htmlFor="edit_is_overtime" className="text-sm font-normal cursor-pointer">
                Mark as overtime
              </Label>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Hourly Rate (optional)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={editPatternForm.hourly_rate}
                  onChange={e => setEditPatternForm(p => ({ ...p, hourly_rate: e.target.value }))}
                  placeholder="0.00"
                />
              </div>
              <div>
                <Label>Currency</Label>
                <Select value={editPatternForm.currency} onValueChange={v => setEditPatternForm(p => ({ ...p, currency: v }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-background z-50">
                    <SelectItem value="GBP">GBP</SelectItem>
                    <SelectItem value="USD">USD</SelectItem>
                    <SelectItem value="EUR">EUR</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Notes (optional)</Label>
              <Textarea
                value={editPatternForm.notes}
                onChange={e => setEditPatternForm(p => ({ ...p, notes: e.target.value }))}
                placeholder="Add any notes..."
              />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setIsEditPatternDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={() => editingPattern && updatePatternMutation.mutate({ ...editPatternForm, id: editingPattern.id })}
              disabled={!editPatternForm.user_id || !editPatternForm.client_name || (editPatternForm.recurrence_interval !== 'daily' && editPatternForm.selected_days.length === 0) || updatePatternMutation.isPending}
            >
              {updatePatternMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
