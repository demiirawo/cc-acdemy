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
import { 
  ArrowLeft, Check, X, Clock, Palmtree, RefreshCw, Bell, BellOff, 
  Copy, Calendar, User, FileText, CheckCircle2, AlertCircle, Trash2, Pencil
} from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";

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

const REQUEST_TYPE_INFO: Record<string, { label: string; icon: typeof Clock; color: string }> = {
  overtime: { label: "Overtime", icon: Clock, color: "text-orange-600" },
  overtime_standard: { label: "Overtime – Standard Hours", icon: Clock, color: "text-orange-600" },
  overtime_double_up: { label: "Overtime – Outside Hours", icon: Clock, color: "text-amber-600" },
  holiday: { label: "Holiday / Time Off", icon: Palmtree, color: "text-green-600" },
  holiday_paid: { label: "Paid Holiday", icon: Palmtree, color: "text-green-600" },
  holiday_unpaid: { label: "Unpaid Holiday", icon: Palmtree, color: "text-yellow-600" },
  shift_swap: { label: "Shift Cover", icon: RefreshCw, color: "text-blue-600" }
};

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-warning/20 text-warning-foreground border-warning',
  approved: 'bg-success/20 text-success border-success',
  rejected: 'bg-destructive/20 text-destructive border-destructive',
};

interface RequestDetailPageProps {
  requestId: string;
  onBack: () => void;
}

