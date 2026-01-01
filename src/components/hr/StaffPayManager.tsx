import { useState, useEffect, useMemo } from "react";
import { calculateHolidayAllowance } from "./StaffHolidaysManager";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, DollarSign, TrendingUp, TrendingDown, Calendar, ChevronLeft, ChevronRight, Calculator, FileText, RefreshCw, Edit2, CheckCircle, Clock, RotateCcw, Sparkles, Repeat } from "lucide-react";
import { format, startOfMonth, endOfMonth, addMonths, subMonths, parseISO } from "date-fns";

interface PublicHoliday {
  date: string;
  name: string;
  isEstimated?: boolean;
}

interface PayRecord {
  id: string;
  user_id: string;
  record_type: string;
  amount: number;
  currency: string;
  description: string | null;
  pay_date: string;
  pay_period_start: string | null;
  pay_period_end: string | null;
  created_by: string;
  created_at: string;
}

interface StaffSchedule {
  id: string;
  user_id: string;
  start_datetime: string;
  end_datetime: string;
  hourly_rate: number | null;
  currency: string;
  client_name: string;
}

interface RecurringShiftPattern {
  id: string;
  user_id: string;
  days_of_week: number[];
  start_time: string;
  end_time: string;
  start_date: string;
  end_date: string | null;
  hourly_rate: number | null;
  currency: string;
  client_name: string;
  is_overtime: boolean;
}

interface ShiftPatternException {
  id: string;
  pattern_id: string;
  exception_date: string;
  exception_type: string;
}

interface UserProfile {
  user_id: string;
  display_name: string | null;
  email: string | null;
}

interface HRProfile {
  user_id: string;
  base_currency: string;
  base_salary: number | null;
  pay_frequency: string | null;
}

interface ExchangeRates {
  [currency: string]: number;
}

const RECORD_TYPES = [
  { value: 'salary', label: 'Base Salary', icon: DollarSign, positive: true },
  { value: 'bonus', label: 'Bonus', icon: TrendingUp, positive: true },
  { value: 'overtime', label: 'Overtime', icon: TrendingUp, positive: true },
  { value: 'expense', label: 'Expense Reimbursement', icon: TrendingUp, positive: true },
  { value: 'deduction', label: 'Deduction', icon: TrendingDown, positive: false },
];

const CURRENCIES = [
  { code: 'GBP', symbol: '£' },
  { code: 'USD', symbol: '$' },
  { code: 'EUR', symbol: '€' },
  { code: 'INR', symbol: '₹' },
  { code: 'AED', symbol: 'د.إ' },
  { code: 'AUD', symbol: 'A$' },
  { code: 'CAD', symbol: 'C$' },
  { code: 'PHP', symbol: '₱' },
  { code: 'ZAR', symbol: 'R' },
  { code: 'NGN', symbol: '₦' },
];

// Fallback rates if API fails
const FALLBACK_RATES: ExchangeRates = {
  GBP: 1,
  EUR: 0.85,
  USD: 0.79,
  INR: 0.0095,
  AED: 0.21,
  AUD: 0.52,
  CAD: 0.58,
  PHP: 0.014,
  ZAR: 0.044,
  NGN: 0.00052,
};

interface RecurringBonus {
  id: string;
  user_id: string;
  amount: number;
  currency: string;
  description: string | null;
  start_date: string;
  end_date: string | null;
  created_by: string;
}

interface AdjustmentEditState {
  staffId: string;
  staffName: string;
  currency: string;
  bonusAmount: number;
  bonusComment: string;
  bonusRecurring: boolean;
  existingRecurringBonusId: string | null;
  deductionAmount: number;
  deductionComment: string;
  overtimeOverrideEnabled: boolean;
  overtimeOverrideAmount: number;
  calculatedOvertime: number;
}

