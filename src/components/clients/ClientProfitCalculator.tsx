import { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { format, startOfMonth, endOfMonth, parseISO, eachDayOfInterval, getDay, differenceInWeeks, isBefore, isAfter, getDate } from "date-fns";
import { TrendingUp, TrendingDown, DollarSign, Users, Building2, AlertCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface Client {
  id: string;
  name: string;
  mrr: number | null;
}

interface Profile {
  user_id: string;
  display_name: string | null;
  email: string | null;
}

interface RecurringPattern {
  id: string;
  user_id: string;
  client_name: string;
  days_of_week: number[];
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
}

interface ExchangeRates {
  [currency: string]: number;
}

export function ClientProfitCalculator() {
  // Default to January 2026
  const [selectedMonth, setSelectedMonth] = useState('2026-01');
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

  // Fetch recurring patterns
  const { data: patterns = [] } = useQuery({
    queryKey: ["patterns-profit"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("recurring_shift_patterns")
        .select("id, user_id, client_name, days_of_week, start_date, end_date, recurrence_interval");
      if (error) throw error;
      return data as RecurringPattern[];
    },
  });

  // Fetch pay records for the month by pay_period_start
  const { data: payRecords = [] } = useQuery({
    queryKey: ["pay-records-period", selectedMonth],
    queryFn: async () => {
      const periodStart = format(monthStart, 'yyyy-MM-dd');
      const { data, error } = await supabase
        .from("staff_pay_records")
        .select("id, user_id, amount, currency, record_type, pay_date, pay_period_start")
        .eq("pay_period_start", periodStart);
      if (error) throw error;
      return data as PayRecord[];
    },
  });

  const getStaffName = (userId: string) => {
    const profile = profiles.find(p => p.user_id === userId);
    return profile?.display_name || profile?.email?.split('@')[0] || 'Unknown';
  };

  // Calculate the number of working days for a pattern within the month
  const calculatePatternDays = (pattern: RecurringPattern): number => {
    const patternStart = parseISO(pattern.start_date);
    const patternEnd = pattern.end_date ? parseISO(pattern.end_date) : monthEnd;
    
    const effectiveStart = isBefore(patternStart, monthStart) ? monthStart : patternStart;
    const effectiveEnd = isAfter(patternEnd, monthEnd) ? monthEnd : patternEnd;
    
    if (isBefore(effectiveEnd, effectiveStart)) return 0;
    
    const days = eachDayOfInterval({ start: effectiveStart, end: effectiveEnd });
    let totalDays = 0;
    
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
      
      totalDays += 1;
    });
    
    return totalDays;
  };

  // Get monthly cost for a staff member from pay records only
  const getStaffMonthlyCost = (userId: string): number => {
    const userPayRecords = payRecords.filter(r => r.user_id === userId);
    
    let total = 0;
    userPayRecords.forEach(record => {
      const amountGBP = toGBP(record.amount, record.currency);
      // Deductions reduce cost, everything else adds
      total += record.record_type === 'deduction' ? -amountGBP : amountGBP;
    });
    
    return total;
  };

  // Calculate days per staff per client
  const staffClientDays = useMemo(() => {
    const days: Record<string, Record<string, number>> = {};
    
    patterns.forEach(pattern => {
      const patternDays = calculatePatternDays(pattern);
      if (patternDays > 0) {
        if (!days[pattern.user_id]) days[pattern.user_id] = {};
        days[pattern.user_id][pattern.client_name] = 
          (days[pattern.user_id][pattern.client_name] || 0) + patternDays;
      }
    });
    
    return days;
  }, [patterns, selectedMonth]);

  // Calculate total days per staff member
  const staffTotalDays = useMemo(() => {
    const totals: Record<string, number> = {};
    Object.entries(staffClientDays).forEach(([userId, clientDays]) => {
      totals[userId] = Object.values(clientDays).reduce((sum, d) => sum + d, 0);
    });
    return totals;
  }, [staffClientDays]);

  // Get all unique staff who have patterns
  const allStaffWithPatterns = useMemo(() => {
    return [...new Set(patterns.map(p => p.user_id))];
  }, [patterns]);

  // Calculate profit data per client
  const profitData = useMemo(() => {
    return clients.map(client => {
      let totalCost = 0;
      let totalDays = 0;
      const staffCosts: { userId: string; name: string; days: number; cost: number; percentage: number }[] = [];
      
      // For each staff member who works for this client
      Object.entries(staffClientDays).forEach(([userId, clientDays]) => {
        const daysOnThisClient = clientDays[client.name] || 0;
        if (daysOnThisClient === 0) return;
        
        totalDays += daysOnThisClient;
        
        // Calculate this staff's cost allocated to this client
        const staffMonthlyCost = getStaffMonthlyCost(userId);
        const staffDaysTotal = staffTotalDays[userId] || 0;
        
        // Allocate cost proportionally based on days worked
        let allocatedCost = 0;
        let percentage = 0;
        if (staffDaysTotal > 0) {
          percentage = (daysOnThisClient / staffDaysTotal) * 100;
          allocatedCost = staffMonthlyCost * (daysOnThisClient / staffDaysTotal);
        }
        
        totalCost += allocatedCost;
        staffCosts.push({
          userId,
          name: getStaffName(userId),
          days: daysOnThisClient,
          cost: allocatedCost,
          percentage
        });
      });
      
      // MRR includes 20% VAT, so actual revenue is MRR / 1.2
      const mrrIncVAT = client.mrr || 0;
      const revenue = mrrIncVAT / 1.2;
      const profit = revenue - totalCost;
      const margin = revenue > 0 ? (profit / revenue) * 100 : 0;
      
      return {
        client,
        revenue,
        totalDays,
        totalCost,
        profit,
        margin,
        staffCosts,
        assignedStaffCount: staffCosts.length
      };
    }).sort((a, b) => b.profit - a.profit);
  }, [clients, staffClientDays, staffTotalDays, profiles, payRecords, exchangeRates]);

  // Summary stats
  const totalRevenue = profitData.reduce((sum, d) => sum + d.revenue, 0);
  const totalCost = profitData.reduce((sum, d) => sum + d.totalCost, 0);
  const totalProfit = totalRevenue - totalCost;
  const overallMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;

  // Check if we have any pay data
  const hasPayData = payRecords.length > 0;
  const hasPatterns = patterns.length > 0;

  // Generate month options: Jan 2026 to Dec 2026 (12 months)
  const monthOptions = useMemo(() => {
    const options = [];
    for (let i = 0; i < 12; i++) {
      const date = new Date(2026, i, 1); // Jan 2026 to Dec 2026
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
      
      {!hasPatterns && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            No recurring shift patterns found. Staff costs cannot be allocated to clients without shift patterns.
          </AlertDescription>
        </Alert>
      )}
      
      {!hasPayData && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            No pay records found for this period. Run payroll in HR → Pay Manager to add salary records.
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
            Staff costs allocated by proportion of working days per client for {format(monthStart, 'MMMM yyyy')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Client</TableHead>
                  <TableHead className="text-right">Revenue</TableHead>
                  <TableHead className="text-right">Staff Days</TableHead>
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
                  profitData.map(({ client, revenue, totalDays, totalCost, profit, margin }) => (
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
                        {totalDays} days
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
            <strong>How calculations work:</strong> Revenue is calculated as MRR excluding 20% VAT (MRR ÷ 1.2). 
            Each staff member's total monthly cost (salary + bonuses + overtime - deductions) 
            is allocated to clients based on the proportion of working days they spend on each client. 
            For example, if a staff member works 10 days for Client A and 10 days for Client B, each client is allocated 50% of that staff member's cost.
            All amounts are converted to GBP.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
