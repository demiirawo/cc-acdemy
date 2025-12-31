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
import { toast } from "sonner";
import { format, addDays, startOfWeek, endOfWeek, eachDayOfInterval, isWithinInterval, parseISO, differenceInHours } from "date-fns";
import { Plus, ChevronLeft, ChevronRight, Clock, Palmtree, AlertCircle, Trash2 } from "lucide-react";

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

export function StaffScheduleManager() {
  const queryClient = useQueryClient();
  const [currentWeekStart, setCurrentWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [isScheduleDialogOpen, setIsScheduleDialogOpen] = useState(false);
  const [isOvertimeDialogOpen, setIsOvertimeDialogOpen] = useState(false);
  const [selectedStaff, setSelectedStaff] = useState<string>("all");
  
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

  const navigateWeek = (direction: "prev" | "next") => {
    setCurrentWeekStart(prev => addDays(prev, direction === "next" ? 7 : -7));
  };

  const getStaffName = (userId: string) => {
    const staff = staffMembers.find(s => s.user_id === userId);
    return staff?.display_name || staff?.email || "Unknown";
  };

  const getSchedulesForStaffDay = (userId: string, day: Date) => {
    return schedules.filter(s => {
      const scheduleDate = parseISO(s.start_datetime);
      return s.user_id === userId && format(scheduleDate, "yyyy-MM-dd") === format(day, "yyyy-MM-dd");
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

            <div className="flex items-center gap-4">
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
          <CardTitle>Staff Schedule Timeline</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <div className="min-w-[900px]">
              {/* Header Row */}
              <div className="grid grid-cols-8 gap-1 mb-2">
                <div className="font-medium text-sm text-muted-foreground p-2">Staff</div>
                {weekDays.map(day => (
                  <div key={day.toISOString()} className="font-medium text-sm text-center p-2 bg-muted rounded">
                    <div>{format(day, "EEE")}</div>
                    <div className="text-xs">{format(day, "d MMM")}</div>
                  </div>
                ))}
              </div>

              {/* Staff Rows */}
              {filteredStaff.map(staff => (
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
                          return (
                            <div 
                              key={schedule.id} 
                              className="bg-primary/10 border border-primary/30 rounded p-1 mb-1 text-xs group relative"
                            >
                              <div className="font-medium truncate">{schedule.client_name}</div>
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
                                onClick={() => deleteScheduleMutation.mutate(schedule.id)}
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

              {filteredStaff.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  No staff members found
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
          <div className="w-4 h-4 rounded bg-orange-100 border border-orange-300" />
          <span>Overtime</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-amber-50 border border-amber-200" />
          <span>Holiday/Absence</span>
        </div>
      </div>
    </div>
  );
}
