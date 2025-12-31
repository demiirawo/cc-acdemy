import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { format, addDays, startOfWeek, endOfWeek, eachDayOfInterval, isWithinInterval, parseISO, differenceInHours, getDay, addWeeks, parse, isBefore, isAfter, isSameDay } from "date-fns";
import { Plus, ChevronLeft, ChevronRight, Clock, Palmtree, Trash2, Users, Building2, Repeat, Infinity } from "lucide-react";

interface Schedule {
  id: string;
  user_id: string;
  client_name: string;
  start_datetime: string;
  end_datetime: string;
  notes: string | null;
  hourly_rate: number | null;
  currency: string;
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
}

interface Client {
  id: string;
  name: string;
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
  const [isScheduleDialogOpen, setIsScheduleDialogOpen] = useState(false);
  const [isOvertimeDialogOpen, setIsOvertimeDialogOpen] = useState(false);
  const [isRecurringDialogOpen, setIsRecurringDialogOpen] = useState(false);
  const [selectedStaff, setSelectedStaff] = useState<string>("all");
  const [viewMode, setViewMode] = useState<ViewMode>("staff");
  
  // Schedule form state
  const [scheduleForm, setScheduleForm] = useState({
    user_id: "",
    client_name: "",
    start_datetime: "",
    end_datetime: "",
    notes: "",
    hourly_rate: "",
    currency: "GBP"
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
    start_date: format(new Date(), "yyyy-MM-dd")
  });

