import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar, DollarSign, UserCircle, Briefcase, Clock, TrendingUp, CheckCircle, AlertCircle, ChevronDown, ChevronUp, FileText, RefreshCw, Users, User, Eye } from "lucide-react";
import { format, startOfMonth, endOfMonth, parseISO, addMonths, eachDayOfInterval, getDay } from "date-fns";
import { calculateHolidayAllowance } from "./StaffHolidaysManager";
import { DocumentPreviewDialog } from "./DocumentPreviewDialog";
interface UserProfile {
  user_id: string;
  display_name: string | null;
  email: string | null;
}
interface MonthlyPayPreview {
  month: Date;
  monthLabel: string;
  monthlyBaseSalary: number;
  dailyRate: number;
  bonuses: number;
  deductions: number;
  overtimeDays: number;
  overtimePay: number;
  holidayOvertimeDays: number;
  holidayOvertimeBonus: number;
  holidayShifts: Array<{
    date: string;
    holidayName: string;
  }>;
  unusedHolidayPayout: number;
  unusedHolidayDays: number;
  excessHolidayDeduction: number;
  excessHolidayDays: number;
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
  is_overtime: boolean;
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
interface OnboardingFormData {
  id: string;
  employment_start_date: string | null;
  full_name: string | null;
  date_of_birth: string | null;
  phone_number: string | null;
  personal_email: string | null;
  address: string | null;
  proof_of_id_1_path: string | null;
  proof_of_id_1_type: string | null;
  proof_of_id_2_path: string | null;
  proof_of_id_2_type: string | null;
  proof_of_address_path: string | null;
  proof_of_address_type: string | null;
  photograph_path: string | null;
  bank_name: string | null;
  account_number: string | null;
  emergency_contact_name: string | null;
  emergency_contact_relationship: string | null;
  emergency_contact_phone: string | null;
  emergency_contact_email: string | null;
  form_status: string;
  submitted_at: string | null;
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
const REQUEST_TYPES: Record<string, {
  label: string;
  icon: string;
}> = {
  'overtime_standard': {
    label: 'Standard Overtime',
    icon: 'clock'
  },
  'overtime_double_up': {
    label: 'Double-Up Overtime',
    icon: 'clock'
  },
  'holiday': {
    label: 'Holiday Request',
    icon: 'calendar'
  },
  'holiday_paid': {
    label: 'Paid Holiday',
    icon: 'calendar'
  },
  'holiday_unpaid': {
    label: 'Unpaid Holiday',
    icon: 'calendar'
  },
  'shift_swap': {
    label: 'Shift Cover',
    icon: 'refresh'
  }
};
export function MyHRProfile() {
  const {
    user
  } = useAuth();
  const {
    isAdmin
  } = useUserRole();
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
  const [onboardingData, setOnboardingData] = useState<OnboardingFormData | null>(null);
  const [expandedMonths, setExpandedMonths] = useState<Set<string>>(new Set([format(new Date(), 'yyyy-MM')]));
  const [documentPreview, setDocumentPreview] = useState<{
    open: boolean;
    filePath: string | null;
    documentType: string;
    documentLabel: string;
  }>({ open: false, filePath: null, documentType: '', documentLabel: '' });

  // Admin staff selection
  const [allStaff, setAllStaff] = useState<UserProfile[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  // Fetch all staff for admin dropdown
  useEffect(() => {
    const fetchAllStaff = async () => {
      if (!isAdmin) return;
      const {
        data: profiles
      } = await supabase.from('profiles').select('user_id, display_name, email').order('display_name');
      if (profiles) {
        setAllStaff(profiles);
      }
    };
    fetchAllStaff();
  }, [isAdmin]);

  // Set initial selected user
  useEffect(() => {
    if (user && !selectedUserId) {
      setSelectedUserId(user.id);
    }
  }, [user, selectedUserId]);

  // Fetch data when selected user changes
  useEffect(() => {
    if (selectedUserId) {
      fetchData(selectedUserId);
    }
  }, [selectedUserId]);
  const fetchData = async (targetUserId: string) => {
    setLoading(true);
    try {
      // Fetch HR profile
      const {
        data: profile
      } = await supabase.from('hr_profiles').select('*').eq('user_id', targetUserId).maybeSingle();
      setHRProfile(profile);

      // Fetch holidays
      const {
        data: holidayData
      } = await supabase.from('staff_holidays').select('*').eq('user_id', targetUserId).order('start_date', {
        ascending: false
      });
      setHolidays(holidayData || []);

      // Calculate total holidays taken this holiday year (June 1 to May 31)
      const now = new Date();
      const currentYear = now.getFullYear();
      const currentMonth = now.getMonth(); // 0-indexed, June = 5

      // Holiday year starts June 1st
      // If we're before June, the holiday year started last year
      const holidayYearStart = currentMonth < 5 ? new Date(currentYear - 1, 5, 1) // June 1st of previous year
      : new Date(currentYear, 5, 1); // June 1st of current year
      const holidayYearEnd = currentMonth < 5 ? new Date(currentYear, 4, 31) // May 31st of current year
      : new Date(currentYear + 1, 4, 31); // May 31st of next year

      const holidaysThisYear = (holidayData || []).filter(h => {
        const startDate = new Date(h.start_date);
        return h.status === 'approved' && h.absence_type === 'holiday' && startDate >= holidayYearStart && startDate <= holidayYearEnd;
      }).reduce((sum, h) => sum + Number(h.days_taken), 0);
      setTotalHolidaysTaken(holidaysThisYear);

      // Fetch pay records
      const {
        data: payData
      } = await supabase.from('staff_pay_records').select('*').eq('user_id', targetUserId).order('pay_date', {
        ascending: false
      });
      setPayRecords(payData || []);

      // Fetch staff schedules for this user
      const {
        data: schedules
      } = await supabase.from('staff_schedules').select('id, user_id, start_datetime, end_datetime').eq('user_id', targetUserId);
      setStaffSchedules(schedules || []);

      // Fetch recurring patterns for this user
      const {
        data: patterns
      } = await supabase.from('recurring_shift_patterns').select('id, user_id, days_of_week, start_time, end_time, start_date, end_date, is_overtime').eq('user_id', targetUserId);
      setRecurringPatterns(patterns || []);

      // Fetch pattern exceptions
      if (patterns && patterns.length > 0) {
        const patternIds = patterns.map(p => p.id);
        const {
          data: exceptions
        } = await supabase.from('shift_pattern_exceptions').select('id, pattern_id, exception_date').in('pattern_id', patternIds);
        setPatternExceptions(exceptions || []);
      } else {
        setPatternExceptions([]);
      }

      // Fetch staff requests
      const {
        data: requestsData
      } = await supabase.from('staff_requests').select('*').eq('user_id', targetUserId).order('created_at', {
        ascending: false
      });
      setStaffRequests(requestsData || []);

      // Fetch recurring bonuses
      const {
        data: bonusesData
      } = await supabase.from('recurring_bonuses').select('*').eq('user_id', targetUserId);
      setRecurringBonuses(bonusesData || []);

      // Fetch onboarding form data
      const {
        data: onboardingFormData
      } = await supabase.from('staff_onboarding_documents').select('*').eq('user_id', targetUserId).maybeSingle();
      setOnboardingData(onboardingFormData);

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

      // Calculate overtime from approved requests
      let overtimeDays = 0;
      const approvedOvertimeRequests = staffRequests.filter(req => req.status === 'approved' && (req.request_type === 'overtime' || req.request_type === 'overtime_standard' || req.request_type === 'overtime_double_up'));
      approvedOvertimeRequests.forEach(req => {
        const reqStart = parseISO(req.start_date);
        const reqEnd = parseISO(req.end_date);
        // Count days that fall within this month
        if (reqStart <= monthEnd && reqEnd >= monthStart) {
          const overlapStart = reqStart > monthStart ? reqStart : monthStart;
          const overlapEnd = reqEnd < monthEnd ? reqEnd : monthEnd;
          const daysInMonth = Math.ceil((overlapEnd.getTime() - overlapStart.getTime()) / (1000 * 60 * 60 * 24)) + 1;
          overtimeDays += Math.min(daysInMonth, req.days_requested);
        }
      });

      // Also count recurring overtime patterns (each day only once even if multiple shifts)
      const overtimePatterns = recurringPatterns.filter(p => p.is_overtime);
      const countedOvertimeDates = new Set<string>();
      for (const day of monthDays) {
        const dateStr = format(day, 'yyyy-MM-dd');
        const dayOfWeek = getDay(day);
        for (const pattern of overtimePatterns) {
          const patternStart = parseISO(pattern.start_date);
          const patternEnd = pattern.end_date ? parseISO(pattern.end_date) : null;
          if (day >= patternStart && (!patternEnd || day <= patternEnd)) {
            if (pattern.days_of_week.includes(dayOfWeek)) {
              const patternExs = exceptionsMap.get(pattern.id);
              if (!patternExs || !patternExs.has(dateStr)) {
                countedOvertimeDates.add(dateStr);
                break; // Only count once per day
              }
            }
          }
        }
      }
      overtimeDays += countedOvertimeDates.size;

      // Overtime pay = 1.5 × daily rate × overtime days
      const overtimePay = 1.5 * dailyRate * overtimeDays;

      // Calculate unused holiday payout or excess holiday deduction for June (end of holiday year)
      // Holiday year runs June 1 to May 31, so June payroll includes payout for unused days or deduction for excess
      let unusedHolidayPayout = 0;
      let unusedHolidayDays = 0;
      let excessHolidayDeduction = 0;
      let excessHolidayDays = 0;
      const targetMonthNum = targetMonth.getMonth(); // 0-indexed, June = 5

      if (targetMonthNum === 5) {
        // June
        // Calculate holidays taken in the holiday year ending May 31 of the same year
        const holidayYearStart = new Date(targetMonth.getFullYear() - 1, 5, 1); // June 1 of previous year
        const holidayYearEnd = new Date(targetMonth.getFullYear(), 4, 31); // May 31 of current year

        const holidaysTakenInYear = holidays.filter(h => {
          const startDate = parseISO(h.start_date);
          return h.status === 'approved' && h.absence_type === 'holiday' && startDate >= holidayYearStart && startDate <= holidayYearEnd;
        }).reduce((sum, h) => sum + Number(h.days_taken), 0);

        // Use the shared calculateHolidayAllowance function for consistency
        const {
          accruedAllowance
        } = calculateHolidayAllowance(hrProfile.start_date);
        const holidayBalance = accruedAllowance - holidaysTakenInYear;
        if (holidayBalance >= 0) {
          // Staff has unused holidays - payout
          unusedHolidayDays = holidayBalance;
          unusedHolidayPayout = monthlyBaseSalary / 20 * unusedHolidayDays;
        } else {
          // Staff has used more holidays than accrued - deduction required
          excessHolidayDays = Math.abs(holidayBalance);
          excessHolidayDeduction = monthlyBaseSalary / 20 * excessHolidayDays;
        }
      }
      const totalPay = monthlyBaseSalary + bonuses + overtimePay + holidayOvertimeBonus + unusedHolidayPayout - deductions - excessHolidayDeduction;

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
        overtimeDays,
        overtimePay,
        holidayOvertimeDays,
        holidayOvertimeBonus,
        holidayShifts,
        unusedHolidayPayout,
        unusedHolidayDays,
        excessHolidayDeduction,
        excessHolidayDays,
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
  // Get selected user's display name for the header
  const selectedUserName = allStaff.find(s => s.user_id === selectedUserId)?.display_name || allStaff.find(s => s.user_id === selectedUserId)?.email || 'Staff Member';
  if (!hrProfile) {
    return <div className="space-y-6">
      {/* Admin Staff Selector */}
      {isAdmin && allStaff.length > 0 && <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-lg">
                <Users className="h-5 w-5 text-primary" />
              </div>
              <div className="flex-1">
                <p className="text-sm text-muted-foreground mb-1">View Staff Profile</p>
                <Select value={selectedUserId || ''} onValueChange={setSelectedUserId}>
                  <SelectTrigger className="w-full max-w-md">
                    <SelectValue placeholder="Select a staff member" />
                  </SelectTrigger>
                  <SelectContent className="bg-background border z-50">
                    {allStaff.map(staff => <SelectItem key={staff.user_id} value={staff.user_id}>
                        {staff.display_name || staff.email || 'Unknown'}
                      </SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>}
      
      <Card>
        <CardContent className="p-12 text-center">
          <UserCircle className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium mb-2">No HR Profile Found</h3>
          <p className="text-muted-foreground">
            {isAdmin && selectedUserId !== user?.id ? `${selectedUserName}'s HR profile has not been set up yet.` : 'Your HR profile has not been set up yet. Please contact your administrator.'}
          </p>
        </CardContent>
      </Card>
    </div>;
  }
  const allowanceInfo = calculateHolidayAllowance(hrProfile.start_date);
  return <div className="space-y-6">
      {/* Admin Staff Selector */}
      {isAdmin && allStaff.length > 0 && <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-lg">
                <Users className="h-5 w-5 text-primary" />
              </div>
              <div className="flex-1">
                <p className="text-sm text-muted-foreground mb-1">View Staff Profile</p>
                <Select value={selectedUserId || ''} onValueChange={setSelectedUserId}>
                  <SelectTrigger className="w-full max-w-md">
                    <SelectValue placeholder="Select a staff member" />
                  </SelectTrigger>
                  <SelectContent className="bg-background border z-50">
                    {allStaff.map(staff => <SelectItem key={staff.user_id} value={staff.user_id}>
                        {staff.display_name || staff.email || 'Unknown'}
                      </SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>}

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
                  <span className="text-muted-foreground text-sm ml-1">({allowanceInfo.accruedAllowance.toFixed(1)} accrued)</span>
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

      {/* Personal Details Section - from onboarding form */}
      {onboardingData && <Accordion type="single" collapsible className="w-full">
          <AccordionItem value="personal-details" className="border-2 border-primary/20 rounded-lg">
            <AccordionTrigger className="px-6 py-4 hover:no-underline">
              <div className="flex items-center gap-2">
                <User className="h-5 w-5 text-primary" />
                <span className="text-lg font-semibold">Personal Details</span>
                <Badge variant={onboardingData.form_status === 'complete' ? 'default' : 'secondary'} className="ml-2">
                  {onboardingData.form_status === 'complete' ? 'Complete' : 'In Progress'}
                </Badge>
              </div>
            </AccordionTrigger>
            <AccordionContent className="px-6 pb-4">
              <div className="space-y-6">
                {/* Documents Section */}
                <div>
                  <h4 className="font-medium text-sm text-muted-foreground mb-3 flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    Onboarding Documents
                  </h4>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <button
                      type="button"
                      onClick={() => onboardingData.photograph_path && setDocumentPreview({
                        open: true,
                        filePath: onboardingData.photograph_path,
                        documentType: 'Staff Photograph',
                        documentLabel: 'Photograph'
                      })}
                      disabled={!onboardingData.photograph_path}
                      className="border rounded-lg p-4 space-y-2 text-left hover:border-primary/50 hover:bg-muted/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <p className="text-xs text-muted-foreground">Photograph</p>
                      <p className="font-medium text-sm">Staff photograph</p>
                      <div className="h-20 flex items-center justify-center bg-muted/50 rounded">
                        {onboardingData.photograph_path ? (
                          <div className="flex flex-col items-center gap-1">
                            <Eye className="h-6 w-6 text-primary" />
                            <span className="text-xs text-primary">Click to view</span>
                          </div>
                        ) : (
                          <p className="text-xs text-muted-foreground">Not provided</p>
                        )}
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => onboardingData.proof_of_id_1_path && setDocumentPreview({
                        open: true,
                        filePath: onboardingData.proof_of_id_1_path,
                        documentType: onboardingData.proof_of_id_1_type || 'ID Document',
                        documentLabel: 'ID Document 1'
                      })}
                      disabled={!onboardingData.proof_of_id_1_path}
                      className="border rounded-lg p-4 space-y-2 text-left hover:border-primary/50 hover:bg-muted/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <p className="text-xs text-muted-foreground">ID Document 1</p>
                      <p className="font-medium text-sm">{onboardingData.proof_of_id_1_type || 'Not provided'}</p>
                      <div className="h-20 flex items-center justify-center bg-muted/50 rounded">
                        {onboardingData.proof_of_id_1_path ? (
                          <div className="flex flex-col items-center gap-1">
                            <Eye className="h-6 w-6 text-primary" />
                            <span className="text-xs text-primary">Click to view</span>
                          </div>
                        ) : (
                          <p className="text-xs text-muted-foreground">Not provided</p>
                        )}
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => onboardingData.proof_of_id_2_path && setDocumentPreview({
                        open: true,
                        filePath: onboardingData.proof_of_id_2_path,
                        documentType: onboardingData.proof_of_id_2_type || 'ID Document',
                        documentLabel: 'ID Document 2'
                      })}
                      disabled={!onboardingData.proof_of_id_2_path}
                      className="border rounded-lg p-4 space-y-2 text-left hover:border-primary/50 hover:bg-muted/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <p className="text-xs text-muted-foreground">ID Document 2</p>
                      <p className="font-medium text-sm">{onboardingData.proof_of_id_2_type || 'Not provided'}</p>
                      <div className="h-20 flex items-center justify-center bg-muted/50 rounded">
                        {onboardingData.proof_of_id_2_path ? (
                          <div className="flex flex-col items-center gap-1">
                            <Eye className="h-6 w-6 text-primary" />
                            <span className="text-xs text-primary">Click to view</span>
                          </div>
                        ) : (
                          <p className="text-xs text-muted-foreground">Not provided</p>
                        )}
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => onboardingData.proof_of_address_path && setDocumentPreview({
                        open: true,
                        filePath: onboardingData.proof_of_address_path,
                        documentType: onboardingData.proof_of_address_type || 'Address Document',
                        documentLabel: 'Proof of Address'
                      })}
                      disabled={!onboardingData.proof_of_address_path}
                      className="border rounded-lg p-4 space-y-2 text-left hover:border-primary/50 hover:bg-muted/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <p className="text-xs text-muted-foreground">Proof of Address</p>
                      <p className="font-medium text-sm">{onboardingData.proof_of_address_type || 'Address document'}</p>
                      <div className="h-20 flex items-center justify-center bg-muted/50 rounded">
                        {onboardingData.proof_of_address_path ? (
                          <div className="flex flex-col items-center gap-1">
                            <Eye className="h-6 w-6 text-primary" />
                            <span className="text-xs text-primary">Click to view</span>
                          </div>
                        ) : (
                          <p className="text-xs text-muted-foreground">Not provided</p>
                        )}
                      </div>
                    </button>
                  </div>
                </div>

                {/* Personal Information */}
                <div className="border-t pt-4">
                  <h4 className="font-medium text-sm text-muted-foreground mb-3 flex items-center gap-2">
                    <UserCircle className="h-4 w-4" />
                    Personal Details
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <p className="text-sm text-muted-foreground">Full Name</p>
                      <p className="font-medium">{onboardingData.full_name || 'Not provided'}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-sm text-muted-foreground">Date of Birth</p>
                      <p className="font-medium">
                        {onboardingData.date_of_birth ? format(parseISO(onboardingData.date_of_birth), 'dd MMM yyyy') : 'Not provided'}
                      </p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-sm text-muted-foreground">Phone</p>
                      <p className="font-medium">{onboardingData.phone_number || 'Not provided'}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-sm text-muted-foreground">Personal Email</p>
                      <p className="font-medium">{onboardingData.personal_email || 'Not provided'}</p>
                    </div>
                    <div className="space-y-1 md:col-span-2">
                      <p className="text-sm text-muted-foreground">Address</p>
                      <p className="font-medium">{onboardingData.address || 'Not provided'}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-sm text-muted-foreground">Employment Start Date (from form)</p>
                      <p className="font-medium">
                        {onboardingData.employment_start_date ? format(parseISO(onboardingData.employment_start_date), 'dd MMM yyyy') : 'Not provided'}
                      </p>
                    </div>
                    {onboardingData.submitted_at && <div className="space-y-1">
                        <p className="text-sm text-muted-foreground">Form Submitted</p>
                        <p className="font-medium">
                          {format(parseISO(onboardingData.submitted_at), 'dd MMM yyyy HH:mm')}
                        </p>
                      </div>}
                  </div>
                </div>

                {/* Bank Details and Emergency Contact - Side by Side */}
                <div className="border-t pt-4 grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Bank Details */}
                  <div className="border rounded-lg p-4">
                    <h4 className="font-medium text-sm text-muted-foreground mb-3 flex items-center gap-2">
                      <DollarSign className="h-4 w-4" />
                      Bank Details
                    </h4>
                    <div className="space-y-3">
                      <div className="space-y-1">
                        <p className="text-sm text-muted-foreground">Bank Name</p>
                        <p className="font-medium">{onboardingData.bank_name || 'Not provided'}</p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-sm text-muted-foreground">Account Number</p>
                        <p className="font-medium">{onboardingData.account_number || 'Not provided'}</p>
                      </div>
                    </div>
                  </div>

                  {/* Emergency Contact */}
                  <div className="border rounded-lg p-4">
                    <h4 className="font-medium text-sm text-muted-foreground mb-3 flex items-center gap-2">
                      <AlertCircle className="h-4 w-4" />
                      Emergency Contact
                    </h4>
                    <div className="space-y-3">
                      <div className="space-y-1">
                        <p className="text-sm text-muted-foreground">Name</p>
                        <p className="font-medium">{onboardingData.emergency_contact_name || 'Not provided'}</p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-sm text-muted-foreground">Relationship</p>
                        <p className="font-medium">{onboardingData.emergency_contact_relationship || 'Not provided'}</p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-sm text-muted-foreground">Phone</p>
                        <p className="font-medium">{onboardingData.emergency_contact_phone || 'Not provided'}</p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-sm text-muted-foreground">Email</p>
                        <p className="font-medium">{onboardingData.emergency_contact_email || 'Not provided'}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>}

      {/* 12-Month Pay Forecast Section */}
      {monthlyPreviews.length > 0 && <Accordion type="single" collapsible className="w-full">
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
                                {preview.unusedHolidayPayout > 0 && <Badge variant="outline" className="text-xs bg-success/20 text-success border-success">
                                    +{preview.unusedHolidayDays.toFixed(1)} unused holiday days
                                  </Badge>}
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
                                  
                                  {preview.overtimePay > 0 && <div className="flex justify-between items-center py-2 border-b">
                                      <span className="text-muted-foreground">Overtime Pay ({preview.overtimeDays} days)</span>
                                      <span className="font-medium text-success">+{formatCurrency(preview.overtimePay, preview.currency)}</span>
                                    </div>}
                                  
                                  {preview.holidayOvertimeBonus > 0 && <div className="flex justify-between items-center py-2 border-b">
                                      <span className="text-muted-foreground">Public Holiday Overtime ({preview.holidayOvertimeDays} days)</span>
                                      <span className="font-medium text-amber-600">+{formatCurrency(preview.holidayOvertimeBonus, preview.currency)}</span>
                                    </div>}
                                  
                                  {preview.unusedHolidayPayout > 0 && <div className="flex justify-between items-center py-2 border-b">
                                      <span className="text-muted-foreground">Unused Holiday Payout ({preview.unusedHolidayDays.toFixed(1)} days)</span>
                                      <span className="font-medium text-success">+{formatCurrency(preview.unusedHolidayPayout, preview.currency)}</span>
                                    </div>}
                                  
                                  {preview.excessHolidayDeduction > 0 && <div className="flex justify-between items-center py-2 border-b">
                                      <span className="text-muted-foreground">Excess Holiday Deduction ({preview.excessHolidayDays.toFixed(1)} days over allowance)</span>
                                      <span className="font-medium text-destructive">-{formatCurrency(preview.excessHolidayDeduction, preview.currency)}</span>
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
        </Accordion>}

      {/* My Requests Section */}
      <Accordion type="single" collapsible className="w-full">
        <AccordionItem value="my-requests" className="border-2 border-primary/20 rounded-lg">
          <AccordionTrigger className="px-6 py-4 hover:no-underline">
            <div className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              <span className="text-lg font-semibold">My Requests</span>
              {staffRequests.length > 0 && <Badge variant="secondary" className="ml-2">{staffRequests.length}</Badge>}
            </div>
          </AccordionTrigger>
          <AccordionContent className="px-6 pb-4">
            <p className="text-sm text-muted-foreground mb-4">Your holiday, overtime, and shift cover requests</p>
            {staffRequests.length === 0 ? <div className="text-center py-8 text-muted-foreground">
                <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No requests found</p>
              </div> : <div className="space-y-3">
                {staffRequests.map(request => {
              const typeInfo = REQUEST_TYPES[request.request_type] || {
                label: request.request_type,
                icon: 'file'
              };
              const getStatusBadge = () => {
                if (request.status === 'approved') {
                  return <Badge variant="outline" className="bg-success/20 text-success border-success">
                          <CheckCircle className="h-3 w-3 mr-1" />
                          Approved
                        </Badge>;
                } else if (request.status === 'rejected') {
                  return <Badge variant="outline" className="bg-destructive/20 text-destructive border-destructive">
                          <AlertCircle className="h-3 w-3 mr-1" />
                          Rejected
                        </Badge>;
                } else {
                  return <Badge variant="outline" className="bg-warning/20 text-warning-foreground border-warning">
                          <Clock className="h-3 w-3 mr-1" />
                          Pending
                        </Badge>;
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

              // Get day-by-day shift breakdown for this request
              const getDayByDayBreakdown = (): {
                date: Date;
                shiftTime: string;
              }[] => {
                if (!['holiday', 'holiday_paid', 'holiday_unpaid', 'shift_swap'].includes(request.request_type)) {
                  return [];
                }
                const startDate = new Date(request.start_date);
                const endDate = new Date(request.end_date);
                const result: {
                  date: Date;
                  shiftTime: string;
                }[] = [];
                let currentDate = new Date(startDate);
                while (currentDate <= endDate) {
                  const dayOfWeek = currentDate.getDay();
                  recurringPatterns.forEach(pattern => {
                    const patternStart = new Date(pattern.start_date);
                    const patternEnd = pattern.end_date ? new Date(pattern.end_date) : null;
                    if (currentDate >= patternStart && (!patternEnd || currentDate <= patternEnd)) {
                      if (pattern.days_of_week.includes(dayOfWeek)) {
                        const startTime = pattern.start_time.substring(0, 5);
                        const endTime = pattern.end_time.substring(0, 5);
                        const shiftTime = `${startTime} - ${endTime}`;
                        result.push({
                          date: new Date(currentDate),
                          shiftTime
                        });
                      }
                    }
                  });
                  currentDate.setDate(currentDate.getDate() + 1);
                }

                // Sort by date
                result.sort((a, b) => a.date.getTime() - b.date.getTime());
                return result;
              };
              const dayBreakdown = getDayByDayBreakdown();
              const isMultiDay = request.start_date !== request.end_date && dayBreakdown.length > 1;
              const summaryShiftTime = dayBreakdown.length > 0 ? [...new Set(dayBreakdown.map(d => d.shiftTime))].join(', ') : null;

              // For single day or non-expandable requests
              if (!isMultiDay) {
                return <div key={request.id} className="p-4 rounded-lg border hover:bg-muted/50 transition-colors">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            {getIcon()}
                            <div>
                              <p className="font-medium">{typeInfo.label}</p>
                              <p className="text-sm text-muted-foreground">
                                {format(parseISO(request.start_date), 'dd MMM yyyy')}
                                {request.days_requested > 0 && ` (${request.days_requested} day${request.days_requested !== 1 ? 's' : ''})`}
                              </p>
                              {summaryShiftTime && <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                                  <Clock className="h-3 w-3" />
                                  {summaryShiftTime}
                                </p>}
                              {request.details && <p className="text-xs text-muted-foreground mt-1">{request.details}</p>}
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            {getStatusBadge()}
                          </div>
                        </div>
                      </div>;
              }

              // For multi-day requests - make expandable
              return <Collapsible key={request.id} className="rounded-lg border hover:bg-muted/50 transition-colors">
                      <CollapsibleTrigger className="w-full p-4 text-left">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            {getIcon()}
                            <div>
                              <p className="font-medium">{typeInfo.label}</p>
                              <p className="text-sm text-muted-foreground">
                                {format(parseISO(request.start_date), 'dd MMM yyyy')} - {format(parseISO(request.end_date), 'dd MMM yyyy')}
                                {request.days_requested > 0 && ` (${request.days_requested} day${request.days_requested !== 1 ? 's' : ''})`}
                              </p>
                              {summaryShiftTime}
                              {request.details && <p className="text-xs text-muted-foreground mt-1">{request.details}</p>}
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            {getStatusBadge()}
                            <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform duration-200 group-data-[state=open]:rotate-180" />
                          </div>
                        </div>
                      </CollapsibleTrigger>
                      <CollapsibleContent className="px-4 pb-4">
                        <div className="ml-7 mt-2 space-y-1 border-l-2 border-muted pl-4">
                          <p className="text-xs font-medium text-muted-foreground mb-2">Affected Shifts</p>
                          {dayBreakdown.map((day, idx) => <div key={idx} className="flex items-center gap-3 text-sm py-1">
                              <span className="min-w-[120px] font-medium">
                                {format(day.date, 'EEE, dd MMM yyyy')}
                              </span>
                              <Badge variant="outline" className="bg-muted text-xs">
                                <Clock className="h-3 w-3 mr-1" />
                                {day.shiftTime}
                              </Badge>
                            </div>)}
                        </div>
                      </CollapsibleContent>
                    </Collapsible>;
            })}
              </div>}
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      {/* Document Preview Dialog */}
      <DocumentPreviewDialog
        open={documentPreview.open}
        onOpenChange={(open) => setDocumentPreview(prev => ({ ...prev, open }))}
        filePath={documentPreview.filePath}
        documentType={documentPreview.documentType}
        documentLabel={documentPreview.documentLabel}
      />
    </div>;
}