export function StaffPayManager() {
  const [payRecords, setPayRecords] = useState<(PayRecord & { user?: UserProfile })[]>([]);
  const [userProfiles, setUserProfiles] = useState<UserProfile[]>([]);
  const [hrProfiles, setHRProfiles] = useState<HRProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(new Date());
  const [exchangeRates, setExchangeRates] = useState<ExchangeRates>(FALLBACK_RATES);
  const [manualRates, setManualRates] = useState<ExchangeRates>({});
  const [ratesDate, setRatesDate] = useState<string | null>(null);
  const [loadingRates, setLoadingRates] = useState(false);
  const [adjustmentEdit, setAdjustmentEdit] = useState<AdjustmentEditState | null>(null);
  const [adjustmentDialogOpen, setAdjustmentDialogOpen] = useState(false);
  const [savingAdjustment, setSavingAdjustment] = useState(false);
  const [readyStaff, setReadyStaff] = useState<Set<string>>(new Set());
  const [publicHolidays, setPublicHolidays] = useState<PublicHoliday[]>([]);
  const [loadingHolidays, setLoadingHolidays] = useState(false);
  const [holidaysYear, setHolidaysYear] = useState(new Date().getFullYear());
  const [staffSchedules, setStaffSchedules] = useState<StaffSchedule[]>([]);
  const [recurringPatterns, setRecurringPatterns] = useState<RecurringShiftPattern[]>([]);
  const [patternExceptions, setPatternExceptions] = useState<ShiftPatternException[]>([]);
  const [recurringBonuses, setRecurringBonuses] = useState<RecurringBonus[]>([]);
  const [staffHolidays, setStaffHolidays] = useState<{ user_id: string; days_taken: number; start_date: string; status: string; absence_type: string }[]>([]);
  const [hrProfilesFull, setHRProfilesFull] = useState<{ user_id: string; annual_holiday_allowance: number | null; start_date: string | null }[]>([]);
  const [approvedOvertimeRequests, setApprovedOvertimeRequests] = useState<{ user_id: string; days_requested: number; start_date: string; end_date: string; request_type: string; overtime_type: string | null }[]>([]);
  const { toast } = useToast();
  const { user } = useAuth();

  const [formData, setFormData] = useState({
    user_id: '',
    record_type: 'bonus',
    amount: 0,
    currency: 'GBP',
    description: '',
    pay_date: new Date().toISOString().split('T')[0]
  });

  useEffect(() => {
    fetchData();
    fetchExchangeRates();
    fetchPublicHolidays(holidaysYear);
  }, []);

  // Fetch holidays when selected month's year changes
  useEffect(() => {
    const selectedYear = selectedMonth.getFullYear();
    if (selectedYear !== holidaysYear) {
      setHolidaysYear(selectedYear);
      fetchPublicHolidays(selectedYear);
    }
  }, [selectedMonth]);

  const fetchPublicHolidays = async (year: number) => {
    setLoadingHolidays(true);
    try {
      const { data, error } = await supabase.functions.invoke('get-public-holidays', {
        body: {},
        headers: {},
      });
      
      // Use query params via URL for GET-style request
      const response = await fetch(
        `https://pavwwgfgpykakbqkxsal.supabase.co/functions/v1/get-public-holidays?year=${year}`,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );
      
      if (!response.ok) throw new Error('Failed to fetch holidays');
      
      const result = await response.json();
      
      if (result?.holidays) {
        setPublicHolidays(result.holidays);
        setHolidaysYear(result.year);
        console.log(`Loaded ${result.holidays.length} holidays for ${result.year} (source: ${result.source})`);
      }
    } catch (error) {
      console.error('Error fetching public holidays:', error);
      toast({
        title: "Holiday data unavailable",
        description: "Using cached holiday data. Refresh to try again.",
        variant: "destructive",
      });
    } finally {
      setLoadingHolidays(false);
    }
  };

  const fetchExchangeRates = async () => {
    setLoadingRates(true);
    try {
      const { data, error } = await supabase.functions.invoke('get-exchange-rates');
      
      if (error) throw error;
      
      if (data?.rates) {
        setExchangeRates(data.rates);
        setRatesDate(data.date || null);
        console.log('Exchange rates loaded:', data);
      }
    } catch (error) {
      console.error('Error fetching exchange rates:', error);
      // Keep using fallback rates
    } finally {
      setLoadingRates(false);
    }
  };

  // Get currencies used in the current payroll
  const currenciesInPayroll = useMemo(() => {
    const currencies = new Set<string>();
    hrProfiles.forEach(hr => {
      if (hr.base_salary && hr.base_salary > 0 && hr.base_currency !== 'GBP') {
        currencies.add(hr.base_currency);
      }
    });
    return Array.from(currencies);
  }, [hrProfiles]);

  const handleManualRateChange = (currency: string, value: string) => {
    const numValue = parseFloat(value);
    if (!isNaN(numValue) && numValue > 0) {
      setManualRates(prev => ({ ...prev, [currency]: numValue }));
    } else if (value === '') {
      // Clear manual rate to use API rate
      setManualRates(prev => {
        const newRates = { ...prev };
        delete newRates[currency];
        return newRates;
      });
    }
  };

  // Convert amount from source currency to GBP using manual rate if set, otherwise API rate
  const convertToGBP = (amount: number, currency: string): number => {
    const rate = manualRates[currency] ?? exchangeRates[currency] ?? 1;
    return amount * rate;
  };

  const fetchData = async () => {
    try {
      const { data: users, error: usersError } = await supabase
        .from('profiles')
        .select('user_id, display_name, email');

      if (usersError) throw usersError;
      setUserProfiles(users || []);

      const { data: hrData } = await supabase
        .from('hr_profiles')
        .select('user_id, base_currency, base_salary, pay_frequency');
      
      setHRProfiles(hrData || []);

      const { data: records, error: recordsError } = await supabase
        .from('staff_pay_records')
        .select('*')
        .order('pay_date', { ascending: false });

      if (recordsError) throw recordsError;

      const mergedRecords = (records || []).map(r => ({
        ...r,
        user: users?.find(u => u.user_id === r.user_id)
      }));

      setPayRecords(mergedRecords);

      // Fetch staff schedules
      const { data: schedules, error: schedulesError } = await supabase
        .from('staff_schedules')
        .select('id, user_id, start_datetime, end_datetime, hourly_rate, currency, client_name');
      
      if (schedulesError) {
        console.error('Error fetching schedules:', schedulesError);
      } else {
        setStaffSchedules(schedules || []);
      }

      // Fetch recurring shift patterns
      const { data: patterns, error: patternsError } = await supabase
        .from('recurring_shift_patterns')
        .select('id, user_id, days_of_week, start_time, end_time, start_date, end_date, hourly_rate, currency, client_name, is_overtime');
      
      if (patternsError) {
        console.error('Error fetching recurring patterns:', patternsError);
      } else {
        setRecurringPatterns(patterns || []);
      }

      // Fetch pattern exceptions
      const { data: exceptions, error: exceptionsError } = await supabase
        .from('shift_pattern_exceptions')
        .select('id, pattern_id, exception_date, exception_type');
      
      if (exceptionsError) {
        console.error('Error fetching pattern exceptions:', exceptionsError);
      } else {
        setPatternExceptions(exceptions || []);
      }

      // Fetch recurring bonuses
      const { data: recBonuses, error: recBonusesError } = await supabase
        .from('recurring_bonuses')
        .select('*');
      
      if (recBonusesError) {
        console.error('Error fetching recurring bonuses:', recBonusesError);
      } else {
        setRecurringBonuses(recBonuses || []);
      }

      // Fetch staff holidays for unused holiday calculation
      const { data: holidaysData, error: holidaysError } = await supabase
        .from('staff_holidays')
        .select('user_id, days_taken, start_date, status, absence_type');
      
      if (holidaysError) {
        console.error('Error fetching staff holidays:', holidaysError);
      } else {
        setStaffHolidays(holidaysData || []);
      }

      // Fetch full HR profiles for holiday allowance
      const { data: hrFullData } = await supabase
        .from('hr_profiles')
        .select('user_id, annual_holiday_allowance, start_date');
      
      setHRProfilesFull(hrFullData || []);

      // Fetch approved overtime and shift_swap requests for overtime pay calculation
      const { data: overtimeRequestsData, error: overtimeRequestsError } = await supabase
        .from('staff_requests')
        .select('user_id, days_requested, start_date, end_date, request_type, overtime_type')
        .eq('status', 'approved')
        .in('request_type', ['overtime', 'overtime_standard', 'overtime_double_up', 'shift_swap']);
      
      if (overtimeRequestsError) {
        console.error('Error fetching overtime requests:', overtimeRequestsError);
      } else {
        setApprovedOvertimeRequests(overtimeRequestsData || []);
      }
    } catch (error) {
      console.error('Error fetching pay records:', error);
      toast({
        title: "Error",
        description: "Failed to load pay records",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  // Get records for selected month
  const monthStart = startOfMonth(selectedMonth);
  const monthEnd = endOfMonth(selectedMonth);

  const monthRecords = useMemo(() => {
    return payRecords.filter(r => {
      const payDate = parseISO(r.pay_date);
      return payDate >= monthStart && payDate <= monthEnd;
    });
  }, [payRecords, monthStart, monthEnd]);

  // Calculate payroll summary per staff member for the month
  const payrollSummary = useMemo(() => {
    // Get staff with HR profiles (who have salary configured)
    const staffWithHR = hrProfiles.filter(hr => hr.base_salary && hr.base_salary > 0);
    
    // Create a set of public holiday dates for quick lookup (format: YYYY-MM-DD)
    const holidayDatesSet = new Set(publicHolidays.map(h => h.date));
    
    // Helper to calculate hours from time strings (HH:MM:SS format)
    const calculateHoursFromTime = (startTime: string, endTime: string): number => {
      const [startH, startM] = startTime.split(':').map(Number);
      const [endH, endM] = endTime.split(':').map(Number);
      return (endH + endM / 60) - (startH + startM / 60);
    };
    
    // Helper to calculate hours worked from a schedule datetime
    const calculateHours = (start: string, end: string): number => {
      const startTime = new Date(start);
      const endTime = new Date(end);
      return (endTime.getTime() - startTime.getTime()) / (1000 * 60 * 60);
    };
    
    // Helper to get schedule date in YYYY-MM-DD format (handles both ISO and Postgres formats)
    const getScheduleDate = (datetime: string): string => {
      const date = new Date(datetime);
      return format(date, 'yyyy-MM-dd');
    };
    
    // Create a set of exception dates per pattern for quick lookup
    const exceptionsMap = new Map<string, Set<string>>();
    patternExceptions.forEach(ex => {
      if (!exceptionsMap.has(ex.pattern_id)) {
        exceptionsMap.set(ex.pattern_id, new Set());
      }
      exceptionsMap.get(ex.pattern_id)!.add(ex.exception_date);
    });
    
    // Generate virtual schedules from recurring patterns for the selected month
    const generateVirtualSchedules = (userId: string): Array<{ date: string; hours: number; hourlyRate: number | null }> => {
      const virtualSchedules: Array<{ date: string; hours: number; hourlyRate: number | null }> = [];
      
      // Get patterns for this user
      const userPatterns = recurringPatterns.filter(p => p.user_id === userId);
      
      // Iterate through each day of the month
      let currentDate = new Date(monthStart);
      while (currentDate <= monthEnd) {
        const dateStr = format(currentDate, 'yyyy-MM-dd');
        const dayOfWeek = currentDate.getDay(); // 0 = Sunday, 1 = Monday, etc.
        
        // Check each pattern
        userPatterns.forEach(pattern => {
          // Check if pattern is active for this date
          const patternStart = parseISO(pattern.start_date);
          const patternEnd = pattern.end_date ? parseISO(pattern.end_date) : null;
          
          if (currentDate >= patternStart && (!patternEnd || currentDate <= patternEnd)) {
            // Check if this day of week is in the pattern
            if (pattern.days_of_week.includes(dayOfWeek)) {
              // Check for exceptions
              const patternExceptions = exceptionsMap.get(pattern.id);
              if (!patternExceptions || !patternExceptions.has(dateStr)) {
                const hours = calculateHoursFromTime(pattern.start_time, pattern.end_time);
                virtualSchedules.push({
                  date: dateStr,
                  hours,
                  hourlyRate: pattern.hourly_rate
                });
              }
            }
          }
        });
        
        // Move to next day
        currentDate.setDate(currentDate.getDate() + 1);
      }
      
      return virtualSchedules;
    };
    
    console.log('Holiday dates set:', Array.from(holidayDatesSet));
    console.log('Staff schedules count:', staffSchedules.length);
    console.log('Recurring patterns count:', recurringPatterns.length);
    
    return staffWithHR.map(hr => {
      const userProfile = userProfiles.find(u => u.user_id === hr.user_id);
      const userRecords = monthRecords.filter(r => r.user_id === hr.user_id);
      
      // Calculate monthly base salary based on pay frequency
      let monthlyBaseSalary = hr.base_salary || 0;
      if (hr.pay_frequency === 'annually') {
        monthlyBaseSalary = (hr.base_salary || 0) / 12;
      } else if (hr.pay_frequency === 'weekly') {
        monthlyBaseSalary = (hr.base_salary || 0) * 4.33; // Average weeks per month
      } else if (hr.pay_frequency === 'bi-weekly') {
        monthlyBaseSalary = (hr.base_salary || 0) * 2.17;
      }
      
      // Calculate hourly rate from monthly salary (assuming ~173 working hours/month)
      const estimatedHourlyRate = monthlyBaseSalary / 173;
      
      // Get staff schedules for this user in the selected month
      const userSchedules = staffSchedules.filter(s => {
        const scheduleDate = new Date(s.start_datetime);
        return s.user_id === hr.user_id && scheduleDate >= monthStart && scheduleDate <= monthEnd;
      });
      
      // Generate virtual schedules from recurring patterns
      const virtualSchedules = generateVirtualSchedules(hr.user_id);
      
      // Create a set of dates that already have actual schedules (to avoid double counting)
      const actualScheduleDates = new Set(userSchedules.map(s => getScheduleDate(s.start_datetime)));
      
      console.log(`User ${userProfile?.display_name}: ${userSchedules.length} actual schedules, ${virtualSchedules.length} virtual schedules`);
      
      // Calculate holiday overtime bonus: 0.5 × (Base Salary / 20) per holiday day worked
      // Base day pay is already in salary, so we only add the 0.5x overtime bonus
      // Daily rate = monthlyBaseSalary / 20 (assuming 20 working days per month)
      const dailyRate = monthlyBaseSalary / 20;
      let holidayOvertimeDays = 0;
      const holidayShifts: Array<{ date: string; holidayName: string }> = [];
      const countedHolidayDates = new Set<string>(); // Track which dates we've already counted
      
      // Check actual schedules
      userSchedules.forEach(schedule => {
        const scheduleDate = getScheduleDate(schedule.start_datetime);
        if (holidayDatesSet.has(scheduleDate) && !countedHolidayDates.has(scheduleDate)) {
          holidayOvertimeDays += 1;
          countedHolidayDates.add(scheduleDate);
          const holiday = publicHolidays.find(h => h.date === scheduleDate);
          holidayShifts.push({
            date: scheduleDate,
            holidayName: holiday?.name || 'Public Holiday'
          });
          console.log(`  HOLIDAY MATCH (actual): ${scheduleDate} - 1 day`);
        }
      });
      
      // Check virtual schedules from recurring patterns (only if no actual schedule exists for that date)
      virtualSchedules.forEach(virtual => {
        if (holidayDatesSet.has(virtual.date) && !actualScheduleDates.has(virtual.date) && !countedHolidayDates.has(virtual.date)) {
          holidayOvertimeDays += 1;
          countedHolidayDates.add(virtual.date);
          const holiday = publicHolidays.find(h => h.date === virtual.date);
          holidayShifts.push({
            date: virtual.date,
            holidayName: holiday?.name || 'Public Holiday'
          });
          console.log(`  HOLIDAY MATCH (pattern): ${virtual.date} - 1 day`);
        }
      });
      
      // Holiday overtime bonus = 0.5 × daily rate × number of holiday days worked
      // (Base day pay is already included in monthly salary, so we only add the overtime portion)
      const holidayOvertimeBonus = holidayOvertimeDays * dailyRate * 0.5;
      
      // Sum additions and deductions from records
      const salaryRecords = userRecords.filter(r => r.record_type === 'salary');
      const bonusRecords = userRecords.filter(r => r.record_type === 'bonus');
      const overtimeRecords = userRecords.filter(r => r.record_type === 'overtime');
      const expenseRecords = userRecords.filter(r => r.record_type === 'expense');
      const deductionRecords = userRecords.filter(r => r.record_type === 'deduction');
      
      const salaryPaid = salaryRecords.reduce((sum, r) => sum + r.amount, 0);
      let bonuses = bonusRecords.reduce((sum, r) => sum + r.amount, 0);
      
      // Add recurring bonuses that are active for this month
      const monthStartStr = format(monthStart, 'yyyy-MM-dd');
      const monthEndStr = format(monthEnd, 'yyyy-MM-dd');
      const activeRecurringBonuses = recurringBonuses.filter(rb => {
        if (rb.user_id !== hr.user_id) return false;
        if (rb.start_date > monthEndStr) return false; // Starts after this month
        if (rb.end_date && rb.end_date < monthStartStr) return false; // Ended before this month
        return true;
      });
      
      const recurringBonusTotal = activeRecurringBonuses.reduce((sum, rb) => sum + rb.amount, 0);
      bonuses += recurringBonusTotal;
      
      const overtimeManualRecords = overtimeRecords.reduce((sum, r) => sum + r.amount, 0);
      const expenses = expenseRecords.reduce((sum, r) => sum + r.amount, 0);
      const deductions = deductionRecords.reduce((sum, r) => sum + r.amount, 0);
      
      // Calculate overtime pay from approved overtime/shift_swap requests
      // Formula: 1.5 × (Base Salary / 20) × Overtime Days
      // For shift_swap requests, only count those marked as overtime (overtime_type is not null)
      const userOvertimeRequests = approvedOvertimeRequests.filter(r => {
        if (r.user_id !== hr.user_id) return false;
        // For shift_swap requests, only include if it's marked as overtime
        if (r.request_type === 'shift_swap' && !r.overtime_type) return false;
        const startDate = parseISO(r.start_date);
        const endDate = parseISO(r.end_date);
        // Check if the request overlaps with the selected month
        return startDate <= monthEnd && endDate >= monthStart;
      });
      
      // Calculate total overtime days for this month
      let overtimeDays = 0;
      const overtimeRequestDetails: Array<{ type: string; startDate: string; endDate: string; days: number }> = [];
      
      userOvertimeRequests.forEach(req => {
        const startDate = parseISO(req.start_date);
        const endDate = parseISO(req.end_date);
        
        // Calculate days that fall within this month
        const effectiveStart = startDate < monthStart ? monthStart : startDate;
        const effectiveEnd = endDate > monthEnd ? monthEnd : endDate;
        
        // Count business days (rough estimate - using days_requested for full range, proportioned if partial)
        let daysInMonth = req.days_requested;
        
        // If the request spans multiple months, calculate proportion for this month
        if (startDate < monthStart || endDate > monthEnd) {
          const totalDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
          const daysInThisMonth = Math.ceil((effectiveEnd.getTime() - effectiveStart.getTime()) / (1000 * 60 * 60 * 24)) + 1;
          daysInMonth = Math.round((daysInThisMonth / totalDays) * req.days_requested);
        }
        
        overtimeDays += daysInMonth;
        overtimeRequestDetails.push({
          type: req.request_type,
          startDate: req.start_date,
          endDate: req.end_date,
          days: daysInMonth
        });
      });
      
      // Also calculate overtime days from recurring overtime shift patterns
      const userOvertimePatterns = recurringPatterns.filter(p => p.user_id === hr.user_id && p.is_overtime);
      const countedOvertimeDates = new Set<string>(); // Track dates already counted to avoid double-counting
      
      // Iterate through each day of the month and count overtime pattern days
      let currentDate = new Date(monthStart);
      while (currentDate <= monthEnd) {
        const dateStr = format(currentDate, 'yyyy-MM-dd');
        const dayOfWeek = currentDate.getDay();
        
        // Check if any overtime pattern applies to this day (count the day only once even if multiple shifts)
        let dayHasOvertime = false;
        userOvertimePatterns.forEach(pattern => {
          const patternStart = parseISO(pattern.start_date);
          const patternEnd = pattern.end_date ? parseISO(pattern.end_date) : null;
          
          if (currentDate >= patternStart && (!patternEnd || currentDate <= patternEnd)) {
            if (pattern.days_of_week.includes(dayOfWeek)) {
              // Check for exceptions
              const patternExceptionsSet = exceptionsMap.get(pattern.id);
              if (!patternExceptionsSet || !patternExceptionsSet.has(dateStr)) {
                dayHasOvertime = true;
              }
            }
          }
        });
        
        // Only count the day once, even if multiple overtime shifts exist
        if (dayHasOvertime && !countedOvertimeDates.has(dateStr)) {
          countedOvertimeDates.add(dateStr);
        }
        
        currentDate.setDate(currentDate.getDate() + 1);
      }
      
      const recurringOvertimeDays = countedOvertimeDates.size;
      
      // Add recurring overtime days to total
      overtimeDays += recurringOvertimeDays;
      
      // Overtime pay = 1.5 × (Base Salary / 20) × Overtime Days
      const overtimeDailyRate = monthlyBaseSalary / 20;
      const calculatedOvertimePay = 1.5 * overtimeDailyRate * overtimeDays;
      
      // Total overtime = manual records + calculated from requests
      const overtime = overtimeManualRecords + calculatedOvertimePay;
      
      // Calculate unused holiday payout for June (end of holiday year: June 1 - May 31)
      let unusedHolidayPayout = 0;
      let unusedHolidayDays = 0;
      const selectedMonthNum = selectedMonth.getMonth(); // 0-indexed, June = 5
      
      if (selectedMonthNum === 5) { // June
        // Holiday year runs June 1 to May 31
        // For June payroll, calculate holidays taken from June 1 of previous year to May 31 of current year
        const holidayYearStart = new Date(selectedMonth.getFullYear() - 1, 5, 1); // June 1 of previous year
        const holidayYearEnd = new Date(selectedMonth.getFullYear(), 4, 31); // May 31 of current year
        
        const userHolidaysTaken = staffHolidays.filter(h => {
          if (h.user_id !== hr.user_id) return false;
          if (h.status !== 'approved') return false;
          if (h.absence_type !== 'holiday') return false;
          const startDate = parseISO(h.start_date);
          return startDate >= holidayYearStart && startDate <= holidayYearEnd;
        }).reduce((sum, h) => sum + Number(h.days_taken), 0);
        
        // Get user's HR profile for start date and use calculateHolidayAllowance for consistency
        const userHRFull = hrProfilesFull.find(p => p.user_id === hr.user_id);
        const employeeStartDateStr = userHRFull?.start_date || null;
        
        // Calculate accrued allowance using the same logic as StaffHolidaysManager
        const { accruedAllowance } = calculateHolidayAllowance(employeeStartDateStr);
        
        unusedHolidayDays = Math.max(0, accruedAllowance - userHolidaysTaken);
        
        // Unused holiday pay = Base Pay / 20 * unused days
        unusedHolidayPayout = (monthlyBaseSalary / 20) * unusedHolidayDays;
      }
      
      // Total pay now includes holiday overtime bonus, calculated overtime pay, and unused holiday payout
      const totalPay = monthlyBaseSalary + bonuses + overtime + expenses + holidayOvertimeBonus + unusedHolidayPayout - deductions;
      const hasSalaryRecord = salaryRecords.length > 0;
      
      // Convert total pay to GBP for aggregation
      const totalPayInGBP = convertToGBP(totalPay, hr.base_currency);
      
      return {
        userId: hr.user_id,
        displayName: userProfile?.display_name || userProfile?.email || 'Unknown',
        email: userProfile?.email,
        currency: hr.base_currency,
        baseSalary: monthlyBaseSalary,
        salaryPaid,
        bonuses,
        overtime,
        overtimeDays,
        overtimeRequestDetails,
        calculatedOvertimePay,
        expenses,
        deductions,
        holidayOvertimeBonus,
        holidayOvertimeDays,
        holidayShifts,
        unusedHolidayPayout,
        unusedHolidayDays,
        totalPay,
        totalPayInGBP,
        hasSalaryRecord,
        records: userRecords
      };
    });
  }, [hrProfiles, userProfiles, monthRecords, exchangeRates, manualRates, staffSchedules, publicHolidays, monthStart, monthEnd, recurringPatterns, patternExceptions, recurringBonuses, staffHolidays, hrProfilesFull, selectedMonth, approvedOvertimeRequests]);

  // Total payroll for the month (converted to GBP)
  const totalPayroll = useMemo(() => {
    return payrollSummary.reduce((sum, s) => sum + s.totalPayInGBP, 0);
  }, [payrollSummary]);

  const handleOpenDialog = () => {
    setFormData({
      user_id: '',
      record_type: 'bonus',
      amount: 0,
      currency: 'GBP',
      description: '',
      pay_date: format(selectedMonth, 'yyyy-MM-dd')
    });
    setDialogOpen(true);
  };

  const handleUserChange = (userId: string) => {
    const hrProfile = hrProfiles.find(h => h.user_id === userId);
    setFormData({
      ...formData,
      user_id: userId,
      currency: hrProfile?.base_currency || 'GBP'
    });
  };

  const handleSave = async () => {
    if (!formData.user_id || !formData.amount || !formData.pay_date) {
      toast({
        title: "Error",
        description: "Please fill in all required fields",
        variant: "destructive"
      });
      return;
    }

    try {
      const payPeriodStart = format(startOfMonth(parseISO(formData.pay_date)), 'yyyy-MM-dd');
      const payPeriodEnd = format(endOfMonth(parseISO(formData.pay_date)), 'yyyy-MM-dd');

      const { error } = await supabase
        .from('staff_pay_records')
        .insert([{
          user_id: formData.user_id,
          record_type: formData.record_type as any,
          amount: formData.amount,
          currency: formData.currency,
          description: formData.description || null,
          pay_date: formData.pay_date,
          pay_period_start: payPeriodStart,
          pay_period_end: payPeriodEnd,
          created_by: user?.id!
        }]);

      if (error) throw error;

      toast({ title: "Success", description: "Pay record created" });
      setDialogOpen(false);
      fetchData();
    } catch (error: any) {
      console.error('Error saving pay record:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to save pay record",
        variant: "destructive"
      });
    }
  };

  const handleRunPayroll = async (userId: string) => {
    const staff = payrollSummary.find(s => s.userId === userId);
    if (!staff || staff.hasSalaryRecord) return;

    try {
      const payDate = format(endOfMonth(selectedMonth), 'yyyy-MM-dd');
      const payPeriodStart = format(startOfMonth(selectedMonth), 'yyyy-MM-dd');
      const payPeriodEnd = payDate;

      const { error } = await supabase
        .from('staff_pay_records')
        .insert([{
          user_id: userId,
          record_type: 'salary' as any,
          amount: staff.baseSalary,
          currency: staff.currency,
          description: `Monthly salary for ${format(selectedMonth, 'MMMM yyyy')}`,
          pay_date: payDate,
          pay_period_start: payPeriodStart,
          pay_period_end: payPeriodEnd,
          created_by: user?.id!
        }]);

      if (error) throw error;

      toast({ title: "Success", description: `Salary recorded for ${staff.displayName}` });
      fetchData();
    } catch (error: any) {
      console.error('Error running payroll:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to run payroll",
        variant: "destructive"
      });
    }
  };

  // Toggle staff to ready status
  const handleToggleReady = (userId: string) => {
    setReadyStaff(prev => {
      const newSet = new Set(prev);
      if (newSet.has(userId)) {
        newSet.delete(userId);
      } else {
        newSet.add(userId);
      }
      return newSet;
    });
  };

  // Revert paid status back to pending (delete salary record)
  const handleRevertToPending = async (userId: string) => {
    const staff = payrollSummary.find(s => s.userId === userId);
    if (!staff) return;

    const salaryRecord = staff.records.find(r => r.record_type === 'salary');
    if (!salaryRecord) return;

    try {
      const { error } = await supabase
        .from('staff_pay_records')
        .delete()
        .eq('id', salaryRecord.id);

      if (error) throw error;

      toast({ title: "Success", description: `${staff.displayName} reverted to pending` });
      fetchData();
    } catch (error: any) {
      console.error('Error reverting payroll:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to revert payroll",
        variant: "destructive"
      });
    }
  };

  const handleRunAllPayroll = async () => {
    // Only process staff marked as ready
    const staffToProcess = payrollSummary.filter(s => !s.hasSalaryRecord && readyStaff.has(s.userId));
    if (staffToProcess.length === 0) {
      toast({ title: "Info", description: "No staff marked as ready to pay" });
      return;
    }

    try {
      const payDate = format(endOfMonth(selectedMonth), 'yyyy-MM-dd');
      const payPeriodStart = format(startOfMonth(selectedMonth), 'yyyy-MM-dd');
      const payPeriodEnd = payDate;

      const records = staffToProcess.map(staff => ({
        user_id: staff.userId,
        record_type: 'salary' as any,
        amount: staff.baseSalary,
        currency: staff.currency,
        description: `Monthly salary for ${format(selectedMonth, 'MMMM yyyy')}`,
        pay_date: payDate,
        pay_period_start: payPeriodStart,
        pay_period_end: payPeriodEnd,
        created_by: user?.id!
      }));

      const { error } = await supabase
        .from('staff_pay_records')
        .insert(records);

      if (error) throw error;

      // Clear ready status for processed staff
      setReadyStaff(prev => {
        const newSet = new Set(prev);
        staffToProcess.forEach(s => newSet.delete(s.userId));
        return newSet;
      });

      toast({ title: "Success", description: `Payroll processed for ${staffToProcess.length} staff members` });
      fetchData();
    } catch (error: any) {
      console.error('Error running payroll:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to run payroll",
        variant: "destructive"
      });
    }
  };

  const formatCurrency = (amount: number, currency: string) => {
    const curr = CURRENCIES.find(c => c.code === currency);
    return `${curr?.symbol || '£'}${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const getRecordTypeInfo = (type: string) => {
    return RECORD_TYPES.find(t => t.value === type) || RECORD_TYPES[0];
  };

  // Open adjustment dialog for a staff row
  const handleOpenAdjustmentDialog = (staff: typeof payrollSummary[0]) => {
    const bonusRecord = staff.records.find(r => r.record_type === 'bonus');
    const deductionRecord = staff.records.find(r => r.record_type === 'deduction');
    const overtimeRecord = staff.records.find(r => r.record_type === 'overtime');
    
    // Check if overtime was manually overridden (has an overtime record)
    const hasOvertimeOverride = overtimeRecord !== undefined;
    
    // Check if this staff has an active recurring bonus
    const monthStartStr = format(monthStart, 'yyyy-MM-dd');
    const monthEndStr = format(monthEnd, 'yyyy-MM-dd');
    const existingRecurringBonus = recurringBonuses.find(rb => {
      if (rb.user_id !== staff.userId) return false;
      if (rb.start_date > monthEndStr) return false;
      if (rb.end_date && rb.end_date < monthStartStr) return false;
      return true;
    });
    
    // Determine the bonus amount to show in the dialog
    // If there's a recurring bonus, show that amount (not the combined total)
    // If there's only a one-off bonus record, show that
    const bonusAmountToShow = existingRecurringBonus 
      ? existingRecurringBonus.amount 
      : (bonusRecord?.amount || 0);
    
    setAdjustmentEdit({
      staffId: staff.userId,
      staffName: staff.displayName,
      currency: staff.currency,
      bonusAmount: bonusAmountToShow,
      bonusComment: existingRecurringBonus?.description || bonusRecord?.description || '',
      bonusRecurring: !!existingRecurringBonus,
      existingRecurringBonusId: existingRecurringBonus?.id || null,
      deductionAmount: staff.deductions,
      deductionComment: deductionRecord?.description || '',
      overtimeOverrideEnabled: hasOvertimeOverride,
      overtimeOverrideAmount: hasOvertimeOverride ? staff.overtime : staff.holidayOvertimeBonus,
      calculatedOvertime: staff.holidayOvertimeBonus
    });
    setAdjustmentDialogOpen(true);
  };

  const handleSaveAdjustment = async () => {
    if (!adjustmentEdit) return;
    
    const staff = payrollSummary.find(s => s.userId === adjustmentEdit.staffId);
    if (!staff) return;

    setSavingAdjustment(true);
    
    try {
      const payDate = format(endOfMonth(selectedMonth), 'yyyy-MM-dd');
      const payPeriodStart = format(startOfMonth(selectedMonth), 'yyyy-MM-dd');
      const payPeriodEnd = payDate;

      // Handle bonus changes for current month
      const existingBonusRecord = staff.records.find(r => r.record_type === 'bonus');
      
      // Calculate the recurring bonus amount for this staff
      const monthStartStr = format(monthStart, 'yyyy-MM-dd');
      const monthEndStr = format(monthEnd, 'yyyy-MM-dd');
      const activeRecurringBonus = recurringBonuses.find(rb => {
        if (rb.user_id !== staff.userId) return false;
        if (rb.start_date > monthEndStr) return false;
        if (rb.end_date && rb.end_date < monthStartStr) return false;
        return true;
      });
      const recurringBonusAmount = activeRecurringBonus?.amount || 0;
      
      // The one-off bonus is the total bonus minus the recurring bonus
      const oneOffBonusAmount = adjustmentEdit.bonusRecurring 
        ? 0  // If recurring, no one-off record needed
        : adjustmentEdit.bonusAmount;
      
      // Handle recurring bonus - create or update recurring bonus pattern
      if (adjustmentEdit.bonusRecurring && adjustmentEdit.bonusAmount > 0) {
        if (adjustmentEdit.existingRecurringBonusId) {
          // Update existing recurring bonus
          const { error } = await supabase
            .from('recurring_bonuses')
            .update({
              amount: adjustmentEdit.bonusAmount,
              description: adjustmentEdit.bonusComment || 'Recurring bonus',
              updated_at: new Date().toISOString()
            })
            .eq('id', adjustmentEdit.existingRecurringBonusId);
          if (error) throw error;
        } else {
          // Create new recurring bonus (indefinite - no end_date)
          const { error } = await supabase
            .from('recurring_bonuses')
            .insert({
              user_id: adjustmentEdit.staffId,
              amount: adjustmentEdit.bonusAmount,
              currency: staff.currency,
              description: adjustmentEdit.bonusComment || 'Recurring bonus',
              start_date: format(startOfMonth(selectedMonth), 'yyyy-MM-dd'),
              end_date: null, // Indefinite
              created_by: user?.id!
            });
          if (error) throw error;
        }
        
        // If switching to recurring, remove any existing one-off bonus record
        if (existingBonusRecord) {
          const { error } = await supabase
            .from('staff_pay_records')
            .delete()
            .eq('id', existingBonusRecord.id);
          if (error) throw error;
        }
      } else if (!adjustmentEdit.bonusRecurring) {
        // Not recurring - handle as one-off bonus pay record
        if (adjustmentEdit.existingRecurringBonusId) {
          // Cancel recurring bonus by setting end_date to previous month
          const { error } = await supabase
            .from('recurring_bonuses')
            .update({
              end_date: format(endOfMonth(subMonths(selectedMonth, 1)), 'yyyy-MM-dd'),
              updated_at: new Date().toISOString()
            })
            .eq('id', adjustmentEdit.existingRecurringBonusId);
          if (error) throw error;
        }
        
        if (oneOffBonusAmount > 0) {
          if (existingBonusRecord) {
            const { error } = await supabase
              .from('staff_pay_records')
              .update({
                amount: oneOffBonusAmount,
                description: adjustmentEdit.bonusComment || null
              })
              .eq('id', existingBonusRecord.id);
            if (error) throw error;
          } else {
            const { error } = await supabase
              .from('staff_pay_records')
              .insert({
                user_id: adjustmentEdit.staffId,
                record_type: 'bonus' as any,
                amount: oneOffBonusAmount,
                currency: staff.currency,
                description: adjustmentEdit.bonusComment || null,
                pay_date: payDate,
                pay_period_start: payPeriodStart,
                pay_period_end: payPeriodEnd,
                created_by: user?.id!
              });
            if (error) throw error;
          }
        } else if (existingBonusRecord) {
          // Zero amount - delete the record
          const { error } = await supabase
            .from('staff_pay_records')
            .delete()
            .eq('id', existingBonusRecord.id);
          if (error) throw error;
        }
      } else if (adjustmentEdit.bonusAmount === 0) {
        // Zero recurring - cancel it
        if (adjustmentEdit.existingRecurringBonusId) {
          const { error } = await supabase
            .from('recurring_bonuses')
            .update({
              end_date: format(endOfMonth(subMonths(selectedMonth, 1)), 'yyyy-MM-dd'),
              updated_at: new Date().toISOString()
            })
            .eq('id', adjustmentEdit.existingRecurringBonusId);
          if (error) throw error;
        }
        if (existingBonusRecord) {
          const { error } = await supabase
            .from('staff_pay_records')
            .delete()
            .eq('id', existingBonusRecord.id);
          if (error) throw error;
        }
      }

      // Handle overtime override
      const existingOvertimeRecord = staff.records.find(r => r.record_type === 'overtime');
      
      if (adjustmentEdit.overtimeOverrideEnabled) {
        // Calculate the override delta (difference from calculated overtime)
        const overtimeDelta = adjustmentEdit.overtimeOverrideAmount - adjustmentEdit.calculatedOvertime;
        
        if (overtimeDelta !== 0) {
          if (existingOvertimeRecord) {
            const { error } = await supabase
              .from('staff_pay_records')
              .update({
                amount: overtimeDelta,
                description: 'Manual overtime adjustment'
              })
              .eq('id', existingOvertimeRecord.id);
            if (error) throw error;
          } else {
            const { error } = await supabase
              .from('staff_pay_records')
              .insert({
                user_id: adjustmentEdit.staffId,
                record_type: 'overtime' as any,
                amount: overtimeDelta,
                currency: staff.currency,
                description: 'Manual overtime adjustment',
                pay_date: payDate,
                pay_period_start: payPeriodStart,
                pay_period_end: payPeriodEnd,
                created_by: user?.id!
              });
            if (error) throw error;
          }
        } else if (existingOvertimeRecord) {
          // Delta is 0, remove the override record
          const { error } = await supabase
            .from('staff_pay_records')
            .delete()
            .eq('id', existingOvertimeRecord.id);
          if (error) throw error;
        }
      } else if (existingOvertimeRecord) {
        // Override disabled, remove the override record
        const { error } = await supabase
          .from('staff_pay_records')
          .delete()
          .eq('id', existingOvertimeRecord.id);
        if (error) throw error;
      }

      // Handle deduction changes
      const existingDeductionRecord = staff.records.find(r => r.record_type === 'deduction');
      
      if (adjustmentEdit.deductionAmount > 0) {
        if (existingDeductionRecord) {
          const { error } = await supabase
            .from('staff_pay_records')
            .update({
              amount: adjustmentEdit.deductionAmount,
              description: adjustmentEdit.deductionComment || null
            })
            .eq('id', existingDeductionRecord.id);
          if (error) throw error;
        } else {
          const { error } = await supabase
            .from('staff_pay_records')
            .insert({
              user_id: adjustmentEdit.staffId,
              record_type: 'deduction' as any,
              amount: adjustmentEdit.deductionAmount,
              currency: staff.currency,
              description: adjustmentEdit.deductionComment || null,
              pay_date: payDate,
              pay_period_start: payPeriodStart,
              pay_period_end: payPeriodEnd,
              created_by: user?.id!
            });
          if (error) throw error;
        }
      } else if (existingDeductionRecord && adjustmentEdit.deductionAmount === 0) {
        const { error } = await supabase
          .from('staff_pay_records')
          .delete()
          .eq('id', existingDeductionRecord.id);
        if (error) throw error;
      }

      const successMessage = adjustmentEdit.bonusRecurring
        ? "Adjustments saved. Bonus will recur indefinitely until cancelled."
        : "Adjustments saved";
      
      toast({ title: "Success", description: successMessage });
      setAdjustmentDialogOpen(false);
      setAdjustmentEdit(null);
      fetchData();
    } catch (error: any) {
      console.error('Error saving adjustment:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to save adjustments",
        variant: "destructive"
      });
    } finally {
      setSavingAdjustment(false);
    }
  };

  const unpaidStaffCount = payrollSummary.filter(s => !s.hasSalaryRecord).length;
  const readyStaffCount = payrollSummary.filter(s => !s.hasSalaryRecord && readyStaff.has(s.userId)).length;
  const pendingStaffCount = unpaidStaffCount - readyStaffCount;

  if (loading) {
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
      {/* Month Navigation and Actions */}
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-4">
          <h2 className="text-xl font-semibold">Payroll Run</h2>
          <div className="flex items-center gap-2 bg-muted rounded-lg p-1">
            <Button variant="ghost" size="icon" onClick={() => setSelectedMonth(subMonths(selectedMonth, 1))}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="flex items-center gap-2 px-3 min-w-[160px] justify-center">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">{format(selectedMonth, 'MMMM yyyy')}</span>
            </div>
            <Button variant="ghost" size="icon" onClick={() => setSelectedMonth(addMonths(selectedMonth, 1))}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleOpenDialog}>
            <Plus className="h-4 w-4 mr-2" />
            Add Adjustment
          </Button>
          {readyStaffCount > 0 && (
            <Button onClick={handleRunAllPayroll}>
              <Calculator className="h-4 w-4 mr-2" />
              Run Payroll ({readyStaffCount})
            </Button>
          )}
        </div>
      </div>

      {/* Exchange Rate Info */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <span>Exchange rates: {ratesDate ? `Updated ${ratesDate}` : 'Using fallback rates'}</span>
        <Button 
          variant="ghost" 
          size="sm" 
          onClick={fetchExchangeRates} 
          disabled={loadingRates}
          className="h-7 px-2"
        >
          <RefreshCw className={`h-3 w-3 ${loadingRates ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-muted-foreground">Total Payroll (GBP)</div>
            <div className="text-2xl font-bold">£{totalPayroll.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
            <div className="text-xs text-muted-foreground mt-1">Converted from all currencies</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-muted-foreground">Staff Members</div>
            <div className="text-2xl font-bold">{payrollSummary.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-muted-foreground">Paid</div>
            <div className="text-2xl font-bold text-success">{payrollSummary.filter(s => s.hasSalaryRecord).length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-muted-foreground">Ready</div>
            <div className="text-2xl font-bold text-blue-500">{readyStaffCount}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-muted-foreground">Pending</div>
            <div className="text-2xl font-bold text-warning">{pendingStaffCount}</div>
          </CardContent>
        </Card>
      </div>

      {/* Manual Currency Rate Inputs */}
      {currenciesInPayroll.length > 0 && (
        <Card>
          <CardContent className="p-4">
            <div className="text-sm font-medium mb-3">Manual Currency Conversion Rates (to GBP)</div>
            <div className="flex flex-wrap gap-4">
              {currenciesInPayroll.map(currency => {
                const currInfo = CURRENCIES.find(c => c.code === currency);
                const currentRate = manualRates[currency] ?? exchangeRates[currency] ?? 0;
                const isManual = currency in manualRates;
                
                return (
                  <div key={currency} className="flex items-center gap-2">
                    <Label className="text-sm whitespace-nowrap min-w-[60px]">
                      1 {currInfo?.symbol || currency} =
                    </Label>
                    <div className="flex items-center gap-1">
                      <span className="text-muted-foreground">£</span>
                      <Input
                        type="number"
                        step="0.0001"
                        value={isManual ? manualRates[currency] : ''}
                        placeholder={currentRate.toFixed(6)}
                        onChange={(e) => handleManualRateChange(currency, e.target.value)}
                        className="w-28 h-8 text-sm"
                      />
                    </div>
                    {isManual && (
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="h-8 px-2 text-xs"
                        onClick={() => handleManualRateChange(currency, '')}
                      >
                        Reset
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Leave empty to use API rates. Enter a value to override.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Public Holidays Accordion */}
      <Card>
        <CardContent className="p-4">
          <Accordion type="single" collapsible className="w-full">
            <AccordionItem value="public-holidays" className="border-none">
              <AccordionTrigger className="hover:no-underline py-0">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-amber-500" />
                  <span className="font-medium">Nigerian Public Holidays {holidaysYear}</span>
                  <Badge variant="secondary" className="ml-2">+0.5x Overtime Bonus</Badge>
                  {loadingHolidays && (
                    <RefreshCw className="h-3 w-3 animate-spin text-muted-foreground" />
                  )}
                </div>
              </AccordionTrigger>
              <AccordionContent className="pt-4">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-muted-foreground">
                      Staff working on any of these public holidays are entitled to overtime pay at <strong>1.5× their usual hourly rate</strong>.
                    </p>
                    <div className="flex items-center gap-2">
                      <Select
                        value={holidaysYear.toString()}
                        onValueChange={(value) => {
                          const year = parseInt(value);
                          setHolidaysYear(year);
                          fetchPublicHolidays(year);
                        }}
                      >
                        <SelectTrigger className="w-24 h-8">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {[2025, 2026, 2027].map((year) => (
                            <SelectItem key={year} value={year.toString()}>
                              {year}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => fetchPublicHolidays(holidaysYear)}
                        disabled={loadingHolidays}
                      >
                        <RefreshCw className={`h-3 w-3 ${loadingHolidays ? 'animate-spin' : ''}`} />
                      </Button>
                    </div>
                  </div>
                  {loadingHolidays ? (
                    <div className="flex items-center justify-center py-8">
                      <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                  ) : publicHolidays.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      No holiday data available. Click refresh to try again.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                      {publicHolidays.map((holiday) => {
                        const holidayDate = parseISO(holiday.date);
                        const isPast = holidayDate < new Date();
                        
                        return (
                          <div 
                            key={holiday.date} 
                            className={`flex items-center justify-between p-2 rounded-md border ${
                              isPast ? 'bg-muted/30 text-muted-foreground' : 'bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800'
                            }`}
                          >
                            <div className="flex items-center gap-1">
                              <span className="text-sm font-medium">{holiday.name}</span>
                              {holiday.isEstimated && (
                                <Badge variant="outline" className="text-[10px] px-1 py-0">Est.</Badge>
                              )}
                            </div>
                            <span className="text-xs text-muted-foreground">
                              {format(holidayDate, 'dd MMM')}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground italic">
                    Note: Islamic holiday dates marked "Est." are estimated and may vary based on moon sighting. Data sourced from Nager.Date API.
                  </p>
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </CardContent>
      </Card>

      {/* Payroll Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Staff Payroll Summary</CardTitle>
          <CardDescription>
            Monthly breakdown for {format(selectedMonth, 'MMMM yyyy')}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Staff Member</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Base Salary</TableHead>
                <TableHead className="text-right">Bonuses</TableHead>
                <TableHead className="text-right">Overtime</TableHead>
                <TableHead className="text-right">Holiday OT</TableHead>
                <TableHead className="text-right">Unused Holiday</TableHead>
                <TableHead className="text-right">Deductions</TableHead>
                <TableHead className="text-right">Total Pay</TableHead>
                <TableHead className="text-right">GBP Equiv.</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {payrollSummary.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={12} className="text-center py-8 text-muted-foreground">
                    No staff with salary configured. Set up HR profiles first.
                  </TableCell>
                </TableRow>
              ) : (
                payrollSummary.map(staff => {
                  const isReady = readyStaff.has(staff.userId);
                  
                  return (
                    <TableRow key={staff.userId} className="hover:bg-muted/30">
                      <TableCell className="font-medium">
                        <div>
                          <div>{staff.displayName}</div>
                          <div className="text-xs text-muted-foreground">{staff.email}</div>
                        </div>
                      </TableCell>
                      <TableCell>
                        {staff.hasSalaryRecord ? (
                          <Badge 
                            variant="default" 
                            className="bg-success cursor-pointer hover:bg-success/80"
                            onClick={() => handleRevertToPending(staff.userId)}
                            title="Click to revert to pending"
                          >
                            <CheckCircle className="h-3 w-3 mr-1" />
                            Paid
                          </Badge>
                        ) : isReady ? (
                          <Badge 
                            variant="default" 
                            className="bg-blue-500 cursor-pointer hover:bg-blue-600"
                            onClick={() => handleToggleReady(staff.userId)}
                            title="Click to set back to pending"
                          >
                            <CheckCircle className="h-3 w-3 mr-1" />
                            Ready
                          </Badge>
                        ) : (
                          <Badge 
                            variant="outline" 
                            className="border-warning text-warning-foreground cursor-pointer hover:bg-warning/10"
                            onClick={() => handleToggleReady(staff.userId)}
                            title="Click to mark as ready"
                          >
                            <Clock className="h-3 w-3 mr-1" />
                            Pending
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">{formatCurrency(staff.baseSalary, staff.currency)}</TableCell>
                      <TableCell className="text-right text-success">
                        {staff.bonuses > 0 ? `+${formatCurrency(staff.bonuses, staff.currency)}` : '-'}
                      </TableCell>
                      <TableCell className="text-right">
                        {staff.overtime > 0 ? (
                          <div className="flex flex-col items-end">
                            <span className="text-success">
                              +{formatCurrency(staff.overtime, staff.currency)}
                            </span>
                            {staff.overtimeDays > 0 && (
                              <span className="text-[10px] text-muted-foreground">
                                {staff.overtimeDays} day{staff.overtimeDays !== 1 ? 's' : ''} @ 1.5x
                              </span>
                            )}
                          </div>
                        ) : '-'}
                      </TableCell>
                      <TableCell className="text-right">
                        {staff.holidayOvertimeBonus > 0 ? (
                          <div className="flex flex-col items-end">
                            <span className="text-amber-600 dark:text-amber-400">
                              +{formatCurrency(staff.holidayOvertimeBonus, staff.currency)}
                            </span>
                            <span className="text-[10px] text-muted-foreground">
                              {staff.holidayOvertimeDays} day{staff.holidayOvertimeDays !== 1 ? 's' : ''} @ +0.5x
                            </span>
                          </div>
                        ) : '-'}
                      </TableCell>
                      <TableCell className="text-right">
                        {staff.unusedHolidayPayout > 0 ? (
                          <div className="flex flex-col items-end">
                            <span className="text-success">
                              +{formatCurrency(staff.unusedHolidayPayout, staff.currency)}
                            </span>
                            <span className="text-[10px] text-muted-foreground">
                              {staff.unusedHolidayDays.toFixed(1)} day{staff.unusedHolidayDays !== 1 ? 's' : ''} unused
                            </span>
                          </div>
                        ) : '-'}
                      </TableCell>
                      <TableCell className="text-right text-destructive">
                        {staff.deductions > 0 ? `-${formatCurrency(staff.deductions, staff.currency)}` : '-'}
                      </TableCell>
                      <TableCell className="text-right font-bold">{formatCurrency(staff.totalPay, staff.currency)}</TableCell>
                      <TableCell className="text-right font-medium text-muted-foreground">
                        {staff.currency !== 'GBP' ? `£${staff.totalPayInGBP.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '-'}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            onClick={() => handleOpenAdjustmentDialog(staff)}
                            className="h-8 w-8 p-0"
                          >
                            <Edit2 className="h-4 w-4" />
                          </Button>
                          {staff.hasSalaryRecord ? (
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              onClick={() => handleRevertToPending(staff.userId)}
                              className="h-8 w-8 p-0"
                              title="Revert to pending"
                            >
                              <RotateCcw className="h-4 w-4" />
                            </Button>
                          ) : isReady ? (
                            <Button variant="ghost" size="sm" onClick={() => handleRunPayroll(staff.userId)}>
                              <FileText className="h-4 w-4 mr-1" />
                              Pay
                            </Button>
                          ) : (
                            <Button variant="ghost" size="sm" onClick={() => handleToggleReady(staff.userId)}>
                              <CheckCircle className="h-4 w-4 mr-1" />
                              Ready
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Add Adjustment Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Add Pay Adjustment</DialogTitle>
            <DialogDescription>
              Add a bonus, overtime, expense, or deduction for a staff member
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Staff Member *</Label>
              <Select
                value={formData.user_id}
                onValueChange={handleUserChange}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select staff member" />
                </SelectTrigger>
                <SelectContent>
                  {hrProfiles.filter(hr => hr.base_salary && hr.base_salary > 0).map(hr => {
                    const profile = userProfiles.find(u => u.user_id === hr.user_id);
                    return (
                      <SelectItem key={hr.user_id} value={hr.user_id}>
                        {profile?.display_name || profile?.email}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Adjustment Type *</Label>
              <Select
                value={formData.record_type}
                onValueChange={(value) => setFormData({ ...formData, record_type: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RECORD_TYPES.filter(t => t.value !== 'salary').map(type => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Amount *</Label>
                <Input
                  type="number"
                  value={formData.amount}
                  onChange={(e) => setFormData({ ...formData, amount: parseFloat(e.target.value) || 0 })}
                  step="0.01"
                  min="0"
                />
              </div>
              <div className="space-y-2">
                <Label>Currency *</Label>
                <Select
                  value={formData.currency}
                  onValueChange={(value) => setFormData({ ...formData, currency: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CURRENCIES.map(currency => (
                      <SelectItem key={currency.code} value={currency.code}>
                        {currency.symbol} {currency.code}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Pay Date *</Label>
              <Input
                type="date"
                value={formData.pay_date}
                onChange={(e) => setFormData({ ...formData, pay_date: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="e.g., Performance bonus Q1"
                rows={2}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave}>Add Adjustment</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Adjustments Dialog */}
      <Dialog open={adjustmentDialogOpen} onOpenChange={setAdjustmentDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Adjustments</DialogTitle>
            <DialogDescription>
              {adjustmentEdit?.staffName} - {format(selectedMonth, 'MMMM yyyy')}
            </DialogDescription>
          </DialogHeader>

          {adjustmentEdit && (
            <div className="space-y-6 py-4">
              {/* Overtime Override Section */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-amber-500" />
                    <Label className="text-base font-medium">Overtime</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Label htmlFor="overtime-override" className="text-sm text-muted-foreground">
                      Manual Override
                    </Label>
                    <Switch
                      id="overtime-override"
                      checked={adjustmentEdit.overtimeOverrideEnabled}
                      onCheckedChange={(checked) => setAdjustmentEdit({
                        ...adjustmentEdit,
                        overtimeOverrideEnabled: checked,
                        overtimeOverrideAmount: checked ? adjustmentEdit.overtimeOverrideAmount : adjustmentEdit.calculatedOvertime
                      })}
                    />
                  </div>
                </div>
                <div className="space-y-2 pl-6">
                  <div className="text-sm text-muted-foreground mb-2">
                    Auto-calculated: {CURRENCIES.find(c => c.code === adjustmentEdit.currency)?.symbol || '£'}
                    {adjustmentEdit.calculatedOvertime.toFixed(2)} (holiday OT)
                  </div>
                  {adjustmentEdit.overtimeOverrideEnabled && (
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground">
                        {CURRENCIES.find(c => c.code === adjustmentEdit.currency)?.symbol || '£'}
                      </span>
                      <Input
                        type="number"
                        value={adjustmentEdit.overtimeOverrideAmount || ''}
                        onChange={(e) => setAdjustmentEdit({
                          ...adjustmentEdit,
                          overtimeOverrideAmount: parseFloat(e.target.value) || 0
                        })}
                        className="w-32"
                        step="0.01"
                        min="0"
                        placeholder="0.00"
                      />
                      <span className="text-xs text-muted-foreground">Total overtime amount</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Bonus Section */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-success" />
                  <Label className="text-base font-medium">Bonus</Label>
                </div>
                <div className="space-y-3 pl-6">
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">
                      {CURRENCIES.find(c => c.code === adjustmentEdit.currency)?.symbol || '£'}
                    </span>
                    <Input
                      type="number"
                      value={adjustmentEdit.bonusAmount || ''}
                      onChange={(e) => setAdjustmentEdit({
                        ...adjustmentEdit,
                        bonusAmount: parseFloat(e.target.value) || 0
                      })}
                      className="w-32"
                      step="0.01"
                      min="0"
                      placeholder="0.00"
                    />
                  </div>
                  <Textarea
                    value={adjustmentEdit.bonusComment}
                    onChange={(e) => setAdjustmentEdit({
                      ...adjustmentEdit,
                      bonusComment: e.target.value
                    })}
                    placeholder="Reason for bonus (visible to staff)..."
                    rows={2}
                    className="text-sm"
                  />
                  
                  {/* Recurring Bonus Option */}
                  {adjustmentEdit.bonusAmount > 0 && (
                    <div className="border rounded-lg p-3 bg-muted/30 space-y-3">
                      <div className="flex items-center gap-2">
                        <Checkbox
                          id="bonus-recurring"
                          checked={adjustmentEdit.bonusRecurring}
                          onCheckedChange={(checked) => setAdjustmentEdit({
                            ...adjustmentEdit,
                            bonusRecurring: checked === true
                          })}
                        />
                        <Label htmlFor="bonus-recurring" className="text-sm flex items-center gap-1 cursor-pointer">
                          <Repeat className="h-3 w-3" />
                          Make this bonus recurring
                        </Label>
                      </div>
                      
                      {adjustmentEdit.bonusRecurring && (
                        <p className="text-xs text-muted-foreground pl-6">
                          This bonus will be applied every month indefinitely until cancelled.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Deduction Section */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <TrendingDown className="h-4 w-4 text-destructive" />
                  <Label className="text-base font-medium">Deduction</Label>
                </div>
                <div className="space-y-2 pl-6">
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">
                      {CURRENCIES.find(c => c.code === adjustmentEdit.currency)?.symbol || '£'}
                    </span>
                    <Input
                      type="number"
                      value={adjustmentEdit.deductionAmount || ''}
                      onChange={(e) => setAdjustmentEdit({
                        ...adjustmentEdit,
                        deductionAmount: parseFloat(e.target.value) || 0
                      })}
                      className="w-32"
                      step="0.01"
                      min="0"
                      placeholder="0.00"
                    />
                  </div>
                  <Textarea
                    value={adjustmentEdit.deductionComment}
                    onChange={(e) => setAdjustmentEdit({
                      ...adjustmentEdit,
                      deductionComment: e.target.value
                    })}
                    placeholder="Reason for deduction (visible to staff)..."
                    rows={2}
                    className="text-sm"
                  />
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setAdjustmentDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveAdjustment} disabled={savingAdjustment}>
              {savingAdjustment ? 'Saving...' : 'Save Adjustments'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
