import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useIsMobile } from "@/hooks/use-mobile";
import { useSchedulingRole } from "@/hooks/useSchedulingRole";
import { useAuth } from "@/hooks/useAuth";
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { format, addDays, startOfWeek, endOfWeek, eachDayOfInterval, isWithinInterval, parseISO, differenceInHours, getDay, addWeeks, parse, isBefore, isAfter, isSameDay, differenceInWeeks, getDate, addMonths, startOfDay, endOfDay, subDays } from "date-fns";
import { Plus, ChevronLeft, ChevronRight, ChevronDown, Clock, Palmtree, Trash2, Users, Building2, Repeat, Infinity, RefreshCw, Send, AlertTriangle, Calendar, Link2, Check, X } from "lucide-react";
import { UnifiedShiftEditor, ShiftToEdit } from "./UnifiedShiftEditor";
import { LiveTimelineView } from "./LiveTimelineView";

interface Schedule {
  id: string;
  user_id: string;
  client_name: string;
  start_datetime: string;
  end_datetime: string;
  notes: string | null;
  hourly_rate: number | null;
  currency: string;
  shift_type: string | null;
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
  no_cover_required: boolean;
  days_taken: number;
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
  shift_type: string | null;
}

interface Client {
  id: string;
  name: string;
}

interface StaffRequest {
  id: string;
  user_id: string;
  request_type: 'overtime_standard' | 'overtime_double_up' | 'overtime' | 'holiday' | 'holiday_paid' | 'holiday_unpaid' | 'shift_swap';
  swap_with_user_id: string | null;
  start_date: string;
  end_date: string;
  days_requested: number;
  details: string | null;
  status: string;
  linked_holiday_id: string | null;
}

type ViewMode = "staff" | "client";

