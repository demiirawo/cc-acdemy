import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Calendar, DollarSign, UserCircle, Briefcase, Clock, TrendingUp, CheckCircle, AlertCircle } from "lucide-react";
import { format, startOfMonth, endOfMonth, parseISO, addMonths } from "date-fns";

interface HRProfile {
  id: string;
  employee_id: string | null;
  job_title: string | null;
  department: string | null;
  start_date: string | null;
  base_currency: string;
  base_salary: number | null;
  pay_frequency: string | null;
  annual_holiday_allowance: number | null;
  notes: string | null;
}

interface Holiday {
  id: string;
  absence_type: string;
  start_date: string;
  end_date: string;
  days_taken: number;
  status: string;
  notes: string | null;
}

interface PayRecord {
  id: string;
  record_type: string;
  amount: number;
  currency: string;
  description: string | null;
  pay_date: string;
  pay_period_start: string | null;
  pay_period_end: string | null;
}

interface StaffSchedule {
  id: string;
  user_id: string;
  start_datetime: string;
  end_datetime: string;
}

interface RecurringShiftPattern {
  id: string;
  user_id: string;
  days_of_week: number[];
  start_time: string;
  end_time: string;
  start_date: string;
  end_date: string | null;
}

interface ShiftPatternException {
  id: string;
  pattern_id: string;
  exception_date: string;
}

interface PublicHoliday {
  date: string;
  name: string;
}

const CURRENCIES: Record<string, string> = {
  'GBP': '£',
  'USD': '$',
  'EUR': '€',
  'INR': '₹',
  'AED': 'د.إ',
  'AUD': 'A$',
  'CAD': 'C$',
  'PHP': '₱',
  'ZAR': 'R',
  'NGN': '₦',
};

const ABSENCE_TYPES: Record<string, string> = {
  'holiday': 'Holiday',
  'sick': 'Sick Leave',
  'personal': 'Personal Leave',
  'maternity': 'Maternity Leave',
  'paternity': 'Paternity Leave',
  'unpaid': 'Unpaid Leave',
  'other': 'Other',
};

const RECORD_TYPES: Record<string, { label: string; positive: boolean }> = {
  'salary': { label: 'Salary', positive: true },
  'bonus': { label: 'Bonus', positive: true },
  'overtime': { label: 'Overtime', positive: true },
  'expense': { label: 'Expense', positive: true },
  'deduction': { label: 'Deduction', positive: false },
};