  // Overtime form state
  const [overtimeForm, setOvertimeForm] = useState({
    user_id: "",
    overtime_date: "",
    hours: "",
    hourly_rate: "",
    currency: "GBP",
    notes: ""
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

  // Generate virtual schedules from recurring patterns for the current week
  const virtualSchedulesFromPatterns = useMemo(() => {
    const virtualSchedules: Schedule[] = [];
    
    for (const pattern of recurringPatterns) {
      const patternStartDate = parseISO(pattern.start_date);
      const patternEndDate = pattern.end_date ? parseISO(pattern.end_date) : null;
      
      for (const day of weekDays) {
        const dayOfWeek = getDay(day);
        
        // Check if this day is in the pattern
        if (!pattern.days_of_week.includes(dayOfWeek)) continue;
        
        // Check if day is within the pattern's date range
        if (isBefore(day, patternStartDate)) continue;
        if (patternEndDate && isAfter(day, patternEndDate)) continue;
        
        // Create virtual schedule entry
        const startDatetime = `${format(day, "yyyy-MM-dd")}T${pattern.start_time}`;
        const endDatetime = `${format(day, "yyyy-MM-dd")}T${pattern.end_time}`;
        
        virtualSchedules.push({
          id: `pattern-${pattern.id}-${format(day, "yyyy-MM-dd")}`,
          user_id: pattern.user_id,
          client_name: pattern.client_name,
          start_datetime: startDatetime,
          end_datetime: endDatetime,
          notes: pattern.notes,
          hourly_rate: pattern.hourly_rate,
          currency: pattern.currency
        });
      }
    }
    
    return virtualSchedules;
  }, [recurringPatterns, weekDays]);

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

  // Create schedule mutation
  const createScheduleMutation = useMutation({
    mutationFn: async (data: typeof scheduleForm) => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error("Not authenticated");

      const { error } = await supabase.from("staff_schedules").insert({
        user_id: data.user_id,
        client_name: data.client_name,
        start_datetime: data.start_datetime,
        end_datetime: data.end_datetime,
        notes: data.notes || null,
        hourly_rate: data.hourly_rate ? parseFloat(data.hourly_rate) : null,
        currency: data.currency,
        created_by: userData.user.id
      });
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["staff-schedules"] });
      setIsScheduleDialogOpen(false);
      resetScheduleForm();
      toast.success("Schedule created successfully");
    },
    onError: (error) => {
      toast.error("Failed to create schedule: " + error.message);
    }
  });

  // Create recurring schedule mutation
  const createRecurringScheduleMutation = useMutation({
    mutationFn: async (data: typeof recurringForm) => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error("Not authenticated");

      // For true indefinite, save as a pattern (no end date)
      if (data.is_indefinite) {
        const { error } = await supabase.from("recurring_shift_patterns").insert({
          user_id: data.user_id,
          client_name: data.client_name,
          days_of_week: data.selected_days,
          start_time: data.start_time,
          end_time: data.end_time,
          hourly_rate: data.hourly_rate ? parseFloat(data.hourly_rate) : null,
          currency: data.currency,
          is_overtime: data.is_overtime,
          notes: data.notes || null,
          start_date: data.start_date,
          end_date: null, // null = indefinite
          created_by: userData.user.id
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

  // Create overtime mutation
  const createOvertimeMutation = useMutation({
    mutationFn: async (data: typeof overtimeForm) => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error("Not authenticated");

      const { error } = await supabase.from("staff_overtime").insert({
        user_id: data.user_id,
        overtime_date: data.overtime_date,
        hours: parseFloat(data.hours),
        hourly_rate: data.hourly_rate ? parseFloat(data.hourly_rate) : null,
        currency: data.currency,
        notes: data.notes || null,
        created_by: userData.user.id
      });
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["staff-overtime"] });
      setIsOvertimeDialogOpen(false);
      resetOvertimeForm();
      toast.success("Overtime entry added successfully");
    },
    onError: (error) => {
      toast.error("Failed to add overtime: " + error.message);
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

  const resetScheduleForm = () => {
    setScheduleForm({
      user_id: "",
      client_name: "",
      start_datetime: "",
      end_datetime: "",
      notes: "",
      hourly_rate: "",
      currency: "GBP"
    });
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
      start_date: format(new Date(), "yyyy-MM-dd")
    });
  };

  const resetOvertimeForm = () => {
    setOvertimeForm({
      user_id: "",
      overtime_date: "",
      hours: "",
      hourly_rate: "",
      currency: "GBP",
      notes: ""
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

              <Dialog open={isScheduleDialogOpen} onOpenChange={setIsScheduleDialogOpen}>
                <DialogTrigger asChild>
                  <Button>
                    <Plus className="h-4 w-4 mr-2" />
                    Add Schedule
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Add Schedule</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div>
                      <Label>Staff Member</Label>
                      <Select value={scheduleForm.user_id} onValueChange={v => setScheduleForm(p => ({ ...p, user_id: v }))}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select staff" />
                        </SelectTrigger>
                        <SelectContent>
                          {staffMembers.map(staff => (
                            <SelectItem key={staff.user_id} value={staff.user_id}>
                              {staff.display_name || staff.email}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Client Name</Label>
                      <Input
                        value={scheduleForm.client_name}
                        onChange={e => setScheduleForm(p => ({ ...p, client_name: e.target.value }))}
                        placeholder="Enter client name"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label>Start Date & Time</Label>
                        <Input
                          type="datetime-local"
                          value={scheduleForm.start_datetime}
                          onChange={e => setScheduleForm(p => ({ ...p, start_datetime: e.target.value }))}
                        />
                      </div>
                      <div>
                        <Label>End Date & Time</Label>
                        <Input
                          type="datetime-local"
                          value={scheduleForm.end_datetime}
                          onChange={e => setScheduleForm(p => ({ ...p, end_datetime: e.target.value }))}
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label>Hourly Rate (optional)</Label>
                        <Input
                          type="number"
                          step="0.01"
                          value={scheduleForm.hourly_rate}
                          onChange={e => setScheduleForm(p => ({ ...p, hourly_rate: e.target.value }))}
                          placeholder="0.00"
                        />
                      </div>
                      <div>
                        <Label>Currency</Label>
                        <Select value={scheduleForm.currency} onValueChange={v => setScheduleForm(p => ({ ...p, currency: v }))}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
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
                        value={scheduleForm.notes}
                        onChange={e => setScheduleForm(p => ({ ...p, notes: e.target.value }))}
                        placeholder="Add any notes..."
                      />
                    </div>
                    <Button 
                      onClick={() => createScheduleMutation.mutate(scheduleForm)}
                      disabled={!scheduleForm.user_id || !scheduleForm.client_name || !scheduleForm.start_datetime || !scheduleForm.end_datetime}
                      className="w-full"
                    >
                      Create Schedule
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>

              {/* Recurring Schedule Dialog */}
              <Dialog open={isRecurringDialogOpen} onOpenChange={setIsRecurringDialogOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline">
                    <Repeat className="h-4 w-4 mr-2" />
                    Recurring
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
                    <div>
                      <Label>Start Date</Label>
                      <Input
                        type="date"
                        value={recurringForm.start_date}
                        onChange={e => setRecurringForm(p => ({ ...p, start_date: e.target.value }))}
                      />
                    </div>

                    {/* Indefinite Toggle */}
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

                    {/* Number of Weeks - only show if not indefinite */}
                    {!recurringForm.is_indefinite && (
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
                      {recurringForm.is_indefinite ? (
                        <span className="flex items-center gap-1">
                          <Infinity className="h-3 w-3" />
                          This will create a never-ending pattern starting from {recurringForm.start_date ? format(parseISO(recurringForm.start_date), "MMM d, yyyy") : "today"}
                        </span>
                      ) : (
                        `This will create ${recurringForm.selected_days.length * recurringForm.weeks_to_create} ${recurringForm.is_overtime ? 'overtime' : 'schedule'} entries starting from ${recurringForm.start_date ? format(parseISO(recurringForm.start_date), "MMM d, yyyy") : "today"}`
                      )}
                    </div>
                    <Button 
                      onClick={() => createRecurringScheduleMutation.mutate(recurringForm)}
                      disabled={!recurringForm.user_id || !recurringForm.client_name || recurringForm.selected_days.length === 0}
                      className="w-full"
                    >
                      {recurringForm.is_indefinite ? (
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

              <Dialog open={isOvertimeDialogOpen} onOpenChange={setIsOvertimeDialogOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline">
                    <Clock className="h-4 w-4 mr-2" />
                    Add Overtime
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Add Overtime Entry</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div>
                      <Label>Staff Member</Label>
                      <Select value={overtimeForm.user_id} onValueChange={v => setOvertimeForm(p => ({ ...p, user_id: v }))}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select staff" />
                        </SelectTrigger>
                        <SelectContent>
                          {staffMembers.map(staff => (
                            <SelectItem key={staff.user_id} value={staff.user_id}>
                              {staff.display_name || staff.email}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label>Date</Label>
                        <Input
                          type="date"
                          value={overtimeForm.overtime_date}
                          onChange={e => setOvertimeForm(p => ({ ...p, overtime_date: e.target.value }))}
                        />
                      </div>
                      <div>
                        <Label>Hours</Label>
                        <Input
                          type="number"
                          step="0.5"
                          value={overtimeForm.hours}
                          onChange={e => setOvertimeForm(p => ({ ...p, hours: e.target.value }))}
                          placeholder="0"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label>Hourly Rate (optional)</Label>
                        <Input
                          type="number"
                          step="0.01"
                          value={overtimeForm.hourly_rate}
                          onChange={e => setOvertimeForm(p => ({ ...p, hourly_rate: e.target.value }))}
                          placeholder="0.00"
                        />
                      </div>
                      <div>
                        <Label>Currency</Label>
                        <Select value={overtimeForm.currency} onValueChange={v => setOvertimeForm(p => ({ ...p, currency: v }))}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
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
                        value={overtimeForm.notes}
                        onChange={e => setOvertimeForm(p => ({ ...p, notes: e.target.value }))}
                        placeholder="Reason for overtime..."
                      />
                    </div>
                    <Button 
                      onClick={() => createOvertimeMutation.mutate(overtimeForm)}
                      disabled={!overtimeForm.user_id || !overtimeForm.overtime_date || !overtimeForm.hours}
                      className="w-full"
                    >
                      Add Overtime
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
                          return (
                            <div 
                              key={schedule.id} 
                              className={`rounded p-1 mb-1 text-xs group relative ${
                                isFromPattern 
                                  ? 'bg-violet-50 border border-violet-300' 
                                  : 'bg-primary/10 border border-primary/30'
                              }`}
                            >
                              <div className="font-medium truncate flex items-center gap-1">
                                {schedule.client_name}
                                {isFromPattern && <Infinity className="h-3 w-3 text-violet-500" />}
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
                              {!isFromPattern && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="absolute top-0 right-0 h-5 w-5 opacity-0 group-hover:opacity-100"
                                  onClick={() => deleteScheduleMutation.mutate(schedule.id)}
                                >
                                  <Trash2 className="h-3 w-3 text-destructive" />
                                </Button>
                              )}
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

                        {!onHoliday && daySchedules.length === 0 && dayOvertime.length === 0 && (
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
                          
                          return (
                            <div 
                              key={schedule.id} 
                              className={`rounded p-1 mb-1 text-xs group relative ${
                                staffOnHoliday 
                                  ? 'bg-amber-100 border border-amber-300' 
                                  : isFromPattern
                                    ? 'bg-violet-50 border border-violet-300'
                                    : 'bg-primary/10 border border-primary/30'
                              }`}
                            >
                              <div className="font-medium truncate flex items-center gap-1">
                                {getStaffName(schedule.user_id)}
                                {staffOnHoliday && <Palmtree className="h-3 w-3 text-amber-600" />}
                                {isFromPattern && <Infinity className="h-3 w-3 text-violet-500" />}
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
                              {!isFromPattern && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="absolute top-0 right-0 h-5 w-5 opacity-0 group-hover:opacity-100"
                                  onClick={() => deleteScheduleMutation.mutate(schedule.id)}
                                >
                                  <Trash2 className="h-3 w-3 text-destructive" />
                                </Button>
                              )}
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
          <span className="flex items-center gap-1">Recurring Pattern <Infinity className="h-3 w-3" /></span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-orange-100 border border-orange-300" />
          <span>Overtime</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-amber-50 border border-amber-200" />
          <span>Holiday/Absence</span>
        </div>
      </div>

      {/* Active Recurring Patterns */}
      {recurringPatterns.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Infinity className="h-5 w-5" />
              Active Recurring Patterns
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {recurringPatterns.map(pattern => (
                <div key={pattern.id} className="flex items-center justify-between p-3 border rounded-md bg-muted/30">
                  <div className="flex-1">
                    <div className="font-medium">
                      {getStaffName(pattern.user_id)} → {pattern.client_name}
                      {pattern.is_overtime && <Badge variant="outline" className="ml-2 text-orange-600">Overtime</Badge>}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {DAYS_OF_WEEK.filter(d => pattern.days_of_week.includes(d.value)).map(d => d.label).join(", ")} • {pattern.start_time} - {pattern.end_time}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      From {format(parseISO(pattern.start_date), "MMM d, yyyy")}
                      {pattern.end_date ? ` to ${format(parseISO(pattern.end_date), "MMM d, yyyy")}` : " (indefinite)"}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => deletePatternMutation.mutate(pattern.id)}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
