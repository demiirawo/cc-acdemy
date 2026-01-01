import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { format, startOfMonth, endOfMonth, parseISO, differenceInHours, eachDayOfInterval, getDay, addWeeks, differenceInWeeks, isBefore, isAfter, parse, getDate } from "date-fns";
import { TrendingUp, TrendingDown, DollarSign, Users, Building2 } from "lucide-react";

interface Client {
  id: string;
  name: string;
  mrr: number | null;
}

interface StaffAssignment {
  staff_user_id: string;
  client_name: string;
}

interface HRProfile {
  user_id: string;
  base_salary: number | null;
  base_currency: string;
  pay_frequency: string | null;
}

interface Profile {
  user_id: string;
  display_name: string | null;
  email: string | null;
}

interface Schedule {
  id: string;
  user_id: string;
  client_name: string;
  start_datetime: string;
  end_datetime: string;
  hourly_rate: number | null;
}

interface RecurringPattern {
  id: string;
  user_id: string;
  client_name: string;
  days_of_week: number[];
  start_time: string;
  end_time: string;
  start_date: string;
  end_date: string | null;
  recurrence_interval: string;
  hourly_rate: number | null;
}

export function ClientProfitCalculator() {
  const currentMonth = format(new Date(), 'yyyy-MM');
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);
  
  const monthStart = startOfMonth(parseISO(`${selectedMonth}-01`));
  const monthEnd = endOfMonth(monthStart);

  // Fetch all clients
  const { data: clients = [] } = useQuery({
    queryKey: ["clients-profit"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("id, name, mrr")
        .eq("status", "active")
        .order("name");
      if (error) throw error;
      return data as Client[];
    },
  });

  // Fetch staff assignments
  const { data: assignments = [] } = useQuery({
    queryKey: ["staff-assignments"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("staff_client_assignments")
        .select("staff_user_id, client_name");
      if (error) throw error;
      return data as StaffAssignment[];
    },
  });

  // Fetch HR profiles for salary info
  const { data: hrProfiles = [] } = useQuery({
    queryKey: ["hr-profiles-salary"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hr_profiles")
        .select("user_id, base_salary, base_currency, pay_frequency");
      if (error) throw error;
      return data as HRProfile[];
    },
  });

  // Fetch user profiles
  const { data: profiles = [] } = useQuery({
    queryKey: ["profiles-display"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("user_id, display_name, email");
      if (error) throw error;
      return data as Profile[];
    },
  });

  // Fetch schedules for the month
  const { data: schedules = [] } = useQuery({
    queryKey: ["schedules-month", selectedMonth],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("staff_schedules")
        .select("id, user_id, client_name, start_datetime, end_datetime, hourly_rate")
        .gte("start_datetime", monthStart.toISOString())
        .lte("end_datetime", monthEnd.toISOString());
      if (error) throw error;
      return data as Schedule[];
    },
  });

  // Fetch recurring patterns
  const { data: patterns = [] } = useQuery({
    queryKey: ["patterns-profit"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("recurring_shift_patterns")
        .select("id, user_id, client_name, days_of_week, start_time, end_time, start_date, end_date, recurrence_interval, hourly_rate");
      if (error) throw error;
      return data as RecurringPattern[];
    },
  });

  const getStaffName = (userId: string) => {
    const profile = profiles.find(p => p.user_id === userId);
    return profile?.display_name || profile?.email?.split('@')[0] || 'Unknown';
  };

  const getHourlyCost = (userId: string): number => {
    const hrProfile = hrProfiles.find(p => p.user_id === userId);
    if (!hrProfile?.base_salary) return 0;
    
    // Convert salary to hourly rate (assuming 37.5 hours/week, 52 weeks/year)
    const annualSalary = hrProfile.pay_frequency === 'monthly' 
      ? hrProfile.base_salary * 12 
      : hrProfile.base_salary;
    return annualSalary / (37.5 * 52);
  };

  // Calculate hours from patterns for the month
  const calculatePatternHours = (pattern: RecurringPattern): number => {
    const patternStart = parseISO(pattern.start_date);
    const patternEnd = pattern.end_date ? parseISO(pattern.end_date) : monthEnd;
    
    const effectiveStart = isBefore(patternStart, monthStart) ? monthStart : patternStart;
    const effectiveEnd = isAfter(patternEnd, monthEnd) ? monthEnd : patternEnd;
    
    if (isBefore(effectiveEnd, effectiveStart)) return 0;
    
    const days = eachDayOfInterval({ start: effectiveStart, end: effectiveEnd });
    let totalHours = 0;
    
    days.forEach(day => {
      const dayOfWeek = getDay(day);
      if (!pattern.days_of_week.includes(dayOfWeek)) return;
      
      // Check recurrence interval
      if (pattern.recurrence_interval === 'biweekly') {
        const weeksDiff = differenceInWeeks(day, patternStart);
        if (weeksDiff % 2 !== 0) return;
      } else if (pattern.recurrence_interval === 'monthly') {
        if (getDate(day) !== getDate(patternStart)) return;
      }
      
      // Calculate hours for this shift
      const startTime = parse(pattern.start_time, 'HH:mm:ss', day);
      const endTime = parse(pattern.end_time, 'HH:mm:ss', day);
      const hours = differenceInHours(endTime, startTime);
      totalHours += hours;
    });
    
    return totalHours;
  };

  // Calculate profit data per client
  const profitData = useMemo(() => {
    return clients.map(client => {
      // Get staff assigned to this client
      const assignedStaff = assignments
        .filter(a => a.client_name === client.name)
        .map(a => a.staff_user_id);
      
      // Calculate total hours from schedules
      const clientSchedules = schedules.filter(s => s.client_name === client.name);
      const scheduleHours = clientSchedules.reduce((total, schedule) => {
        return total + differenceInHours(
          parseISO(schedule.end_datetime),
          parseISO(schedule.start_datetime)
        );
      }, 0);
      
      // Calculate total hours from patterns
      const clientPatterns = patterns.filter(p => p.client_name === client.name);
      const patternHours = clientPatterns.reduce((total, pattern) => {
        return total + calculatePatternHours(pattern);
      }, 0);
      
      const totalHours = scheduleHours + patternHours;
      
      // Calculate staff costs
      let totalCost = 0;
      const staffCosts: { userId: string; name: string; hours: number; cost: number }[] = [];
      
      // Group hours by staff member
      const staffHours: Record<string, number> = {};
      
      clientSchedules.forEach(schedule => {
        staffHours[schedule.user_id] = (staffHours[schedule.user_id] || 0) + 
          differenceInHours(parseISO(schedule.end_datetime), parseISO(schedule.start_datetime));
      });
      
      clientPatterns.forEach(pattern => {
        const hours = calculatePatternHours(pattern);
        staffHours[pattern.user_id] = (staffHours[pattern.user_id] || 0) + hours;
      });
      
      Object.entries(staffHours).forEach(([userId, hours]) => {
        const hourlyRate = getHourlyCost(userId);
        const cost = hours * hourlyRate;
        totalCost += cost;
        staffCosts.push({
          userId,
          name: getStaffName(userId),
          hours,
          cost
        });
      });
      
      const revenue = client.mrr || 0;
      const profit = revenue - totalCost;
      const margin = revenue > 0 ? (profit / revenue) * 100 : 0;
      
      return {
        client,
        revenue,
        totalHours,
        totalCost,
        profit,
        margin,
        staffCosts,
        assignedStaffCount: new Set(Object.keys(staffHours)).size
      };
    }).sort((a, b) => b.profit - a.profit);
  }, [clients, schedules, patterns, assignments, hrProfiles, profiles]);

  // Summary stats
  const totalRevenue = profitData.reduce((sum, d) => sum + d.revenue, 0);
  const totalCost = profitData.reduce((sum, d) => sum + d.totalCost, 0);
  const totalProfit = totalRevenue - totalCost;
  const overallMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;

  // Generate month options (last 12 months)
  const monthOptions = useMemo(() => {
    const options = [];
    const now = new Date();
    for (let i = 0; i < 12; i++) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      options.push({
        value: format(date, 'yyyy-MM'),
        label: format(date, 'MMMM yyyy')
      });
    }
    return options;
  }, []);

  return (
    <div className="space-y-4">
      {/* Month Selector */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-4">
            <label className="text-sm font-medium">Analysis Period:</label>
            <Select value={selectedMonth} onValueChange={setSelectedMonth}>
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {monthOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-green-500" />
              <div>
                <p className="text-sm text-muted-foreground">Total Revenue</p>
                <p className="text-2xl font-bold">£{totalRevenue.toLocaleString()}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-blue-500" />
              <div>
                <p className="text-sm text-muted-foreground">Staff Costs</p>
                <p className="text-2xl font-bold">£{totalCost.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              {totalProfit >= 0 ? (
                <TrendingUp className="h-5 w-5 text-green-500" />
              ) : (
                <TrendingDown className="h-5 w-5 text-red-500" />
              )}
              <div>
                <p className="text-sm text-muted-foreground">Net Profit</p>
                <p className={`text-2xl font-bold ${totalProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  £{totalProfit.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div>
              <p className="text-sm text-muted-foreground">Overall Margin</p>
              <p className={`text-2xl font-bold ${overallMargin >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {overallMargin.toFixed(1)}%
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Client Profit Table */}
      <Card>
        <CardHeader>
          <CardTitle>Client Profitability</CardTitle>
          <CardDescription>
            Profit analysis based on client MRR and estimated staff costs from schedules
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Client</TableHead>
                  <TableHead className="text-right">Revenue</TableHead>
                  <TableHead className="text-right">Staff Hours</TableHead>
                  <TableHead className="text-right">Staff Cost</TableHead>
                  <TableHead className="text-right">Profit</TableHead>
                  <TableHead className="text-right">Margin</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {profitData.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                      No active clients found
                    </TableCell>
                  </TableRow>
                ) : (
                  profitData.map(({ client, revenue, totalHours, totalCost, profit, margin }) => (
                    <TableRow key={client.id}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <Building2 className="h-4 w-4 text-muted-foreground" />
                          {client.name}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        £{revenue.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right">
                        {totalHours.toFixed(1)}h
                      </TableCell>
                      <TableCell className="text-right">
                        £{totalCost.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                      </TableCell>
                      <TableCell className="text-right">
                        <span className={profit >= 0 ? 'text-green-600' : 'text-red-600'}>
                          £{profit.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge variant={margin >= 20 ? 'default' : margin >= 0 ? 'secondary' : 'destructive'}>
                          {margin.toFixed(1)}%
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Note about calculations */}
      <Card>
        <CardContent className="pt-6">
          <p className="text-sm text-muted-foreground">
            <strong>Note:</strong> Staff costs are estimated based on base salary from HR profiles 
            (converted to hourly rate assuming 37.5 hours/week). Actual costs may vary based on 
            overtime, bonuses, and other factors.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}