import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { format, eachDayOfInterval, getDay, isWithinInterval, parseISO } from "date-fns";
import { CalendarIcon, Clock, Palmtree, RefreshCw, AlertCircle, Send, RotateCcw, Check, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";

type RequestType = 'overtime' | 'holiday' | 'holiday_paid' | 'holiday_unpaid' | 'shift_swap' | 'overtime_standard' | 'overtime_double_up';

interface StaffMember {
  user_id: string;
  display_name: string;
  email: string;
}

interface StaffRequest {
  id: string;
  user_id: string;
  request_type: RequestType;
  swap_with_user_id: string | null;
  start_date: string;
  end_date: string;
  days_requested: number;
  details: string | null;
  status: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_notes: string | null;
  created_at: string;
  linked_holiday_id: string | null;
  overtime_type: 'standard_hours' | 'outside_hours' | null;
}

interface ApprovedHoliday {
  id: string;
  user_id: string;
  start_date: string;
  end_date: string;
  days_taken: number;
  notes: string | null;
  absence_type: string;
}

const REQUEST_TYPE_INFO = {
  overtime: {
    label: "Overtime",
    description: "Request overtime pay for covering during an approved holiday period.",
    icon: Clock,
    color: "text-orange-600"
  },
  holiday_paid: {
    label: "Paid Holiday",
    description: "Request paid time off from work (uses your holiday allowance).",
    icon: Palmtree,
    color: "text-green-600"
  },
  holiday_unpaid: {
    label: "Unpaid Holiday",
    description: "Request unpaid time off from work.",
    icon: Palmtree,
    color: "text-yellow-600"
  },
  shift_swap: {
    label: "Shift Cover",
    description: "Request to cover shifts for another staff member.",
    icon: RefreshCw,
    color: "text-blue-600"
  }
};

// Types available for new requests
const SELECTABLE_REQUEST_TYPES = ['overtime', 'holiday_paid', 'holiday_unpaid', 'shift_swap'] as const;

// Legacy type info for displaying old requests
const LEGACY_REQUEST_TYPE_INFO: Record<string, { label: string; description: string; icon: typeof Clock; color: string }> = {
  holiday: {
    label: "Holiday / Time Off",
    description: "Request time off from work.",
    icon: Palmtree,
    color: "text-green-600"
  },
  overtime_standard: {
    label: "Overtime – Standard Hours",
    description: "Overtime during standard working hours.",
    icon: Clock,
    color: "text-orange-600"
  },
  overtime_double_up: {
    label: "Overtime – Outside Hours",
    description: "Overtime outside standard working hours.",
    icon: Clock,
    color: "text-amber-600"
  }
};

// Helper to get type info including legacy types
const getRequestTypeInfo = (type: string) => {
  return REQUEST_TYPE_INFO[type as keyof typeof REQUEST_TYPE_INFO] || LEGACY_REQUEST_TYPE_INFO[type] || {
    label: type,
    description: "",
    icon: Clock,
    color: "text-muted-foreground"
  };
};

export function StaffRequestForm() {
  const { user } = useAuth();
  const { isAdmin } = useUserRole();
  const queryClient = useQueryClient();
  
  const [requestType, setRequestType] = useState<RequestType | "">("");
  const [swapWithUserId, setSwapWithUserId] = useState("");
  const [startDate, setStartDate] = useState<Date>();
  const [endDate, setEndDate] = useState<Date>();
  const [daysRequested, setDaysRequested] = useState("1");
  const [details, setDetails] = useState("");
  const [linkedHolidayId, setLinkedHolidayId] = useState("");
  const [coveringStaffId, setCoveringStaffId] = useState("");
  const [swapStartDate, setSwapStartDate] = useState<Date>();
  const [swapEndDate, setSwapEndDate] = useState<Date>();
  const [selectedSwapShifts, setSelectedSwapShifts] = useState<string[]>([]);
  // Fetch staff members for swap selection
  const { data: staffMembers = [] } = useQuery({
    queryKey: ["staff-members-for-requests"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("user_id, display_name, email")
        .order("display_name");
      
      if (error) throw error;
      return data as StaffMember[];
    }
  });

  // Fetch user's recurring shift patterns to calculate working days
  const { data: shiftPatterns = [] } = useQuery({
    queryKey: ["my-shift-patterns", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("recurring_shift_patterns")
        .select("*")
        .eq("user_id", user.id);
      
      if (error) throw error;
      return data;
    },
    enabled: !!user
  });

  // Fetch user's individual schedules
  const { data: individualSchedules = [] } = useQuery({
    queryKey: ["my-schedules", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("staff_schedules")
        .select("*")
        .eq("user_id", user.id);
      
      if (error) throw error;
      return data;
    },
    enabled: !!user
  });

  // Fetch approved holidays for the selected staff member being covered
  const { data: approvedHolidays = [] } = useQuery({
    queryKey: ["approved-holidays-for-staff", coveringStaffId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("staff_holidays")
        .select("id, user_id, start_date, end_date, days_taken, notes, absence_type")
        .eq("status", "approved")
        .eq("user_id", coveringStaffId)
        .order("start_date", { ascending: false });
      
      if (error) throw error;
      return data as ApprovedHoliday[];
    },
    enabled: !!coveringStaffId
  });

  // Fetch swap partner's schedules for shift swap
  const { data: swapPartnerSchedules = [] } = useQuery({
    queryKey: ["swap-partner-schedules", swapWithUserId, swapStartDate?.toISOString(), swapEndDate?.toISOString()],
    queryFn: async () => {
      if (!swapWithUserId || !swapStartDate || !swapEndDate) return [];
      const { data, error } = await supabase
        .from("staff_schedules")
        .select("*")
        .eq("user_id", swapWithUserId)
        .gte("start_datetime", format(swapStartDate, "yyyy-MM-dd"))
        .lte("start_datetime", format(swapEndDate, "yyyy-MM-dd") + "T23:59:59")
        .order("start_datetime");
      
      if (error) throw error;
      return data;
    },
    enabled: !!swapWithUserId && !!swapStartDate && !!swapEndDate
  });

  // Fetch swap partner's recurring patterns to generate virtual shifts
  const { data: swapPartnerPatterns = [] } = useQuery({
    queryKey: ["swap-partner-patterns", swapWithUserId],
    queryFn: async () => {
      if (!swapWithUserId) return [];
      const { data, error } = await supabase
        .from("recurring_shift_patterns")
        .select("*")
        .eq("user_id", swapWithUserId);
      
      if (error) throw error;
      return data;
    },
    enabled: !!swapWithUserId
  });

  // Get staff members who have approved holidays (for the covering dropdown)
  const staffWithHolidays = staffMembers.filter(s => s.user_id !== user?.id);

  // Generate available shifts to swap from partner's schedules and patterns
  const availableSwapShifts = (() => {
    if (!swapStartDate || !swapEndDate || !swapWithUserId) return [];
    
    const shifts: { id: string; date: Date; startTime: string; endTime: string; clientName: string; isPattern: boolean }[] = [];
    
    // Add individual schedules
    swapPartnerSchedules.forEach(schedule => {
      shifts.push({
        id: schedule.id,
        date: parseISO(schedule.start_datetime),
        startTime: format(parseISO(schedule.start_datetime), "HH:mm"),
        endTime: format(parseISO(schedule.end_datetime), "HH:mm"),
        clientName: schedule.client_name,
        isPattern: false
      });
    });
    
    // Generate virtual shifts from patterns
    const daysInRange = eachDayOfInterval({ start: swapStartDate, end: swapEndDate });
    swapPartnerPatterns.forEach(pattern => {
      const patternStart = parseISO(pattern.start_date);
      const patternEnd = pattern.end_date ? parseISO(pattern.end_date) : null;
      
      daysInRange.forEach(day => {
        const dayOfWeek = getDay(day);
        
        // Check if day is within pattern range
        if (day < patternStart) return;
        if (patternEnd && day > patternEnd) return;
        
        // Check if this day matches the pattern
        if (!pattern.days_of_week?.includes(dayOfWeek)) return;
        
        // Check if there's already an individual schedule for this day/time
        const hasIndividual = swapPartnerSchedules.some(s => 
          format(parseISO(s.start_datetime), "yyyy-MM-dd") === format(day, "yyyy-MM-dd")
        );
        if (hasIndividual) return;
        
        shifts.push({
          id: `pattern-${pattern.id}-${format(day, "yyyy-MM-dd")}`,
          date: day,
          startTime: pattern.start_time,
          endTime: pattern.end_time,
          clientName: pattern.client_name,
          isPattern: true
        });
      });
    });
    
    return shifts.sort((a, b) => a.date.getTime() - b.date.getTime());
  })();


  // Calculate overtime type based on selected holiday and user's shift patterns
  const calculateOvertimeType = (holidayId: string): 'standard_hours' | 'outside_hours' => {
    const holiday = approvedHolidays.find(h => h.id === holidayId);
    if (!holiday) return 'outside_hours';
    
    // Check if the holiday period overlaps with the user's standard working patterns
    const holidayStart = parseISO(holiday.start_date);
    const holidayEnd = parseISO(holiday.end_date);
    const daysInRange = eachDayOfInterval({ start: holidayStart, end: holidayEnd });
    
    let hasStandardHoursOverlap = false;
    
    daysInRange.forEach(day => {
      const dayOfWeek = getDay(day);
      
      // Check if this day is part of the current user's recurring shift pattern
      const hasRecurringShift = shiftPatterns.some(pattern => {
        const patternStart = parseISO(pattern.start_date);
        const patternEnd = pattern.end_date ? parseISO(pattern.end_date) : null;
        const inDateRange = day >= patternStart && (!patternEnd || day <= patternEnd);
        const dayMatches = pattern.days_of_week?.includes(dayOfWeek);
        return inDateRange && dayMatches;
      });
      
      if (hasRecurringShift) {
        hasStandardHoursOverlap = true;
      }
    });
    
    return hasStandardHoursOverlap ? 'standard_hours' : 'outside_hours';
  };

  // Auto-calculate working days when dates change for holiday requests
  useEffect(() => {
    if ((requestType === 'holiday_paid' || requestType === 'holiday_unpaid') && startDate && endDate) {
      const daysInRange = eachDayOfInterval({ start: startDate, end: endDate });
      let workingDays = 0;

      daysInRange.forEach(day => {
        const dayOfWeek = getDay(day);
        const dateStr = format(day, "yyyy-MM-dd");

        const hasRecurringShift = shiftPatterns.some(pattern => {
          const patternStart = parseISO(pattern.start_date);
          const patternEnd = pattern.end_date ? parseISO(pattern.end_date) : null;
          const inDateRange = day >= patternStart && (!patternEnd || day <= patternEnd);
          const dayMatches = pattern.days_of_week?.includes(dayOfWeek);
          return inDateRange && dayMatches;
        });

        const hasIndividualShift = individualSchedules.some(schedule => {
          const scheduleStart = parseISO(schedule.start_datetime);
          const scheduleEnd = parseISO(schedule.end_datetime);
          return isWithinInterval(day, { start: scheduleStart, end: scheduleEnd }) ||
                 format(scheduleStart, "yyyy-MM-dd") === dateStr;
        });

        if (hasRecurringShift || hasIndividualShift) {
          workingDays++;
        }
      });

      setDaysRequested(workingDays.toString());
    }
  }, [requestType, startDate, endDate, shiftPatterns, individualSchedules]);

  // Auto-populate dates from selected holiday for overtime requests
  useEffect(() => {
    if (requestType === 'overtime' && linkedHolidayId) {
      const holiday = approvedHolidays.find(h => h.id === linkedHolidayId);
      if (holiday) {
        setStartDate(parseISO(holiday.start_date));
        setEndDate(parseISO(holiday.end_date));
        setDaysRequested(holiday.days_taken.toString());
      }
    }
  }, [requestType, linkedHolidayId, approvedHolidays]);

  // Fetch user's requests
  const { data: myRequests = [] } = useQuery({
    queryKey: ["my-staff-requests"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("staff_requests")
        .select("*")
        .order("created_at", { ascending: false });
      
      if (error) throw error;
      return data as StaffRequest[];
    }
  });

  // Submit request mutation
  const submitRequestMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Not authenticated");
      if (!requestType) throw new Error("Please select a request type");
      
      // Validation for shift cover
      if (requestType === 'shift_swap') {
        if (!swapWithUserId) throw new Error("Please select whose shifts you are covering");
        if (!swapStartDate || !swapEndDate) throw new Error("Please select a date range");
        if (selectedSwapShifts.length === 0) throw new Error("Please select at least one shift to cover");
      } else if (requestType !== 'overtime') {
        if (!startDate) throw new Error("Please select a start date");
        if (!endDate) throw new Error("Please select an end date");
      }
      
      if (requestType === 'overtime' && !linkedHolidayId) {
        throw new Error("Please select the approved holiday you are covering");
      }

      // Calculate overtime type if applicable
      let overtimeType: 'standard_hours' | 'outside_hours' | null = null;
      if (requestType === 'overtime' && linkedHolidayId) {
        overtimeType = calculateOvertimeType(linkedHolidayId);
      }

      // Build details for shift swap including selected shifts
      let requestDetails = details;
      if (requestType === 'shift_swap' && selectedSwapShifts.length > 0) {
        const shiftDetails = availableSwapShifts
          .filter(s => selectedSwapShifts.includes(s.id))
          .map(s => `${format(s.date, "dd MMM yyyy")} ${s.startTime}-${s.endTime} (${s.clientName})`)
          .join("; ");
        requestDetails = details ? `${details}\n\nShifts: ${shiftDetails}` : `Shifts: ${shiftDetails}`;
      }

      // Determine dates for shift swap
      const requestStartDate = requestType === 'shift_swap' ? swapStartDate : startDate;
      const requestEndDate = requestType === 'shift_swap' ? swapEndDate : endDate;
      const requestDays = requestType === 'shift_swap' ? selectedSwapShifts.length : parseFloat(daysRequested) || 1;

      const { error } = await supabase.from("staff_requests").insert({
        user_id: user.id,
        request_type: requestType,
        swap_with_user_id: requestType === 'shift_swap' ? swapWithUserId : null,
        linked_holiday_id: requestType === 'overtime' ? linkedHolidayId : null,
        overtime_type: overtimeType,
        start_date: format(requestStartDate!, "yyyy-MM-dd"),
        end_date: format(requestEndDate!, "yyyy-MM-dd"),
        days_requested: requestDays,
        details: requestDetails || null
      });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-staff-requests"] });
      toast.success("Request submitted successfully");
      resetForm();
    },
    onError: (error) => {
      toast.error(error.message);
    }
  });

  // Approve/reject mutation (admin only)
  const reviewRequestMutation = useMutation({
    mutationFn: async ({ requestId, status, notes }: { requestId: string; status: 'approved' | 'rejected'; notes?: string }) => {
      if (!user) throw new Error("Not authenticated");

      // Get the request details first
      const { data: request, error: fetchError } = await supabase
        .from("staff_requests")
        .select("*")
        .eq("id", requestId)
        .single();

      if (fetchError) throw fetchError;

      // Update the request status
      const { error } = await supabase
        .from("staff_requests")
        .update({
          status,
          reviewed_by: user.id,
          reviewed_at: new Date().toISOString(),
          review_notes: notes || null
        })
        .eq("id", requestId);

      if (error) throw error;

      // If it's a holiday request being approved, sync to staff_holidays
      if (status === 'approved' && (request.request_type === 'holiday_paid' || request.request_type === 'holiday_unpaid' || request.request_type === 'holiday')) {
        const { error: holidayError } = await supabase
          .from("staff_holidays")
          .insert({
            user_id: request.user_id,
            absence_type: request.request_type === 'holiday_unpaid' ? 'unpaid' : 'holiday',
            start_date: request.start_date,
            end_date: request.end_date,
            days_taken: request.days_requested,
            status: 'approved',
            notes: request.details,
            approved_by: user.id,
            approved_at: new Date().toISOString()
          });

        if (holidayError) {
          console.error('Failed to sync to staff_holidays:', holidayError);
          // Don't throw - the request is already approved, just log the sync failure
        }
      }
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["my-staff-requests"] });
      queryClient.invalidateQueries({ queryKey: ["staff-holidays"] });
      toast.success(`Request ${variables.status}`);
    },
    onError: (error) => {
      toast.error("Failed to update request: " + error.message);
    }
  });

  const resetForm = () => {
    setRequestType("");
    setSwapWithUserId("");
    setLinkedHolidayId("");
    setCoveringStaffId("");
    setStartDate(undefined);
    setEndDate(undefined);
    setDaysRequested("1");
    setDetails("");
    setSwapStartDate(undefined);
    setSwapEndDate(undefined);
    setSelectedSwapShifts([]);
  };

  const getStaffName = (userId: string) => {
    const staff = staffMembers.find(s => s.user_id === userId);
    return staff?.display_name || staff?.email || "Unknown";
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'approved':
        return <Badge className="bg-green-100 text-green-800 border-green-300">Approved</Badge>;
      case 'rejected':
        return <Badge className="bg-red-100 text-red-800 border-red-300">Rejected</Badge>;
      default:
        return <Badge className="bg-amber-100 text-amber-800 border-amber-300">Pending</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Request Form */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Send className="h-5 w-5" />
            Time Off & Overtime Request
          </CardTitle>
          <CardDescription>
            Submit a request for overtime, holiday, or shift swap
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Request Type Info */}
          <div className="p-4 bg-muted/50 rounded-lg border">
            <div className="flex items-start gap-2 mb-3">
              <AlertCircle className="h-4 w-4 text-primary mt-0.5" />
              <span className="text-sm font-medium">Please note</span>
            </div>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li className="flex items-start gap-2">
                <span className="font-medium text-orange-600">•</span>
                <span><strong>Overtime:</strong> Request to cover someone's approved holiday. The system will determine if it's during your standard hours or outside.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="font-medium text-green-600">•</span>
                <span><strong>Paid Holiday:</strong> request paid time off from work (uses your holiday allowance).</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="font-medium text-yellow-600">•</span>
                <span><strong>Unpaid Holiday:</strong> request unpaid time off from work.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="font-medium text-blue-600">•</span>
                <span><strong>Shift Swap:</strong> request to swap shifts with another staff member.</span>
              </li>
            </ul>
          </div>

          {/* Request Type Select */}
          <div className="space-y-2">
            <Label>Request Type <span className="text-destructive">*</span></Label>
            <Select value={requestType} onValueChange={(val) => setRequestType(val as RequestType)}>
              <SelectTrigger>
                <SelectValue placeholder="Select request type..." />
              </SelectTrigger>
              <SelectContent className="bg-background">
                {SELECTABLE_REQUEST_TYPES.map((key) => {
                  const info = REQUEST_TYPE_INFO[key];
                  return (
                    <SelectItem key={key} value={key}>
                      <div className="flex items-center gap-2">
                        <info.icon className={cn("h-4 w-4", info.color)} />
                        {info.label}
                      </div>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>

          {/* Overtime - Select staff member being covered */}
          {requestType === 'overtime' && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Which staff member are you covering? <span className="text-destructive">*</span></Label>
                <Select 
                  value={coveringStaffId} 
                  onValueChange={(val) => {
                    setCoveringStaffId(val);
                    setLinkedHolidayId(""); // Reset holiday when staff changes
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select staff member..." />
                  </SelectTrigger>
                  <SelectContent className="bg-background">
                    {staffWithHolidays.length === 0 ? (
                      <div className="p-2 text-sm text-muted-foreground text-center">
                        No other staff members available
                      </div>
                    ) : (
                      staffWithHolidays.map(staff => (
                        <SelectItem key={staff.user_id} value={staff.user_id}>
                          {staff.display_name || staff.email}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>

              {/* Once staff is selected, show their approved holidays */}
              {coveringStaffId && (
                <div className="space-y-2">
                  <Label>Which of their approved holidays are you covering? <span className="text-destructive">*</span></Label>
                  <Select value={linkedHolidayId} onValueChange={setLinkedHolidayId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select an approved holiday..." />
                    </SelectTrigger>
                    <SelectContent className="bg-background">
                      {approvedHolidays.length === 0 ? (
                        <div className="p-2 text-sm text-muted-foreground text-center">
                          No approved holidays for this staff member
                        </div>
                      ) : (
                        approvedHolidays.map(holiday => (
                          <SelectItem key={holiday.id} value={holiday.id}>
                            <div className="flex flex-col">
                              <span>{format(new Date(holiday.start_date), 'dd MMM yyyy')} – {format(new Date(holiday.end_date), 'dd MMM yyyy')}</span>
                              <span className="text-xs text-muted-foreground">
                                {holiday.days_taken} days • {holiday.absence_type}
                              </span>
                            </div>
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {linkedHolidayId && (() => {
                const holiday = approvedHolidays.find(h => h.id === linkedHolidayId);
                return (
                  <div className="p-3 bg-muted rounded-md text-sm space-y-2">
                    <div>
                      <p className="font-medium">Covering Period</p>
                      <p className="text-muted-foreground">
                        {holiday ? `${format(parseISO(holiday.start_date), 'dd MMM yyyy')} – ${format(parseISO(holiday.end_date), 'dd MMM yyyy')} (${holiday.days_taken} day${holiday.days_taken !== 1 ? 's' : ''})` : 'N/A'}
                      </p>
                    </div>
                    <div>
                      <p className="font-medium">Overtime Type: {calculateOvertimeType(linkedHolidayId) === 'standard_hours' ? 'Standard Hours' : 'Outside Standard Hours'}</p>
                      <p className="text-muted-foreground text-xs">
                        {calculateOvertimeType(linkedHolidayId) === 'standard_hours' 
                          ? 'This holiday falls within your standard working hours.'
                          : 'This holiday is outside your standard working hours.'}
                      </p>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

          {/* Shift Cover - Who are you covering */}
          {requestType === 'shift_swap' && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Whose shifts are you covering? <span className="text-destructive">*</span></Label>
                <Select 
                  value={swapWithUserId} 
                  onValueChange={(val) => {
                    setSwapWithUserId(val);
                    setSelectedSwapShifts([]);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select staff member..." />
                  </SelectTrigger>
                  <SelectContent className="bg-background">
                    {staffMembers
                      .filter(s => s.user_id !== user?.id)
                      .map(staff => (
                        <SelectItem key={staff.user_id} value={staff.user_id}>
                          {staff.display_name || staff.email}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Date range for shift swap */}
              {swapWithUserId && (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Start Date <span className="text-destructive">*</span></Label>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            className={cn(
                              "w-full justify-start text-left font-normal",
                              !swapStartDate && "text-muted-foreground"
                            )}
                          >
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {swapStartDate ? format(swapStartDate, "dd/MM/yyyy") : "Select start date"}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0 bg-background" align="start">
                          <Calendar
                            mode="single"
                            selected={swapStartDate}
                            onSelect={(date) => {
                              setSwapStartDate(date);
                              setSelectedSwapShifts([]);
                              if (date && swapEndDate && date > swapEndDate) {
                                setSwapEndDate(date);
                              }
                            }}
                            initialFocus
                            className="p-3 pointer-events-auto"
                          />
                        </PopoverContent>
                      </Popover>
                    </div>

                    <div className="space-y-2">
                      <Label>End Date <span className="text-destructive">*</span></Label>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            className={cn(
                              "w-full justify-start text-left font-normal",
                              !swapEndDate && "text-muted-foreground"
                            )}
                          >
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {swapEndDate ? format(swapEndDate, "dd/MM/yyyy") : "Select end date"}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0 bg-background" align="start">
                          <Calendar
                            mode="single"
                            selected={swapEndDate}
                            onSelect={(date) => {
                              setSwapEndDate(date);
                              setSelectedSwapShifts([]);
                            }}
                            disabled={(date) => swapStartDate ? date < swapStartDate : false}
                            initialFocus
                            className="p-3 pointer-events-auto"
                          />
                        </PopoverContent>
                      </Popover>
                    </div>
                  </div>

                  {/* Shifts to cover */}
                  {swapStartDate && swapEndDate && (
                    <div className="space-y-2">
                      <Label>Select shifts to cover <span className="text-destructive">*</span></Label>
                      {availableSwapShifts.length === 0 ? (
                        <div className="p-4 bg-muted rounded-md text-sm text-muted-foreground text-center">
                          No shifts found for {getStaffName(swapWithUserId)} in this date range
                        </div>
                      ) : (
                        <div className="space-y-2 max-h-[200px] overflow-y-auto border rounded-md p-3">
                          {availableSwapShifts.map(shift => (
                            <div 
                              key={shift.id} 
                              className="flex items-center space-x-3 p-2 rounded hover:bg-muted/50"
                            >
                              <Checkbox
                                id={shift.id}
                                checked={selectedSwapShifts.includes(shift.id)}
                                onCheckedChange={(checked) => {
                                  if (checked) {
                                    setSelectedSwapShifts(prev => [...prev, shift.id]);
                                  } else {
                                    setSelectedSwapShifts(prev => prev.filter(id => id !== shift.id));
                                  }
                                }}
                              />
                              <label 
                                htmlFor={shift.id} 
                                className="flex-1 text-sm cursor-pointer"
                              >
                                <div className="font-medium">
                                  {format(shift.date, "EEE, dd MMM yyyy")}
                                </div>
                                <div className="text-muted-foreground text-xs">
                                  {shift.startTime} - {shift.endTime} • {shift.clientName}
                                  {shift.isPattern && <span className="ml-1 text-primary">(Recurring)</span>}
                                </div>
                              </label>
                            </div>
                          ))}
                        </div>
                      )}
                      {selectedSwapShifts.length > 0 && (
                        <p className="text-xs text-muted-foreground">
                          {selectedSwapShifts.length} shift{selectedSwapShifts.length !== 1 ? 's' : ''} selected
                        </p>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* Details */}
          <div className="space-y-2">
            <Label>Details <span className="text-destructive">*</span></Label>
            <p className="text-sm text-muted-foreground">
              Please explain the details of your request, for example the start and end time of your shift or the details of who you will be swapping shifts with and when. Write N/A if no comment is required.
            </p>
            <Textarea 
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              placeholder="Enter details..."
              rows={3}
            />
          </div>

          {/* Dates Row - Hidden for overtime and shift_swap since they have their own date handling */}
          {requestType !== 'overtime' && requestType !== 'shift_swap' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Start Date <span className="text-destructive">*</span></Label>
                <p className="text-sm text-muted-foreground">Please enter start date of request</p>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !startDate && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {startDate ? format(startDate, "dd/MM/yyyy") : "dd/mm/yyyy"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0 bg-background" align="start">
                    <Calendar
                      mode="single"
                      selected={startDate}
                      onSelect={(date) => {
                        setStartDate(date);
                        if (date && endDate && date > endDate) {
                          setEndDate(date);
                        }
                      }}
                      initialFocus
                      className="p-3 pointer-events-auto"
                    />
                  </PopoverContent>
                </Popover>
              </div>

              <div className="space-y-2">
                <Label>End Date</Label>
                <p className="text-sm text-muted-foreground">Please enter end date of request</p>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !endDate && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {endDate ? format(endDate, "dd/MM/yyyy") : "dd/mm/yyyy"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0 bg-background" align="start">
                    <Calendar
                      mode="single"
                      selected={endDate}
                      onSelect={setEndDate}
                      disabled={(date) => startDate ? date < startDate : false}
                      initialFocus
                      className="p-3 pointer-events-auto"
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>
          )}

          {/* Days Requested - Auto-calculated for holidays */}
          {(requestType === 'holiday_paid' || requestType === 'holiday_unpaid') && (
            <div className="space-y-2">
              <Label>Working days in selected period</Label>
              <div className="px-4 py-2 bg-muted rounded-md font-medium min-w-[80px] w-fit">
                {startDate && endDate ? (
                  <>{daysRequested} day{parseFloat(daysRequested) !== 1 ? 's' : ''}</>
                ) : (
                  <span className="text-muted-foreground">Select dates above</span>
                )}
              </div>
              {startDate && endDate && parseFloat(daysRequested) === 0 && (
                <p className="text-sm text-amber-600">
                  No scheduled working days found in this period. Check your schedule patterns.
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                Automatically calculated based on your shift patterns
              </p>
            </div>
          )}

          {/* Shift swap shows selected shifts count - auto-calculated */}
          {requestType === 'shift_swap' && selectedSwapShifts.length > 0 && (
            <div className="space-y-2">
              <Label>Shifts to swap</Label>
              <div className="px-4 py-2 bg-muted rounded-md font-medium min-w-[80px] w-fit">
                {selectedSwapShifts.length} shift{selectedSwapShifts.length !== 1 ? 's' : ''} selected
              </div>
              <p className="text-xs text-muted-foreground">
                Automatically calculated from selected shifts above
              </p>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-between pt-4 border-t">
            <Button variant="ghost" onClick={resetForm} className="text-primary">
              <RotateCcw className="h-4 w-4 mr-2" />
              Clear form
            </Button>
            <Button 
              onClick={() => submitRequestMutation.mutate()}
              disabled={submitRequestMutation.isPending}
            >
              {submitRequestMutation.isPending ? "Submitting..." : "Submit"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* My Requests */}
      <Card>
        <CardHeader>
          <CardTitle>My Requests</CardTitle>
          <CardDescription>View the status of your submitted requests</CardDescription>
        </CardHeader>
        <CardContent>
          {myRequests.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              No requests submitted yet
            </p>
          ) : (
            <div className="space-y-3">
              {myRequests.map(request => {
                const typeInfo = getRequestTypeInfo(request.request_type);
                const TypeIcon = typeInfo.icon;
                const isMyRequest = request.user_id === user?.id;
                
                return (
                  <div key={request.id} className="p-4 border rounded-lg bg-muted/30">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 space-y-1">
                        <div className="flex items-center gap-2">
                          <TypeIcon className={cn("h-4 w-4", typeInfo.color)} />
                          <span className="font-medium">{typeInfo.label}</span>
                          {getStatusBadge(request.status)}
                        </div>
                        {!isMyRequest && (
                          <p className="text-sm text-muted-foreground">
                            Requested by: {getStaffName(request.user_id)}
                          </p>
                        )}
                        <p className="text-sm text-muted-foreground">
                          {format(new Date(request.start_date), "dd MMM yyyy")} 
                          {request.start_date !== request.end_date && (
                            <> – {format(new Date(request.end_date), "dd MMM yyyy")}</>
                          )}
                          {" "}({request.days_requested} day{request.days_requested !== 1 ? 's' : ''})
                        </p>
                        {request.request_type === 'shift_swap' && request.swap_with_user_id && (
                          <p className="text-sm text-muted-foreground">
                            Swapping with: {getStaffName(request.swap_with_user_id)}
                          </p>
                        )}
                        {request.details && (
                          <p className="text-sm text-muted-foreground italic">
                            "{request.details}"
                          </p>
                        )}
                        {request.review_notes && (
                          <p className="text-sm text-muted-foreground">
                            Review notes: {request.review_notes}
                          </p>
                        )}
                      </div>

                      {/* Admin Actions */}
                      {isAdmin && request.status === 'pending' && (
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-green-600 border-green-300 hover:bg-green-50"
                            onClick={() => reviewRequestMutation.mutate({ requestId: request.id, status: 'approved' })}
                          >
                            <Check className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-red-600 border-red-300 hover:bg-red-50"
                            onClick={() => reviewRequestMutation.mutate({ requestId: request.id, status: 'rejected' })}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
