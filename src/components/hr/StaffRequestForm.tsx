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
import { toast } from "sonner";
import { format, eachDayOfInterval, getDay, isWithinInterval, parseISO } from "date-fns";
import { CalendarIcon, Clock, Palmtree, RefreshCw, AlertCircle, Send, RotateCcw, Check, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";

type RequestType = 'overtime_standard' | 'overtime_double_up' | 'holiday' | 'holiday_paid' | 'holiday_unpaid' | 'shift_swap';

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
}

const REQUEST_TYPE_INFO = {
  overtime_standard: {
    label: "Overtime – Standard",
    description: "Applies when you work outside of your normal contracted working hours.",
    icon: Clock,
    color: "text-orange-600"
  },
  overtime_double_up: {
    label: "Overtime – Double Up",
    description: "Applies when you cover another colleague during your regular working hours.",
    icon: Clock,
    color: "text-amber-600"
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
    label: "Shift Swap",
    description: "Request to swap shifts with another staff member.",
    icon: RefreshCw,
    color: "text-blue-600"
  }
};

// Types available for new requests (excludes legacy 'holiday')
const SELECTABLE_REQUEST_TYPES = ['overtime_standard', 'overtime_double_up', 'holiday_paid', 'holiday_unpaid', 'shift_swap'] as const;

// Legacy type info for displaying old requests
const LEGACY_REQUEST_TYPE_INFO: Record<string, { label: string; description: string; icon: typeof Clock; color: string }> = {
  holiday: {
    label: "Holiday / Time Off",
    description: "Request time off from work.",
    icon: Palmtree,
    color: "text-green-600"
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
      if (!startDate) throw new Error("Please select a start date");
      if (!endDate) throw new Error("Please select an end date");
      if (requestType === 'shift_swap' && !swapWithUserId) {
        throw new Error("Please select who you are swapping shifts with");
      }

      const { error } = await supabase.from("staff_requests").insert({
        user_id: user.id,
        request_type: requestType,
        swap_with_user_id: requestType === 'shift_swap' ? swapWithUserId : null,
        start_date: format(startDate, "yyyy-MM-dd"),
        end_date: format(endDate, "yyyy-MM-dd"),
        days_requested: parseFloat(daysRequested) || 1,
        details: details || null
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
    setStartDate(undefined);
    setEndDate(undefined);
    setDaysRequested("1");
    setDetails("");
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
                <span><strong>Overtime – Standard:</strong> applies when you work outside of your normal contracted working hours.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="font-medium text-amber-600">•</span>
                <span><strong>Overtime – Double Up:</strong> applies when you cover another colleague during your regular working hours.</span>
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

          {/* Shift Swap - Who are you swapping with */}
          {requestType === 'shift_swap' && (
            <div className="space-y-2">
              <Label>Who are you swapping shifts with? <span className="text-destructive">*</span></Label>
              <Select value={swapWithUserId} onValueChange={setSwapWithUserId}>
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

          {/* Dates Row */}
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

          {/* Manual days input for non-holiday requests */}
          {requestType && !['holiday', 'holiday_paid', 'holiday_unpaid'].includes(requestType) && (
            <div className="space-y-2">
              <Label>How many days are you requesting? <span className="text-destructive">*</span></Label>
              <Input 
                type="number"
                min="0.5"
                step="0.5"
                value={daysRequested}
                onChange={(e) => setDaysRequested(e.target.value)}
                className="max-w-[200px]"
              />
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
