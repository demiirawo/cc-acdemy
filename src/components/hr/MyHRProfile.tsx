import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Calendar, DollarSign, UserCircle, Briefcase, Clock, TrendingUp, CheckCircle, AlertCircle, ChevronDown, ChevronUp, FileText, RefreshCw } from "lucide-react";
import { format, startOfMonth, endOfMonth, parseISO, addMonths, eachDayOfInterval, getDay } from "date-fns";
import { calculateHolidayAllowance } from "./StaffHolidaysManager";
interface MonthlyPayPreview {
  month: Date;
  monthLabel: string;
  monthlyBaseSalary: number;
  dailyRate: number;
  bonuses: number;
  deductions: number;
  holidayOvertimeDays: number;
  holidayOvertimeBonus: number;
  holidayShifts: Array<{
    date: string;
    holidayName: string;
  }>;
  unusedHolidayPayout: number;
  unusedHolidayDays: number;
  totalPay: number;
  payrollStatus: 'pending' | 'ready' | 'paid';
  currency: string;
}
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
interface StaffRequest {
  id: string;
  request_type: string;
  start_date: string;
  end_date: string;
  days_requested: number;
  status: string;
  details: string | null;
  created_at: string;
}
interface RecurringBonus {
  id: string;
  amount: number;
  currency: string;
  description: string | null;
  start_date: string;
  end_date: string | null;
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
  'NGN': '₦'
};
const ABSENCE_TYPES: Record<string, string> = {
  'holiday': 'Holiday',
  'sick': 'Sick Leave',
  'personal': 'Personal Leave',
  'maternity': 'Maternity Leave',
  'paternity': 'Paternity Leave',
  'unpaid': 'Unpaid Leave',
  'other': 'Other'
};
const RECORD_TYPES: Record<string, {
  label: string;
  positive: boolean;
}> = {
  'salary': {
    label: 'Salary',
    positive: true
  },
  'bonus': {
    label: 'Bonus',
    positive: true
  },
  'overtime': {
    label: 'Overtime',
    positive: true
  },
  'expense': {
    label: 'Expense',
    positive: true
  },
  'deduction': {
    label: 'Deduction',
    positive: false
  }
};
const REQUEST_TYPES: Record<string, { label: string; icon: string }> = {
  'overtime_standard': { label: 'Standard Overtime', icon: 'clock' },
  'overtime_double_up': { label: 'Double-Up Overtime', icon: 'clock' },
  'holiday': { label: 'Holiday Request', icon: 'calendar' },
  'holiday_paid': { label: 'Paid Holiday', icon: 'calendar' },
  'holiday_unpaid': { label: 'Unpaid Holiday', icon: 'calendar' },
  'shift_swap': { label: 'Shift Swap', icon: 'refresh' },
};
export function MyHRProfile() {
  const {
    user
  } = useAuth();
  const {
    toast
  } = useToast();
  const [loading, setLoading] = useState(true);
  const [hrProfile, setHRProfile] = useState<HRProfile | null>(null);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [payRecords, setPayRecords] = useState<PayRecord[]>([]);
  const [totalHolidaysTaken, setTotalHolidaysTaken] = useState(0);
  const [staffSchedules, setStaffSchedules] = useState<StaffSchedule[]>([]);
  const [recurringPatterns, setRecurringPatterns] = useState<RecurringShiftPattern[]>([]);
  const [patternExceptions, setPatternExceptions] = useState<ShiftPatternException[]>([]);
  const [publicHolidays, setPublicHolidays] = useState<PublicHoliday[]>([]);
  const [staffRequests, setStaffRequests] = useState<StaffRequest[]>([]);
  const [recurringBonuses, setRecurringBonuses] = useState<RecurringBonus[]>([]);
  const [expandedMonths, setExpandedMonths] = useState<Set<string>>(new Set([format(new Date(), 'yyyy-MM')]));
  useEffect(() => {
    if (user) {
      fetchData();
    }
  }, [user]);
  const fetchData = async () => {
    try {
      // Fetch HR profile
      const {
        data: profile
      } = await supabase.from('hr_profiles').select('*').eq('user_id', user?.id).maybeSingle();
      setHRProfile(profile);

      // Fetch holidays
      const {
        data: holidayData
      } = await supabase.from('staff_holidays').select('*').eq('user_id', user?.id).order('start_date', {
        ascending: false
      });
      setHolidays(holidayData || []);

      // Calculate total holidays taken this holiday year (June 1 to May 31)
      const now = new Date();
      const currentYear = now.getFullYear();
      const currentMonth = now.getMonth(); // 0-indexed, June = 5
      
      // Holiday year starts June 1st
      // If we're before June, the holiday year started last year
      const holidayYearStart = currentMonth < 5 
        ? new Date(currentYear - 1, 5, 1) // June 1st of previous year
        : new Date(currentYear, 5, 1); // June 1st of current year
      const holidayYearEnd = currentMonth < 5
        ? new Date(currentYear, 4, 31) // May 31st of current year
        : new Date(currentYear + 1, 4, 31); // May 31st of next year
      
      const holidaysThisYear = (holidayData || []).filter(h => {
        const startDate = new Date(h.start_date);
        return h.status === 'approved' && 
               h.absence_type === 'holiday' && 
               startDate >= holidayYearStart && 
               startDate <= holidayYearEnd;
      }).reduce((sum, h) => sum + Number(h.days_taken), 0);
      setTotalHolidaysTaken(holidaysThisYear);

      // Fetch pay records
      const {
        data: payData
      } = await supabase.from('staff_pay_records').select('*').eq('user_id', user?.id).order('pay_date', {
        ascending: false
      });
      setPayRecords(payData || []);

      // Fetch staff schedules for this user
      const {
        data: schedules
      } = await supabase.from('staff_schedules').select('id, user_id, start_datetime, end_datetime').eq('user_id', user?.id);
      setStaffSchedules(schedules || []);

      // Fetch recurring patterns for this user
      const {
        data: patterns
      } = await supabase.from('recurring_shift_patterns').select('id, user_id, days_of_week, start_time, end_time, start_date, end_date').eq('user_id', user?.id);
      setRecurringPatterns(patterns || []);

      // Fetch pattern exceptions
      if (patterns && patterns.length > 0) {
        const patternIds = patterns.map(p => p.id);
        const {
          data: exceptions
        } = await supabase.from('shift_pattern_exceptions').select('id, pattern_id, exception_date').in('pattern_id', patternIds);
        setPatternExceptions(exceptions || []);
      }

      // Fetch staff requests
      const {
        data: requestsData
      } = await supabase.from('staff_requests').select('*').eq('user_id', user?.id).order('created_at', {
        ascending: false
      });
      setStaffRequests(requestsData || []);

      // Fetch recurring bonuses
      const {
        data: bonusesData
      } = await supabase.from('recurring_bonuses').select('*').eq('user_id', user?.id);
      setRecurringBonuses(bonusesData || []);

      // Fetch public holidays for next 12 months (current year + next year if needed)
      await fetchPublicHolidays();
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
      const currentYear = new Date().getFullYear();
      const nextYear = currentYear + 1;

      // Fetch current year
      const response1 = await fetch(`https://pavwwgfgpykakbqkxsal.supabase.co/functions/v1/get-public-holidays?year=${currentYear}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      // Fetch next year
      const response2 = await fetch(`https://pavwwgfgpykakbqkxsal.supabase.co/functions/v1/get-public-holidays?year=${nextYear}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      const allHolidays: PublicHoliday[] = [];
      if (response1.ok) {
        const result1 = await response1.json();
        if (result1?.holidays) {
          allHolidays.push(...result1.holidays);
        }
      }
      if (response2.ok) {
        const result2 = await response2.json();
        if (result2?.holidays) {
          allHolidays.push(...result2.holidays);
        }
      }
      setPublicHolidays(allHolidays);
    } catch (error) {
      console.error('Error fetching public holidays:', error);
    }
  };

  // Calculate pay preview for the next 12 months
  const monthlyPreviews = useMemo((): MonthlyPayPreview[] => {
    if (!hrProfile || !hrProfile.base_salary) return [];
    const previews: MonthlyPayPreview[] = [];
    const now = new Date();

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
    const holidayDatesMap = new Map(publicHolidays.map(h => [h.date, h.name]));

    // Create exceptions map
    const exceptionsMap = new Map<string, Set<string>>();
    patternExceptions.forEach(ex => {
      if (!exceptionsMap.has(ex.pattern_id)) {
        exceptionsMap.set(ex.pattern_id, new Set());
      }
      exceptionsMap.get(ex.pattern_id)!.add(ex.exception_date);
    });
    for (let i = 0; i < 12; i++) {
      const targetMonth = addMonths(now, i);
      const monthStart = startOfMonth(targetMonth);
      const monthEnd = endOfMonth(targetMonth);
      const monthKey = format(targetMonth, 'yyyy-MM');

      // Generate virtual schedules from recurring patterns for this month
      const virtualScheduleDates: string[] = [];
      const monthDays = eachDayOfInterval({
        start: monthStart,
        end: monthEnd
      });
      for (const day of monthDays) {
        const dateStr = format(day, 'yyyy-MM-dd');
        const dayOfWeek = getDay(day);
        for (const pattern of recurringPatterns) {
          const patternStart = parseISO(pattern.start_date);
          const patternEnd = pattern.end_date ? parseISO(pattern.end_date) : null;
          if (day >= patternStart && (!patternEnd || day <= patternEnd)) {
            if (pattern.days_of_week.includes(dayOfWeek)) {
              const patternExs = exceptionsMap.get(pattern.id);
              if (!patternExs || !patternExs.has(dateStr)) {
                virtualScheduleDates.push(dateStr);
                break; // Only add date once even if multiple patterns match
              }
            }
          }
        }
      }

      // Get actual schedules in this month
      const userSchedulesInMonth = staffSchedules.filter(s => {
        const scheduleDate = new Date(s.start_datetime);
        return scheduleDate >= monthStart && scheduleDate <= monthEnd;
      });
      const actualScheduleDates = new Set(userSchedulesInMonth.map(s => format(new Date(s.start_datetime), 'yyyy-MM-dd')));

      // Count holiday days
      const countedHolidayDates = new Set<string>();
      const holidayShifts: Array<{
        date: string;
        holidayName: string;
      }> = [];

      // Check actual schedules
      for (const schedule of userSchedulesInMonth) {
        const scheduleDate = format(new Date(schedule.start_datetime), 'yyyy-MM-dd');
        if (holidayDatesMap.has(scheduleDate) && !countedHolidayDates.has(scheduleDate)) {
          countedHolidayDates.add(scheduleDate);
          holidayShifts.push({
            date: scheduleDate,
            holidayName: holidayDatesMap.get(scheduleDate) || 'Public Holiday'
          });
        }
      }

      // Check virtual schedules
      for (const dateStr of virtualScheduleDates) {
        if (holidayDatesMap.has(dateStr) && !actualScheduleDates.has(dateStr) && !countedHolidayDates.has(dateStr)) {
          countedHolidayDates.add(dateStr);
          holidayShifts.push({
            date: dateStr,
            holidayName: holidayDatesMap.get(dateStr) || 'Public Holiday'
          });
        }
      }
      const holidayOvertimeDays = countedHolidayDates.size;
      // Base day pay is already in salary, so we only add the 0.5x overtime bonus
      const holidayOvertimeBonus = holidayOvertimeDays * dailyRate * 0.5;

      // Get bonuses and deductions for this month from pay records
      const monthRecords = payRecords.filter(r => {
        const payDate = parseISO(r.pay_date);
        return payDate >= monthStart && payDate <= monthEnd;
      });
      const oneOffBonuses = monthRecords.filter(r => r.record_type === 'bonus').reduce((sum, r) => sum + r.amount, 0);
      
      // Add recurring bonuses that are active for this month
      const activeRecurringBonuses = recurringBonuses.filter(bonus => {
        const bonusStart = parseISO(bonus.start_date);
        const bonusEnd = bonus.end_date ? parseISO(bonus.end_date) : null;
        // Bonus is active if: started before or during this month AND (no end date OR ends after or during this month)
        return bonusStart <= monthEnd && (!bonusEnd || bonusEnd >= monthStart);
      }).reduce((sum, bonus) => sum + bonus.amount, 0);
      
      const bonuses = oneOffBonuses + activeRecurringBonuses;
      const deductions = monthRecords.filter(r => r.record_type === 'deduction').reduce((sum, r) => sum + r.amount, 0);
      
      // Calculate unused holiday payout for June (end of holiday year)
      // Holiday year runs June 1 to May 31, so June payroll includes payout for unused days
      let unusedHolidayPayout = 0;
      let unusedHolidayDays = 0;
      const targetMonthNum = targetMonth.getMonth(); // 0-indexed, June = 5
      
      if (targetMonthNum === 5) { // June
        // Calculate holidays taken in the holiday year ending May 31 of the same year
        const holidayYearStart = new Date(targetMonth.getFullYear() - 1, 5, 1); // June 1 of previous year
        const holidayYearEnd = new Date(targetMonth.getFullYear(), 4, 31); // May 31 of current year
        
        const holidaysTakenInYear = holidays.filter(h => {
          const startDate = parseISO(h.start_date);
          return h.status === 'approved' && 
                 h.absence_type === 'holiday' && 
                 startDate >= holidayYearStart && 
                 startDate <= holidayYearEnd;
        }).reduce((sum, h) => sum + Number(h.days_taken), 0);
        
        // Use the shared calculateHolidayAllowance function for consistency
        const { accruedAllowance } = calculateHolidayAllowance(hrProfile.start_date);
        
        unusedHolidayDays = Math.max(0, accruedAllowance - holidaysTakenInYear);
        // Unused holiday pay = Base Pay / 20 * unused days
        unusedHolidayPayout = (monthlyBaseSalary / 20) * unusedHolidayDays;
      }
      
      const totalPay = monthlyBaseSalary + bonuses + holidayOvertimeBonus + unusedHolidayPayout - deductions;

      // Determine payroll status
      let payrollStatus: 'pending' | 'ready' | 'paid' = 'pending';
      const hasSalaryRecord = monthRecords.some(r => r.record_type === 'salary');
      if (hasSalaryRecord) {
        payrollStatus = 'paid';
      } else {
        const today = new Date();
        if (today > monthEnd) {
          payrollStatus = 'ready';
        } else if (format(today, 'yyyy-MM') === monthKey && today.getDate() >= 25) {
          payrollStatus = 'ready';
        }
      }
      previews.push({
        month: targetMonth,
        monthLabel: format(targetMonth, 'MMMM yyyy'),
        monthlyBaseSalary,
        dailyRate,
        bonuses,
        deductions,
        holidayOvertimeDays,
        holidayOvertimeBonus,
        holidayShifts,
        unusedHolidayPayout,
        unusedHolidayDays,
        totalPay,
        payrollStatus,
        currency: hrProfile.base_currency
      });
    }
    return previews;
  }, [hrProfile, staffSchedules, recurringPatterns, patternExceptions, publicHolidays, payRecords, recurringBonuses, holidays]);
  const toggleMonth = (monthKey: string) => {
    setExpandedMonths(prev => {
      const next = new Set(prev);
      if (next.has(monthKey)) {
        next.delete(monthKey);
      } else {
        next.add(monthKey);
      }
      return next;
    });
  };
  const formatCurrency = (amount: number, currency: string) => {
    const symbol = CURRENCIES[currency] || '';
    return `${symbol}${amount.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    })}`;
  };
  if (loading) {
    return <div className="space-y-4">
        <Card>
          <CardContent className="p-6">
            <div className="animate-pulse space-y-4">
              <div className="h-4 bg-muted rounded w-1/4"></div>
              <div className="h-10 bg-muted rounded"></div>
            </div>
          </CardContent>
        </Card>
      </div>;
  }
  if (!hrProfile) {
    return <Card>
        <CardContent className="p-12 text-center">
          <UserCircle className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium mb-2">No HR Profile Found</h3>
          <p className="text-muted-foreground">
            Your HR profile has not been set up yet. Please contact your administrator.
          </p>
        </CardContent>
      </Card>;
  }
  const allowanceInfo = calculateHolidayAllowance(hrProfile.start_date);
  return <div className="space-y-6">
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
                  {hrProfile.base_salary ? formatCurrency(hrProfile.base_salary, hrProfile.base_currency) : 'Not set'}
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
                <p className="text-sm text-muted-foreground">Holiday Allowance (Jun-May)</p>
                <p className="font-medium">
                  {totalHolidaysTaken} / {allowanceInfo.annualAllowance} days used
                  <span className="text-muted-foreground text-sm ml-1">({allowanceInfo.accruedAllowance} accrued)</span>
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
                  {hrProfile.start_date ? format(new Date(hrProfile.start_date), 'dd MMM yyyy') : 'Not set'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 12-Month Pay Forecast Section */}
      {monthlyPreviews.length > 0 && (
        <Accordion type="single" collapsible className="w-full">
          <AccordionItem value="pay-forecast" className="border-2 border-primary/20 rounded-lg">
            <AccordionTrigger className="px-6 py-4 hover:no-underline">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-primary" />
                <span className="text-lg font-semibold">12-Month Pay Forecast</span>
              </div>
            </AccordionTrigger>
            <AccordionContent className="px-6 pb-4">
              <p className="text-sm text-muted-foreground mb-4">Estimated pay for the next 12 months (subject to final processing)</p>
              <div className="space-y-2">
                {monthlyPreviews.map(preview => {
                  const monthKey = format(preview.month, 'yyyy-MM');
                  const isExpanded = expandedMonths.has(monthKey);
                  const isCurrentMonth = format(new Date(), 'yyyy-MM') === monthKey;
                  const getStatusBadge = (status: 'pending' | 'ready' | 'paid') => {
                    if (status === 'paid') {
                      return <Badge variant="outline" className="bg-success/20 text-success border-success">
                              <CheckCircle className="h-3 w-3 mr-1" />
                              Paid
                            </Badge>;
                    } else if (status === 'ready') {
                      return;
                    } else {
                      return <Badge variant="outline" className="bg-muted text-muted-foreground border-muted-foreground">
                              <AlertCircle className="h-3 w-3 mr-1" />
                              Pending
                            </Badge>;
                    }
                  };
                  return <Collapsible key={monthKey} open={isExpanded} onOpenChange={() => toggleMonth(monthKey)}>
                          <CollapsibleTrigger className="w-full">
                            <div className={`flex items-center justify-between p-4 rounded-lg border hover:bg-muted/50 transition-colors ${isCurrentMonth ? 'border-primary bg-primary/5' : ''}`}>
                              <div className="flex items-center gap-3">
                                {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                                <span className="font-medium">{preview.monthLabel}</span>
                                {isCurrentMonth && <Badge variant="outline" className="text-xs">Current</Badge>}
                                {preview.unusedHolidayPayout > 0 && (
                                  <Badge variant="outline" className="text-xs bg-success/20 text-success border-success">
                                    +{preview.unusedHolidayDays} unused holiday days
                                  </Badge>
                                )}
                              </div>
                              <div className="flex items-center gap-3">
                                {getStatusBadge(preview.payrollStatus)}
                                <span className="font-bold text-lg">
                                  {formatCurrency(preview.totalPay, preview.currency)}
                                </span>
                              </div>
                            </div>
                          </CollapsibleTrigger>
                          <CollapsibleContent>
                            <div className="px-4 pb-4 pt-2 ml-7 border-l-2 border-muted">
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                {/* Left column - Breakdown */}
                                <div className="space-y-3">
                                  <div className="flex justify-between items-center py-2 border-b">
                                    <span className="text-muted-foreground">Base Salary</span>
                                    <span className="font-medium">{formatCurrency(preview.monthlyBaseSalary, preview.currency)}</span>
                                  </div>
                                  
                                  {preview.bonuses > 0 && <div className="flex justify-between items-center py-2 border-b">
                                      <span className="text-muted-foreground">Bonuses</span>
                                      <span className="font-medium text-success">+{formatCurrency(preview.bonuses, preview.currency)}</span>
                                    </div>}
                                  
                                  {preview.holidayOvertimeBonus > 0 && <div className="flex justify-between items-center py-2 border-b">
                                      <span className="text-muted-foreground">Public Holiday Overtime ({preview.holidayOvertimeDays} days)</span>
                                      <span className="font-medium text-amber-600">+{formatCurrency(preview.holidayOvertimeBonus, preview.currency)}</span>
                                    </div>}
                                  
                                  {preview.unusedHolidayPayout > 0 && <div className="flex justify-between items-center py-2 border-b">
                                      <span className="text-muted-foreground">Unused Holiday Payout ({preview.unusedHolidayDays} days)</span>
                                      <span className="font-medium text-success">+{formatCurrency(preview.unusedHolidayPayout, preview.currency)}</span>
                                    </div>}
                                  
                                  {preview.deductions > 0 && <div className="flex justify-between items-center py-2 border-b">
                                      <span className="text-muted-foreground">Deductions</span>
                                      <span className="font-medium text-destructive">-{formatCurrency(preview.deductions, preview.currency)}</span>
                                    </div>}
                                  
                                  <div className="flex justify-between items-center py-3 bg-primary/5 rounded-lg px-3 mt-2">
                                    <span className="font-semibold">Estimated Total</span>
                                    <span className="font-bold text-lg">{formatCurrency(preview.totalPay, preview.currency)}</span>
                                  </div>
                                </div>

                                {/* Right column - Holiday shifts details */}
                                <div>
                                  {preview.holidayShifts.length > 0 ? <div className="space-y-2">
                                      <h4 className="font-medium text-sm text-muted-foreground mb-3">Public Holiday Shifts</h4>
                                      {preview.holidayShifts.map((shift, idx) => <div key={idx} className="flex items-center gap-2 text-sm py-1.5 px-2 bg-amber-500/10 rounded">
                                          <Calendar className="h-4 w-4 text-amber-600" />
                                          <span>{format(parseISO(shift.date), 'dd MMM yyyy')}</span>
                                          <span className="text-muted-foreground">-</span>
                                          <span className="text-amber-600">{shift.holidayName}</span>
                                        </div>)}
                                    </div> : <div className="text-center py-6 text-muted-foreground">
                                      <Calendar className="h-8 w-8 mx-auto mb-2 opacity-50" />
                                      <p className="text-sm">No public holiday shifts this month</p>
                                    </div>}
                                </div>
                              </div>
                            </div>
                          </CollapsibleContent>
                        </Collapsible>;
                })}
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      )}

      {/* My Requests Section */}
      <Accordion type="single" collapsible className="w-full">
        <AccordionItem value="my-requests" className="border-2 border-primary/20 rounded-lg">
          <AccordionTrigger className="px-6 py-4 hover:no-underline">
            <div className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              <span className="text-lg font-semibold">My Requests</span>
              {staffRequests.length > 0 && (
                <Badge variant="secondary" className="ml-2">{staffRequests.length}</Badge>
              )}
            </div>
          </AccordionTrigger>
          <AccordionContent className="px-6 pb-4">
            <p className="text-sm text-muted-foreground mb-4">Your holiday, overtime, and shift swap requests</p>
            {staffRequests.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No requests found</p>
              </div>
            ) : (
              <div className="space-y-3">
                {staffRequests.map((request) => {
                  const typeInfo = REQUEST_TYPES[request.request_type] || { label: request.request_type, icon: 'file' };
                  const getStatusBadge = () => {
                    if (request.status === 'approved') {
                      return (
                        <Badge variant="outline" className="bg-success/20 text-success border-success">
                          <CheckCircle className="h-3 w-3 mr-1" />
                          Approved
                        </Badge>
                      );
                    } else if (request.status === 'rejected') {
                      return (
                        <Badge variant="outline" className="bg-destructive/20 text-destructive border-destructive">
                          <AlertCircle className="h-3 w-3 mr-1" />
                          Rejected
                        </Badge>
                      );
                    } else {
                      return (
                        <Badge variant="outline" className="bg-warning/20 text-warning-foreground border-warning">
                          <Clock className="h-3 w-3 mr-1" />
                          Pending
                        </Badge>
                      );
                    }
                  };
                  
                  const getIcon = () => {
                    if (request.request_type.includes('overtime')) {
                      return <Clock className="h-4 w-4 text-primary" />;
                    } else if (request.request_type.includes('shift_swap')) {
                      return <RefreshCw className="h-4 w-4 text-primary" />;
                    } else {
                      return <Calendar className="h-4 w-4 text-primary" />;
                    }
                  };

                  return (
                    <div key={request.id} className="flex items-center justify-between p-4 rounded-lg border hover:bg-muted/50 transition-colors">
                      <div className="flex items-center gap-3">
                        {getIcon()}
                        <div>
                          <p className="font-medium">{typeInfo.label}</p>
                          <p className="text-sm text-muted-foreground">
                            {format(parseISO(request.start_date), 'dd MMM yyyy')}
                            {request.start_date !== request.end_date && ` - ${format(parseISO(request.end_date), 'dd MMM yyyy')}`}
                            {request.days_requested > 0 && ` (${request.days_requested} day${request.days_requested !== 1 ? 's' : ''})`}
                          </p>
                          {request.details && (
                            <p className="text-xs text-muted-foreground mt-1">{request.details}</p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        {getStatusBadge()}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </AccordionContent>
        </AccordionItem>
      </Accordion>

    </div>;
}