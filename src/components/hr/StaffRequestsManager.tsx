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
import { Check, X, Clock, Palmtree, RefreshCw, Eye } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";

type RequestType = 'overtime_standard' | 'overtime_double_up' | 'holiday' | 'shift_swap';

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

interface UserProfile {
  user_id: string;
  display_name: string | null;
  email: string | null;
}

const REQUEST_TYPE_INFO: Record<RequestType, { label: string; icon: typeof Clock; color: string }> = {
  overtime_standard: {
    label: "Overtime – Standard",
    icon: Clock,
    color: "text-orange-600"
  },
  overtime_double_up: {
    label: "Overtime – Double Up",
    icon: Clock,
    color: "text-amber-600"
  },
  holiday: {
    label: "Holiday / Time Off",
    icon: Palmtree,
    color: "text-green-600"
  },
  shift_swap: {
    label: "Shift Swap",
    icon: RefreshCw,
    color: "text-blue-600"
  }
};

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-warning/20 text-warning-foreground border-warning',
  approved: 'bg-success/20 text-success border-success',
  rejected: 'bg-destructive/20 text-destructive border-destructive',
};

export function StaffRequestsManager() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<string>("pending");
  const [reviewDialogOpen, setReviewDialogOpen] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<StaffRequest | null>(null);
  const [reviewNotes, setReviewNotes] = useState("");

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

      // If it's a holiday request being approved, sync to staff_holidays
      if (status === 'approved' && request.request_type === 'holiday') {
        const { error: holidayError } = await supabase
          .from("staff_holidays")
          .insert({
            user_id: request.user_id,
            absence_type: 'holiday',
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
        }
      }
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["all-staff-requests"] });
      queryClient.invalidateQueries({ queryKey: ["my-staff-requests"] });
      toast.success(`Request ${variables.status}`);
      setReviewDialogOpen(false);
      setSelectedRequest(null);
      setReviewNotes("");
    },
    onError: (error) => {
      toast.error("Failed to update request: " + error.message);
    }
  });

  const getStaffName = (userId: string) => {
    const profile = userProfiles.find(p => p.user_id === userId);
    return profile?.display_name || profile?.email || "Unknown";
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

  const pendingCount = requests.filter(r => r.status === 'pending').length;
  const approvedCount = requests.filter(r => r.status === 'approved').length;
  const rejectedCount = requests.filter(r => r.status === 'rejected').length;

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
            Review and approve staff overtime, holiday, and shift swap requests
          </p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="pending" className="gap-2">
            Pending
            {pendingCount > 0 && (
              <Badge variant="secondary" className="ml-1">{pendingCount}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="approved" className="gap-2">
            Approved
            <Badge variant="outline" className="ml-1">{approvedCount}</Badge>
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
                    <TableHead>Start Date</TableHead>
                    <TableHead>End Date</TableHead>
                    <TableHead>Days</TableHead>
                    <TableHead>Details</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Submitted</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRequests.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                        No {activeTab === "all" ? "" : activeTab} requests found.
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredRequests.map(request => {
                      const typeInfo = REQUEST_TYPE_INFO[request.request_type];
                      const Icon = typeInfo?.icon || Clock;
                      
                      return (
                        <TableRow key={request.id}>
                          <TableCell className="font-medium">
                            {getStaffName(request.user_id)}
                            {request.request_type === 'shift_swap' && request.swap_with_user_id && (
                              <div className="text-xs text-muted-foreground">
                                ↔ {getStaffName(request.swap_with_user_id)}
                              </div>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Icon className={`h-4 w-4 ${typeInfo?.color || ''}`} />
                              <span className="text-sm">{typeInfo?.label || request.request_type}</span>
                            </div>
                          </TableCell>
                          <TableCell>{format(new Date(request.start_date), 'dd MMM yyyy')}</TableCell>
                          <TableCell>{format(new Date(request.end_date), 'dd MMM yyyy')}</TableCell>
                          <TableCell>{request.days_requested}</TableCell>
                          <TableCell className="max-w-[200px] truncate" title={request.details || ''}>
                            {request.details || '-'}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className={STATUS_COLORS[request.status] || ''}>
                              {request.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {format(new Date(request.created_at), 'dd MMM yyyy')}
                          </TableCell>
                          <TableCell>
                            {request.status === 'pending' ? (
                              <div className="flex gap-1">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => openReviewDialog(request)}
                                  className="text-primary hover:text-primary"
                                >
                                  <Eye className="h-4 w-4 mr-1" />
                                  Review
                                </Button>
                              </div>
                            ) : (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => openReviewDialog(request)}
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </CardContent>
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
                  <Label className="text-muted-foreground">Swapping With</Label>
                  <p className="font-medium">{getStaffName(selectedRequest.swap_with_user_id)}</p>
                </div>
              )}

              {selectedRequest.details && (
                <div>
                  <Label className="text-muted-foreground">Details</Label>
                  <p className="text-sm mt-1 p-3 bg-muted rounded-md">{selectedRequest.details}</p>
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