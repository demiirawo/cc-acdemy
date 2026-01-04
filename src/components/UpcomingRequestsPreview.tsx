import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Clock, Palmtree, RefreshCw, Calendar, Bell, BellOff, CornerDownRight } from "lucide-react";
import { format, addDays, isWithinInterval, parseISO } from "date-fns";

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
  client_informed: boolean;
  created_at: string;
}

interface UserProfile {
  user_id: string;
  display_name: string | null;
  email: string | null;
}

const REQUEST_TYPE_INFO: Record<string, { label: string; icon: typeof Clock; color: string }> = {
  overtime: {
    label: "Overtime",
    icon: Clock,
    color: "text-orange-600"
  },
  overtime_standard: {
    label: "Overtime",
    icon: Clock,
    color: "text-orange-600"
  },
  overtime_double_up: {
    label: "Overtime",
    icon: Clock,
    color: "text-amber-600"
  },
  holiday: {
    label: "Holiday",
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

export function UpcomingRequestsPreview() {
  const today = new Date();
  const thirtyDaysFromNow = addDays(today, 30);

  // Fetch approved staff requests
  const { data: requests = [], isLoading } = useQuery({
    queryKey: ["upcoming-approved-requests"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("staff_requests")
        .select("*")
        .eq("status", "approved")
        .order("start_date", { ascending: true });
      
      if (error) throw error;
      return data as StaffRequest[];
    }
  });

  // Fetch user profiles for display names
  const { data: userProfiles = [] } = useQuery({
    queryKey: ["user-profiles-for-upcoming-requests"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("user_id, display_name, email");
      
      if (error) throw error;
      return data as UserProfile[];
    }
  });

  const getStaffName = (userId: string) => {
    const profile = userProfiles.find(p => p.user_id === userId);
    return profile?.display_name || profile?.email || "Unknown";
  };

  // Filter requests to only show those in the next 30 days
  const upcomingRequests = requests.filter(request => {
    const startDate = parseISO(request.start_date);
    const endDate = parseISO(request.end_date);
    
    return (
      isWithinInterval(startDate, { start: today, end: thirtyDaysFromNow }) ||
      isWithinInterval(endDate, { start: today, end: thirtyDaysFromNow }) ||
      (startDate <= today && endDate >= today)
    );
  });

  // Helper to find cover requests for a holiday
  const findCoverForHoliday = (holidayRequest: StaffRequest): StaffRequest[] => {
    return upcomingRequests.filter(r => 
      r.request_type === 'shift_swap' && 
      r.swap_with_user_id === holidayRequest.user_id &&
      new Date(r.start_date) <= new Date(holidayRequest.end_date) &&
      new Date(r.end_date) >= new Date(holidayRequest.start_date)
    );
  };

  // Get all cover request IDs that are nested under holidays
  const getNestedCoverIds = (): Set<string> => {
    const nestedIds = new Set<string>();
    upcomingRequests.forEach(request => {
      if (['holiday', 'holiday_paid', 'holiday_unpaid'].includes(request.request_type)) {
        const covers = findCoverForHoliday(request);
        covers.forEach(cover => nestedIds.add(cover.id));
      }
    });
    return nestedIds;
  };

  const nestedCoverIds = getNestedCoverIds();
  const topLevelRequests = upcomingRequests.filter(r => !nestedCoverIds.has(r.id));

  // Group requests by month
  const groupRequestsByMonth = (requests: StaffRequest[]) => {
    const grouped: { [key: string]: StaffRequest[] } = {};
    requests.forEach(request => {
      const monthKey = format(parseISO(request.start_date), 'MMMM yyyy');
      if (!grouped[monthKey]) {
        grouped[monthKey] = [];
      }
      grouped[monthKey].push(request);
    });
    return grouped;
  };

  const groupedRequests = groupRequestsByMonth(topLevelRequests);

  const getRowClassName = (request: StaffRequest) => {
    if (request.request_type === 'shift_swap') {
      return 'bg-blue-50 dark:bg-blue-950/20';
    }
    if (['holiday', 'holiday_paid', 'holiday_unpaid'].includes(request.request_type)) {
      return 'bg-green-50 dark:bg-green-950/20';
    }
    if (['overtime', 'overtime_standard', 'overtime_double_up'].includes(request.request_type)) {
      return 'bg-orange-50 dark:bg-orange-950/20';
    }
    return '';
  };

  if (isLoading) {
    return (
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Upcoming Approved Requests
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-4">
            <div className="h-4 bg-muted rounded w-1/4"></div>
            <div className="h-10 bg-muted rounded"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="mb-6">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Calendar className="h-5 w-5 text-primary" />
          Upcoming Approved Requests
          <Badge variant="secondary" className="ml-2">{upcomingRequests.length}</Badge>
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Approved requests in the next 30 days
        </p>
      </CardHeader>
      <CardContent className="pt-0">
        {topLevelRequests.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Calendar className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>No approved requests in the next 30 days</p>
          </div>
        ) : (
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
              </TableRow>
            </TableHeader>
            <TableBody>
              {Object.keys(groupedRequests).map(monthKey => (
                <>
                  {/* Month Header Row */}
                  <TableRow key={`month-${monthKey}`} className="bg-muted/50 hover:bg-muted/50">
                    <TableCell colSpan={8} className="py-2">
                      <span className="font-semibold">{monthKey}</span>
                      <span className="text-muted-foreground ml-2">
                        ({groupedRequests[monthKey].length} request{groupedRequests[monthKey].length !== 1 ? 's' : ''})
                      </span>
                    </TableCell>
                  </TableRow>
                  
                  {/* Requests for this month */}
                  {groupedRequests[monthKey].map((request) => {
                    const typeInfo = REQUEST_TYPE_INFO[request.request_type] || REQUEST_TYPE_INFO.holiday;
                    const TypeIcon = typeInfo.icon;
                    const covers = findCoverForHoliday(request);
                    
                    return (
                      <>
                        <TableRow key={request.id} className={getRowClassName(request)}>
                          <TableCell className="font-medium">
                            {getStaffName(request.user_id)}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <TypeIcon className={`h-4 w-4 ${typeInfo.color}`} />
                              <span className="text-sm">{typeInfo.label}</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-sm">
                            <div>{format(parseISO(request.start_date), 'dd MMM yyyy')}</div>
                            <div className="text-muted-foreground text-xs">
                              to {format(parseISO(request.end_date), 'dd MMM yyyy')}
                            </div>
                          </TableCell>
                          <TableCell>{request.days_requested}</TableCell>
                          <TableCell className="max-w-[200px] truncate text-sm">
                            {request.details || '-'}
                          </TableCell>
                          <TableCell>
                            {request.request_type === 'shift_swap' ? (
                              <span className="text-muted-foreground text-sm">N/A</span>
                            ) : (
                              <div className="flex items-center gap-1.5">
                                {request.client_informed ? (
                                  <Bell className="h-4 w-4 text-green-600" />
                                ) : (
                                  <>
                                    <BellOff className="h-4 w-4 text-destructive" />
                                    <span className="text-destructive text-sm">Not yet</span>
                                  </>
                                )}
                              </div>
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge className="bg-success/20 text-success border-success">
                              approved
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {format(parseISO(request.created_at), 'dd MMM yyyy')}
                          </TableCell>
                        </TableRow>
                        
                        {/* Nested cover requests */}
                        {covers.map((cover) => {
                          const coverTypeInfo = REQUEST_TYPE_INFO[cover.request_type];
                          const CoverIcon = coverTypeInfo.icon;
                          
                          return (
                            <TableRow key={cover.id} className="bg-blue-50 dark:bg-blue-950/20">
                              <TableCell className="font-medium">
                                <div className="flex items-center gap-2">
                                  <CornerDownRight className="h-4 w-4 text-muted-foreground" />
                                  <div>
                                    <div>{getStaffName(cover.user_id)}</div>
                                    <div className="text-xs text-muted-foreground">
                                      Covering: {getStaffName(request.user_id)}
                                    </div>
                                  </div>
                                </div>
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  <CoverIcon className={`h-4 w-4 ${coverTypeInfo.color}`} />
                                  <span className="text-sm">{coverTypeInfo.label}</span>
                                </div>
                              </TableCell>
                              <TableCell className="text-sm">
                                <div>{format(parseISO(cover.start_date), 'dd MMM yyyy')}</div>
                                <div className="text-muted-foreground text-xs">
                                  to {format(parseISO(cover.end_date), 'dd MMM yyyy')}
                                </div>
                              </TableCell>
                              <TableCell>{cover.days_requested}</TableCell>
                              <TableCell className="max-w-[200px] text-sm">
                                Holiday: {format(parseISO(request.start_date), 'dd MMM yyyy')} – {format(parseISO(request.end_date), 'dd MMM yyyy')} ({request.days_requested} days)
                              </TableCell>
                              <TableCell>
                                <span className="text-muted-foreground text-sm">N/A</span>
                              </TableCell>
                              <TableCell>
                                <Badge className="bg-success/20 text-success border-success">
                                  approved
                                </Badge>
                              </TableCell>
                              <TableCell className="text-sm text-muted-foreground">
                                {format(parseISO(cover.created_at), 'dd MMM yyyy')}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </>
                    );
                  })}
                </>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