export function RequestDetailPage({ requestId, onBack }: RequestDetailPageProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [reviewNotes, setReviewNotes] = useState("");
  const [emailCopied, setEmailCopied] = useState(false);
  const [editingDetails, setEditingDetails] = useState(false);
  const [detailsValue, setDetailsValue] = useState("");

  // Fetch the specific request
  const { data: request, isLoading } = useQuery({
    queryKey: ["staff-request", requestId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("staff_requests")
        .select("*")
        .eq("id", requestId)
        .single();
      
      if (error) throw error;
      return data as StaffRequest;
    }
  });

  // Fetch user profiles
  const { data: userProfiles = [] } = useQuery({
    queryKey: ["user-profiles-for-request-detail"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("user_id, display_name, email");
      
      if (error) throw error;
      return data as UserProfile[];
    }
  });

  // Fetch client assignments for the staff member
  const { data: clientAssignments = [] } = useQuery({
    queryKey: ["client-assignments", request?.user_id],
    enabled: !!request?.user_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("staff_client_assignments")
        .select("client_name")
        .eq("staff_user_id", request!.user_id);
      
      if (error) throw error;
      return data as ClientAssignment[];
    }
  });

  // Fetch all staff with their client assignments (to identify bench staff)
  const { data: allStaffWithAssignments = [] } = useQuery({
    queryKey: ["all-staff-with-assignments"],
    queryFn: async () => {
      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("user_id, display_name, email");
      
      if (profilesError) throw profilesError;

      const { data: assignments, error: assignmentsError } = await supabase
        .from("staff_client_assignments")
        .select("staff_user_id, client_name");
      
      if (assignmentsError) throw assignmentsError;

      // Map profiles with their assignments
      return (profiles || []).map(profile => ({
        ...profile,
        clientAssignments: (assignments || [])
          .filter(a => a.staff_user_id === profile.user_id)
          .map(a => a.client_name),
        isBench: (assignments || []).some(
          a => a.staff_user_id === profile.user_id && a.client_name === "Care Cuddle"
        )
      }));
    }
  });

  // Fetch covering staff info (for shift swaps where someone is covering this person's holiday)
  const { data: coveringStaff, refetch: refetchCoveringStaff } = useQuery({
    queryKey: ["covering-staff", request?.id],
    enabled: !!request && ['holiday', 'holiday_paid', 'holiday_unpaid'].includes(request.request_type),
    queryFn: async () => {
      // Find shift swap requests that cover this person's dates
      const { data, error } = await supabase
        .from("staff_requests")
        .select("*")
        .eq("request_type", "shift_swap")
        .eq("swap_with_user_id", request!.user_id)
        .gte("start_date", request!.start_date)
        .lte("end_date", request!.end_date);
      
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
      const { error } = await supabase
        .from("staff_requests")
        .update({ client_informed: informed })
        .eq("id", requestId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["staff-request", requestId] });
      queryClient.invalidateQueries({ queryKey: ["all-staff-requests"] });
      toast.success("Client notification status updated");
    },
    onError: (error) => {
      toast.error("Failed to update: " + error.message);
    }
  });

  // Update details mutation
  const updateDetailsMutation = useMutation({
    mutationFn: async (newDetails: string) => {
      const { error } = await supabase
        .from("staff_requests")
        .update({ details: newDetails || null })
        .eq("id", requestId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["staff-request", requestId] });
      queryClient.invalidateQueries({ queryKey: ["all-staff-requests"] });
      toast.success("Details updated");
      setEditingDetails(false);
    },
    onError: (error) => {
      toast.error("Failed to update details: " + error.message);
    }
  });

  // Assign cover mutation
  const assignCoverMutation = useMutation({
    mutationFn: async (coverUserId: string) => {
      if (!user || !request) throw new Error("Not authenticated or no request");

      // Calculate days between start and end date
      const startDate = new Date(request.start_date);
      const endDate = new Date(request.end_date);
      const diffTime = Math.abs(endDate.getTime() - startDate.getTime());
      const daysRequested = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;

      // Create a shift_swap request for the covering staff member
      const { error } = await supabase
        .from("staff_requests")
        .insert([{
          user_id: coverUserId,
          request_type: 'shift_swap',
          swap_with_user_id: request.user_id,
          start_date: request.start_date,
          end_date: request.end_date,
          days_requested: daysRequested,
          details: `Covering for ${getStaffName(request.user_id)} during their holiday`,
          status: 'approved',
          reviewed_by: user.id,
          reviewed_at: new Date().toISOString(),
          client_informed: false
        }]);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["covering-staff", request?.id] });
      queryClient.invalidateQueries({ queryKey: ["all-staff-requests"] });
      toast.success("Cover assigned successfully");
    },
    onError: (error) => {
      toast.error("Failed to assign cover: " + error.message);
    }
  });

  // Review mutation
  const reviewMutation = useMutation({
    mutationFn: async (status: 'approved' | 'rejected') => {
      if (!user) throw new Error("Not authenticated");

      const { error } = await supabase
        .from("staff_requests")
        .update({
          status,
          reviewed_by: user.id,
          reviewed_at: new Date().toISOString(),
          review_notes: reviewNotes || null
        })
        .eq("id", requestId);

      if (error) throw error;

      // If it's a holiday request being approved, sync to staff_holidays
      if (status === 'approved' && request && ['holiday', 'holiday_paid', 'holiday_unpaid'].includes(request.request_type)) {
        const absenceType = request.request_type === 'holiday_unpaid' ? 'unpaid' : 'holiday';
        await supabase
          .from("staff_holidays")
          .insert([{
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
    },
    onSuccess: (_, status) => {
      queryClient.invalidateQueries({ queryKey: ["staff-request", requestId] });
      queryClient.invalidateQueries({ queryKey: ["all-staff-requests"] });
      queryClient.invalidateQueries({ queryKey: ["staff-holidays-for-schedule"] });
      toast.success(`Request ${status}`);
    },
    onError: (error) => {
      toast.error("Failed to update request: " + error.message);
    }
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (request?.status === 'approved' && 
          ['holiday', 'holiday_paid', 'holiday_unpaid'].includes(request.request_type)) {
        await supabase
          .from("staff_holidays")
          .delete()
          .eq("user_id", request.user_id)
          .eq("start_date", request.start_date)
          .eq("end_date", request.end_date);
      }

      const { error } = await supabase
        .from("staff_requests")
        .delete()
        .eq("id", requestId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["all-staff-requests"] });
      toast.success("Request deleted");
      onBack();
    },
    onError: (error) => {
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

    const dateText = isSingleDay 
      ? `on ${startDate}` 
      : `from ${startDate} to ${endDate} (${request.days_requested} day${request.days_requested > 1 ? 's' : ''})`;

    return `Dear Client,

I hope this email finds you well.

I am writing to inform you that ${staffName} will be on approved leave ${dateText}.${coverInfo}

If you have any questions or concerns regarding the care arrangements during this period, please do not hesitate to contact us.

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
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!request) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Request not found</p>
        <Button variant="outline" onClick={onBack} className="mt-4">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Requests
        </Button>
      </div>
    );
  }

  const typeInfo = REQUEST_TYPE_INFO[request.request_type];
  const Icon = typeInfo?.icon || Clock;
  const isHolidayRequest = ['holiday', 'holiday_paid', 'holiday_unpaid'].includes(request.request_type);

  return (
    <div className="space-y-6">
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
                  <p className="text-lg font-medium mt-1">{getStaffName(request.user_id)}</p>
                  <p className="text-sm text-muted-foreground">{getStaffEmail(request.user_id)}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground text-sm">Request Type</Label>
                  <div className="flex items-center gap-2 mt-1">
                    <Icon className={`h-5 w-5 ${typeInfo?.color || ''}`} />
                    <span className="text-lg font-medium">{typeInfo?.label}</span>
                  </div>
                  {request.overtime_type && (
                    <Badge variant="outline" className="mt-1">
                      {request.overtime_type === 'standard_hours' ? 'Standard Hours' : 'Outside Hours'}
                    </Badge>
                  )}
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
                  <p className="text-lg font-medium mt-1">{request.days_requested} day{request.days_requested > 1 ? 's' : ''}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground text-sm">Submitted</Label>
                  <p className="text-lg font-medium mt-1">{format(new Date(request.created_at), 'dd MMM yyyy HH:mm')}</p>
                </div>
              </div>

              <Separator />
              <div>
                <div className="flex items-center justify-between">
                  <Label className="text-muted-foreground text-sm">Additional Details</Label>
                  {!editingDetails && (
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      onClick={() => setEditingDetails(true)}
                      className="h-8"
                    >
                      <Pencil className="h-3 w-3 mr-1" />
                      Edit
                    </Button>
                  )}
                </div>
                {editingDetails ? (
                  <div className="mt-2 space-y-2">
                    <Textarea
                      value={detailsValue}
                      onChange={(e) => setDetailsValue(e.target.value)}
                      placeholder="Add additional details..."
                      className="min-h-[100px]"
                    />
                    <div className="flex gap-2">
                      <Button 
                        size="sm" 
                        onClick={() => updateDetailsMutation.mutate(detailsValue)}
                        disabled={updateDetailsMutation.isPending}
                      >
                        {updateDetailsMutation.isPending ? "Saving..." : "Save"}
                      </Button>
                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={() => {
                          setDetailsValue(request.details || "");
                          setEditingDetails(false);
                        }}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <p className="mt-2 p-4 bg-muted rounded-lg">
                    {request.details || <span className="text-muted-foreground italic">No additional details</span>}
                  </p>
                )}
              </div>

              {/* Assigned Clients */}
              {clientAssignments.length > 0 && (
                <>
                  <Separator />
                  <div>
                    <Label className="text-muted-foreground text-sm">Assigned Clients</Label>
                    <div className="flex flex-wrap gap-2 mt-2">
                      {clientAssignments.map((ca, idx) => (
                        <Badge key={idx} variant="secondary">{ca.client_name}</Badge>
                      ))}
                    </div>
                  </div>
                </>
              )}
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
              {/* Current Cover */}
              {coveringStaff && coveringStaff.length > 0 ? (
                <div className="space-y-3">
                  <Label className="text-muted-foreground text-sm">Assigned Cover</Label>
                  {coveringStaff.map((cover, idx) => (
                    <div key={idx} className="flex items-center gap-3 p-3 bg-success/10 border border-success/20 rounded-lg">
                      <CheckCircle2 className="h-5 w-5 text-success" />
                      <div>
                        <p className="font-medium">{cover.staffName}</p>
                        <p className="text-sm text-muted-foreground">
                          Covering from {format(new Date(cover.start_date), 'dd MMM')} to {format(new Date(cover.end_date), 'dd MMM')}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex items-center gap-3 p-4 bg-amber-500/10 border border-amber-500/20 rounded-lg">
                  <AlertCircle className="h-5 w-5 text-amber-600" />
                  <div>
                    <p className="font-medium">No cover arranged yet</p>
                    <p className="text-sm text-muted-foreground">Click a staff member below to assign them as cover</p>
                  </div>
                </div>
              )}

              {/* Assign Cover Section - only show for holiday requests */}
              {isHolidayRequest && (
                <div className="space-y-4">
                  <Separator />
                  
                  {/* Care Cuddle Bench Staff */}
                  {(() => {
                    const benchStaff = allStaffWithAssignments.filter(
                      s => s.isBench && s.user_id !== request.user_id
                    );
                    const otherStaff = allStaffWithAssignments.filter(
                      s => !s.isBench && s.user_id !== request.user_id
                    );
                    const coveredUserIds = (coveringStaff || []).map(c => c.user_id);

                    return (
                      <>
                        {benchStaff.length > 0 && (
                          <div>
                            <Label className="text-muted-foreground text-sm flex items-center gap-2">
                              <span className="inline-block w-2 h-2 rounded-full bg-purple-500"></span>
                              Care Cuddle Bench
                            </Label>
                            <div className="flex flex-wrap gap-2 mt-2">
                              {benchStaff.map(staff => {
                                const isAssigned = coveredUserIds.includes(staff.user_id);
                                return (
                                  <Button
                                    key={staff.user_id}
                                    variant={isAssigned ? "secondary" : "outline"}
                                    size="sm"
                                    disabled={isAssigned || assignCoverMutation.isPending}
                                    onClick={() => assignCoverMutation.mutate(staff.user_id)}
                                    className={isAssigned ? "bg-success/20 text-success border-success" : "hover:bg-purple-50 hover:border-purple-300"}
                                  >
                                    {isAssigned && <CheckCircle2 className="h-3 w-3 mr-1" />}
                                    {staff.display_name || staff.email}
                                  </Button>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {otherStaff.length > 0 && (
                          <div>
                            <Label className="text-muted-foreground text-sm flex items-center gap-2">
                              <span className="inline-block w-2 h-2 rounded-full bg-blue-500"></span>
                              Other Staff
                            </Label>
                            <div className="flex flex-wrap gap-2 mt-2">
                              {otherStaff.map(staff => {
                                const isAssigned = coveredUserIds.includes(staff.user_id);
                                return (
                                  <Button
                                    key={staff.user_id}
                                    variant={isAssigned ? "secondary" : "outline"}
                                    size="sm"
                                    disabled={isAssigned || assignCoverMutation.isPending}
                                    onClick={() => assignCoverMutation.mutate(staff.user_id)}
                                    className={isAssigned ? "bg-success/20 text-success border-success" : "hover:bg-blue-50 hover:border-blue-300"}
                                  >
                                    {isAssigned && <CheckCircle2 className="h-3 w-3 mr-1" />}
                                    {staff.display_name || staff.email}
                                  </Button>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </>
                    );
                  })()}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Email Template for Holiday Requests */}
          {isHolidayRequest && (
            <Card>
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
            </Card>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Client Notification Status (Holiday requests only) */}
          {isHolidayRequest && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  {(request as any).client_informed ? (
                    <Bell className="h-5 w-5 text-green-600" />
                  ) : (
                    <BellOff className="h-5 w-5 text-amber-600" />
                  )}
                  Client Notification
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-start gap-3">
                  <Checkbox
                    id="client-informed"
                    checked={(request as any).client_informed || false}
                    onCheckedChange={(checked) => clientInformedMutation.mutate(!!checked)}
                    disabled={clientInformedMutation.isPending}
                    className="mt-1"
                  />
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
            </Card>
          )}

          {/* Review Section */}
          <Card>
            <CardHeader>
              <CardTitle>Review Decision</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {request.status === 'pending' ? (
                <>
                  <div className="space-y-2">
                    <Label>Review Notes (Optional)</Label>
                    <Textarea
                      value={reviewNotes}
                      onChange={(e) => setReviewNotes(e.target.value)}
                      placeholder="Add any notes about this decision..."
                      rows={3}
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="destructive"
                      onClick={() => reviewMutation.mutate('rejected')}
                      disabled={reviewMutation.isPending}
                      className="flex-1"
                    >
                      <X className="h-4 w-4 mr-1" />
                      Reject
                    </Button>
                    <Button
                      onClick={() => reviewMutation.mutate('approved')}
                      disabled={reviewMutation.isPending}
                      className="flex-1 bg-success hover:bg-success/90"
                    >
                      <Check className="h-4 w-4 mr-1" />
                      Approve
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  {request.review_notes && (
                    <div>
                      <Label className="text-muted-foreground text-sm">Review Notes</Label>
                      <p className="mt-1 p-3 bg-muted rounded-md text-sm">{request.review_notes}</p>
                    </div>
                  )}
                  {request.reviewed_at && (
                    <div className="text-sm text-muted-foreground">
                      <p>Reviewed on {format(new Date(request.reviewed_at), 'dd MMM yyyy HH:mm')}</p>
                      {request.reviewed_by && <p>by {getStaffName(request.reviewed_by)}</p>}
                    </div>
                  )}
                  <Separator />
                  <Button
                    variant="destructive"
                    onClick={() => deleteMutation.mutate()}
                    disabled={deleteMutation.isPending}
                    className="w-full"
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete Request
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}