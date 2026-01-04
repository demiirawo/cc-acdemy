import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Clock, Palmtree, RefreshCw, Calendar } from "lucide-react";
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
    
    // Check if any part of the request falls within the next 30 days
    return (
      isWithinInterval(startDate, { start: today, end: thirtyDaysFromNow }) ||
      isWithinInterval(endDate, { start: today, end: thirtyDaysFromNow }) ||
      (startDate <= today && endDate >= today)
    );
  });

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
        {upcomingRequests.length === 0 ? (
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
              </TableRow>
            </TableHeader>
            <TableBody>
              {upcomingRequests.map((request) => {
                const typeInfo = REQUEST_TYPE_INFO[request.request_type] || REQUEST_TYPE_INFO.holiday;
                const TypeIcon = typeInfo.icon;
                
                return (
                  <TableRow key={request.id}>
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
                      {format(parseISO(request.start_date), 'dd MMM')} - {format(parseISO(request.end_date), 'dd MMM yyyy')}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{request.days_requested}</Badge>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