const SHIFT_TYPES = [
  "Call Monitoring",
  "Supervisions",
  "Floating Support",
  "General Admin",
  "Bench"
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
  "Bench": { 
    bg: "bg-amber-100", 
    border: "border-amber-300", 
    text: "text-amber-900",
    badge: "bg-amber-500 text-white"
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

const DAYS_OF_WEEK = [
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
  { value: 0, label: "Sun" },
];

// Client share button component
const ClientShareButton = ({ clientName }: { clientName: string }) => {
  const [copied, setCopied] = useState(false);
  
  const handleCopyLink = (e: React.MouseEvent) => {
    e.stopPropagation();
    const url = `${window.location.origin}/public/schedule/${encodeURIComponent(clientName)}`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    toast.success("Schedule link copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  };
  
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={handleCopyLink}
      className="h-6 px-2 text-xs"
    >
      {copied ? (
        <>
          <Check className="h-3 w-3 mr-1" />
          Copied
        </>
      ) : (
        <>
          <Link2 className="h-3 w-3 mr-1" />
          Share
        </>
      )}
    </Button>
  );
};

export function StaffScheduleManager() {
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();
  const { user } = useAuth();
  const { canEditSchedule, isAdmin } = useSchedulingRole();
  const scheduleEditHint = canEditSchedule 
    ? (isMobile ? "Tap to edit" : "Double-click to edit")
    : "View only";
  const [currentWeekStart, setCurrentWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [showLiveView, setShowLiveView] = useState(false);
  const [isRecurringDialogOpen, setIsRecurringDialogOpen] = useState(false);
  const [isEditPatternDialogOpen, setIsEditPatternDialogOpen] = useState(false);
  const [editingPattern, setEditingPattern] = useState<RecurringPattern | null>(null);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; isPattern: boolean; patternId?: string; exceptionDate?: string } | null>(null);
  const [selectedStaff, setSelectedStaff] = useState<string[]>([]);
  const [selectedClient, setSelectedClient] = useState<string[]>([]);
  const [staffSearch, setStaffSearch] = useState("");
  const [clientSearch, setClientSearch] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("staff");
  
  // Unified shift editor state
  const [isUnifiedEditorOpen, setIsUnifiedEditorOpen] = useState(false);
  const [shiftToEdit, setShiftToEdit] = useState<ShiftToEdit | null>(null);
  
  const [isEditScheduleDialogOpen, setIsEditScheduleDialogOpen] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<Schedule | null>(null);
  const [editScheduleForm, setEditScheduleForm] = useState({
    client_name: "",
    start_time: "09:00",
    end_time: "17:00",
    notes: "",
    shift_type: "",
    is_overtime: false
  });

  const [isEditOvertimeDialogOpen, setIsEditOvertimeDialogOpen] = useState(false);
  const [editingOvertime, setEditingOvertime] = useState<Overtime | null>(null);
  const [editOvertimeForm, setEditOvertimeForm] = useState({
    client_name: "",
    start_time: "09:00",
    end_time: "17:00",
    hourly_rate: "",
    currency: "GBP",
    notes: "",
  });

  // Holiday edit state
  const [isEditHolidayDialogOpen, setIsEditHolidayDialogOpen] = useState(false);
  const [editingHoliday, setEditingHoliday] = useState<Holiday | null>(null);
  const [isViewingHoliday, setIsViewingHoliday] = useState(true);
  const [editHolidayForm, setEditHolidayForm] = useState({
    absence_type: 'holiday',
    start_date: '',
    end_date: '',
    days_taken: 1,
    notes: '',
    no_cover_required: false
  });
  const [isDeleteHolidayConfirmOpen, setIsDeleteHolidayConfirmOpen] = useState(false);

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
    recurrence_interval: "weekly" as 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'one_off',
    shift_type: ""
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
    recurrence_interval: "weekly" as 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'one_off',
    shift_type: ""
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

  // Fetch current user's client assignments (for non-admin filtering)
  const { data: myClientAssignments = [] } = useQuery({
    queryKey: ["my-client-assignments", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data, error } = await supabase
        .from("staff_client_assignments")
        .select("client_name")
        .eq("staff_user_id", user.id);
      
      if (error) throw error;
      return data.map(a => a.client_name);
    },
    enabled: !!user?.id && !isAdmin
  });

  // Fetch all staff-client assignments to determine which staff share clients with current user
  const { data: allClientAssignments = [] } = useQuery({
    queryKey: ["all-client-assignments"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("staff_client_assignments")
        .select("staff_user_id, client_name");
      
      if (error) throw error;
      return data as { staff_user_id: string; client_name: string }[];
    },
    enabled: !isAdmin
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
  const { data: holidays = [], refetch: refetchHolidays } = useQuery({
    queryKey: ["staff-holidays-for-schedule", currentWeekStart.toISOString()],
    queryFn: async () => {
      const weekEnd = endOfWeek(currentWeekStart, { weekStartsOn: 1 });
      const { data, error } = await supabase
        .from("staff_holidays")
        .select("id, user_id, start_date, end_date, status, absence_type, notes, no_cover_required, days_taken")
        .or(`start_date.lte.${format(weekEnd, "yyyy-MM-dd")},end_date.gte.${format(currentWeekStart, "yyyy-MM-dd")}`)
        .in("status", ["approved", "pending"]);
      
      if (error) throw error;
      return data as Holiday[];
    }
  });

  // Fetch staff requests (pending and approved) with linked holiday info
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
      return data as (StaffRequest & { linked_holiday_id: string | null })[];
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
        
        if (recurrenceInterval === 'one_off') {
          // One-off: include if day is in days_of_week and within date range (already checked above)
          shouldInclude = pattern.days_of_week.includes(dayOfWeek);
        } else if (recurrenceInterval === 'daily') {
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
          shift_type: pattern.shift_type,
          is_pattern_overtime: pattern.is_overtime
        });
      }
    }
    
    return virtualSchedules;
  }, [recurringPatterns, weekDays, shiftExceptions]);

  // Combine real schedules with virtual ones from patterns and add bench schedules
  const allSchedules = useMemo(() => {
    // Filter out duplicates - if there's a real schedule at the same time, use that
    const realScheduleKeys = new Set(
      schedules.map(s => `${s.user_id}-${format(parseISO(s.start_datetime), "yyyy-MM-dd-HH:mm")}`)
    );
    
    const uniqueVirtual = virtualSchedulesFromPatterns.filter(vs => {
      const key = `${vs.user_id}-${format(parseISO(vs.start_datetime), "yyyy-MM-dd-HH:mm")}`;
      return !realScheduleKeys.has(key);
    });
    
    const combinedSchedules = [...schedules, ...uniqueVirtual];
    
    // Generate bench schedules for staff with no assignments for full weeks (Mon-Fri)
    const benchSchedules: Schedule[] = [];
    const weekdaysDates = weekDays.filter(day => {
      const dayOfWeek = getDay(day);
      return dayOfWeek >= 1 && dayOfWeek <= 5; // Monday = 1, Friday = 5
    });
    
    // Only proceed if we have a full Mon-Fri week
    if (weekdaysDates.length === 5) {
      for (const staff of staffMembers) {
        // Check if staff has NO schedules at all for any weekday this week
        const hasAnyScheduleThisWeek = weekdaysDates.some(day => {
          const dateStr = format(day, "yyyy-MM-dd");
          return combinedSchedules.some(s => {
            if (s.user_id !== staff.user_id) return false;
            const scheduleDate = format(parseISO(s.start_datetime), "yyyy-MM-dd");
            return scheduleDate === dateStr;
          });
        });
        
        // Also check if they're on holiday any day this week
        const isOnHolidayAnyDay = weekdaysDates.some(day => {
          return holidays.some(h => {
            if (h.user_id !== staff.user_id) return false;
            const start = startOfDay(parseISO(h.start_date));
            const end = endOfDay(parseISO(h.end_date));
            return isWithinInterval(day, { start, end });
          });
        });
        
        // Check if they're covering someone else's shift (shift_swap or overtime with linked_holiday)
        const isCoveringAnyDay = weekdaysDates.some(day => {
          return staffRequests.some(r => {
            if (r.user_id !== staff.user_id) return false;
            if (r.status !== 'approved') return false;
            // Check shift_swap requests
            if (r.request_type === 'shift_swap' && r.swap_with_user_id) {
              const start = startOfDay(parseISO(r.start_date));
              const end = endOfDay(parseISO(r.end_date));
              return isWithinInterval(day, { start, end });
            }
            // Check overtime covering holiday
            if (['overtime', 'overtime_standard', 'overtime_double_up'].includes(r.request_type) && r.linked_holiday_id) {
              const start = startOfDay(parseISO(r.start_date));
              const end = endOfDay(parseISO(r.end_date));
              return isWithinInterval(day, { start, end });
            }
            return false;
          });
        });
        
        // If no schedules, not on holiday, and not covering anyone, add bench schedules
        if (!hasAnyScheduleThisWeek && !isOnHolidayAnyDay && !isCoveringAnyDay) {
          for (const day of weekdaysDates) {
            const dateStr = format(day, "yyyy-MM-dd");
            benchSchedules.push({
              id: `bench-${staff.user_id}-${dateStr}`,
              user_id: staff.user_id,
              client_name: "Care Cuddle",
              start_datetime: `${dateStr}T09:00:00`,
              end_datetime: `${dateStr}T17:00:00`,
              notes: "Default bench assignment",
              hourly_rate: null,
              currency: "GBP",
              shift_type: "Bench"
            });
          }
        }
      }
    }
    
    return [...combinedSchedules, ...benchSchedules];
  }, [schedules, virtualSchedulesFromPatterns, staffMembers, weekDays, holidays, staffRequests]);

  // Get unique clients - combine clients from database AND schedules (sorted alphabetically)
  const uniqueClients = useMemo(() => {
    // Start with all clients from the database
    const clientSet = new Set(clients.map(c => c.name));
    // Also add any clients from schedules (for backwards compatibility with any data inconsistencies)
    allSchedules.forEach(s => clientSet.add(s.client_name));
    return Array.from(clientSet).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  }, [clients, allSchedules]);

  // Filter clients for non-admins: only show clients they are assigned to
  const visibleClients = useMemo(() => {
    if (isAdmin) return uniqueClients;
    if (!user?.id) return [];
    
    // Only show clients the user is assigned to
    const myClients = new Set(myClientAssignments);
    return uniqueClients.filter(clientName => myClients.has(clientName));
  }, [isAdmin, user?.id, uniqueClients, myClientAssignments]);

  // Filter staff members for non-admins: only show staff who share a client or are the current user
  const visibleStaffMembers = useMemo(() => {
    if (isAdmin) return staffMembers;
    if (!user?.id) return [];

    // Get staff IDs who share at least one client with the current user
    const myClients = new Set(myClientAssignments);
    const staffWithSharedClients = new Set<string>();
    
    // Always include the current user
    staffWithSharedClients.add(user.id);
    
    // Add staff who are assigned to any of my clients
    for (const assignment of allClientAssignments) {
      if (myClients.has(assignment.client_name)) {
        staffWithSharedClients.add(assignment.staff_user_id);
      }
    }
    
    // Also include staff who have schedules at my clients (from allSchedules)
    // This catches "covering" staff who may not be assigned but have shifts
    for (const schedule of allSchedules) {
      if (myClients.has(schedule.client_name)) {
        staffWithSharedClients.add(schedule.user_id);
      }
    }

    return staffMembers.filter(s => staffWithSharedClients.has(s.user_id));
  }, [isAdmin, user?.id, staffMembers, myClientAssignments, allClientAssignments, allSchedules]);

  // Create recurring schedule mutation - ALL shifts are stored as patterns for consistent editing
  const createRecurringScheduleMutation = useMutation({
    mutationFn: async (data: typeof recurringForm) => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error("Not authenticated");

      // Calculate end date based on recurrence type
      let endDate: string | null = null;
      let daysOfWeek: number[] = [];

      if (data.recurrence_interval === 'one_off') {
        // One-off: end_date = end of date range, days = all days of week for the date range
        endDate = data.end_date;
        // Get unique days of week for the date range
        const startDate = parseISO(data.start_date);
        const endDateParsed = parseISO(data.end_date);
        const daysInRange = eachDayOfInterval({ start: startDate, end: endDateParsed });
        daysOfWeek = [...new Set(daysInRange.map(day => getDay(day)))];
      } else if (data.recurrence_interval === 'daily') {
        // Daily: all days
        daysOfWeek = [0, 1, 2, 3, 4, 5, 6];
        endDate = data.is_indefinite ? null : calculateEndDateFromWeeks(data.start_date, data.weeks_to_create);
      } else {
        // Weekly/biweekly/monthly: use selected days
        daysOfWeek = data.selected_days;
        endDate = data.is_indefinite ? null : calculateEndDateFromWeeks(data.start_date, data.weeks_to_create);
      }

      // Store as a pattern - this gives consistent editing experience
      const { error } = await supabase.from("recurring_shift_patterns").insert({
        user_id: data.user_id,
        client_name: data.client_name,
        days_of_week: daysOfWeek,
        start_time: data.start_time,
        end_time: data.end_time,
        hourly_rate: data.hourly_rate ? parseFloat(data.hourly_rate) : null,
        currency: data.currency,
        is_overtime: data.is_overtime,
        notes: data.notes || null,
        start_date: data.start_date,
        end_date: endDate,
        created_by: userData.user.id,
        recurrence_interval: data.recurrence_interval,
        shift_type: data.shift_type || null
      });

      if (error) throw error;
      
      return { 
        type: 'pattern', 
        indefinite: data.is_indefinite,
        one_off: data.recurrence_interval === 'one_off'
      };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["staff-schedules"] });
      queryClient.invalidateQueries({ queryKey: ["staff-overtime"] });
      queryClient.invalidateQueries({ queryKey: ["recurring-shift-patterns"] });
      setIsRecurringDialogOpen(false);
      resetRecurringForm();
      if (result.one_off) {
        toast.success("Created shift pattern");
      } else if (result.indefinite) {
        toast.success("Created indefinite recurring pattern");
      } else {
        toast.success("Created recurring pattern with end date");
      }
    },
    onError: (error) => {
      toast.error("Failed to create schedule: " + error.message);
    }
  });

  // Helper to calculate end date from weeks
  const calculateEndDateFromWeeks = (startDateStr: string, weeks: number): string => {
    const startDate = parseISO(startDateStr);
    const endDate = addWeeks(startDate, weeks);
    return format(endDate, "yyyy-MM-dd");
  };

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
      // Calculate days_of_week based on recurrence interval
      let daysOfWeek: number[];
      if (data.recurrence_interval === 'daily') {
        daysOfWeek = [0, 1, 2, 3, 4, 5, 6];
      } else if (data.recurrence_interval === 'one_off') {
        // For one-off, calculate days from date range
        const startDate = parseISO(data.start_date);
        const endDate = data.end_date ? parseISO(data.end_date) : startDate;
        const daysInRange = eachDayOfInterval({ start: startDate, end: endDate });
        daysOfWeek = [...new Set(daysInRange.map(day => getDay(day)))];
      } else {
        daysOfWeek = data.selected_days;
      }

      const { error } = await supabase
        .from("recurring_shift_patterns")
        .update({
          user_id: data.user_id,
          client_name: data.client_name,
          days_of_week: daysOfWeek,
          start_time: data.start_time,
          end_time: data.end_time,
          hourly_rate: data.hourly_rate ? parseFloat(data.hourly_rate) : null,
          currency: data.currency,
          is_overtime: data.is_overtime,
          notes: data.notes || null,
          start_date: data.start_date,
          end_date: data.end_date || null,
          recurrence_interval: data.recurrence_interval,
          shift_type: data.shift_type || null
        })
        .eq("id", data.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["recurring-shift-patterns"] });
      setIsEditPatternDialogOpen(false);
      setEditingPattern(null);
      toast.success("Pattern updated");
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

  // Delete this and all future shifts from a pattern (set end_date to day before)
  const deleteFutureShiftsMutation = useMutation({
    mutationFn: async ({ patternId, exceptionDate }: { patternId: string; exceptionDate: string }) => {
      const dayBefore = format(subDays(parseISO(exceptionDate), 1), "yyyy-MM-dd");
      const { error } = await supabase
        .from("recurring_shift_patterns")
        .update({ end_date: dayBefore })
        .eq("id", patternId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["recurring-shift-patterns"] });
      queryClient.invalidateQueries({ queryKey: ["public-client-patterns"] });
      toast.success("This and all future shifts deleted");
    },
    onError: (error) => {
      toast.error("Failed to delete future shifts: " + error.message);
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

  // Update schedule mutation
  const updateScheduleMutation = useMutation({
    mutationFn: async (data: { id: string; client_name: string; start_datetime: string; end_datetime: string; notes: string | null; hourly_rate: number | null; currency: string; shift_type: string | null }) => {
      const { error } = await supabase
        .from("staff_schedules")
        .update({
          client_name: data.client_name,
          start_datetime: data.start_datetime,
          end_datetime: data.end_datetime,
          notes: data.notes,
          hourly_rate: data.hourly_rate,
          currency: data.currency,
          shift_type: data.shift_type
        })
        .eq("id", data.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["staff-schedules"] });
      setIsEditScheduleDialogOpen(false);
      setEditingSchedule(null);
      toast.success("Schedule updated");
    },
    onError: (error) => {
      toast.error("Failed to update schedule: " + error.message);
    }
  });

  // Convert schedule to overtime mutation
  const convertToOvertimeMutation = useMutation({
    mutationFn: async (data: { 
      scheduleId: string; 
      user_id: string; 
      overtime_date: string; 
      client_name: string;
      start_time: string;
      end_time: string;
      hourly_rate: number | null; 
      currency: string; 
      notes: string | null 
    }) => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error("Not authenticated");

      // Calculate hours from start/end time
      const [startHour, startMin] = data.start_time.split(':').map(Number);
      const [endHour, endMin] = data.end_time.split(':').map(Number);
      const hours = (endHour + endMin / 60) - (startHour + startMin / 60);

      // Combine client name and notes
      const combinedNotes = data.notes 
        ? `${data.client_name}: ${data.notes}` 
        : data.client_name;

      // Delete the schedule first
      const { error: deleteError } = await supabase
        .from("staff_schedules")
        .delete()
        .eq("id", data.scheduleId);
      
      if (deleteError) throw deleteError;

      // Create the overtime entry
      const { error: insertError } = await supabase
        .from("staff_overtime")
        .insert({
          user_id: data.user_id,
          overtime_date: data.overtime_date,
          hours: hours,
          hourly_rate: data.hourly_rate,
          currency: data.currency,
          notes: combinedNotes,
          created_by: userData.user.id
        });

      if (insertError) throw insertError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["staff-schedules"] });
      queryClient.invalidateQueries({ queryKey: ["staff-overtime"] });
      setIsEditScheduleDialogOpen(false);
      setEditingSchedule(null);
      toast.success("Schedule converted to overtime");
    },
    onError: (error) => {
      toast.error("Failed to convert to overtime: " + error.message);
    }
  });

  // Update overtime mutation
  const updateOvertimeMutation = useMutation({
    mutationFn: async (data: { id: string; hours: number; hourly_rate: number | null; currency: string; client_name: string; notes: string | null }) => {
      // Combine client name and notes into the notes field (format: "ClientName: notes" or just "ClientName")
      const combinedNotes = data.notes 
        ? `${data.client_name}: ${data.notes}` 
        : data.client_name;
      
      const { error } = await supabase
        .from("staff_overtime")
        .update({
          hours: data.hours,
          hourly_rate: data.hourly_rate,
          currency: data.currency,
          notes: combinedNotes,
        })
        .eq("id", data.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["staff-overtime"] });
      setIsEditOvertimeDialogOpen(false);
      setEditingOvertime(null);
      toast.success("Overtime updated");
    },
    onError: (error) => {
      toast.error("Failed to update overtime: " + error.message);
    },
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

  // Helper to parse virtual pattern schedule IDs (format: pattern-{uuid}-{yyyy-MM-dd})
  const parsePatternScheduleId = (id: string): { patternId: string; dateStr: string } | null => {
    if (!id.startsWith('pattern-')) return null;
    const rest = id.slice('pattern-'.length); // Remove 'pattern-' prefix
    // Date is always last 10 chars (yyyy-MM-dd)
    if (rest.length < 11) return null; // Need at least uuid + '-' + date
    const dateStr = rest.slice(-10);
    // Validate date format
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return null;
    // Pattern ID is everything before the last dash and date
    const patternId = rest.slice(0, -(10 + 1)); // Remove '-yyyy-MM-dd'
    if (!patternId) return null;
    return { patternId, dateStr };
  };

  // Handler for delete button clicks - shows confirmation for pattern-based shifts
  const handleDeleteClick = (scheduleId: string) => {
    const parsed = parsePatternScheduleId(scheduleId);
    if (parsed) {
      setDeleteTarget({ id: scheduleId, isPattern: true, patternId: parsed.patternId, exceptionDate: parsed.dateStr });
      setIsDeleteConfirmOpen(true);
    } else {
      // Direct delete for non-pattern schedules
      deleteScheduleMutation.mutate(scheduleId);
    }
  };

  const handleDeleteConfirm = (deleteType: 'single' | 'future' | 'all') => {
    if (!deleteTarget) return;
    
    if (deleteType === 'all' && deleteTarget.patternId) {
      // Delete the entire pattern
      deletePatternMutation.mutate(deleteTarget.patternId);
    } else if (deleteType === 'future' && deleteTarget.patternId && deleteTarget.exceptionDate) {
      // Set end_date to day before this occurrence
      deleteFutureShiftsMutation.mutate({
        patternId: deleteTarget.patternId,
        exceptionDate: deleteTarget.exceptionDate
      });
    } else if (deleteType === 'single' && deleteTarget.patternId && deleteTarget.exceptionDate) {
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
      recurrence_interval: "weekly",
      shift_type: ""
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
      recurrence_interval: (pattern.recurrence_interval || "weekly") as 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'one_off',
      shift_type: pattern.shift_type || ""
    });
    setIsEditPatternDialogOpen(true);
  };

  const handleScheduleClick = (schedule: Schedule) => {
    // Only allow editing for users with edit permissions
    if (!canEditSchedule) {
      return; // View only - do nothing on click
    }
    
    const parsed = parsePatternScheduleId(schedule.id);
    const scheduleDate = parseISO(schedule.start_datetime);
    
    // Use unified editor for all shifts
    setShiftToEdit({
      patternId: parsed?.patternId,
      scheduleId: parsed ? undefined : schedule.id,
      userId: schedule.user_id,
      clientName: schedule.client_name,
      date: scheduleDate,
      startTime: format(scheduleDate, "HH:mm"),
      endTime: format(parseISO(schedule.end_datetime), "HH:mm"),
      shiftType: schedule.shift_type,
      notes: schedule.notes,
      isOvertime: schedule.is_pattern_overtime || false,
    });
    setIsUnifiedEditorOpen(true);
  };

  const handleOvertimeClick = (ot: Overtime) => {
    // Only allow editing for users with edit permissions
    if (!canEditSchedule) {
      return; // View only - do nothing on click
    }
    
    setEditingOvertime(ot);
    // Parse client name from notes (format: "ClientName: notes" or just "ClientName")
    const noteParts = ot.notes?.split(':') || [];
    const clientName = noteParts.length > 0 ? noteParts[0].trim() : '';
    const additionalNotes = noteParts.length > 1 ? noteParts.slice(1).join(':').trim() : '';
    // Calculate times from hours (default 8 hour shift)
    const startHour = 9;
    const endHour = startHour + ot.hours;
    setEditOvertimeForm({
      client_name: clientName,
      start_time: `${String(Math.floor(startHour)).padStart(2, '0')}:00`,
      end_time: `${String(Math.floor(endHour)).padStart(2, '0')}:${String(Math.round((endHour % 1) * 60)).padStart(2, '0')}`,
      hourly_rate: ot.hourly_rate?.toString() || "",
      currency: ot.currency,
      notes: additionalNotes,
    });
    setIsEditOvertimeDialogOpen(true);
  };

  // Holiday click handler
  const handleHolidayClick = (holiday: Holiday) => {
    // Only allow viewing/editing for users with edit permissions
    if (!canEditSchedule) {
      return; // View only - do nothing on click
    }
    
    setEditingHoliday(holiday);
    setEditHolidayForm({
      absence_type: holiday.absence_type,
      start_date: holiday.start_date,
      end_date: holiday.end_date,
      days_taken: holiday.days_taken,
      notes: holiday.notes || '',
      no_cover_required: holiday.no_cover_required
    });
    setIsViewingHoliday(true);
    setIsEditHolidayDialogOpen(true);
  };

  // Update holiday mutation - also syncs to linked staff_requests
  const updateHolidayMutation = useMutation({
    mutationFn: async () => {
      if (!editingHoliday) throw new Error("No holiday selected");
      
      // Update the holiday
      const { error } = await supabase
        .from("staff_holidays")
        .update({
          absence_type: editHolidayForm.absence_type as any,
          start_date: editHolidayForm.start_date,
          end_date: editHolidayForm.end_date,
          days_taken: editHolidayForm.days_taken,
          notes: editHolidayForm.notes || null,
          no_cover_required: editHolidayForm.no_cover_required
        })
        .eq("id", editingHoliday.id);
      
      if (error) throw error;
      
      // Also update any linked staff_requests (by linked_holiday_id)
      const { error: linkedRequestError } = await supabase
        .from("staff_requests")
        .update({
          start_date: editHolidayForm.start_date,
          end_date: editHolidayForm.end_date,
          days_requested: editHolidayForm.days_taken,
          details: editHolidayForm.notes || null
        })
        .eq("linked_holiday_id", editingHoliday.id);
      
      if (linkedRequestError) {
        console.warn("Could not sync holiday update to requests:", linkedRequestError);
      }
      
      // Also update matching staff requests by user_id and original date range
      const { error: matchingRequestError } = await supabase
        .from("staff_requests")
        .update({
          start_date: editHolidayForm.start_date,
          end_date: editHolidayForm.end_date,
          days_requested: editHolidayForm.days_taken,
          details: editHolidayForm.notes || null
        })
        .eq("user_id", editingHoliday.user_id)
        .eq("start_date", editingHoliday.start_date)
        .eq("end_date", editingHoliday.end_date)
        .in("request_type", ["holiday", "holiday_paid", "holiday_unpaid"]);
      
      if (matchingRequestError) {
        console.warn("Could not sync holiday update to matching requests:", matchingRequestError);
      }
    },
    onSuccess: () => {
      toast.success("Holiday updated successfully");
      setIsEditHolidayDialogOpen(false);
      setIsViewingHoliday(true);
      refetchHolidays();
      queryClient.invalidateQueries({ queryKey: ["staff-holidays-for-schedule"] });
      queryClient.invalidateQueries({ queryKey: ["staff-requests"] });
      queryClient.invalidateQueries({ queryKey: ["staff-requests-for-schedule"] });
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to update holiday");
    }
  });

  // Delete holiday mutation
  const deleteHolidayMutation = useMutation({
    mutationFn: async () => {
      if (!editingHoliday) throw new Error("No holiday selected");
      
      // First, delete any staff requests that are linked via linked_holiday_id
      const { error: linkedRequestsError } = await supabase
        .from("staff_requests")
        .delete()
        .eq("linked_holiday_id", editingHoliday.id);
      
      if (linkedRequestsError) throw linkedRequestsError;
      
      // Also delete matching staff requests by user_id and date range (for requests created before linked_holiday_id was used)
      const { error: matchingRequestsError } = await supabase
        .from("staff_requests")
        .delete()
        .eq("user_id", editingHoliday.user_id)
        .eq("start_date", editingHoliday.start_date)
        .eq("end_date", editingHoliday.end_date)
        .in("request_type", ["holiday", "holiday_paid", "holiday_unpaid"]);
      
      if (matchingRequestsError) throw matchingRequestsError;
      
      // Now delete the holiday itself
      const { error } = await supabase
        .from("staff_holidays")
        .delete()
        .eq("id", editingHoliday.id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Holiday and associated requests deleted successfully");
      setIsDeleteHolidayConfirmOpen(false);
      setIsEditHolidayDialogOpen(false);
      refetchHolidays();
      queryClient.invalidateQueries({ queryKey: ["staff-holidays-for-schedule"] });
      queryClient.invalidateQueries({ queryKey: ["staff-requests"] });
      queryClient.invalidateQueries({ queryKey: ["staff-requests-for-schedule"] });
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to delete holiday");
    }
  });

  // Delete cover request mutation - removes cover assignment and syncs to staff_requests
  const deleteCoverRequestMutation = useMutation({
    mutationFn: async (requestId: string) => {
      const { error } = await supabase
        .from("staff_requests")
        .delete()
        .eq("id", requestId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Cover assignment removed");
      queryClient.invalidateQueries({ queryKey: ["staff-requests"] });
      queryClient.invalidateQueries({ queryKey: ["staff-requests-for-schedule"] });
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to remove cover assignment");
    }
  });

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
    return allSchedules
      .filter(s => {
        const scheduleDate = parseISO(s.start_datetime);
        return s.client_name === clientName && format(scheduleDate, "yyyy-MM-dd") === format(day, "yyyy-MM-dd");
      })
      .sort((a, b) => parseISO(a.start_datetime).getTime() - parseISO(b.start_datetime).getTime());
  };

  const getOvertimeForStaffDay = (userId: string, day: Date) => {
    return overtimeEntries.filter(o => 
      o.user_id === userId && o.overtime_date === format(day, "yyyy-MM-dd")
    );
  };

  // Check if a user has a standard (non-overtime) working day on a given date
  // This is used to determine if a holiday should apply to that day
  const isStandardWorkingDay = (userId: string, day: Date): boolean => {
    const dateStr = format(day, "yyyy-MM-dd");
    const dayOfWeek = getDay(day);
    
    // Check for non-overtime recurring patterns that apply to this day
    const hasStandardPattern = recurringPatterns.some(pattern => {
      if (pattern.user_id !== userId) return false;
      if (pattern.is_overtime) return false; // Exclude overtime patterns
      
      const patternStartDate = parseISO(pattern.start_date);
      const patternEndDate = pattern.end_date ? parseISO(pattern.end_date) : null;
      
      // Check if day is within the pattern's date range
      if (isBefore(day, patternStartDate)) return false;
      if (patternEndDate && isAfter(day, patternEndDate)) return false;
      
      // Check if there's an exception for this date
      const hasException = shiftExceptions.some(
        e => e.pattern_id === pattern.id && e.exception_date === dateStr
      );
      if (hasException) return false;
      
      // Check recurrence interval
      const recurrenceInterval = pattern.recurrence_interval || 'weekly';
      
      if (recurrenceInterval === 'one_off') {
        return pattern.days_of_week.includes(dayOfWeek);
      } else if (recurrenceInterval === 'daily') {
        return true;
      } else if (recurrenceInterval === 'weekly') {
        return pattern.days_of_week.includes(dayOfWeek);
      } else if (recurrenceInterval === 'biweekly') {
        if (!pattern.days_of_week.includes(dayOfWeek)) return false;
        const weeksDiff = differenceInWeeks(startOfWeek(day, { weekStartsOn: 1 }), startOfWeek(patternStartDate, { weekStartsOn: 1 }));
        return weeksDiff % 2 === 0;
      } else if (recurrenceInterval === 'monthly') {
        if (!pattern.days_of_week.includes(dayOfWeek)) return false;
        const startDayOfMonth = getDate(patternStartDate);
        const currentDayOfMonth = getDate(day);
        const startWeekOfMonth = Math.ceil(startDayOfMonth / 7);
        const currentWeekOfMonth = Math.ceil(currentDayOfMonth / 7);
        return startWeekOfMonth === currentWeekOfMonth;
      }
      return false;
    });
    
    if (hasStandardPattern) return true;
    
    // Check for manual schedules (staff_schedules) on this day - these are standard work
    const hasManualSchedule = schedules.some(s => {
      if (s.user_id !== userId) return false;
      const scheduleDate = format(parseISO(s.start_datetime), "yyyy-MM-dd");
      return scheduleDate === dateStr;
    });
    
    return hasManualSchedule;
  };

  // Check if staff is on holiday - only applies to days they are normally scheduled to work
  const isStaffOnHoliday = (userId: string, day: Date) => {
    // First check if there's a holiday record covering this day
    const hasHolidayRecord = holidays.some(h => {
      if (h.user_id !== userId) return false;
      const start = startOfDay(parseISO(h.start_date));
      const end = endOfDay(parseISO(h.end_date));
      return isWithinInterval(day, { start, end });
    });
    
    if (!hasHolidayRecord) return false;
    
    // Only consider it a holiday if they would normally be working this day (standard hours, not overtime)
    return isStandardWorkingDay(userId, day);
  };

  const getHolidayInfo = (userId: string, day: Date) => {
    const holiday = holidays.find(h => {
      if (h.user_id !== userId) return false;
      const start = parseISO(h.start_date);
      const end = parseISO(h.end_date);
      return isWithinInterval(day, { start, end });
    });
    
    if (!holiday) return undefined;
    
    // Only return holiday info if it's a standard working day
    if (!isStandardWorkingDay(userId, day)) return undefined;
    
    return holiday;
  };

  const getRequestsForStaffDay = (userId: string, day: Date) => {
    return staffRequests.filter(r => {
      if (r.user_id !== userId) return false;
      const start = parseISO(r.start_date);
      const end = parseISO(r.end_date);
      return isWithinInterval(day, { start, end }) || isSameDay(day, start) || isSameDay(day, end);
    });
  };

  // Check if the covered user has shifts on a specific day (for shift_swap filtering)
  const doesCoveredUserHaveShiftsOnDay = (coveredUserId: string, day: Date) => {
    // Check manual schedules
    const hasManualSchedules = allSchedules.some(s => {
      if (s.user_id !== coveredUserId) return false;
      const scheduleDate = parseISO(s.start_datetime);
      return format(scheduleDate, "yyyy-MM-dd") === format(day, "yyyy-MM-dd");
    });
    if (hasManualSchedules) return true;

    // Check recurring patterns
    const dayOfWeek = getDay(day);
    const dateStr = format(day, "yyyy-MM-dd");
    
    const hasPatternShifts = recurringPatterns.some(pattern => {
      if (pattern.user_id !== coveredUserId) return false;
      const patternStartDate = parseISO(pattern.start_date);
      const patternEndDate = pattern.end_date ? parseISO(pattern.end_date) : null;
      
      // Check date range
      if (isBefore(day, patternStartDate)) return false;
      if (patternEndDate && isAfter(day, patternEndDate)) return false;
      
      // Check if day matches pattern
      if (pattern.recurrence_interval === 'daily') return true;
      if (pattern.recurrence_interval === 'weekly') return pattern.days_of_week.includes(dayOfWeek);
      if (pattern.recurrence_interval === 'biweekly') {
        if (!pattern.days_of_week.includes(dayOfWeek)) return false;
        const weeksDiff = differenceInWeeks(startOfWeek(day, { weekStartsOn: 1 }), startOfWeek(patternStartDate, { weekStartsOn: 1 }));
        return weeksDiff % 2 === 0;
      }
      return false;
    });
    
    return hasPatternShifts;
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
          label: 'Shift Cover', 
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
  // Only returns true if the staff member is actually scheduled to work that day (standard hours, not overtime)
  const hasHolidayRequestForDay = (userId: string, day: Date) => {
    // Only applies if this is a standard working day
    if (!isStandardWorkingDay(userId, day)) return false;
    
    return staffRequests.some(r => {
      if (r.user_id !== userId) return false;
      if (r.request_type !== 'holiday' && r.request_type !== 'holiday_paid' && r.request_type !== 'holiday_unpaid') return false;
      if (r.status === 'rejected') return false;
      const start = parseISO(r.start_date);
      const end = parseISO(r.end_date);
      return isWithinInterval(day, { start, end }) || isSameDay(day, start) || isSameDay(day, end);
    });
  };

  // Get who is covering for a staff member on holiday for a specific day
  const getCoverageForHoliday = (holidayUserId: string, day: Date) => {
    // Find the holiday for this user on this day
    const holiday = holidays.find(h => {
      if (h.user_id !== holidayUserId) return false;
      const start = parseISO(h.start_date);
      const end = parseISO(h.end_date);
      return isWithinInterval(day, { start, end });
    });
    
    if (!holiday) return null;
    
    // Find approved overtime requests linked to this holiday
    const overtimeCoverageRequests = staffRequests.filter(r => 
      r.linked_holiday_id === holiday.id && 
      r.status === 'approved' &&
      (r.request_type === 'overtime_standard' || r.request_type === 'overtime_double_up' || r.request_type === 'overtime')
    );
    
    // Find approved shift_swap requests where this holiday user is being covered
    const shiftSwapCoverageRequests = staffRequests.filter(r => 
      r.swap_with_user_id === holidayUserId && 
      r.status === 'approved' &&
      r.request_type === 'shift_swap' &&
      (() => {
        const start = startOfDay(parseISO(r.start_date));
        const end = endOfDay(parseISO(r.end_date));
        return isWithinInterval(day, { start, end });
      })()
    );
    
    const allCoverageRequests = [...overtimeCoverageRequests, ...shiftSwapCoverageRequests];
    
    if (allCoverageRequests.length === 0) return null;
    
    // Return covering staff info with request IDs for deletion
    return allCoverageRequests.map(r => ({
      requestId: r.id,
      userId: r.user_id,
      name: getStaffName(r.user_id),
      type: r.request_type
    }));
  };

  // Get who a staff member is covering for (when they have approved overtime or shift_swap)
  const getCoveringForInfo = (userId: string, day: Date) => {
    // Check overtime requests (linked_holiday_id)
    const overtimeRequests = staffRequests.filter(r => {
      if (r.user_id !== userId) return false;
      if (r.status !== 'approved') return false;
      if (r.request_type !== 'overtime_standard' && r.request_type !== 'overtime_double_up' && r.request_type !== 'overtime') return false;
      if (!r.linked_holiday_id) return false;
      const start = startOfDay(parseISO(r.start_date));
      const end = endOfDay(parseISO(r.end_date));
      return isWithinInterval(day, { start, end });
    });
    
    // Check shift_swap requests (swap_with_user_id)
    const shiftSwapRequests = staffRequests.filter(r => {
      if (r.user_id !== userId) return false;
      if (r.status !== 'approved') return false;
      if (r.request_type !== 'shift_swap') return false;
      if (!r.swap_with_user_id) return false;
      const start = startOfDay(parseISO(r.start_date));
      const end = endOfDay(parseISO(r.end_date));
      return isWithinInterval(day, { start, end });
    });
    
    const relevantRequests = [...overtimeRequests, ...shiftSwapRequests];
    
    if (relevantRequests.length === 0) return null;
    
    // Find who they're covering and get the shift details
    return relevantRequests.map(req => {
      let coveredUserId: string | null = null;
      
      if (req.request_type === 'shift_swap' && req.swap_with_user_id) {
        coveredUserId = req.swap_with_user_id;
      } else if (req.linked_holiday_id) {
        const linkedHoliday = holidays.find(h => h.id === req.linked_holiday_id);
        if (linkedHoliday) {
          coveredUserId = linkedHoliday.user_id;
        }
      }
      
      if (!coveredUserId) return null;
      
      // Get the schedules for the person on holiday for this day from allSchedules
      let coveredSchedules = allSchedules.filter(s => {
        if (s.user_id !== coveredUserId) return false;
        const scheduleDate = parseISO(s.start_datetime);
        return format(scheduleDate, "yyyy-MM-dd") === format(day, "yyyy-MM-dd");
      });
      
      // If no schedules found, check recurring patterns for what shifts would normally occur
      if (coveredSchedules.length === 0) {
        const dayOfWeek = getDay(day);
        const dateStr = format(day, "yyyy-MM-dd");
        
        const matchingPatterns = recurringPatterns.filter(pattern => {
          if (pattern.user_id !== coveredUserId) return false;
          const patternStartDate = parseISO(pattern.start_date);
          const patternEndDate = pattern.end_date ? parseISO(pattern.end_date) : null;
          
          // Check date range
          if (isBefore(day, patternStartDate)) return false;
          if (patternEndDate && isAfter(day, patternEndDate)) return false;
          
          // Check if day matches pattern
          if (pattern.recurrence_interval === 'daily') return true;
          if (pattern.recurrence_interval === 'weekly') return pattern.days_of_week.includes(dayOfWeek);
          if (pattern.recurrence_interval === 'biweekly') {
            if (!pattern.days_of_week.includes(dayOfWeek)) return false;
            const weeksDiff = differenceInWeeks(startOfWeek(day, { weekStartsOn: 1 }), startOfWeek(patternStartDate, { weekStartsOn: 1 }));
            return weeksDiff % 2 === 0;
          }
          return false;
        });
        
        // Convert patterns to schedule-like objects
        coveredSchedules = matchingPatterns.map(pattern => ({
          id: `pattern-${pattern.id}-${dateStr}`,
          user_id: pattern.user_id,
          client_name: pattern.client_name,
          start_datetime: `${dateStr}T${pattern.start_time}`,
          end_datetime: `${dateStr}T${pattern.end_time}`,
          notes: pattern.notes,
          hourly_rate: pattern.hourly_rate,
          currency: pattern.currency,
          shift_type: pattern.shift_type
        }));
      }
      
      // Only return covering info if there are actually shifts to cover on this day
      if (coveredSchedules.length === 0) return null;
      
      return {
        requestId: req.id,
        holidayUserId: coveredUserId,
        holidayUserName: getStaffName(coveredUserId),
        overtimeType: req.request_type,
        shifts: coveredSchedules.map(s => ({
          clientName: s.client_name,
          startTime: format(parseISO(s.start_datetime), "HH:mm"),
          endTime: format(parseISO(s.end_datetime), "HH:mm")
        }))
      };
    }).filter(Boolean) as { requestId: string; holidayUserId: string; holidayUserName: string; overtimeType: string; shifts: { clientName: string; startTime: string; endTime: string }[] }[];
  };

  const calculateScheduleCost = (schedule: Schedule) => {
    if (!schedule.hourly_rate) return null;
    const hours = differenceInHours(parseISO(schedule.end_datetime), parseISO(schedule.start_datetime));
    return hours * schedule.hourly_rate;
  };

  const filteredStaff = selectedStaff.length > 0
    ? visibleStaffMembers.filter(s => selectedStaff.includes(s.user_id))
    : visibleStaffMembers;

  const filteredClients = selectedClient.length > 0
    ? visibleClients.filter(c => selectedClient.includes(c))
    : visibleClients;

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
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => {
                  setCurrentWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }));
                }}
              >
                Today
              </Button>
            </div>

            <div className="flex items-center gap-2">
              {/* Timeline Toggle - Weekly vs Live */}
              <div className="flex border rounded-md">
                <Button
                  variant={!showLiveView ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setShowLiveView(false)}
                  className="rounded-r-none"
                >
                  <Calendar className="h-4 w-4 mr-1" />
                  Weekly
                </Button>
                <Button
                  variant={showLiveView ? "default" : "ghost"}
                  size="sm"
                  onClick={() => {
                    setCurrentWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }));
                    setShowLiveView(true);
                  }}
                  className="rounded-l-none"
                >
                  <Clock className="h-4 w-4 mr-1" />
                  Live
                </Button>
              </div>

              {/* View Mode Toggle - Staff vs Client */}
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
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-[200px] justify-between">
                      {selectedStaff.length === 0 
                        ? "All Staff" 
                        : selectedStaff.length === 1 
                          ? visibleStaffMembers.find(s => s.user_id === selectedStaff[0])?.display_name || "1 selected"
                          : `${selectedStaff.length} selected`}
                      <ChevronDown className="h-4 w-4 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[250px] p-2 bg-background z-50" align="start">
                    <Input
                      placeholder="Search staff..."
                      value={staffSearch}
                      onChange={(e) => setStaffSearch(e.target.value)}
                      className="mb-2"
                    />
                    <div className="space-y-1 max-h-[300px] overflow-y-auto">
                      <div 
                        className="flex items-center gap-2 p-2 hover:bg-muted rounded cursor-pointer"
                        onClick={() => setSelectedStaff([])}
                      >
                        <Checkbox checked={selectedStaff.length === 0} />
                        <span className="text-sm font-medium">All Staff</span>
                      </div>
                      <Separator className="my-1" />
                      {visibleStaffMembers
                        .filter(staff => {
                          if (!staffSearch.trim()) return true;
                          const searchLower = staffSearch.toLowerCase();
                          return (staff.display_name?.toLowerCase().includes(searchLower) || 
                                  staff.email?.toLowerCase().includes(searchLower));
                        })
                        .map(staff => (
                        <div 
                          key={staff.user_id}
                          className="flex items-center gap-2 p-2 hover:bg-muted rounded cursor-pointer"
                          onClick={() => {
                            setSelectedStaff(prev => 
                              prev.includes(staff.user_id)
                                ? prev.filter(id => id !== staff.user_id)
                                : [...prev, staff.user_id]
                            );
                          }}
                        >
                          <Checkbox checked={selectedStaff.includes(staff.user_id)} />
                          <span className="text-sm truncate">{staff.display_name || staff.email}</span>
                        </div>
                      ))}
                    </div>
                  </PopoverContent>
                </Popover>
              )}

              {viewMode === "client" && (
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-[200px] justify-between">
                      {selectedClient.length === 0 
                        ? "All Clients" 
                        : selectedClient.length === 1 
                          ? selectedClient[0]
                          : `${selectedClient.length} selected`}
                      <ChevronDown className="h-4 w-4 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[250px] p-2 bg-background z-50" align="start">
                    <Input
                      placeholder="Search clients..."
                      value={clientSearch}
                      onChange={(e) => setClientSearch(e.target.value)}
                      className="mb-2"
                    />
                    <div className="space-y-1 max-h-[300px] overflow-y-auto">
                      <div 
                        className="flex items-center gap-2 p-2 hover:bg-muted rounded cursor-pointer"
                        onClick={() => setSelectedClient([])}
                      >
                        <Checkbox checked={selectedClient.length === 0} />
                        <span className="text-sm font-medium">All Clients</span>
                      </div>
                      <Separator className="my-1" />
                      {uniqueClients
                        .filter(clientName => {
                          if (!clientSearch.trim()) return true;
                          return clientName.toLowerCase().includes(clientSearch.toLowerCase());
                        })
                        .map(clientName => (
                        <div 
                          key={clientName}
                          className="flex items-center gap-2 p-2 hover:bg-muted rounded cursor-pointer"
                          onClick={() => {
                            setSelectedClient(prev => 
                              prev.includes(clientName)
                                ? prev.filter(c => c !== clientName)
                                : [...prev, clientName]
                            );
                          }}
                        >
                          <Checkbox checked={selectedClient.includes(clientName)} />
                          <span className="text-sm truncate">{clientName}</span>
                        </div>
                      ))}
                    </div>
                  </PopoverContent>
                </Popover>
              )}

              {/* Recurring Schedule Dialog - Only show for editors/admins */}
              {canEditSchedule && (
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

                    <div>
                      <Label>Shift Type (optional)</Label>
                      <Select 
                        value={recurringForm.shift_type} 
                        onValueChange={v => setRecurringForm(p => ({ ...p, shift_type: v }))}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select shift type" />
                        </SelectTrigger>
                        <SelectContent className="bg-background z-50">
                          {SHIFT_TYPES.map(type => (
                            <SelectItem key={type} value={type}>{type}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
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
              )}
            </div>
          </div>
        </CardContent>
      </Card>


      {/* Gantt-style Timeline or Live View */}
      <Card className={showLiveView ? "border-primary/50" : ""}>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {showLiveView && <Clock className="h-5 w-5 text-primary animate-pulse" />}
              {showLiveView 
                ? `Live View - ${format(new Date(), "EEEE, MMMM d, yyyy")} (Now: ${format(new Date(), "HH:mm")})`
                : (viewMode === "staff" ? "Staff Schedule Timeline" : "Client Schedule Timeline")
              }
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {/* Live View - Accurate Timeline */}
          {showLiveView ? (
            <LiveTimelineView
              viewMode={viewMode}
              filteredStaff={filteredStaff}
              filteredClients={filteredClients}
              allSchedules={allSchedules}
              isStaffOnHoliday={isStaffOnHoliday}
              getStaffName={getStaffName}
              holidays={holidays}
              staffRequests={staffRequests}
              recurringPatterns={recurringPatterns}
            />
          ) : (
            /* Regular Weekly Gantt View */
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
                    const coverage = onHoliday ? getCoverageForHoliday(staff.user_id, day) : null;
                    const coveringFor = getCoveringForInfo(staff.user_id, day);

                    const hasCoverage = coverage && coverage.length > 0;
                    const needsCoverage = onHoliday && holidayInfo?.status === 'approved' && !hasCoverage && !holidayInfo?.no_cover_required;

                    return (
                      <div 
                        key={day.toISOString()} 
                        className={`min-h-[80px] p-1 rounded border ${
                          onHoliday 
                            ? hasCoverage
                              ? 'bg-green-50 border-green-200'
                              : needsCoverage
                                ? 'bg-red-50 border-red-200'
                                : 'bg-amber-50 border-amber-200'
                            : 'bg-background border-border'
                        }`}
                      >
                        {/* Holiday indicator with coverage info - clickable */}
                        {onHoliday && holidayInfo && (
                          <div 
                            className="mb-1 cursor-pointer hover:ring-2 hover:ring-primary/50 rounded p-0.5 -m-0.5"
                            onClick={() => handleHolidayClick(holidayInfo)}
                          >
                            <div className={`flex items-center gap-1 text-xs ${hasCoverage ? 'text-green-700' : needsCoverage ? 'text-red-700' : 'text-amber-700'}`}>
                              <Palmtree className="h-3 w-3" />
                              <span className="capitalize">{holidayInfo?.absence_type || 'Holiday'}</span>
                              {holidayInfo?.status === 'pending' && (
                                <Badge variant="outline" className="text-[10px] py-0 px-1">Pending</Badge>
                              )}
                              {holidayInfo?.no_cover_required && (
                                <Badge variant="outline" className="text-[10px] py-0 px-1 bg-blue-50 border-blue-200 text-blue-700">No cover needed</Badge>
                              )}
                            </div>
                            {hasCoverage ? (
                              <div className="text-[10px] text-green-700 bg-green-100 rounded px-1 py-0.5 mt-0.5">
                                <span className="font-medium">Covered by:</span>
                                {coverage.map((c, coverIdx) => (
                                  <span key={coverIdx} className="inline-flex items-center gap-0.5 ml-1">
                                    {c.name}
                                    {canEditSchedule && (
                                      <button
                                        className="hover:text-red-600 ml-0.5"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          deleteCoverRequestMutation.mutate(c.requestId);
                                        }}
                                        title="Remove cover"
                                      >
                                        <X className="h-2.5 w-2.5" />
                                      </button>
                                    )}
                                    {coverIdx < coverage.length - 1 && ','}
                                  </span>
                                ))}
                              </div>
                            ) : needsCoverage && (
                              <div className="text-[10px] text-red-600 bg-red-100 rounded px-1 py-0.5 mt-0.5 flex items-center gap-1">
                                <AlertTriangle className="h-2.5 w-2.5" />
                                <span>No cover assigned</span>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Covering for someone indicator - with delete option */}
                        {coveringFor && coveringFor.length > 0 && coveringFor.map((cover, idx) => (
                          <div key={idx} className="text-[10px] text-blue-700 bg-blue-50 rounded px-1 py-0.5 mb-1 group relative">
                            <div className="flex items-center gap-1 font-medium">
                              <Users className="h-2.5 w-2.5 flex-shrink-0" />
                              <span className="flex-1">Covering: {cover?.holidayUserName}</span>
                              {canEditSchedule && cover?.requestId && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-4 w-4 opacity-0 group-hover:opacity-100 -mr-0.5"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    deleteCoverRequestMutation.mutate(cover.requestId);
                                  }}
                                  title="Remove cover assignment"
                                >
                                  <X className="h-2.5 w-2.5 text-destructive" />
                                </Button>
                              )}
                            </div>
                            {cover?.shifts && cover.shifts.length > 0 ? (
                              cover.shifts.map((shift, shiftIdx) => (
                                <div key={shiftIdx} className="ml-3 text-blue-600">
                                  {shift.clientName} ({shift.startTime} - {shift.endTime})
                                </div>
                              ))
                            ) : (
                              <div className="ml-3 text-blue-500 italic">
                                No shifts defined for {cover?.holidayUserName}
                              </div>
                            )}
                          </div>
                        ))}
                        
                        {/* Show schedules: hide standard schedules if on holiday, but always show overtime pattern schedules */}
                        {daySchedules.filter(schedule => {
                          // If not on holiday, show all schedules
                          if (!onHoliday) return true;
                          // If on holiday, still show overtime pattern schedules
                          return schedule.is_pattern_overtime === true;
                        }).map(schedule => {
                          const cost = calculateScheduleCost(schedule);
                          const isFromPattern = schedule.id.startsWith('pattern-');
                          const isPatternOvertime = schedule.is_pattern_overtime;
                          
                          return (
                            <div 
                              key={schedule.id} 
                              className={`rounded p-1 mb-1 text-xs group relative ${canEditSchedule ? 'cursor-pointer hover:ring-2 hover:ring-primary/50' : ''} ${
                                isFromPattern 
                                  ? isPatternOvertime
                                    ? 'bg-orange-50 border border-orange-300'
                                    : 'bg-violet-50 border border-violet-300' 
                                  : 'bg-primary/10 border border-primary/30'
                              }`}
                              onClick={() => handleScheduleClick(schedule)}
                              onDoubleClick={() => handleScheduleClick(schedule)}
                              title={scheduleEditHint}
                            >
                              <div className="font-medium truncate flex items-center gap-1">
                                {schedule.client_name}
                                {isFromPattern && (
                                  <Infinity className={`h-3 w-3 ${isPatternOvertime ? 'text-orange-500' : 'text-violet-500'}`} />
                                )}
                                {isPatternOvertime && (
                                  <Clock className="h-3 w-3 text-orange-500" />
                                )}
                              </div>
                              {schedule.shift_type && (
                                <div className="text-[10px] text-primary font-medium">{schedule.shift_type}</div>
                              )}
                              <div className="text-muted-foreground">
                                {format(parseISO(schedule.start_datetime), "HH:mm")} - {format(parseISO(schedule.end_datetime), "HH:mm")}
                              </div>
                              {cost !== null && (
                                <div className="text-muted-foreground">
                                  {schedule.currency} {cost.toFixed(2)}
                                </div>
                              )}
                              {schedule.notes && (
                                <div className="italic truncate text-muted-foreground">{schedule.notes}</div>
                              )}
                              {canEditSchedule && (
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
                              )}
                            </div>
                          );
                        })}

                        {dayOvertime.map(ot => {
                          // Extract client name from notes if present (format: "ClientName: notes" or just "ClientName")
                          const noteParts = ot.notes?.split(':') || [];
                          const clientName = noteParts.length > 0 ? noteParts[0].trim() : null;
                          const additionalNotes = noteParts.length > 1 ? noteParts.slice(1).join(':').trim() : null;
                          
                          return (
                            <div 
                              key={ot.id} 
                              className={`bg-orange-50 border border-orange-300 rounded p-1 mb-1 text-xs group relative ${canEditSchedule ? 'cursor-pointer hover:ring-2 hover:ring-primary/50' : ''}`}
                              onClick={() => handleOvertimeClick(ot)}
                              onDoubleClick={() => handleOvertimeClick(ot)}
                              title={scheduleEditHint}
                            >
                              <div className="font-medium truncate flex items-center gap-1">
                                {clientName || 'Overtime'}
                                <Clock className="h-3 w-3 text-orange-500" />
                              </div>
                              <div className="text-muted-foreground">
                                {ot.hours}h overtime
                              </div>
                              {ot.hourly_rate && (
                                <div className="text-muted-foreground">
                                  {ot.currency} {(ot.hours * ot.hourly_rate).toFixed(2)}
                                </div>
                              )}
                              {additionalNotes && (
                                <div className="italic truncate text-muted-foreground">{additionalNotes}</div>
                              )}
                              {canEditSchedule && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="absolute top-0 right-0 h-5 w-5 opacity-0 group-hover:opacity-100"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    deleteOvertimeMutation.mutate(ot.id);
                                  }}
                                >
                                  <Trash2 className="h-3 w-3 text-destructive" />
                                </Button>
                              )}
                            </div>
                          );
                        })}

                        {/* Staff Requests - filter out holidays, overtime with linked holiday, and shift_swap on days without shifts */}
                        {getRequestsForStaffDay(staff.user_id, day)
                          .filter(r => {
                            // Filter out holiday types
                            if (['holiday', 'holiday_paid', 'holiday_unpaid'].includes(r.request_type)) return false;
                            // Filter out overtime that's linked to a holiday (shown in "Covering" section)
                            if (['overtime', 'overtime_standard', 'overtime_double_up'].includes(r.request_type) && r.linked_holiday_id) return false;
                            // Filter out shift_swap on days when the covered person has no shifts
                            if (r.request_type === 'shift_swap' && r.swap_with_user_id) {
                              if (!doesCoveredUserHaveShiftsOnDay(r.swap_with_user_id, day)) return false;
                            }
                            return true;
                          })
                          .map(request => {
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
                                    covering {getStaffName(request.swap_with_user_id)}
                                  </div>
                                )}
                                {request.details && (
                                  <div className="text-[10px] italic truncate">{request.details}</div>
                                )}
                              </div>
                            );
                          })}

                        {!onHoliday && daySchedules.length === 0 && dayOvertime.length === 0 && getRequestsForStaffDay(staff.user_id, day).filter(r => {
                          if (['holiday', 'holiday_paid', 'holiday_unpaid'].includes(r.request_type)) return false;
                          if (['overtime', 'overtime_standard', 'overtime_double_up'].includes(r.request_type) && r.linked_holiday_id) return false;
                          if (r.request_type === 'shift_swap' && r.swap_with_user_id && !doesCoveredUserHaveShiftsOnDay(r.swap_with_user_id, day)) return false;
                          return true;
                        }).length === 0 && !coveringFor?.length && (
                          <div className="text-xs text-muted-foreground italic flex items-center justify-center h-full">
                            No schedule
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}

              {/* Client View - grouped by shift type with colors */}
              {viewMode === "client" && filteredClients.map(clientName => {
                // Get all schedules for this client this week
                const allClientSchedules = weekDays.flatMap(day => getSchedulesForClientDay(clientName, day));
                const hasSchedules = allClientSchedules.length > 0;
                
                // Get unique shift types for this client (preserve order, put nulls at end)
                const shiftTypesForClient = [...new Set(allClientSchedules.map(s => s.shift_type || "Other"))];
                const orderedShiftTypes = [
                  ...SHIFT_TYPES.filter(st => shiftTypesForClient.includes(st)),
                  ...shiftTypesForClient.filter(st => !SHIFT_TYPES.includes(st))
                ];

                return (
                  <div key={clientName} className="mb-4">
                    {/* Client header with share button */}
                    <div className="p-2 text-sm font-bold truncate bg-muted/50 rounded-t border border-b-0 border-border flex items-center justify-between">
                      <span>{clientName}</span>
                      <ClientShareButton clientName={clientName} />
                    </div>
                    
                    {/* Shift type sections */}
                    {orderedShiftTypes.map(shiftType => {
                      const colors = getShiftTypeColors(shiftType);
                      
                      return (
                        <div key={`${clientName}-${shiftType}`}>
                          {/* Shift type header row */}
                          <div className="grid grid-cols-8 gap-1">
                            <div className="p-2 text-xs font-medium truncate border-r bg-muted/20 flex items-center gap-2">
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${colors.badge}`}>
                                {shiftType}
                              </span>
                            </div>
                            {weekDays.map(day => {
                              // Get schedules for this client, day, and shift type (already sorted by time)
                              const daySchedules = getSchedulesForClientDay(clientName, day).filter(
                                s => (s.shift_type || "Other") === shiftType
                              );
                              
                              return (
                                <div 
                                  key={day.toISOString()} 
                                  className="min-h-[60px] p-1 rounded border bg-background border-border"
                                >
                                  {daySchedules.map(schedule => {
                                    const cost = calculateScheduleCost(schedule);
                                    const staffOnHoliday = isStaffOnHoliday(schedule.user_id, day);
                                    const isFromPattern = schedule.id.startsWith('pattern-');
                                    const isPatternOvertime = schedule.is_pattern_overtime;
                                    const coverage = staffOnHoliday ? getCoverageForHoliday(schedule.user_id, day) : null;
                                    const holidayInfo = staffOnHoliday ? getHolidayInfo(schedule.user_id, day) : null;
                                    
                                    return (
                                      <div 
                                        key={schedule.id} 
                                        className={`rounded p-1.5 mb-1 text-xs group relative ${canEditSchedule ? 'cursor-pointer hover:ring-2 hover:ring-primary/50' : ''} border ${
                                          staffOnHoliday 
                                            ? 'bg-amber-100 border-amber-300' 
                                            : `${colors.bg} ${colors.border}`
                                        }`}
                                        onClick={() => handleScheduleClick(schedule)}
                                        onDoubleClick={() => handleScheduleClick(schedule)}
                                        title={scheduleEditHint}
                                      >
                                        <div className={`font-semibold truncate flex items-center gap-1 ${staffOnHoliday ? 'text-amber-900' : colors.text}`}>
                                          {staffOnHoliday && <Palmtree className="h-3 w-3 text-amber-600" />}
                                          {isFromPattern && !staffOnHoliday && (
                                            <Infinity className="h-3 w-3 opacity-60" />
                                          )}
                                          {isPatternOvertime && !staffOnHoliday && <Clock className="h-3 w-3 opacity-60" />}
                                          <span>{getStaffName(schedule.user_id)}</span>
                                        </div>
                                        
                                        {/* Holiday/Coverage info */}
                                        {staffOnHoliday && (
                                          <div className="mt-0.5">
                                            <div className="text-[10px] text-amber-800 opacity-80">
                                              {format(parseISO(schedule.start_datetime), "HH:mm")} - {format(parseISO(schedule.end_datetime), "HH:mm")}
                                            </div>
                                            <div className="text-[10px] text-amber-700 capitalize">
                                              {holidayInfo?.absence_type || 'On holiday'}
                                            </div>
                                            {coverage && coverage.length > 0 ? (
                                              <div className="text-[10px] text-green-700 bg-green-50 rounded px-1 py-0.5 mt-0.5">
                                                <span className="font-medium">Cover:</span> {coverage.map(c => c.name).join(', ')}
                                              </div>
                                            ) : (
                                              <div className="text-[10px] text-red-600 bg-red-50 rounded px-1 py-0.5 mt-0.5 flex items-center gap-1">
                                                <AlertTriangle className="h-2.5 w-2.5" />
                                                <span>No cover</span>
                                              </div>
                                            )}
                                          </div>
                                        )}
                                        
                                        {!staffOnHoliday && (
                                          <div className={`${colors.text} opacity-80`}>
                                            <div>
                                              {format(parseISO(schedule.start_datetime), "HH:mm")} - {format(parseISO(schedule.end_datetime), "HH:mm")}
                                            </div>
                                            {cost !== null && (
                                              <div className="text-[10px] opacity-70">
                                                {schedule.currency} {cost.toFixed(2)}
                                              </div>
                                            )}
                                          </div>
                                        )}
                                        {canEditSchedule && (
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
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                    
                    {/* Show message if no schedules for this client */}
                    {!hasSchedules && (
                      <div className="text-center py-4 text-xs text-muted-foreground italic border border-t-0 rounded-b">
                        No schedules this week
                      </div>
                    )}
                  </div>
                );
              })}

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
          )}
        </CardContent>
      </Card>

      {/* Legend - Dynamic based on view mode and live view */}
      <div className="flex flex-wrap gap-4 text-sm">
        {showLiveView ? (
          // Live View Legend - simpler, focused on what's visible in live timeline
          <>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded bg-primary/20 border-2 border-primary/60" />
              <span>Scheduled Shift</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded bg-violet-100 border-2 border-violet-400" />
              <span className="flex items-center gap-1">Recurring Shift <Infinity className="h-3 w-3 text-violet-500" /></span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded bg-cyan-100 border-2 border-cyan-500" />
              <span className="flex items-center gap-1">Providing Cover <Users className="h-3 w-3 text-cyan-600" /></span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded ring-2 ring-green-500 bg-green-50" />
              <span>Currently Working</span>
            </div>
          </>
        ) : viewMode === "staff" ? (
          <>
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
              <span className="flex items-center gap-1">Overtime <Clock className="h-3 w-3 text-orange-500" /></span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded bg-amber-50 border border-amber-200" />
              <span>Holiday/Absence</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded bg-green-50 border border-green-200" />
              <span>On Holiday (Covered)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded bg-red-50 border border-red-200" />
              <span>On Holiday (Needs Cover)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded bg-blue-50 border border-blue-200" />
              <span>Covering for Someone</span>
            </div>
          </>
        ) : (
          <>
            {/* Shift type colors - show a sample of the color-coded shift types */}
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded bg-teal-100 border border-teal-300" />
              <span>Day Shift</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded bg-purple-100 border border-purple-300" />
              <span>Night Shift</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded bg-orange-50 border border-orange-300" />
              <span className="flex items-center gap-1">Overtime <Clock className="h-3 w-3 text-orange-500" /></span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded bg-amber-100 border border-amber-300" />
              <span className="flex items-center gap-1">Staff on Holiday <Palmtree className="h-3 w-3 text-amber-600" /></span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded bg-green-50 border border-green-200" />
              <span>Covered (within shift)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded bg-red-50 border border-red-200" />
              <span className="flex items-center gap-1">No Cover <AlertTriangle className="h-3 w-3 text-red-500" /></span>
            </div>
          </>
        )}
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
          <AlertDialogFooter className="flex-col gap-2">
            <AlertDialogCancel onClick={() => setDeleteTarget(null)}>Cancel</AlertDialogCancel>
            <div className="flex flex-col sm:flex-row gap-2 w-full">
              <AlertDialogAction 
                onClick={() => handleDeleteConfirm('single')}
                className="bg-orange-600 hover:bg-orange-700 flex-1"
              >
                Just This Shift
              </AlertDialogAction>
              <AlertDialogAction 
                onClick={() => handleDeleteConfirm('future')}
                className="bg-amber-600 hover:bg-amber-700 flex-1"
              >
                This & Future
              </AlertDialogAction>
              <AlertDialogAction 
                onClick={() => handleDeleteConfirm('all')}
                className="bg-destructive hover:bg-destructive/90 flex-1"
              >
                Entire Pattern
              </AlertDialogAction>
            </div>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Unified Shift Editor - handles all shift editing (patterns, schedules, overtime) */}
      <UnifiedShiftEditor
        open={isUnifiedEditorOpen}
        onOpenChange={setIsUnifiedEditorOpen}
        shift={shiftToEdit}
        staffMembers={staffMembers}
        clients={clients}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ["staff-schedules"] });
          queryClient.invalidateQueries({ queryKey: ["staff-overtime"] });
          queryClient.invalidateQueries({ queryKey: ["recurring-shift-patterns"] });
        }}
      />

      {/* Holiday Edit Dialog */}
      <Dialog open={isEditHolidayDialogOpen} onOpenChange={setIsEditHolidayDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Palmtree className="h-5 w-5 text-amber-600" />
              {isViewingHoliday ? 'Holiday/Absence Details' : 'Edit Holiday/Absence'}
            </DialogTitle>
            <DialogDescription>
              {editingHoliday && getStaffName(editingHoliday.user_id)}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {!isViewingHoliday ? (
              <>
                <div className="space-y-2">
                  <Label>Absence Type</Label>
                  <Select
                    value={editHolidayForm.absence_type}
                    onValueChange={(value) => setEditHolidayForm({ ...editHolidayForm, absence_type: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="holiday">Holiday</SelectItem>
                      <SelectItem value="sick">Sick Leave</SelectItem>
                      <SelectItem value="personal">Personal Leave</SelectItem>
                      <SelectItem value="maternity">Maternity Leave</SelectItem>
                      <SelectItem value="paternity">Paternity Leave</SelectItem>
                      <SelectItem value="unpaid">Unpaid Leave</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Start Date</Label>
                    <Input
                      type="date"
                      value={editHolidayForm.start_date}
                      onChange={(e) => setEditHolidayForm({ ...editHolidayForm, start_date: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>End Date</Label>
                    <Input
                      type="date"
                      value={editHolidayForm.end_date}
                      onChange={(e) => setEditHolidayForm({ ...editHolidayForm, end_date: e.target.value })}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Days Taken</Label>
                  <Input
                    type="number"
                    value={editHolidayForm.days_taken}
                    onChange={(e) => setEditHolidayForm({ ...editHolidayForm, days_taken: parseFloat(e.target.value) || 0 })}
                    step="0.5"
                  />
                </div>

                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="no_cover_required"
                    checked={editHolidayForm.no_cover_required}
                    onCheckedChange={(checked) => setEditHolidayForm({ ...editHolidayForm, no_cover_required: !!checked })}
                  />
                  <Label htmlFor="no_cover_required" className="text-sm font-normal cursor-pointer">
                    No cover required for this absence
                  </Label>
                </div>

                <div className="space-y-2">
                  <Label>Notes</Label>
                  <Textarea
                    value={editHolidayForm.notes}
                    onChange={(e) => setEditHolidayForm({ ...editHolidayForm, notes: e.target.value })}
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
                    <p className="font-medium capitalize">{editingHoliday?.absence_type}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Days</p>
                    <p className="font-medium">{editingHoliday?.days_taken}</p>
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Start Date</p>
                    <p className="font-medium">
                      {editingHoliday?.start_date && format(parseISO(editingHoliday.start_date), 'dd MMM yyyy')}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">End Date</p>
                    <p className="font-medium">
                      {editingHoliday?.end_date && format(parseISO(editingHoliday.end_date), 'dd MMM yyyy')}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Status</p>
                    <Badge variant="outline" className="bg-success/20 text-success border-success">
                      {editingHoliday?.status}
                    </Badge>
                  </div>
                  {editingHoliday?.no_cover_required && (
                    <div>
                      <p className="text-sm text-muted-foreground">Cover</p>
                      <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                        No cover needed
                      </Badge>
                    </div>
                  )}
                </div>

                {editingHoliday?.notes && (
                  <div>
                    <p className="text-sm text-muted-foreground">Notes</p>
                    <p className="text-sm">{editingHoliday.notes}</p>
                  </div>
                )}
              </>
            )}
          </div>

          <DialogFooter className="flex-col sm:flex-row gap-2">
            {!isViewingHoliday ? (
              <>
                <Button 
                  variant="outline" 
                  onClick={() => setIsViewingHoliday(true)}
                >
                  Cancel
                </Button>
                <Button 
                  onClick={() => updateHolidayMutation.mutate()}
                  disabled={updateHolidayMutation.isPending}
                >
                  {updateHolidayMutation.isPending ? "Saving..." : "Save Changes"}
                </Button>
              </>
            ) : (
              <>
                {canEditSchedule && (
                  <>
                    <Button 
                      variant="destructive" 
                      onClick={() => setIsDeleteHolidayConfirmOpen(true)}
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Delete
                    </Button>
                    <Button 
                      variant="outline"
                      onClick={() => setIsViewingHoliday(false)}
                    >
                      Edit
                    </Button>
                  </>
                )}
                <Button onClick={() => setIsEditHolidayDialogOpen(false)}>
                  Close
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Holiday Confirmation Dialog */}
      <AlertDialog open={isDeleteHolidayConfirmOpen} onOpenChange={setIsDeleteHolidayConfirmOpen}>
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
              {deleteHolidayMutation.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  );
}