export function MyHRProfile() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [hrProfile, setHRProfile] = useState<HRProfile | null>(null);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [payRecords, setPayRecords] = useState<PayRecord[]>([]);
  const [totalHolidaysTaken, setTotalHolidaysTaken] = useState(0);
  const [staffSchedules, setStaffSchedules] = useState<StaffSchedule[]>([]);
  const [recurringPatterns, setRecurringPatterns] = useState<RecurringShiftPattern[]>([]);
  const [patternExceptions, setPatternExceptions] = useState<ShiftPatternException[]>([]);
  const [publicHolidays, setPublicHolidays] = useState<PublicHoliday[]>([]);
  const [payrollStatus, setPayrollStatus] = useState<'pending' | 'ready' | 'paid'>('pending');

  useEffect(() => {
    if (user) {
      fetchData();
    }
  }, [user]);

  const fetchData = async () => {
    try {
      // Fetch HR profile
      const { data: profile } = await supabase
        .from('hr_profiles')
        .select('*')
        .eq('user_id', user?.id)
        .maybeSingle();

      setHRProfile(profile);

      // Fetch holidays
      const { data: holidayData } = await supabase
        .from('staff_holidays')
        .select('*')
        .eq('user_id', user?.id)
        .order('start_date', { ascending: false });

      setHolidays(holidayData || []);

      // Calculate total holidays taken this year
      const thisYear = new Date().getFullYear();
      const holidaysThisYear = (holidayData || [])
        .filter(h => 
          h.status === 'approved' && 
          h.absence_type === 'holiday' &&
          new Date(h.start_date).getFullYear() === thisYear
        )
        .reduce((sum, h) => sum + Number(h.days_taken), 0);
      
      setTotalHolidaysTaken(holidaysThisYear);

      // Fetch pay records
      const { data: payData } = await supabase
        .from('staff_pay_records')
        .select('*')
        .eq('user_id', user?.id)
        .order('pay_date', { ascending: false });

      setPayRecords(payData || []);

      // Fetch staff schedules for this user
      const { data: schedules } = await supabase
        .from('staff_schedules')
        .select('id, user_id, start_datetime, end_datetime')
        .eq('user_id', user?.id);
      
      setStaffSchedules(schedules || []);

      // Fetch recurring patterns for this user
      const { data: patterns } = await supabase
        .from('recurring_shift_patterns')
        .select('id, user_id, days_of_week, start_time, end_time, start_date, end_date')
        .eq('user_id', user?.id);
      
      setRecurringPatterns(patterns || []);

      // Fetch pattern exceptions
      if (patterns && patterns.length > 0) {
        const patternIds = patterns.map(p => p.id);
        const { data: exceptions } = await supabase
          .from('shift_pattern_exceptions')
          .select('id, pattern_id, exception_date')
          .in('pattern_id', patternIds);
        
        setPatternExceptions(exceptions || []);
      }

      // Fetch public holidays for current year
      await fetchPublicHolidays();

      // Determine payroll status for current month
      const currentMonthStart = startOfMonth(new Date());
      const currentMonthEnd = endOfMonth(new Date());
      
      const currentMonthRecords = (payData || []).filter(r => {
        const payDate = parseISO(r.pay_date);
        return payDate >= currentMonthStart && payDate <= currentMonthEnd;
      });
      
      const hasSalaryRecord = currentMonthRecords.some(r => r.record_type === 'salary');
      
      if (hasSalaryRecord) {
        setPayrollStatus('paid');
      } else {
        // Check if there are any records at all for this month (bonuses, etc.)
        // For now, default to pending - admin would need to mark as ready
        setPayrollStatus('pending');
      }
      
    } catch (error) {
      console.error('Error fetching HR data:', error);
      toast({
        title: "Error",
        description: "Failed to load your HR profile",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchPublicHolidays = async () => {
    try {
      const year = new Date().getFullYear();
      const response = await fetch(
        `https://pavwwgfgpykakbqkxsal.supabase.co/functions/v1/get-public-holidays?year=${year}`,
        {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
        }
      );
      
      if (response.ok) {
        const result = await response.json();
        if (result?.holidays) {
          setPublicHolidays(result.holidays);
        }
      }
    } catch (error) {
      console.error('Error fetching public holidays:', error);
    }
  };

  // Calculate pay preview for current month
  const payPreview = useMemo(() => {
    if (!hrProfile || !hrProfile.base_salary) return null;

    const currentMonth = new Date();
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(currentMonth);

    // Calculate monthly base salary based on pay frequency
    let monthlyBaseSalary = hrProfile.base_salary;
    if (hrProfile.pay_frequency === 'annually') {
      monthlyBaseSalary = hrProfile.base_salary / 12;
    } else if (hrProfile.pay_frequency === 'weekly') {
      monthlyBaseSalary = hrProfile.base_salary * 4.33;
    } else if (hrProfile.pay_frequency === 'bi-weekly') {
      monthlyBaseSalary = hrProfile.base_salary * 2.17;
    }

    const dailyRate = monthlyBaseSalary / 20;
    const holidayDatesSet = new Set(publicHolidays.map(h => h.date));

    // Create exceptions map
    const exceptionsMap = new Map<string, Set<string>>();
    patternExceptions.forEach(ex => {
      if (!exceptionsMap.has(ex.pattern_id)) {
        exceptionsMap.set(ex.pattern_id, new Set());
      }
      exceptionsMap.get(ex.pattern_id)!.add(ex.exception_date);
    });

    // Generate virtual schedules from recurring patterns
    const virtualSchedules: Array<{ date: string }> = [];
    let currentDate = new Date(monthStart);
    
    while (currentDate <= monthEnd) {
      const dateStr = format(currentDate, 'yyyy-MM-dd');
      const dayOfWeek = currentDate.getDay();

      recurringPatterns.forEach(pattern => {
        const patternStart = parseISO(pattern.start_date);
        const patternEnd = pattern.end_date ? parseISO(pattern.end_date) : null;

        if (currentDate >= patternStart && (!patternEnd || currentDate <= patternEnd)) {
          if (pattern.days_of_week.includes(dayOfWeek)) {
            const patternExceptions = exceptionsMap.get(pattern.id);
            if (!patternExceptions || !patternExceptions.has(dateStr)) {
              virtualSchedules.push({ date: dateStr });
            }
          }
        }
      });

      currentDate.setDate(currentDate.getDate() + 1);
    }

    // Get actual schedules in month
    const getScheduleDate = (datetime: string): string => {
      const date = new Date(datetime);
      return format(date, 'yyyy-MM-dd');
    };

    const userSchedulesInMonth = staffSchedules.filter(s => {
      const scheduleDate = new Date(s.start_datetime);
      return scheduleDate >= monthStart && scheduleDate <= monthEnd;
    });

    const actualScheduleDates = new Set(userSchedulesInMonth.map(s => getScheduleDate(s.start_datetime)));

    // Count holiday days
    let holidayOvertimeDays = 0;
    const holidayShifts: Array<{ date: string; holidayName: string }> = [];
    const countedHolidayDates = new Set<string>();

    // Check actual schedules
    userSchedulesInMonth.forEach(schedule => {
      const scheduleDate = getScheduleDate(schedule.start_datetime);
      if (holidayDatesSet.has(scheduleDate) && !countedHolidayDates.has(scheduleDate)) {
        holidayOvertimeDays += 1;
        countedHolidayDates.add(scheduleDate);
        const holiday = publicHolidays.find(h => h.date === scheduleDate);
        holidayShifts.push({
          date: scheduleDate,
          holidayName: holiday?.name || 'Public Holiday'
        });
      }
    });

    // Check virtual schedules
    virtualSchedules.forEach(virtual => {
      if (holidayDatesSet.has(virtual.date) && !actualScheduleDates.has(virtual.date) && !countedHolidayDates.has(virtual.date)) {
        holidayOvertimeDays += 1;
        countedHolidayDates.add(virtual.date);
        const holiday = publicHolidays.find(h => h.date === virtual.date);
        holidayShifts.push({
          date: virtual.date,
          holidayName: holiday?.name || 'Public Holiday'
        });
      }
    });

    const holidayOvertimeBonus = holidayOvertimeDays * dailyRate * 1.5;

    // Get bonuses and deductions for current month
    const currentMonthStart = startOfMonth(currentMonth);
    const currentMonthEnd = endOfMonth(currentMonth);
    
    const currentMonthRecords = payRecords.filter(r => {
      const payDate = parseISO(r.pay_date);
      return payDate >= currentMonthStart && payDate <= currentMonthEnd;
    });

    const bonuses = currentMonthRecords
      .filter(r => r.record_type === 'bonus')
      .reduce((sum, r) => sum + r.amount, 0);
    
    const deductions = currentMonthRecords
      .filter(r => r.record_type === 'deduction')
      .reduce((sum, r) => sum + r.amount, 0);

    const totalPay = monthlyBaseSalary + bonuses + holidayOvertimeBonus - deductions;

    return {
      monthlyBaseSalary,
      dailyRate,
      bonuses,
      deductions,
      holidayOvertimeDays,
      holidayOvertimeBonus,
      holidayShifts,
      totalPay,
      currency: hrProfile.base_currency
    };
  }, [hrProfile, staffSchedules, recurringPatterns, patternExceptions, publicHolidays, payRecords]);

  const formatCurrency = (amount: number, currency: string) => {
    const symbol = CURRENCIES[currency] || '';
    return `${symbol}${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <Card>
          <CardContent className="p-6">
            <div className="animate-pulse space-y-4">
              <div className="h-4 bg-muted rounded w-1/4"></div>
              <div className="h-10 bg-muted rounded"></div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!hrProfile) {
    return (
      <Card>
        <CardContent className="p-12 text-center">
          <UserCircle className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium mb-2">No HR Profile Found</h3>
          <p className="text-muted-foreground">
            Your HR profile has not been set up yet. Please contact your administrator.
          </p>
        </CardContent>
      </Card>
    );
  }

  const holidayRemaining = (hrProfile.annual_holiday_allowance || 28) - totalHolidaysTaken;

  return (
    <div className="space-y-6">
      {/* Profile Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-lg">
                <Briefcase className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Job Title</p>
                <p className="font-medium">{hrProfile.job_title || 'Not set'}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-lg">
                <DollarSign className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Base Salary</p>
                <p className="font-medium">
                  {hrProfile.base_salary 
                    ? formatCurrency(hrProfile.base_salary, hrProfile.base_currency)
                    : 'Not set'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-lg">
                <Calendar className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Holiday Balance</p>
                <p className="font-medium">
                  {holidayRemaining} / {hrProfile.annual_holiday_allowance || 28} days
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-lg">
                <Clock className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Start Date</p>
                <p className="font-medium">
                  {hrProfile.start_date 
                    ? format(new Date(hrProfile.start_date), 'dd MMM yyyy')
                    : 'Not set'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Pay Preview Section */}
      {payPreview && (
        <Card className="border-2 border-primary/20">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-primary" />
                <CardTitle className="text-lg">Pay Preview - {format(new Date(), 'MMMM yyyy')}</CardTitle>
              </div>
              <Badge 
                variant="outline"
                className={
                  payrollStatus === 'paid' 
                    ? 'bg-success/20 text-success border-success' 
                    : payrollStatus === 'ready'
                    ? 'bg-amber-500/20 text-amber-600 border-amber-500'
                    : 'bg-muted text-muted-foreground border-muted-foreground'
                }
              >
                {payrollStatus === 'paid' && <CheckCircle className="h-3 w-3 mr-1" />}
                {payrollStatus === 'ready' && <Clock className="h-3 w-3 mr-1" />}
                {payrollStatus === 'pending' && <AlertCircle className="h-3 w-3 mr-1" />}
                {payrollStatus.charAt(0).toUpperCase() + payrollStatus.slice(1)}
              </Badge>
            </div>
            <CardDescription>Estimated pay for the current month (subject to final processing)</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Left column - Breakdown */}
              <div className="space-y-3">
                <div className="flex justify-between items-center py-2 border-b">
                  <span className="text-muted-foreground">Base Salary</span>
                  <span className="font-medium">{formatCurrency(payPreview.monthlyBaseSalary, payPreview.currency)}</span>
                </div>
                
                {payPreview.bonuses > 0 && (
                  <div className="flex justify-between items-center py-2 border-b">
                    <span className="text-muted-foreground">Bonuses</span>
                    <span className="font-medium text-success">+{formatCurrency(payPreview.bonuses, payPreview.currency)}</span>
                  </div>
                )}
                
                {payPreview.holidayOvertimeBonus > 0 && (
                  <div className="flex justify-between items-center py-2 border-b">
                    <div>
                      <span className="text-muted-foreground">Holiday Overtime</span>
                      <span className="text-xs text-muted-foreground ml-2">
                        ({payPreview.holidayOvertimeDays} day{payPreview.holidayOvertimeDays !== 1 ? 's' : ''} @ 1.5x)
                      </span>
                    </div>
                    <span className="font-medium text-amber-600">+{formatCurrency(payPreview.holidayOvertimeBonus, payPreview.currency)}</span>
                  </div>
                )}
                
                {payPreview.deductions > 0 && (
                  <div className="flex justify-between items-center py-2 border-b">
                    <span className="text-muted-foreground">Deductions</span>
                    <span className="font-medium text-destructive">-{formatCurrency(payPreview.deductions, payPreview.currency)}</span>
                  </div>
                )}
                
                <div className="flex justify-between items-center py-3 bg-primary/5 rounded-lg px-3 mt-2">
                  <span className="font-semibold">Estimated Total</span>
                  <span className="font-bold text-lg">{formatCurrency(payPreview.totalPay, payPreview.currency)}</span>
                </div>
              </div>

              {/* Right column - Holiday shifts details */}
              <div>
                {payPreview.holidayShifts.length > 0 ? (
                  <div className="space-y-2">
                    <h4 className="font-medium text-sm text-muted-foreground mb-3">Public Holiday Shifts</h4>
                    {payPreview.holidayShifts.map((shift, idx) => (
                      <div key={idx} className="flex items-center gap-2 text-sm py-1.5 px-2 bg-amber-500/10 rounded">
                        <Calendar className="h-4 w-4 text-amber-600" />
                        <span>{format(parseISO(shift.date), 'dd MMM yyyy')}</span>
                        <span className="text-muted-foreground">-</span>
                        <span className="text-amber-600">{shift.holidayName}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-6 text-muted-foreground">
                    <Calendar className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">No public holiday shifts this month</p>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Detailed Information */}
      <Tabs defaultValue="pay" className="w-full">
        <TabsList>
          <TabsTrigger value="pay" className="flex items-center gap-2">
            <DollarSign className="h-4 w-4" />
            My Pay Records
          </TabsTrigger>
          <TabsTrigger value="holidays" className="flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            My Holidays/Absences
          </TabsTrigger>
        </TabsList>

        <TabsContent value="pay" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Pay Records</CardTitle>
              <CardDescription>Your salary, bonuses, and deductions</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Type</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Pay Date</TableHead>
                    <TableHead>Pay Period</TableHead>
                    <TableHead>Reason/Description</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payRecords.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                        No pay records found.
                      </TableCell>
                    </TableRow>
                  ) : (
                    payRecords.map(record => {
                      const typeInfo = RECORD_TYPES[record.record_type] || { label: record.record_type, positive: true };
                      return (
                        <TableRow key={record.id}>
                          <TableCell>
                            <Badge variant={typeInfo.positive ? "default" : "destructive"}>
                              {typeInfo.label}
                            </Badge>
                          </TableCell>
                          <TableCell className={typeInfo.positive ? "text-success font-medium" : "text-destructive font-medium"}>
                            {typeInfo.positive ? '+' : '-'}{formatCurrency(record.amount, record.currency)}
                          </TableCell>
                          <TableCell>{format(new Date(record.pay_date), 'dd MMM yyyy')}</TableCell>
                          <TableCell>
                            {record.pay_period_start && record.pay_period_end
                              ? `${format(new Date(record.pay_period_start), 'dd MMM')} - ${format(new Date(record.pay_period_end), 'dd MMM yyyy')}`
                              : '-'}
                          </TableCell>
                          <TableCell className="max-w-[250px]">
                            {record.description ? (
                              <span className={
                                record.record_type === 'bonus' ? 'text-success' :
                                record.record_type === 'deduction' ? 'text-destructive' : ''
                              }>
                                {record.description}
                              </span>
                            ) : '-'}
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

        <TabsContent value="holidays" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Holidays & Absences</CardTitle>
              <CardDescription>Your leave history</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Type</TableHead>
                    <TableHead>Start Date</TableHead>
                    <TableHead>End Date</TableHead>
                    <TableHead>Days</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Notes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {holidays.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                        No holiday/absence records found.
                      </TableCell>
                    </TableRow>
                  ) : (
                    holidays.map(holiday => (
                      <TableRow key={holiday.id}>
                        <TableCell>{ABSENCE_TYPES[holiday.absence_type] || holiday.absence_type}</TableCell>
                        <TableCell>{format(new Date(holiday.start_date), 'dd MMM yyyy')}</TableCell>
                        <TableCell>{format(new Date(holiday.end_date), 'dd MMM yyyy')}</TableCell>
                        <TableCell>{holiday.days_taken}</TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={
                              holiday.status === 'approved'
                                ? 'bg-success/20 text-success border-success'
                                : holiday.status === 'rejected'
                                ? 'bg-destructive/20 text-destructive border-destructive'
                                : 'bg-warning/20 text-warning-foreground border-warning'
                            }
                          >
                            {holiday.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="max-w-[200px] truncate">{holiday.notes || '-'}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
