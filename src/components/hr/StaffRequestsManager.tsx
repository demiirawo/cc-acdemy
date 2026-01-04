import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Check, X, Clock, Palmtree, RefreshCw, Eye, Trash2, ChevronLeft, ChevronRight, Bell, BellOff } from "lucide-react";
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

interface LinkedHoliday {
  id: string;
  user_id: string;
  start_date: string;
  end_date: string;
  days_taken: number;
  absence_type: string;
}

const REQUEST_TYPE_INFO: Record<string, { label: string; icon: typeof Clock; color: string }> = {
  overtime: {
    label: "Overtime",
    icon: Clock,
    color: "text-orange-600"
  },
  overtime_standard: {
    label: "Overtime – Standard Hours (Legacy)",
    icon: Clock,
    color: "text-orange-600"
  },
  overtime_double_up: {
    label: "Overtime – Outside Hours (Legacy)",
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
  rejected: 'bg-destructive/20 text-destructive border-destructive',
};

interface StaffRequestsManagerProps {
  onViewRequest?: (requestId: string) => void;
}

export function StaffRequestsManager({ onViewRequest }: StaffRequestsManagerProps = {}) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<string>("pending");
  const [reviewDialogOpen, setReviewDialogOpen] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<StaffRequest | null>(null);
  const [reviewNotes, setReviewNotes] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 10;

  // Fetch all staff requests
  const { data: requests = [], isLoading } = useQuery({
    queryKey: ["all-staff-requests"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("staff_requests")
        .select("*")
        .order("created_at", { ascending: false });
      
      if (error) throw error;
      return data as StaffRequest[];
    }
  });

  // Fetch user profiles for display names
  const { data: userProfiles = [] } = useQuery({
    queryKey: ["user-profiles-for-requests"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("user_id, display_name, email");
      
      if (error) throw error;
      return data as UserProfile[];
    }
  });

  // Fetch linked holidays for overtime requests
  const { data: linkedHolidays = [] } = useQuery({
    queryKey: ["linked-holidays-for-requests"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("staff_holidays")
        .select("id, user_id, start_date, end_date, days_taken, absence_type");
      
      if (error) throw error;
      return data as LinkedHoliday[];
    }
  });

  // Review request mutation
  const reviewMutation = useMutation({
    mutationFn: async ({ requestId, status }: { requestId: string; status: 'approved' | 'rejected' }) => {
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
          review_notes: reviewNotes || null
        })
        .eq("id", requestId);

      if (error) throw error;

      // If it's a shift cover being approved, assign the covered staff's shifts to the covering staff
      if (status === 'approved' && request.request_type === 'shift_swap' && request.swap_with_user_id) {
        // request.user_id = the staff member who is COVERING
        // request.swap_with_user_id = the staff member being COVERED (whose shifts need to be taken over)
        const startDate = request.start_date;
        const endDate = request.end_date;
        
        // Get the covered staff's schedules in the date range
        const { data: coveredSchedules, error: coveredSchedError } = await supabase
          .from("staff_schedules")
          .select("*")
          .eq("user_id", request.swap_with_user_id)
          .gte("start_datetime", startDate)
          .lte("start_datetime", endDate + "T23:59:59");
        
        if (coveredSchedError) console.error('Error fetching covered staff schedules:', coveredSchedError);
        
        // Reassign the covered staff's schedules to the covering staff
        if (coveredSchedules && coveredSchedules.length > 0) {
          for (const schedule of coveredSchedules) {
            await supabase
              .from("staff_schedules")
              .update({ user_id: request.user_id })
              .eq("id", schedule.id);
          }
        }
        
        console.log(`Shift cover completed: ${coveredSchedules?.length || 0} schedules reassigned to covering staff`);
      }

      // If it's a holiday request being approved, sync to staff_holidays
      if (status === 'approved' && (request.request_type === 'holiday' || request.request_type === 'holiday_paid' || request.request_type === 'holiday_unpaid')) {
        const absenceType: 'holiday' | 'unpaid_leave' = request.request_type === 'holiday_unpaid' ? 'unpaid_leave' : 'holiday';
        const { error: holidayError } = await supabase
          .from("staff_holidays")
          .insert([{
            user_id: request.user_id,
            absence_type: absenceType as 'holiday' | 'maternity' | 'other' | 'paternity' | 'personal' | 'sick' | 'unpaid',
            start_date: request.start_date,
            end_date: request.end_date,
            days_taken: request.days_requested,
            status: 'approved',
            notes: request.details,
            approved_by: user.id,
            approved_at: new Date().toISOString()
          }]);

        if (holidayError) {
          console.error('Failed to sync to staff_holidays:', holidayError);
        }
      }
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["all-staff-requests"] });
      queryClient.invalidateQueries({ queryKey: ["my-staff-requests"] });
      queryClient.invalidateQueries({ queryKey: ["staff-schedules"] });
      queryClient.invalidateQueries({ queryKey: ["staff-holidays-for-schedule"] });
      toast.success(`Request ${variables.status}`);
      setReviewDialogOpen(false);
      setSelectedRequest(null);
      setReviewNotes("");
    },
    onError: (error) => {
      toast.error("Failed to update request: " + error.message);
    }
  });

  // Delete request mutation
  const deleteMutation = useMutation({
    mutationFn: async (requestId: string) => {
      // First, get the request details to check if we need to delete associated data
      const { data: request, error: fetchError } = await supabase
        .from("staff_requests")
        .select("*")
        .eq("id", requestId)
        .single();

      if (fetchError) throw fetchError;

      // If it was an approved holiday request, delete the corresponding staff_holidays entry
      if (request.status === 'approved' && 
          (request.request_type === 'holiday' || request.request_type === 'holiday_paid' || request.request_type === 'holiday_unpaid')) {
        // Find and delete the matching holiday entry
        const { error: holidayDeleteError } = await supabase
          .from("staff_holidays")
          .delete()
          .eq("user_id", request.user_id)
          .eq("start_date", request.start_date)
          .eq("end_date", request.end_date);

        if (holidayDeleteError) {
          console.error('Failed to delete associated holiday entry:', holidayDeleteError);
          // Continue anyway - the request should still be deleted
        }
      }

      // Delete the request itself
      const { error } = await supabase
        .from("staff_requests")
        .delete()
        .eq("id", requestId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["all-staff-requests"] });
      queryClient.invalidateQueries({ queryKey: ["my-staff-requests"] });
      queryClient.invalidateQueries({ queryKey: ["staff-requests-for-schedule"] });
      queryClient.invalidateQueries({ queryKey: ["staff-holidays-for-schedule"] });
      queryClient.invalidateQueries({ queryKey: ["linked-holidays-for-requests"] });
      toast.success("Request deleted");
      setReviewDialogOpen(false);
      setSelectedRequest(null);
    },
    onError: (error) => {
      toast.error("Failed to delete request: " + error.message);
    }
  });

  const getStaffName = (userId: string) => {
    const profile = userProfiles.find(p => p.user_id === userId);
    return profile?.display_name || profile?.email || "Unknown";
  };

  const getCoveredStaffInfo = (linkedHolidayId: string | null) => {
    if (!linkedHolidayId) return null;
    const holiday = linkedHolidays.find(h => h.id === linkedHolidayId);
    if (!holiday) return null;
    return {
      staffName: getStaffName(holiday.user_id),
      startDate: holiday.start_date,
      endDate: holiday.end_date,
      days: holiday.days_taken,
      absenceType: holiday.absence_type
    };
  };

  const openReviewDialog = (request: StaffRequest) => {
    setSelectedRequest(request);
    setReviewNotes(request.review_notes || "");
    setReviewDialogOpen(true);
  };

  const handleApprove = () => {
    if (selectedRequest) {
      reviewMutation.mutate({ requestId: selectedRequest.id, status: 'approved' });
    }
  };

  const handleReject = () => {
    if (selectedRequest) {
      reviewMutation.mutate({ requestId: selectedRequest.id, status: 'rejected' });
    }
  };

  const filteredRequests = requests.filter(r => {
    if (activeTab === "all") return true;
    return r.status === activeTab;
  });

  // Sort by start_date descending, then group by month
  const sortedRequests = [...filteredRequests].sort((a, b) => 
    new Date(b.start_date).getTime() - new Date(a.start_date).getTime()
  );

  // Helper to check if a cover request matches a holiday request
  const findCoverForHoliday = (holidayRequest: StaffRequest): StaffRequest[] => {
    return filteredRequests.filter(r => 
      r.request_type === 'shift_swap' && 
      r.swap_with_user_id === holidayRequest.user_id &&
      // Check overlapping dates
      new Date(r.start_date) <= new Date(holidayRequest.end_date) &&
      new Date(r.end_date) >= new Date(holidayRequest.start_date)
    );
  };

  // Get all cover request IDs that are nested under holidays
  const getNestedCoverIds = (): Set<string> => {
    const nestedIds = new Set<string>();
    filteredRequests.forEach(request => {
      if (['holiday', 'holiday_paid', 'holiday_unpaid'].includes(request.request_type)) {
        const covers = findCoverForHoliday(request);
        covers.forEach(cover => nestedIds.add(cover.id));
      }
    });
    return nestedIds;
  };

  const nestedCoverIds = getNestedCoverIds();

  // Filter out requests that are nested under holidays for the main list
  const topLevelRequests = sortedRequests.filter(r => !nestedCoverIds.has(r.id));

  // Group requests by month (based on start_date)
  const groupRequestsByMonth = (requests: StaffRequest[]) => {
    const grouped: { [key: string]: StaffRequest[] } = {};
    requests.forEach(request => {
      const monthKey = format(new Date(request.start_date), 'MMMM yyyy');
      if (!grouped[monthKey]) {
        grouped[monthKey] = [];
      }
      grouped[monthKey].push(request);
    });
    return grouped;
  };

  const groupedRequests = groupRequestsByMonth(topLevelRequests);
  const monthKeys = Object.keys(groupedRequests);

  // Pagination - now based on top-level requests only
  const totalPages = Math.ceil(topLevelRequests.length / ITEMS_PER_PAGE);
  const paginatedRequests = topLevelRequests.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  // Group paginated requests by month for display
  const paginatedGrouped = groupRequestsByMonth(paginatedRequests);

  // Reset to page 1 when tab changes
  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    setCurrentPage(1);
  };

  const pendingCount = requests.filter(r => r.status === 'pending').length;
  const approvedCount = requests.filter(r => r.status === 'approved').length;
  const rejectedCount = requests.filter(r => r.status === 'rejected').length;

  // Client informed mutation
  const clientInformedMutation = useMutation({
    mutationFn: async ({ requestId, informed }: { requestId: string; informed: boolean }) => {
      const { error } = await supabase
        .from("staff_requests")
        .update({ client_informed: informed })
        .eq("id", requestId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["all-staff-requests"] });
      toast.success("Client notification status updated");
    },
    onError: (error) => {
      toast.error("Failed to update: " + error.message);
    }
  });

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="animate-pulse space-y-4">
            <div className="h-4 bg-muted rounded w-1/4"></div>
            <div className="h-10 bg-muted rounded"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-semibold">Staff Requests</h2>
          <p className="text-sm text-muted-foreground">
            Review and approve staff overtime, holiday, and shift cover requests
          </p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList>
          <TabsTrigger value="approved" className="gap-2">
            Approved
            <Badge variant="outline" className="ml-1">{approvedCount}</Badge>
          </TabsTrigger>
          <TabsTrigger value="pending" className="gap-2">
            Pending
            {pendingCount > 0 && (
              <Badge variant="secondary" className="ml-1">{pendingCount}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="rejected" className="gap-2">
            Rejected
            <Badge variant="outline" className="ml-1">{rejectedCount}</Badge>
          </TabsTrigger>
          <TabsTrigger value="all">All</TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab} className="mt-4">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Staff Member</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Dates</TableHead>
                    <TableHead>Days</TableHead>
                    <TableHead>Details</TableHead>
                    <TableHead>Client Notified</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Submitted</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {Object.keys(paginatedGrouped).length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                        No {activeTab === "all" ? "" : activeTab} requests found.
                      </TableCell>
                    </TableRow>
                  ) : (
                    Object.entries(paginatedGrouped).map(([monthKey, monthRequests]) => (
                      <>
                        {/* Month header row */}
                        <TableRow key={`month-${monthKey}`} className="bg-muted/30">
                          <TableCell colSpan={9} className="py-3 font-semibold text-sm">
                            {monthKey}
                            <span className="ml-2 text-muted-foreground font-normal">
                              ({monthRequests.length} request{monthRequests.length !== 1 ? 's' : ''})
                            </span>
                          </TableCell>
                        </TableRow>
                        {monthRequests.map(request => {
                          const typeInfo = REQUEST_TYPE_INFO[request.request_type];
                          const Icon = typeInfo?.icon || Clock;
                          const coveredStaff = getCoveredStaffInfo(request.linked_holiday_id);
                          const isHolidayRequest = ['holiday', 'holiday_paid', 'holiday_unpaid'].includes(request.request_type);
                          
                          // Find covers for this holiday
                          const nestedCovers = isHolidayRequest ? findCoverForHoliday(request) : [];
                          
                          // Determine row highlighting for holiday requests
                          const rowHighlightClass = isHolidayRequest 
                            ? request.client_informed 
                              ? 'bg-blue-100 dark:bg-blue-950/30 hover:bg-blue-200 dark:hover:bg-blue-950/50' 
                              : 'bg-red-100 dark:bg-red-950/30 hover:bg-red-200 dark:hover:bg-red-950/50'
                            : 'hover:bg-muted/50';

                          // Helper to render a single request row
                          const renderRequestRow = (req: StaffRequest, isNested: boolean = false) => {
                            const reqTypeInfo = REQUEST_TYPE_INFO[req.request_type];
                            const ReqIcon = reqTypeInfo?.icon || Clock;
                            const reqCoveredStaff = getCoveredStaffInfo(req.linked_holiday_id);
                            const reqIsHoliday = ['holiday', 'holiday_paid', 'holiday_unpaid'].includes(req.request_type);
                            
                            const nestedRowClass = isNested 
                              ? 'bg-purple-50 dark:bg-purple-950/20 hover:bg-purple-100 dark:hover:bg-purple-950/40 border-l-4 border-purple-400'
                              : rowHighlightClass;
                            
                            return (
                              <TableRow 
                                key={req.id} 
                                className={`h-20 cursor-pointer transition-colors ${nestedRowClass}`}
                                onClick={() => onViewRequest ? onViewRequest(req.id) : openReviewDialog(req)}
                              >
                                <TableCell className="font-medium py-4">
                                  <div className="flex flex-col gap-1">
                                    <div className="flex items-center gap-2">
                                      {isNested && <span className="text-purple-500">↳</span>}
                                      <span>{getStaffName(req.user_id)}</span>
                                    </div>
                                    {req.request_type === 'shift_swap' && req.swap_with_user_id && (
                                      <span className="text-xs text-muted-foreground">
                                        Covering: {getStaffName(req.swap_with_user_id)}
                                      </span>
                                    )}
                                    {req.request_type === 'overtime' && reqCoveredStaff && (
                                      <span className="text-xs text-muted-foreground">
                                        Covering: {reqCoveredStaff.staffName}
                                      </span>
                                    )}
                                  </div>
                                </TableCell>
                                <TableCell className="py-4">
                                  <div className="flex flex-col gap-1">
                                    <div className="flex items-center gap-2">
                                      <ReqIcon className={`h-4 w-4 ${reqTypeInfo?.color || ''}`} />
                                      <span className="text-sm">{reqTypeInfo?.label || req.request_type}</span>
                                    </div>
                                    {req.request_type === 'overtime' && req.overtime_type && (
                                      <Badge variant="outline" className="w-fit text-xs">
                                        {req.overtime_type === 'standard_hours' ? 'Standard Hours' : 'Outside Hours'}
                                      </Badge>
                                    )}
                                  </div>
                                </TableCell>
                                <TableCell className="py-4">
                                  <div className="flex flex-col gap-0.5">
                                    <span className="text-sm">{format(new Date(req.start_date), 'dd MMM yyyy')}</span>
                                    <span className="text-xs text-muted-foreground">to {format(new Date(req.end_date), 'dd MMM yyyy')}</span>
                                  </div>
                                </TableCell>
                                <TableCell className="py-4">{req.days_requested}</TableCell>
                                <TableCell className="max-w-[200px] py-4">
                                  {req.request_type === 'overtime' && reqCoveredStaff ? (
                                    <div className="text-xs">
                                      <div className="font-medium">{reqCoveredStaff.staffName}'s {reqCoveredStaff.absenceType}</div>
                                      <div className="text-muted-foreground">
                                        {format(new Date(reqCoveredStaff.startDate), 'dd MMM')} – {format(new Date(reqCoveredStaff.endDate), 'dd MMM')}
                                      </div>
                                      {req.details && <div className="text-muted-foreground mt-1 break-words whitespace-normal line-clamp-2">{req.details}</div>}
                                    </div>
                                  ) : (
                                    <span className="block break-words whitespace-normal text-sm line-clamp-2" title={req.details || ''}>{req.details || '-'}</span>
                                  )}
                                </TableCell>
                                <TableCell className="py-4" onClick={(e) => e.stopPropagation()}>
                                  {reqIsHoliday ? (
                                    <div className="flex items-center gap-2">
                                      <Checkbox
                                        checked={(req as any).client_informed || false}
                                        onCheckedChange={(checked) => 
                                          clientInformedMutation.mutate({ requestId: req.id, informed: !!checked })
                                        }
                                        disabled={clientInformedMutation.isPending}
                                      />
                                      <span className="text-xs text-muted-foreground">
                                        {(req as any).client_informed ? (
                                          <span className="flex items-center gap-1 text-green-600">
                                            <Bell className="h-3 w-3" /> Informed
                                          </span>
                                        ) : (
                                          <span className="flex items-center gap-1 text-amber-600">
                                            <BellOff className="h-3 w-3" /> Not yet
                                          </span>
                                        )}
                                      </span>
                                    </div>
                                  ) : (
                                    <span className="text-muted-foreground text-xs">N/A</span>
                                  )}
                                </TableCell>
                                <TableCell className="py-4">
                                  <Badge variant="outline" className={STATUS_COLORS[req.status] || ''}>
                                    {req.status}
                                  </Badge>
                                </TableCell>
                                <TableCell className="text-sm text-muted-foreground py-4">
                                  {format(new Date(req.created_at), 'dd MMM yyyy')}
                                </TableCell>
                                <TableCell className="py-4" onClick={(e) => e.stopPropagation()}>
                                  <div className="flex gap-1">
                                    {req.status === 'pending' ? (
                                      <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
                                        Pending Review
                                      </Badge>
                                    ) : (
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => deleteMutation.mutate(req.id)}
                                        className="text-destructive hover:text-destructive"
                                        disabled={deleteMutation.isPending}
                                      >
                                        <Trash2 className="h-4 w-4" />
                                      </Button>
                                    )}
                                  </div>
                                </TableCell>
                              </TableRow>
                            );
                          };
                          
                          return (
                            <>
                              {renderRequestRow(request, false)}
                              {/* Render nested covers under holiday */}
                              {nestedCovers.map(cover => renderRequestRow(cover, true))}
                            </>
                          );
                        })}
                      </>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
            
            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t">
                <div className="text-sm text-muted-foreground">
                  Showing {((currentPage - 1) * ITEMS_PER_PAGE) + 1} to {Math.min(currentPage * ITEMS_PER_PAGE, filteredRequests.length)} of {filteredRequests.length} requests
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Previous
                  </Button>
                  <span className="text-sm text-muted-foreground">
                    Page {currentPage} of {totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                  >
                    Next
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </Card>
        </TabsContent>
      </Tabs>

      {/* Review Dialog */}
      <Dialog open={reviewDialogOpen} onOpenChange={setReviewDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Review Request</DialogTitle>
            <DialogDescription>
              {selectedRequest && (
                <span>
                  {REQUEST_TYPE_INFO[selectedRequest.request_type]?.label} request from{' '}
                  <strong>{getStaffName(selectedRequest.user_id)}</strong>
                </span>
              )}
            </DialogDescription>
          </DialogHeader>

          {selectedRequest && (
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <Label className="text-muted-foreground">Start Date</Label>
                  <p className="font-medium">{format(new Date(selectedRequest.start_date), 'dd MMM yyyy')}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">End Date</Label>
                  <p className="font-medium">{format(new Date(selectedRequest.end_date), 'dd MMM yyyy')}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Days Requested</Label>
                  <p className="font-medium">{selectedRequest.days_requested}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Status</Label>
                  <Badge variant="outline" className={STATUS_COLORS[selectedRequest.status] || ''}>
                    {selectedRequest.status}
                  </Badge>
                </div>
              </div>

              {selectedRequest.request_type === 'shift_swap' && selectedRequest.swap_with_user_id && (
                <div>
                  <Label className="text-muted-foreground">Covering For</Label>
                  <p className="font-medium">{getStaffName(selectedRequest.swap_with_user_id)}</p>
                </div>
              )}

              {selectedRequest.request_type === 'overtime' && (() => {
                const coveredStaff = getCoveredStaffInfo(selectedRequest.linked_holiday_id);
                if (!coveredStaff) return null;
                return (
                  <div className="p-3 bg-muted rounded-md">
                    <Label className="text-muted-foreground">Covering For</Label>
                    <p className="font-medium mt-1">{coveredStaff.staffName}</p>
                    <p className="text-sm text-muted-foreground">
                      {coveredStaff.absenceType} from {format(new Date(coveredStaff.startDate), 'dd MMM yyyy')} to {format(new Date(coveredStaff.endDate), 'dd MMM yyyy')} ({coveredStaff.days} days)
                    </p>
                  </div>
                );
              })()}

              {selectedRequest.details && (
                <div>
                  <Label className="text-muted-foreground">Details</Label>
                  <p className="text-sm mt-1 p-3 bg-muted rounded-md">{selectedRequest.details}</p>
                </div>
              )}

              {/* Client Informed checkbox for holiday requests */}
              {['holiday', 'holiday_paid', 'holiday_unpaid'].includes(selectedRequest.request_type) && (
                <div className="p-4 border rounded-md bg-muted/50">
                  <div className="flex items-center gap-3">
                    <Checkbox
                      id="client-informed"
                      checked={(selectedRequest as any).client_informed || false}
                      onCheckedChange={(checked) => 
                        clientInformedMutation.mutate({ requestId: selectedRequest.id, informed: !!checked })
                      }
                      disabled={clientInformedMutation.isPending}
                    />
                    <div className="flex-1">
                      <Label htmlFor="client-informed" className="font-medium cursor-pointer">
                        Client has been informed of this holiday
                      </Label>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Check this box once you have notified the relevant client(s) about this staff member's time off
                      </p>
                    </div>
                    {(selectedRequest as any).client_informed ? (
                      <Bell className="h-5 w-5 text-green-600" />
                    ) : (
                      <BellOff className="h-5 w-5 text-amber-600" />
                    )}
                  </div>
                </div>
              )}

              {selectedRequest.status === 'pending' && (
                <div className="space-y-2">
                  <Label>Review Notes (Optional)</Label>
                  <Textarea
                    value={reviewNotes}
                    onChange={(e) => setReviewNotes(e.target.value)}
                    placeholder="Add any notes about this decision..."
                    rows={2}
                  />
                </div>
              )}

              {selectedRequest.status !== 'pending' && selectedRequest.review_notes && (
                <div>
                  <Label className="text-muted-foreground">Review Notes</Label>
                  <p className="text-sm mt-1 p-3 bg-muted rounded-md">{selectedRequest.review_notes}</p>
                </div>
              )}

              {selectedRequest.reviewed_at && (
                <div className="text-xs text-muted-foreground">
                  Reviewed on {format(new Date(selectedRequest.reviewed_at), 'dd MMM yyyy HH:mm')}
                  {selectedRequest.reviewed_by && ` by ${getStaffName(selectedRequest.reviewed_by)}`}
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            {selectedRequest?.status === 'pending' ? (
              <>
                <Button variant="outline" onClick={() => setReviewDialogOpen(false)}>Cancel</Button>
                <Button
                  variant="destructive"
                  onClick={handleReject}
                  disabled={reviewMutation.isPending}
                >
                  <X className="h-4 w-4 mr-1" />
                  Reject
                </Button>
                <Button
                  onClick={handleApprove}
                  disabled={reviewMutation.isPending}
                  className="bg-success hover:bg-success/90"
                >
                  <Check className="h-4 w-4 mr-1" />
                  Approve
                </Button>
              </>
            ) : (
              <Button variant="outline" onClick={() => setReviewDialogOpen(false)}>Close</Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}