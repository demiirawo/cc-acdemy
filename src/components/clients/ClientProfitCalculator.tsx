import { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { format, startOfMonth, endOfMonth, parseISO, differenceInHours, eachDayOfInterval, getDay, differenceInWeeks, isBefore, isAfter, parse, getDate, isWithinInterval } from "date-fns";
import { TrendingUp, TrendingDown, DollarSign, Users, Building2, AlertCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface Client {
  id: string;
  name: string;
  mrr: number | null;
}

interface StaffAssignment {
  staff_user_id: string;
  client_name: string;
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
}

interface PayRecord {
  id: string;
  user_id: string;
  amount: number;
  currency: string;
  record_type: string;
  pay_date: string;
  pay_period_start: string | null;
  pay_period_end: string | null;
}

interface RecurringBonus {
  id: string;
  user_id: string;
  amount: number;
  currency: string;
  start_date: string;
  end_date: string | null;
}

interface ExchangeRates {
  [currency: string]: number;
}

export function ClientProfitCalculator() {
  const currentMonth = format(new Date(), 'yyyy-MM');
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);
  const [exchangeRates, setExchangeRates] = useState<ExchangeRates>({ GBP: 1 });
  const [ratesError, setRatesError] = useState<string | null>(null);
  
  const monthStart = startOfMonth(parseISO(`${selectedMonth}-01`));
  const monthEnd = endOfMonth(monthStart);

  // Fetch exchange rates
  useEffect(() => {
    const fetchRates = async () => {
      try {
        const { data, error } = await supabase.functions.invoke('get-exchange-rates');
        if (error) throw error;
        if (data?.rates) {
          setExchangeRates(data.rates);
          setRatesError(null);
        }
      } catch (err) {
        console.error('Failed to fetch exchange rates:', err);
        setRatesError('Using fallback exchange rates');
        // Use fallback rates
        setExchangeRates({
          GBP: 1,
          NGN: 0.00052,
          USD: 0.79,
          EUR: 0.85,
        });
      }
    };
    fetchRates();
  }, []);

  // Convert amount to GBP
  const toGBP = (amount: number, currency: string): number => {
    const rate = exchangeRates[currency] || exchangeRates['GBP'] || 1;
    return amount * rate;
  };

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
        .select("id, user_id, client_name, start_datetime, end_datetime")
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
        .select("id, user_id, client_name, days_of_week, start_time, end_time, start_date, end_date, recurrence_interval");
      if (error) throw error;
      return data as RecurringPattern[];
    },
  });

  // Fetch pay records for the month
  const { data: payRecords = [] } = useQuery({
    queryKey: ["pay-records-month", selectedMonth],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("staff_pay_records")
        .select("id, user_id, amount, currency, record_type, pay_date, pay_period_start, pay_period_end")
        .gte("pay_date", format(monthStart, 'yyyy-MM-dd'))
        .lte("pay_date", format(monthEnd, 'yyyy-MM-dd'));
      if (error) throw error;
      return data as PayRecord[];
    },
  });

  // Fetch recurring bonuses
  const { data: recurringBonuses = [] } = useQuery({
    queryKey: ["recurring-bonuses"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("recurring_bonuses")
        .select("id, user_id, amount, currency, start_date, end_date");
      if (error) throw error;
      return data as RecurringBonus[];
    },
  });

  // Fetch overtime records for the month
  const { data: overtimeRecords = [] } = useQuery({
    queryKey: ["overtime-month", selectedMonth],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("staff_overtime")
        .select("id, user_id, hours, hourly_rate, currency, overtime_date")
        .gte("overtime_date", format(monthStart, 'yyyy-MM-dd'))
        .lte("overtime_date", format(monthEnd, 'yyyy-MM-dd'));
      if (error) throw error;
      return data as { id: string; user_id: string; hours: number; hourly_rate: number | null; currency: string; overtime_date: string }[];
    },
  });

  const getStaffName = (userId: string) => {
    const profile = profiles.find(p => p.user_id === userId);
    return profile?.display_name || profile?.email?.split('@')[0] || 'Unknown';
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

  // Calculate total cost per staff member from pay records
  const staffTotalCosts = useMemo(() => {
    const costs: Record<string, number> = {};
    
    // Add pay records (salary, bonus, deduction, expense, overtime)
    payRecords.forEach(record => {
      const amountGBP = toGBP(record.amount, record.currency);
      // Deductions reduce cost, everything else adds
      const adjustedAmount = record.record_type === 'deduction' ? -amountGBP : amountGBP;
      costs[record.user_id] = (costs[record.user_id] || 0) + adjustedAmount;
    });
    
    // Add recurring bonuses that apply to this month
    recurringBonuses.forEach(bonus => {
      const bonusStart = parseISO(bonus.start_date);
      const bonusEnd = bonus.end_date ? parseISO(bonus.end_date) : null;
      
      // Check if bonus applies to this month
      const appliesToMonth = 
        isBefore(bonusStart, monthEnd) && 
        (!bonusEnd || isAfter(bonusEnd, monthStart));
      
      if (appliesToMonth) {
        const amountGBP = toGBP(bonus.amount, bonus.currency);
        costs[bonus.user_id] = (costs[bonus.user_id] || 0) + amountGBP;
      }
    });
    
    // Add overtime records
    overtimeRecords.forEach(overtime => {
      if (overtime.hourly_rate) {
        const cost = overtime.hours * overtime.hourly_rate;
        const amountGBP = toGBP(cost, overtime.currency);
        costs[overtime.user_id] = (costs[overtime.user_id] || 0) + amountGBP;
      }
    });
    
    return costs;
  }, [payRecords, recurringBonuses, overtimeRecords, exchangeRates]);

  // Calculate hours per staff per client
  const staffClientHours = useMemo(() => {
    const hours: Record<string, Record<string, number>> = {};
    
    // From schedules
    schedules.forEach(schedule => {
      const scheduleHours = differenceInHours(
        parseISO(schedule.end_datetime),
        parseISO(schedule.start_datetime)
      );
      
      if (!hours[schedule.user_id]) hours[schedule.user_id] = {};
      hours[schedule.user_id][schedule.client_name] = 
        (hours[schedule.user_id][schedule.client_name] || 0) + scheduleHours;
    });
    
    // From patterns
    patterns.forEach(pattern => {
      const patternHours = calculatePatternHours(pattern);
      if (patternHours > 0) {
        if (!hours[pattern.user_id]) hours[pattern.user_id] = {};
        hours[pattern.user_id][pattern.client_name] = 
          (hours[pattern.user_id][pattern.client_name] || 0) + patternHours;
      }
    });
    
    return hours;
  }, [schedules, patterns, selectedMonth]);

  // Calculate total hours per staff member
  const staffTotalHours = useMemo(() => {
    const totals: Record<string, number> = {};
    Object.entries(staffClientHours).forEach(([userId, clientHours]) => {
      totals[userId] = Object.values(clientHours).reduce((sum, h) => sum + h, 0);
    });
    return totals;
  }, [staffClientHours]);

  // Calculate profit data per client
  const profitData = useMemo(() => {
    return clients.map(client => {
      let totalCost = 0;
      let totalHours = 0;
      const staffCosts: { userId: string; name: string; hours: number; cost: number }[] = [];
      
      // For each staff member who worked on this client
      Object.entries(staffClientHours).forEach(([userId, clientHours]) => {
        const hoursOnThisClient = clientHours[client.name] || 0;
        if (hoursOnThisClient === 0) return;
        
        totalHours += hoursOnThisClient;
        
        // Calculate this staff's cost allocated to this client
        const staffTotal = staffTotalCosts[userId] || 0;
        const staffHoursTotal = staffTotalHours[userId] || 0;
        
        // Allocate cost proportionally based on hours
        let allocatedCost = 0;
        if (staffHoursTotal > 0) {
          const proportion = hoursOnThisClient / staffHoursTotal;
          allocatedCost = staffTotal * proportion;
        }
        
        totalCost += allocatedCost;
        staffCosts.push({
          userId,
          name: getStaffName(userId),
          hours: hoursOnThisClient,
          cost: allocatedCost
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
        assignedStaffCount: staffCosts.length
      };
    }).sort((a, b) => b.profit - a.profit);
  }, [clients, staffClientHours, staffTotalCosts, staffTotalHours, profiles]);

  // Summary stats
  const totalRevenue = profitData.reduce((sum, d) => sum + d.revenue, 0);
  const totalCost = profitData.reduce((sum, d) => sum + d.totalCost, 0);
  const totalProfit = totalRevenue - totalCost;
  const overallMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;

  // Check if we have any pay data
  const hasPayData = payRecords.length > 0 || recurringBonuses.length > 0;

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

      {/* Warnings */}
      {ratesError && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{ratesError}</AlertDescription>
        </Alert>
      )}
      
      {!hasPayData && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            No pay records found for {format(monthStart, 'MMMM yyyy')}. Staff costs will show as £0 until pay records are added.
          </AlertDescription>
        </Alert>
      )}

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
            Staff costs calculated from pay records, bonuses, and overtime for {format(monthStart, 'MMMM yyyy')}, 
            allocated to clients based on scheduled hours
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
            <strong>How costs are calculated:</strong> Total staff costs (salary + bonuses + overtime - deductions) 
            from pay records are allocated to each client proportionally based on hours worked. 
            All amounts are converted to GBP using current exchange rates.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
