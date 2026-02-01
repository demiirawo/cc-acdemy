import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Check, X, Clock, Palmtree, RefreshCw, Bell, BellOff, Copy, Calendar, User, FileText, CheckCircle2, AlertCircle, Trash2, Pencil, UserX } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useRequestEmailNotification } from "@/hooks/useRequestEmailNotification";
type RequestType = 'overtime' | 'overtime_standard' | 'overtime_double_up' | 'holiday' | 'holiday_paid' | 'holiday_unpaid' | 'shift_swap';
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
  client_informed: boolean;
}
interface UserProfile {
  user_id: string;
  display_name: string | null;
  email: string | null;
}
interface ClientAssignment {
  client_name: string;
}
const REQUEST_TYPE_INFO: Record<string, {
  label: string;
  icon: typeof Clock;
  color: string;
}> = {
  overtime: {
    label: "Overtime",
    icon: Clock,
    color: "text-orange-600"
  },
  overtime_standard: {
    label: "Overtime – Standard Hours",
    icon: Clock,
    color: "text-orange-600"
  },
  overtime_double_up: {
    label: "Overtime – Outside Hours",
    icon: Clock,
    color: "text-amber-600"
  },
  holiday: {
    label: "Holiday / Time Off",
    icon: Palmtree,
    color: "text-green-600"
  },
  holiday_paid: {
    label: "Paid Holiday",
    icon: Palmtree,
    color: "text-green-600"
  },
  holiday_unpaid: {
    label: "Unpaid Holiday",
    icon: Palmtree,
    color: "text-yellow-600"
  },
  shift_swap: {
    label: "Shift Cover",
    icon: RefreshCw,
    color: "text-blue-600"
  }
};
const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-warning/20 text-warning-foreground border-warning',
  approved: 'bg-success/20 text-success border-success',
  rejected: 'bg-destructive/20 text-destructive border-destructive'
};
interface RequestDetailPageProps {
  requestId: string;
  onBack: () => void;
  onViewProfile?: (userId: string) => void;
}
export function RequestDetailPage({
  requestId,
  onBack,
  onViewProfile
}: RequestDetailPageProps) {
  const {
    user
  } = useAuth();
  const queryClient = useQueryClient();
  const {
    sendReviewEmail
  } = useRequestEmailNotification();
  const [reviewNotes, setReviewNotes] = useState("");
  const [emailCopied, setEmailCopied] = useState(false);
  const [editingDetails, setEditingDetails] = useState(false);
  const [detailsValue, setDetailsValue] = useState("");

  // Fetch the specific request
  const {
    data: request,
    isLoading
  } = useQuery({
    queryKey: ["staff-request", requestId],
    queryFn: async () => {
      const {
        data,
        error
      } = await supabase.from("staff_requests").select("*").eq("id", requestId).single();
      if (error) throw error;
      return data as StaffRequest;
    }
  });

  // Fetch user profiles
  const {
    data: userProfiles = []
  } = useQuery({
    queryKey: ["user-profiles-for-request-detail"],
    queryFn: async () => {
      const {
        data,
        error
      } = await supabase.from("profiles").select("user_id, display_name, email");
      if (error) throw error;
      return data as UserProfile[];
    }
  });

  // Fetch client assignments for the staff member
  const {
    data: clientAssignments = []
  } = useQuery({
    queryKey: ["client-assignments", request?.user_id],
    enabled: !!request?.user_id,
    queryFn: async () => {
      const {
        data,
        error
      } = await supabase.from("staff_client_assignments").select("client_name").eq("staff_user_id", request!.user_id);
      if (error) throw error;
      return data as ClientAssignment[];
    }
  });

  // Fetch shift patterns for the staff member to show affected shift times
  const {
    data: shiftPatterns = []
  } = useQuery({
    queryKey: ["shift-patterns-for-request", request?.user_id],
    enabled: !!request?.user_id,
    queryFn: async () => {
      const {
        data,
        error
      } = await supabase.from("recurring_shift_patterns").select("id, client_name, start_time, end_time, days_of_week, start_date, end_date, recurrence_interval").eq("user_id", request!.user_id);
      if (error) throw error;
      return data as {
        id: string;
        client_name: string;
        start_time: string;
        end_time: string;
        days_of_week: number[];
        start_date: string;
        end_date: string | null;
        recurrence_interval: string;
      }[];
    }
  });

  // Fetch shift pattern exceptions to exclude dates where patterns don't apply
  const {
    data: shiftExceptions = []
  } = useQuery({
    queryKey: ["shift-exceptions-for-request", shiftPatterns.map(p => p.id)],
    enabled: shiftPatterns.length > 0,
    queryFn: async () => {
      const patternIds = shiftPatterns.map(p => p.id);
      const {
        data,
        error
      } = await supabase.from("shift_pattern_exceptions").select("pattern_id, exception_date, exception_type").in("pattern_id", patternIds);
      if (error) throw error;
      return data as {
        pattern_id: string;
        exception_date: string;
        exception_type: string;
      }[];
    }
  });

  // Helper function to check if a date falls on an active recurrence week
  const isDateOnRecurrenceSchedule = (currentDate: Date, patternStartDate: string, recurrenceInterval: string): boolean => {
    if (recurrenceInterval === 'weekly') return true;
    const patternStart = new Date(patternStartDate);
    const diffTime = currentDate.getTime() - patternStart.getTime();
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    const diffWeeks = Math.floor(diffDays / 7);
    if (recurrenceInterval === 'biweekly') {
      // Biweekly: pattern runs on even weeks (0, 2, 4, ...)
      return diffWeeks % 2 === 0;
    }
    if (recurrenceInterval === 'monthly') {
      // Monthly: only on weeks that are 4 weeks apart (0, 4, 8, ...)
      return diffWeeks % 4 === 0;
    }

    // Default to weekly if unknown interval
    return true;
  };

  // Get day-by-day breakdown of affected shift times
  const getAffectedShiftsByDay = (): {
    date: Date;
    clientName: string;
    shiftTime: string;
  }[] => {
    if (!request || shiftPatterns.length === 0) return [];
    const startDate = new Date(request.start_date);
    const endDate = new Date(request.end_date);
    const result: {
      date: Date;
      clientName: string;
      shiftTime: string;
    }[] = [];

    // Create a set of exception keys for quick lookup (pattern_id + date)
    const exceptionSet = new Set(shiftExceptions.map(exc => `${exc.pattern_id}:${exc.exception_date}`));

    // Iterate through each day of the request period
    let currentDate = new Date(startDate);
    while (currentDate <= endDate) {
      const dayOfWeek = currentDate.getDay();
      const currentDateStr = currentDate.toISOString().split('T')[0];

      // Find patterns that apply to this day
      shiftPatterns.forEach(pattern => {
        const patternDays = pattern.days_of_week as number[];

        // Check if this day matches the pattern's days of week
        if (!patternDays.includes(dayOfWeek)) return;

        // Check if the current date is within the pattern's active period
        const patternStartDate = pattern.start_date;
        const patternEndDate = pattern.end_date;

        // Skip if current date is before the pattern started
        if (currentDateStr < patternStartDate) return;

        // Skip if pattern has ended before current date
        if (patternEndDate && currentDateStr > patternEndDate) return;

        // Skip if this date doesn't fall on the recurrence schedule (biweekly, monthly, etc.)
        if (!isDateOnRecurrenceSchedule(currentDate, patternStartDate, pattern.recurrence_interval)) return;

        // Skip if there's an exception for this pattern on this date
        if (exceptionSet.has(`${pattern.id}:${currentDateStr}`)) return;
        const startTime = pattern.start_time.substring(0, 5);
        const endTime = pattern.end_time.substring(0, 5);
        const shiftTime = `${startTime} - ${endTime}`;
        result.push({
          date: new Date(currentDate),
          clientName: pattern.client_name,
          shiftTime
        });
      });
      currentDate.setDate(currentDate.getDate() + 1);
    }

    // Sort by date
    result.sort((a, b) => a.date.getTime() - b.date.getTime());
    return result;
  };

  // Fetch all staff with their client assignments (to identify bench staff)
  const {
    data: allStaffWithAssignments = []
  } = useQuery({
    queryKey: ["all-staff-with-assignments"],
    queryFn: async () => {
      const {
        data: profiles,
        error: profilesError
      } = await supabase.from("profiles").select("user_id, display_name, email");
      if (profilesError) throw profilesError;
      const {
        data: assignments,
        error: assignmentsError
      } = await supabase.from("staff_client_assignments").select("staff_user_id, client_name");
      if (assignmentsError) throw assignmentsError;

      // Map profiles with their assignments
      return (profiles || []).map(profile => ({
        ...profile,
        clientAssignments: (assignments || []).filter(a => a.staff_user_id === profile.user_id).map(a => a.client_name),
        isBench: (assignments || []).some(a => a.staff_user_id === profile.user_id && a.client_name === "Care Cuddle")
      }));
    }
  });

  // Fetch covering staff info (for shift swaps where someone is covering this person's holiday)
  const {
    data: coveringStaff,
    refetch: refetchCoveringStaff
  } = useQuery({
    queryKey: ["covering-staff", request?.id],
    enabled: !!request && ['holiday', 'holiday_paid', 'holiday_unpaid'].includes(request.request_type),
    queryFn: async () => {
      // Find shift swap requests that cover this person's dates
      const {
        data,
        error
      } = await supabase.from("staff_requests").select("*").eq("request_type", "shift_swap").eq("swap_with_user_id", request!.user_id).gte("start_date", request!.start_date).lte("end_date", request!.end_date);
      if (error) throw error;
      if (data && data.length > 0) {
        return data.map(cover => ({
          ...cover,
          staffName: getStaffName(cover.user_id)
        }));
      }
      return null;
    }
  });

  // Fetch the linked holiday record (for approved holiday requests)
  const {
    data: linkedHoliday,
    refetch: refetchLinkedHoliday
  } = useQuery({
    queryKey: ["linked-holiday", request?.id],
    enabled: !!request && ['holiday', 'holiday_paid', 'holiday_unpaid'].includes(request.request_type) && request.status === 'approved',
    queryFn: async () => {
      // Find the staff_holidays record that matches this request
      const {
        data,
        error
      } = await supabase
        .from("staff_holidays")
        .select("*")
        .eq("user_id", request!.user_id)
        .eq("start_date", request!.start_date)
        .eq("end_date", request!.end_date)
        .eq("status", "approved")
        .maybeSingle();
      if (error) throw error;
      return data;
    }
  });
  useEffect(() => {
    if (request) {
      setReviewNotes(request.review_notes || "");
      setDetailsValue(request.details || "");
    }
  }, [request]);
  const getStaffName = (userId: string) => {
    const profile = userProfiles.find(p => p.user_id === userId);
    return profile?.display_name || profile?.email || "Unknown";
  };
  const getStaffEmail = (userId: string) => {
    const profile = userProfiles.find(p => p.user_id === userId);
    return profile?.email || "";
  };

  // Client informed mutation
  const clientInformedMutation = useMutation({
    mutationFn: async (informed: boolean) => {
      const {
        error
      } = await supabase.from("staff_requests").update({
        client_informed: informed
      }).eq("id", requestId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["staff-request", requestId]
      });
      queryClient.invalidateQueries({
        queryKey: ["all-staff-requests"]
      });
      toast.success("Client notification status updated");
    },
    onError: error => {
      toast.error("Failed to update: " + error.message);
    }
  });

  // Update details mutation
  const updateDetailsMutation = useMutation({
    mutationFn: async (newDetails: string) => {
      const {
        error
      } = await supabase.from("staff_requests").update({
        details: newDetails || null
      }).eq("id", requestId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["staff-request", requestId]
      });
      queryClient.invalidateQueries({
        queryKey: ["all-staff-requests"]
      });
      toast.success("Details updated");
      setEditingDetails(false);
    },
    onError: error => {
      toast.error("Failed to update details: " + error.message);
    }
  });

  // Assign cover mutation
  const assignCoverMutation = useMutation({
    mutationFn: async (coverUserId: string) => {
      if (!user || !request) throw new Error("Not authenticated or no request");

      // Compute working days from the covered person's shift patterns (same logic as display)
      const affectedShifts = getAffectedShiftsByDay();
      const uniqueWorkingDates = new Set(affectedShifts.map(s => s.date.toISOString().split('T')[0]));
      const computedWorkingDays = uniqueWorkingDates.size;
      
      // Use computed working days if available, otherwise fall back to linked holiday or request
      const daysRequested = computedWorkingDays > 0 
        ? computedWorkingDays 
        : (linkedHoliday?.days_taken ?? request.days_requested);
      
      const payload = {
        user_id: coverUserId,
        request_type: 'shift_swap' as const,
        swap_with_user_id: request.user_id,
        start_date: request.start_date,
        end_date: request.end_date,
        days_requested: daysRequested,
        details: `Covering for ${getStaffName(request.user_id)} during their holiday`,
        status: 'approved',
        reviewed_by: user.id,
        reviewed_at: new Date().toISOString(),
        client_informed: false
      };

      // If a cover request already exists for this exact period, update it instead of inserting a duplicate
      const {
        data: existing,
        error: existingError
      } = await supabase.from("staff_requests").select("id").eq("request_type", "shift_swap").eq("user_id", coverUserId).eq("swap_with_user_id", request.user_id).eq("start_date", request.start_date).eq("end_date", request.end_date).limit(1);
      if (existingError) throw existingError;
      if (existing && existing.length > 0) {
        const {
          error
        } = await supabase.from("staff_requests").update(payload).eq("id", existing[0].id);
        if (error) throw error;
        return;
      }

      // Create a shift_swap request for the covering staff member
      const {
        error
      } = await supabase.from("staff_requests").insert([payload]);
      if (error) throw error;

      // Auto-clear "no cover required" when assigning cover
      if (linkedHoliday?.no_cover_required) {
        await supabase
          .from("staff_holidays")
          .update({ no_cover_required: false })
          .eq("id", linkedHoliday.id);
      }
    },
    onSuccess: () => {
      refetchLinkedHoliday();
      refetchCoveringStaff();
      queryClient.invalidateQueries({
        queryKey: ["covering-staff", request?.id]
      });
      queryClient.invalidateQueries({
        queryKey: ["all-staff-requests"]
      });
      queryClient.invalidateQueries({ queryKey: ["staff-holidays"] });
      queryClient.invalidateQueries({ queryKey: ["staff-holidays-for-cover-status"] });
      queryClient.invalidateQueries({ queryKey: ["linked-holidays-for-requests"] });
      queryClient.invalidateQueries({ queryKey: ["linked-holiday", request?.id] });
      toast.success("Cover assigned successfully");
    },
    onError: error => {
      toast.error("Failed to assign cover: " + error.message);
    }
  });

  // Unassign cover mutation
  const unassignCoverMutation = useMutation({
    mutationFn: async (coverUserId: string) => {
      if (!request) throw new Error("No request");
      
      // Find and delete the cover request for this user
      const { error } = await supabase
        .from("staff_requests")
        .delete()
        .eq("request_type", "shift_swap")
        .eq("user_id", coverUserId)
        .eq("swap_with_user_id", request.user_id)
        .eq("start_date", request.start_date)
        .eq("end_date", request.end_date);
      
      if (error) throw error;
    },
    onSuccess: () => {
      refetchCoveringStaff();
      queryClient.invalidateQueries({ queryKey: ["covering-staff", request?.id] });
      queryClient.invalidateQueries({ queryKey: ["all-staff-requests"] });
      queryClient.invalidateQueries({ queryKey: ["staff-holidays"] });
      queryClient.invalidateQueries({ queryKey: ["staff-holidays-for-cover-status"] });
      queryClient.invalidateQueries({ queryKey: ["linked-holidays-for-requests"] });
      toast.success("Cover unassigned");
    },
    onError: (error) => {
      toast.error("Failed to unassign cover: " + error.message);
    }
  });

  // Toggle no cover required mutation
  const toggleNoCoverMutation = useMutation({
    mutationFn: async (noCoverRequired: boolean) => {
      if (!linkedHoliday) throw new Error("No linked holiday found");
      const { error } = await supabase
        .from("staff_holidays")
        .update({ no_cover_required: noCoverRequired })
        .eq("id", linkedHoliday.id);
      if (error) throw error;
    },
    onSuccess: () => {
      refetchLinkedHoliday();
      queryClient.invalidateQueries({ queryKey: ["staff-holidays"] });
      queryClient.invalidateQueries({ queryKey: ["staff-holidays-for-cover-status"] });
      queryClient.invalidateQueries({ queryKey: ["linked-holidays-for-requests"] });
      queryClient.invalidateQueries({ queryKey: ["linked-holiday", request?.id] });
      queryClient.invalidateQueries({ queryKey: ["all-staff-requests"] });
      toast.success("Cover requirement updated");
    },
    onError: (error) => {
      toast.error("Failed to update: " + error.message);
    }
  });

  const reviewMutation = useMutation({
    mutationFn: async (status: 'approved' | 'rejected') => {
      if (!user) throw new Error("Not authenticated");
      const {
        error
      } = await supabase.from("staff_requests").update({
        status,
        reviewed_by: user.id,
        reviewed_at: new Date().toISOString(),
        review_notes: reviewNotes || null
      }).eq("id", requestId);
      if (error) throw error;

      // If it's a holiday request being approved, sync to staff_holidays
      if (status === 'approved' && request && ['holiday', 'holiday_paid', 'holiday_unpaid'].includes(request.request_type)) {
        const absenceType = request.request_type === 'holiday_unpaid' ? 'unpaid' : 'holiday';
        await supabase.from("staff_holidays").insert([{
          user_id: request.user_id,
          absence_type: absenceType,
          start_date: request.start_date,
          end_date: request.end_date,
          days_taken: request.days_requested,
          status: 'approved',
          notes: request.details,
          approved_by: user.id,
          approved_at: new Date().toISOString()
        }]);
      }

      // Send email notification to the requester
      const requesterProfile = userProfiles.find(p => p.user_id === request.user_id);
      const reviewerProfile = userProfiles.find(p => p.user_id === user.id);
      if (requesterProfile?.email) {
        sendReviewEmail({
          type: status === 'approved' ? 'request_approved' : 'request_rejected',
          requestType: request.request_type,
          requesterName: requesterProfile.display_name || "Staff Member",
          requesterEmail: requesterProfile.email,
          startDate: request.start_date,
          endDate: request.end_date,
          daysRequested: request.days_requested,
          reviewNotes: reviewNotes || undefined,
          reviewerName: reviewerProfile?.display_name || user.email
        }).catch(err => console.error("Failed to send email notification:", err));
      }
    },
    onSuccess: (_, status) => {
      queryClient.invalidateQueries({
        queryKey: ["staff-request", requestId]
      });
      queryClient.invalidateQueries({
        queryKey: ["all-staff-requests"]
      });
      queryClient.invalidateQueries({
        queryKey: ["staff-holidays-for-schedule"]
      });
      toast.success(`Request ${status}`);
    },
    onError: error => {
      toast.error("Failed to update request: " + error.message);
    }
  });

  // Change request type mutation
  const changeRequestTypeMutation = useMutation({
    mutationFn: async (newType: RequestType) => {
      if (!user || !request) throw new Error("Not authenticated or no request");
      
      // Update the request type
      const { error } = await supabase
        .from("staff_requests")
        .update({ request_type: newType })
        .eq("id", requestId);
      if (error) throw error;

      // If the request is approved and it's a holiday type, also update the linked staff_holidays record
      if (request.status === 'approved' && ['holiday', 'holiday_paid', 'holiday_unpaid'].includes(request.request_type)) {
        const newAbsenceType = newType === 'holiday_unpaid' ? 'unpaid' : 'holiday';
        await supabase
          .from("staff_holidays")
          .update({ absence_type: newAbsenceType })
          .eq("user_id", request.user_id)
          .eq("start_date", request.start_date)
          .eq("end_date", request.end_date);
      }
    },
    onSuccess: async () => {
      await queryClient.refetchQueries({ queryKey: ["staff-request", requestId] });
      queryClient.invalidateQueries({ queryKey: ["all-staff-requests"] });
      queryClient.invalidateQueries({ queryKey: ["staff-holidays"] });
      queryClient.invalidateQueries({ queryKey: ["linked-holiday", request?.id] });
      toast.success("Request type updated successfully");
    },
    onError: (error) => {
      toast.error("Failed to update request type: " + error.message);
    }
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (request?.status === 'approved' && ['holiday', 'holiday_paid', 'holiday_unpaid'].includes(request.request_type)) {
        await supabase.from("staff_holidays").delete().eq("user_id", request.user_id).eq("start_date", request.start_date).eq("end_date", request.end_date);
      }
      const {
        error
      } = await supabase.from("staff_requests").delete().eq("id", requestId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["all-staff-requests"]
      });
      toast.success("Request deleted");
      onBack();
    },
    onError: error => {
      toast.error("Failed to delete request: " + error.message);
    }
  });
  const generateEmailTemplate = () => {
    if (!request) return "";
    const staffName = getStaffName(request.user_id);
    const startDate = format(new Date(request.start_date), 'EEEE, dd MMMM yyyy');
    const endDate = format(new Date(request.end_date), 'EEEE, dd MMMM yyyy');
    const isSingleDay = request.start_date === request.end_date;
    let coverInfo = "";
    if (coveringStaff && coveringStaff.length > 0) {
      const coverNames = coveringStaff.map(c => c.staffName).join(", ");
      coverInfo = `\n\nCover arrangements have been made. ${coverNames} will be covering during this period.`;
    } else {
      coverInfo = "\n\nPlease note that cover arrangements are still being finalised, and we will update you once confirmed.";
    }
    const dateText = isSingleDay ? `on ${startDate}` : `from ${startDate} to ${endDate} (${request.days_requested} day${request.days_requested > 1 ? 's' : ''})`;
    return `Dear Client,

I hope this email finds you well.

I am writing to inform you that ${staffName} will be on approved leave ${dateText}.${coverInfo}

If you have any questions or concerns regarding this, please do not hesitate to contact us.

Thank you for your understanding.

Kind regards,
Care Cuddle Team`;
  };
  const copyEmailToClipboard = () => {
    const email = generateEmailTemplate();
    navigator.clipboard.writeText(email);
    setEmailCopied(true);
    toast.success("Email template copied to clipboard");
    setTimeout(() => setEmailCopied(false), 2000);
  };
  if (isLoading) {
    return <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>;
  }
  if (!request) {
    return <div className="text-center py-12">
        <p className="text-muted-foreground">Request not found</p>
        <Button variant="outline" onClick={onBack} className="mt-4">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Requests
        </Button>
      </div>;
  }
  const typeInfo = REQUEST_TYPE_INFO[request.request_type];
  const Icon = typeInfo?.icon || Clock;
  const isHolidayRequest = ['holiday', 'holiday_paid', 'holiday_unpaid'].includes(request.request_type);
  return <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={onBack}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-3">
              <Icon className={`h-6 w-6 ${typeInfo?.color || ''}`} />
              {typeInfo?.label || request.request_type} Request
            </h1>
            <p className="text-muted-foreground mt-1">
              Submitted by {getStaffName(request.user_id)} on {format(new Date(request.created_at), 'dd MMMM yyyy')}
            </p>
          </div>
        </div>
        <Badge variant="outline" className={`text-lg px-4 py-2 ${STATUS_COLORS[request.status] || ''}`}>
          {request.status.charAt(0).toUpperCase() + request.status.slice(1)}
        </Badge>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Details */}
        <div className="lg:col-span-2 space-y-6">
          {/* Request Details Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                Request Details
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-6">
              <div>
                  <Label className="text-muted-foreground text-sm">Staff Member</Label>
                  {onViewProfile ? <button onClick={() => onViewProfile(request.user_id)} className="text-lg font-medium mt-1 text-primary hover:underline text-left block">
                      {getStaffName(request.user_id)}
                    </button> : <p className="text-lg font-medium mt-1">{getStaffName(request.user_id)}</p>}
                  <p className="text-sm text-muted-foreground">{getStaffEmail(request.user_id)}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground text-sm">Request Type</Label>
                  <Select
                    value={request.request_type}
                    onValueChange={(value) => changeRequestTypeMutation.mutate(value as RequestType)}
                    disabled={changeRequestTypeMutation.isPending}
                  >
                    <SelectTrigger className="w-full mt-1">
                      <SelectValue>
                        <div className="flex items-center gap-2">
                          <Icon className={`h-4 w-4 ${typeInfo?.color || ''}`} />
                          <span>{typeInfo?.label}</span>
                        </div>
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="holiday_paid">
                        <div className="flex items-center gap-2">
                          <Palmtree className="h-4 w-4 text-green-600" />
                          Paid Holiday
                        </div>
                      </SelectItem>
                      <SelectItem value="holiday_unpaid">
                        <div className="flex items-center gap-2">
                          <Palmtree className="h-4 w-4 text-yellow-600" />
                          Unpaid Holiday
                        </div>
                      </SelectItem>
                      <SelectItem value="holiday">
                        <div className="flex items-center gap-2">
                          <Palmtree className="h-4 w-4 text-green-600" />
                          Holiday / Time Off
                        </div>
                      </SelectItem>
                      <SelectItem value="overtime_standard">
                        <div className="flex items-center gap-2">
                          <Clock className="h-4 w-4 text-orange-600" />
                          Overtime – Standard Hours
                        </div>
                      </SelectItem>
                      <SelectItem value="overtime_double_up">
                        <div className="flex items-center gap-2">
                          <Clock className="h-4 w-4 text-amber-600" />
                          Overtime – Outside Hours
                        </div>
                      </SelectItem>
                      <SelectItem value="shift_swap">
                        <div className="flex items-center gap-2">
                          <RefreshCw className="h-4 w-4 text-blue-600" />
                          Shift Cover
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  {request.overtime_type && <Badge variant="outline" className="mt-1">
                      {request.overtime_type === 'standard_hours' ? 'Standard Hours' : 'Outside Hours'}
                    </Badge>}
                </div>
                <div>
                  <Label className="text-muted-foreground text-sm">Start Date</Label>
                  <p className="text-lg font-medium mt-1">{format(new Date(request.start_date), 'EEEE, dd MMMM yyyy')}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground text-sm">End Date</Label>
                  <p className="text-lg font-medium mt-1">{format(new Date(request.end_date), 'EEEE, dd MMMM yyyy')}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground text-sm">Days Requested</Label>
                  {(() => {
                  const affectedShifts = getAffectedShiftsByDay();
                  const uniqueWorkingDays = new Set(affectedShifts.map(s => s.date.toISOString().split('T')[0])).size;
                  const calendarDays = request.days_requested;
                  if (isHolidayRequest && affectedShifts.length > 0 && uniqueWorkingDays !== calendarDays) {
                    return <div className="mt-1">
                          <p className="text-lg font-medium">
                            {uniqueWorkingDays} working day{uniqueWorkingDays !== 1 ? 's' : ''}
                          </p>
                          
                        </div>;
                  }
                  return <p className="text-lg font-medium mt-1">{calendarDays} day{calendarDays > 1 ? 's' : ''}</p>;
                })()}
                </div>
                <div>
                  <Label className="text-muted-foreground text-sm">Submitted</Label>
                  <p className="text-lg font-medium mt-1">{format(new Date(request.created_at), 'dd MMM yyyy HH:mm')}</p>
                </div>
              </div>

              {/* Affected Shift Times - Day by Day Breakdown */}
              {getAffectedShiftsByDay().length > 0 && <>
                  <Separator />
                  <div>
                    <Label className="text-muted-foreground text-sm">Affected Shift Times</Label>
                    <div className="mt-2 space-y-1">
                      {getAffectedShiftsByDay().map((shift, idx) => <div key={idx} className="flex items-center gap-2 text-sm">
                          <span className="font-medium min-w-[140px]">
                            {format(shift.date, 'EEE, dd MMM yyyy')}
                          </span>
                          <Badge variant="outline" className="bg-muted">
                            <Clock className="h-3 w-3 mr-1" />
                            {shift.shiftTime}
                          </Badge>
                          <span className="text-muted-foreground text-xs">
                            ({shift.clientName})
                          </span>
                        </div>)}
                    </div>
                  </div>
                </>}

              <Separator />
              <div>
                <div className="flex items-center justify-between">
                  <Label className="text-muted-foreground text-sm">Additional Details</Label>
                  {!editingDetails && <Button variant="ghost" size="sm" onClick={() => setEditingDetails(true)} className="h-8">
                      <Pencil className="h-3 w-3 mr-1" />
                      Edit
                    </Button>}
                </div>
                {editingDetails ? <div className="mt-2 space-y-2">
                    <Textarea value={detailsValue} onChange={e => setDetailsValue(e.target.value)} placeholder="Add additional details..." className="min-h-[100px]" />
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => updateDetailsMutation.mutate(detailsValue)} disabled={updateDetailsMutation.isPending}>
                        {updateDetailsMutation.isPending ? "Saving..." : "Save"}
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => {
                    setDetailsValue(request.details || "");
                    setEditingDetails(false);
                  }}>
                        Cancel
                      </Button>
                    </div>
                  </div> : <p className="mt-2 p-4 bg-muted rounded-lg">
                    {request.details || <span className="text-muted-foreground italic">No additional details</span>}
                  </p>}
              </div>

              {/* Assigned Clients */}
              {clientAssignments.length > 0 && <>
                  <Separator />
                  <div>
                    <Label className="text-muted-foreground text-sm">Assigned Clients</Label>
                    <div className="flex flex-wrap gap-2 mt-2">
                      {clientAssignments.map((ca, idx) => <Badge key={idx} variant="secondary">{ca.client_name}</Badge>)}
                    </div>
                  </div>
                </>}
            </CardContent>
          </Card>

          {/* Cover Arrangements */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="h-5 w-5" />
                Cover Arrangements
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Cover Status Section */}
              {linkedHoliday?.no_cover_required ? (
                <div className="flex items-center gap-3 p-4 bg-success/10 border border-success/20 rounded-lg">
                  <CheckCircle2 className="h-5 w-5 text-success" />
                  <div className="flex-1">
                    <p className="font-medium text-success">No cover required</p>
                    <p className="text-sm text-muted-foreground">This absence has been marked as not requiring cover</p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => toggleNoCoverMutation.mutate(false)}
                    disabled={toggleNoCoverMutation.isPending}
                  >
                    Require Cover
                  </Button>
                </div>
              ) : (
                <>
                  {/* Current Cover */}
                  {coveringStaff && coveringStaff.length > 0 ? <div className="space-y-3">
                      <Label className="text-muted-foreground text-sm">Assigned Cover</Label>
                      {coveringStaff.map((cover, idx) => <div key={idx} className="flex items-center gap-3 p-3 bg-success/10 border border-success/20 rounded-lg">
                          <CheckCircle2 className="h-5 w-5 text-success" />
                          <div>
                            <p className="font-medium">{cover.staffName}</p>
                            <p className="text-sm text-muted-foreground">
                              Covering from {format(new Date(cover.start_date), 'dd MMM')} to {format(new Date(cover.end_date), 'dd MMM')}
                            </p>
                          </div>
                        </div>)}
                    </div> : <div className="flex items-center gap-3 p-4 bg-amber-500/10 border border-amber-500/20 rounded-lg">
                      <AlertCircle className="h-5 w-5 text-amber-600" />
                      <div className="flex-1">
                        <p className="font-medium">No cover arranged yet</p>
                        <p className="text-sm text-muted-foreground">Click a staff member below to assign them as cover, or mark as not required</p>
                      </div>
                      {linkedHoliday && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => toggleNoCoverMutation.mutate(true)}
                          disabled={toggleNoCoverMutation.isPending}
                          className="whitespace-nowrap"
                        >
                          <UserX className="h-4 w-4 mr-1" />
                          Cover Not Required
                        </Button>
                      )}
                    </div>}
                </>
              )}

              {/* Assign Cover Section - always show for holiday requests */}
              {isHolidayRequest && <div className="space-y-4">
                  <Separator />
                  
                  {/* Care Cuddle Bench Staff */}
                  {(() => {
                const benchStaff = allStaffWithAssignments.filter(s => s.isBench && s.user_id !== request.user_id);
                const otherStaff = allStaffWithAssignments.filter(s => !s.isBench && s.user_id !== request.user_id);
                const coveredUserIds = (coveringStaff || []).map(c => c.user_id);
                return <>
                        {benchStaff.length > 0 && <div>
                            <Label className="text-muted-foreground text-sm flex items-center gap-2">
                              <span className="inline-block w-2 h-2 rounded-full bg-purple-500"></span>
                              Care Cuddle Bench
                            </Label>
                            <div className="flex flex-wrap gap-2 mt-2">
                              {benchStaff.map(staff => {
                        const isAssigned = coveredUserIds.includes(staff.user_id);
                        const isPending = assignCoverMutation.isPending || unassignCoverMutation.isPending;
                        return <Button 
                          key={staff.user_id} 
                          variant={isAssigned ? "secondary" : "outline"} 
                          size="sm" 
                          disabled={isPending} 
                          onClick={() => isAssigned 
                            ? unassignCoverMutation.mutate(staff.user_id) 
                            : assignCoverMutation.mutate(staff.user_id)
                          } 
                          className={isAssigned ? "bg-success/20 text-success border-success hover:bg-destructive/20 hover:text-destructive hover:border-destructive" : "hover:bg-purple-50 hover:border-purple-300"}
                        >
                                    {isAssigned && <CheckCircle2 className="h-3 w-3 mr-1" />}
                                    {staff.display_name || staff.email}
                                  </Button>;
                      })}
                            </div>
                          </div>}

                        {otherStaff.length > 0 && <div>
                            <Label className="text-muted-foreground text-sm flex items-center gap-2">
                              <span className="inline-block w-2 h-2 rounded-full bg-blue-500"></span>
                              Other Staff
                            </Label>
                            <div className="flex flex-wrap gap-2 mt-2">
                              {otherStaff.map(staff => {
                        const isAssigned = coveredUserIds.includes(staff.user_id);
                        const isPending = assignCoverMutation.isPending || unassignCoverMutation.isPending;
                        return <Button 
                          key={staff.user_id} 
                          variant={isAssigned ? "secondary" : "outline"} 
                          size="sm" 
                          disabled={isPending} 
                          onClick={() => isAssigned 
                            ? unassignCoverMutation.mutate(staff.user_id) 
                            : assignCoverMutation.mutate(staff.user_id)
                          } 
                          className={isAssigned ? "bg-success/20 text-success border-success hover:bg-destructive/20 hover:text-destructive hover:border-destructive" : "hover:bg-blue-50 hover:border-blue-300"}
                        >
                                    {isAssigned && <CheckCircle2 className="h-3 w-3 mr-1" />}
                                    {staff.display_name || staff.email}
                                  </Button>;
                      })}
                            </div>
                          </div>}
                      </>;
              })()}
                </div>}
            </CardContent>
          </Card>

          {/* Email Template for Holiday Requests */}
          {isHolidayRequest && <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Client Notification Email
                </CardTitle>
                <CardDescription>
                  Copy this pre-configured email to notify the client about this staff member's leave
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="bg-muted p-4 rounded-lg font-mono text-sm whitespace-pre-wrap">
                  {generateEmailTemplate()}
                </div>
                <Button onClick={copyEmailToClipboard} className="w-full">
                  <Copy className="h-4 w-4 mr-2" />
                  {emailCopied ? "Copied!" : "Copy Email to Clipboard"}
                </Button>
              </CardContent>
            </Card>}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Client Notification Status (Holiday requests only) */}
          {isHolidayRequest && <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  {(request as any).client_informed ? <Bell className="h-5 w-5 text-green-600" /> : <BellOff className="h-5 w-5 text-amber-600" />}
                  Client Notification
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-start gap-3">
                  <Checkbox id="client-informed" checked={(request as any).client_informed || false} onCheckedChange={checked => clientInformedMutation.mutate(!!checked)} disabled={clientInformedMutation.isPending} className="mt-1" />
                  <div>
                    <Label htmlFor="client-informed" className="font-medium cursor-pointer">
                      Client has been informed
                    </Label>
                    <p className="text-xs text-muted-foreground mt-1">
                      Check this once you have notified the relevant client(s) about this leave
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>}

          {/* Review Section */}
          <Card>
            <CardHeader>
              <CardTitle>Review Decision</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {request.status === 'pending' ? <>
                  <div className="space-y-2">
                    <Label>Review Notes (Optional)</Label>
                    <Textarea value={reviewNotes} onChange={e => setReviewNotes(e.target.value)} placeholder="Add any notes about this decision..." rows={3} />
                  </div>
                  <div className="flex gap-2">
                    <Button variant="destructive" onClick={() => reviewMutation.mutate('rejected')} disabled={reviewMutation.isPending} className="flex-1">
                      <X className="h-4 w-4 mr-1" />
                      Reject
                    </Button>
                    <Button onClick={() => reviewMutation.mutate('approved')} disabled={reviewMutation.isPending} className="flex-1 bg-success hover:bg-success/90">
                      <Check className="h-4 w-4 mr-1" />
                      Approve
                    </Button>
                  </div>
                </> : <>
                  {request.review_notes && <div>
                      <Label className="text-muted-foreground text-sm">Review Notes</Label>
                      <p className="mt-1 p-3 bg-muted rounded-md text-sm">{request.review_notes}</p>
                    </div>}
                  {request.reviewed_at && <div className="text-sm text-muted-foreground">
                      <p>Reviewed on {format(new Date(request.reviewed_at), 'dd MMM yyyy HH:mm')}</p>
                      {request.reviewed_by && <p>by {getStaffName(request.reviewed_by)}</p>}
                    </div>}
                  <Separator />
                  <Button variant="destructive" onClick={() => deleteMutation.mutate()} disabled={deleteMutation.isPending} className="w-full">
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete Request
                  </Button>
                </>}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>;
}