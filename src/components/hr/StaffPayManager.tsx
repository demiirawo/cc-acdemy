import React, { useState, useEffect, useMemo } from "react";
import { calculateHolidayAllowance } from "./StaffHolidaysManager";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
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
import { Plus, DollarSign, TrendingUp, TrendingDown, Calendar, ChevronLeft, ChevronRight, ChevronDown, ChevronUp, Calculator, FileText, RefreshCw, Edit2, CheckCircle, Clock, RotateCcw, Sparkles, Repeat, FileBadge, ArrowUp, ArrowDown, ArrowUpDown, Landmark } from "lucide-react";
import { InvoiceGeneratorDialog } from "./InvoiceGeneratorDialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { downloadInvoicePdf, type InvoiceData } from "@/lib/invoice/generatePdf";
import { format, startOfMonth, endOfMonth, addMonths, subMonths, parseISO, eachDayOfInterval } from "date-fns";
import { getCoveredDatesFromRequest } from "@/lib/coverageUtils";

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
  overtime_subtype: string | null;
  recurrence_interval: string;
}

interface ShiftPatternException {
  id: string;
  pattern_id: string;
  exception_date: string;
  exception_type: string;
  overtime_subtype: string | null;
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
  const [invoiceDialog, setInvoiceDialog] = useState<{
    open: boolean;
    staffUserId: string;
    staffName: string;
    staffEmail: string;
    amount: number;
    currency: string;
  } | null>(null);
  const [invoiceDescriptions, setInvoiceDescriptions] = useState<Record<string, string>>({});
  const [descDialog, setDescDialog] = useState<{ open: boolean; userId: string; name: string; value: string } | null>(null);
  const [quickInvoiceBusy, setQuickInvoiceBusy] = useState<string | null>(null);
  const [exchangeRates, setExchangeRates] = useState<ExchangeRates>(FALLBACK_RATES);
  const [manualRates, setManualRates] = useState<ExchangeRates>({});
  const [ratesDate, setRatesDate] = useState<string | null>(null);
  const [loadingRates, setLoadingRates] = useState(false);
  const [adjustmentEdit, setAdjustmentEdit] = useState<AdjustmentEditState | null>(null);
  const [adjustmentDialogOpen, setAdjustmentDialogOpen] = useState(false);
  const [savingAdjustment, setSavingAdjustment] = useState(false);
  const [readyStaff, setReadyStaff] = useState<Set<string>>(new Set());
  const [expandedOvertimeStaff, setExpandedOvertimeStaff] = useState<Set<string>>(new Set());
  const [bankDetailsDialog, setBankDetailsDialog] = useState<{
    open: boolean;
    staffName: string;
    details: Record<string, string> | null;
  }>({ open: false, staffName: '', details: null });
  type SortKey = 'displayName' | 'baseSalary' | 'bonuses' | 'overtime' | 'holidayOvertimeBonus' | 'unusedHolidayPayout' | 'unpaidHolidayDeduction' | 'proRataDeduction' | 'deductions' | 'totalPay' | 'totalPayInGBP';
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(key === 'displayName' ? 'asc' : 'desc');
    }
  };
  const sortItems = <T extends Record<string, any>>(items: T[]): T[] => {
    if (!sortKey) return items;
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...items].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (typeof av === 'string' || typeof bv === 'string') {
        return String(av ?? '').localeCompare(String(bv ?? '')) * dir;
      }
      return ((Number(av) || 0) - (Number(bv) || 0)) * dir;
    });
  };
  const [publicHolidays, setPublicHolidays] = useState<PublicHoliday[]>([]);
  const [loadingHolidays, setLoadingHolidays] = useState(false);
  const [holidaysYear, setHolidaysYear] = useState(new Date().getFullYear());
  const [staffSchedules, setStaffSchedules] = useState<StaffSchedule[]>([]);
  const [recurringPatterns, setRecurringPatterns] = useState<RecurringShiftPattern[]>([]);
  const [patternExceptions, setPatternExceptions] = useState<ShiftPatternException[]>([]);
  const [recurringBonuses, setRecurringBonuses] = useState<RecurringBonus[]>([]);
  const [staffHolidays, setStaffHolidays] = useState<{ user_id: string; days_taken: number; start_date: string; status: string; absence_type: string }[]>([]);
  const [hrProfilesFull, setHRProfilesFull] = useState<{ user_id: string; annual_holiday_allowance: number | null; start_date: string | null; employment_end_date: string | null; unlimited_holiday: boolean; public_holiday_pay_disabled?: boolean }[]>([]);
  const [approvedOvertimeRequests, setApprovedOvertimeRequests] = useState<{ user_id: string; days_requested: number; start_date: string; end_date: string; request_type: string; overtime_type: string | null; swap_with_user_id: string | null; coverage_metadata: Json | null }[]>([]);
  const [unpaidHolidayRequests, setUnpaidHolidayRequests] = useState<{ user_id: string; days_requested: number; start_date: string; end_date: string }[]>([]);
  const [approvedLeaveRequests, setApprovedLeaveRequests] = useState<{ user_id: string; start_date: string; end_date: string }[]>([]);
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

  // Load persisted manual currency rates from DB
  const fetchManualRates = async () => {
    const { data } = await supabase
      .from('manual_currency_rates')
      .select('currency_code, rate_to_gbp');
    if (data && data.length > 0) {
      const rates: ExchangeRates = {};
      data.forEach((r: any) => { rates[r.currency_code] = Number(r.rate_to_gbp); });
      setManualRates(rates);
    }
  };

  useEffect(() => {
    fetchData();
    fetchExchangeRates();
    fetchManualRates();
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

  // Fetch persisted "ready to pay" status for the selected month
  useEffect(() => {
    const fetchReadyStatus = async () => {
      const monthKey = format(startOfMonth(selectedMonth), 'yyyy-MM-dd');
      const { data, error } = await supabase
        .from('payroll_ready_status')
        .select('user_id')
        .eq('pay_period_month', monthKey);
      if (error) {
        console.error('Error fetching payroll ready status:', error);
        return;
      }
      setReadyStaff(new Set((data || []).map(r => r.user_id)));
    };
    fetchReadyStatus();
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

  const handleManualRateChange = async (currency: string, value: string) => {
    const numValue = parseFloat(value);
    if (!isNaN(numValue) && numValue > 0) {
      setManualRates(prev => ({ ...prev, [currency]: numValue }));
      // Upsert to DB
      const { data: userData } = await supabase.auth.getUser();
      if (userData.user) {
        await supabase
          .from('manual_currency_rates')
          .upsert({
            currency_code: currency,
            rate_to_gbp: numValue,
            updated_by: userData.user.id,
            updated_at: new Date().toISOString()
          }, { onConflict: 'currency_code' });
      }
    } else if (value === '') {
      // Clear manual rate - delete from DB
      setManualRates(prev => {
        const newRates = { ...prev };
        delete newRates[currency];
        return newRates;
      });
      await supabase
        .from('manual_currency_rates')
        .delete()
        .eq('currency_code', currency);
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
        .select('id, user_id, days_of_week, start_time, end_time, start_date, end_date, hourly_rate, currency, client_name, is_overtime, overtime_subtype, recurrence_interval');
      
      if (patternsError) {
        console.error('Error fetching recurring patterns:', patternsError);
      } else {
        setRecurringPatterns(patterns || []);
      }

      // Fetch pattern exceptions
      const { data: exceptions, error: exceptionsError } = await supabase
        .from('shift_pattern_exceptions')
        .select('id, pattern_id, exception_date, exception_type, overtime_subtype');
      
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
        .select('user_id, annual_holiday_allowance, start_date, employment_end_date, unlimited_holiday, public_holiday_pay_disabled');
      
      setHRProfilesFull(hrFullData || []);

      // Fetch approved overtime and shift_swap requests for overtime pay calculation
      const { data: overtimeRequestsData, error: overtimeRequestsError } = await supabase
        .from('staff_requests')
        .select('user_id, days_requested, start_date, end_date, request_type, overtime_type, swap_with_user_id, coverage_metadata')
        .eq('status', 'approved')
        .in('request_type', ['overtime', 'overtime_standard', 'overtime_double_up', 'shift_swap']);
      
      if (overtimeRequestsError) {
        console.error('Error fetching overtime requests:', overtimeRequestsError);
      } else {
        setApprovedOvertimeRequests(overtimeRequestsData || []);
      }

      // Fetch approved unpaid holiday requests for deduction calculation
      const { data: unpaidHolidayData, error: unpaidHolidayError } = await supabase
        .from('staff_requests')
        .select('user_id, days_requested, start_date, end_date')
        .eq('status', 'approved')
        .eq('request_type', 'holiday_unpaid');
      
      if (unpaidHolidayError) {
        console.error('Error fetching unpaid holiday requests:', unpaidHolidayError);
      } else {
        setUnpaidHolidayRequests(unpaidHolidayData || []);
      }

      // Fetch approved leave requests (paid + unpaid) to exclude from public holiday overtime
      const { data: leaveData, error: leaveError } = await supabase
        .from('staff_requests')
        .select('user_id, start_date, end_date')
        .eq('status', 'approved')
        .in('request_type', ['holiday_paid', 'holiday_unpaid']);
      
      if (leaveError) {
        console.error('Error fetching leave requests:', leaveError);
      } else {
        setApprovedLeaveRequests(leaveData || []);
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

    const isDateOnRecurrenceSchedule = (currentDate: Date, patternStartDate: string, recurrenceInterval: string): boolean => {
      const start = parseISO(patternStartDate);
      const msDiff = currentDate.getTime() - start.getTime();
      const dayDiff = Math.floor(msDiff / (1000 * 60 * 60 * 24));

      switch (recurrenceInterval) {
        case 'daily':
        case 'weekly':
        case 'one_off':
          return true;
        case 'biweekly':
          return Math.floor(dayDiff / 7) % 2 === 0;
        case 'monthly':
          return currentDate.getDate() === start.getDate();
        default:
          return true;
      }
    };

    const getGranularCoveredDates = (request: {
      coverage_metadata: Json | null;
      start_date: string;
      end_date: string;
    }): string[] => {
      const normalizedCoverageMetadata =
        request.coverage_metadata && typeof request.coverage_metadata === 'object' && !Array.isArray(request.coverage_metadata)
          ? (request.coverage_metadata as Record<string, unknown>)
          : null;

      return getCoveredDatesFromRequest({
        start_date: request.start_date,
        end_date: request.end_date,
        coverage_metadata: normalizedCoverageMetadata,
      });
    };
    
    // Create separate maps for deleted vs overtime exceptions
    const deletedExceptionsMap = new Map<string, Set<string>>();
    const overtimeExceptionsMap = new Map<string, Map<string, { type: string; subtype: string | null }>>();
    patternExceptions.forEach(ex => {
      if (ex.exception_type === 'deleted') {
        if (!deletedExceptionsMap.has(ex.pattern_id)) {
          deletedExceptionsMap.set(ex.pattern_id, new Set());
        }
        deletedExceptionsMap.get(ex.pattern_id)!.add(ex.exception_date);
      } else if (ex.exception_type === 'overtime' || ex.exception_type === 'not_overtime') {
        if (!overtimeExceptionsMap.has(ex.pattern_id)) {
          overtimeExceptionsMap.set(ex.pattern_id, new Map());
        }
        overtimeExceptionsMap.get(ex.pattern_id)!.set(ex.exception_date, { type: ex.exception_type, subtype: ex.overtime_subtype });
      }
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
              // Only skip if there's a 'deleted' exception
              const deletedExs = deletedExceptionsMap.get(pattern.id);
              if (!deletedExs || !deletedExs.has(dateStr)) {
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

      // Zero out base salary for any month entirely after the employment end date
      const hrFullForEnd = hrProfilesFull.find(h => h.user_id === hr.user_id);
      const employmentEndDateForZero = hrFullForEnd?.employment_end_date ? parseISO(hrFullForEnd.employment_end_date) : null;
      if (employmentEndDateForZero && employmentEndDateForZero < monthStart) {
        monthlyBaseSalary = 0;
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
      
      // Build set of dates the user is on approved leave (paid or unpaid)
      // Staff on leave should NOT receive public holiday overtime
      const userLeaveDates = new Set<string>();
      const userLeaveReqs = approvedLeaveRequests.filter(r => r.user_id === hr.user_id);
      userLeaveReqs.forEach(req => {
        const leaveStart = parseISO(req.start_date);
        const leaveEnd = parseISO(req.end_date);
        const leaveDays = eachDayOfInterval({ start: leaveStart, end: leaveEnd });
        leaveDays.forEach(d => userLeaveDates.add(format(d, 'yyyy-MM-dd')));
      });
      
      // Check actual schedules
      userSchedules.forEach(schedule => {
        const scheduleDate = getScheduleDate(schedule.start_datetime);
        if (holidayDatesSet.has(scheduleDate) && !countedHolidayDates.has(scheduleDate) && !userLeaveDates.has(scheduleDate)) {
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
        if (holidayDatesSet.has(virtual.date) && !actualScheduleDates.has(virtual.date) && !countedHolidayDates.has(virtual.date) && !userLeaveDates.has(virtual.date)) {
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
      
      // Check approved cover requests (shift_swap, overtime) for public holiday days
      // When a staff member is covering someone's holiday, they may work on a public holiday
      // but won't have a recurring pattern or actual schedule for that client
      const userCoverRequests = approvedOvertimeRequests.filter(r => r.user_id === hr.user_id);
      userCoverRequests.forEach(req => {
        // Skip requests that don't overlap the selected month at all
        const reqStart = parseISO(req.start_date);
        const reqEnd = parseISO(req.end_date);
        if (reqEnd < monthStart || reqStart > monthEnd) return;

        const granularCoveredDates = getGranularCoveredDates(req)
          .filter(date => date >= format(monthStart, 'yyyy-MM-dd') && date <= format(monthEnd, 'yyyy-MM-dd'));

        const effectiveStart = reqStart < monthStart ? monthStart : reqStart;
        const effectiveEnd = reqEnd > monthEnd ? monthEnd : reqEnd;

        const coverDatesToCheck = granularCoveredDates.length > 0
          ? granularCoveredDates
          : (effectiveStart <= effectiveEnd
              ? eachDayOfInterval({ start: effectiveStart, end: effectiveEnd }).map(day => format(day, 'yyyy-MM-dd'))
              : []);

        coverDatesToCheck.forEach(coverDateStr => {
          if (holidayDatesSet.has(coverDateStr) && !countedHolidayDates.has(coverDateStr) && !userLeaveDates.has(coverDateStr)) {
            holidayOvertimeDays += 1;
            countedHolidayDates.add(coverDateStr);
            const holiday = publicHolidays.find(h => h.date === coverDateStr);
            holidayShifts.push({
              date: coverDateStr,
              holidayName: holiday?.name || 'Public Holiday'
            });
            console.log(`  HOLIDAY MATCH (cover request): ${coverDateStr} - 1 day`);
          }
        });
      });
      
      // Holiday overtime bonus = 0.5 × daily rate × number of holiday days worked
      // (Base day pay is already included in monthly salary, so we only add the overtime portion)
      // If staff has public holiday pay disabled, skip this bonus entirely.
      const publicHolidayPayDisabled = !!(hrFullForEnd as any)?.public_holiday_pay_disabled;
      const holidayOvertimeBonus = publicHolidayPayDisabled ? 0 : holidayOvertimeDays * dailyRate * 0.5;
      
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
      // Use a date-keyed map to deduplicate: same date from request + pattern = counted once
      // Request entries take precedence over pattern entries for the same date
      // If mixed subtypes on same day, 'standard' (1.5x) takes precedence over 'double_up' (0.5x)
      const overtimeShiftsByDate = new Map<string, {
        subtype: 'standard' | 'double_up';
        source: 'pattern' | 'request';
        client: string;
        requestType?: string;
      }>();

      const upsertOvertimeShift = (
        dateStr: string,
        subtype: 'standard' | 'double_up',
        source: 'pattern' | 'request',
        client: string,
        requestType?: string
      ) => {
        const existing = overtimeShiftsByDate.get(dateStr);
        if (!existing) {
          overtimeShiftsByDate.set(dateStr, { subtype, source, client, requestType });
          return;
        }
        // Prefer request source when both exist for the same date
        const preferredSource: 'pattern' | 'request' =
          existing.source === 'request' || source === 'request' ? 'request' : 'pattern';
        // If mixed subtypes on same day, prefer standard (higher multiplier)
        const preferredSubtype: 'standard' | 'double_up' =
          existing.subtype === 'standard' || subtype === 'standard' ? 'standard' : 'double_up';
        overtimeShiftsByDate.set(dateStr, {
          subtype: preferredSubtype,
          source: preferredSource,
          client: preferredSource === source ? client : existing.client,
          requestType: preferredSource === 'request' ? (source === 'request' ? requestType : existing.requestType) : undefined
        });
      };

      const userOvertimeRequests = approvedOvertimeRequests.filter(r => {
        if (r.user_id !== hr.user_id) return false;
        if (r.request_type === 'shift_swap' && !r.overtime_type) return false;
        const startDate = parseISO(r.start_date);
        const endDate = parseISO(r.end_date);
        return startDate <= monthEnd && endDate >= monthStart;
      });
      
      // Add request-based overtime to the map
      // Only count days where the covered user (or requesting user) actually has a shift pattern
      userOvertimeRequests.forEach(req => {
        const startDate = parseISO(req.start_date);
        const endDate = parseISO(req.end_date);
        const effectiveStart = startDate < monthStart ? monthStart : startDate;
        const effectiveEnd = endDate > monthEnd ? monthEnd : endDate;
        const isInsideHours = req.request_type === 'overtime_double_up' || (req.overtime_type === 'standard_hours');
        const subtype: 'standard' | 'double_up' = isInsideHours ? 'double_up' : 'standard';
        
        // Determine whose patterns to check: covered user's patterns if shift_swap, else requesting user's
        const targetUserId = (req.request_type === 'shift_swap' && req.swap_with_user_id) 
          ? req.swap_with_user_id 
          : hr.user_id;
        const targetPatterns = recurringPatterns.filter(p => p.user_id === targetUserId && !p.is_overtime);
        const targetActualScheduleDates = new Set(
          staffSchedules
            .filter(schedule => schedule.user_id === targetUserId)
            .map(schedule => getScheduleDate(schedule.start_datetime))
        );
        
        const granularCoveredDates = getGranularCoveredDates(req)
          .filter(date => date >= format(monthStart, 'yyyy-MM-dd') && date <= format(monthEnd, 'yyyy-MM-dd'));

        const daysInRange = granularCoveredDates.length > 0
          ? granularCoveredDates.map(date => parseISO(date))
          : eachDayOfInterval({ start: effectiveStart, end: effectiveEnd });

        daysInRange.forEach(day => {
          const dStr = format(day, 'yyyy-MM-dd');
          const dayOfWeek = day.getDay();
          
          // Only count this day if it's a working day for the target user
          const hasActualSchedule = targetActualScheduleDates.has(dStr);

          let matchedClientName: string | undefined;
          const hasRecurringShift = targetPatterns.some(pattern => {
            const patternStart = parseISO(pattern.start_date);
            const patternEnd = pattern.end_date ? parseISO(pattern.end_date) : null;
            if (day < patternStart || (patternEnd && day > patternEnd)) return false;
            if (!pattern.days_of_week.includes(dayOfWeek)) return false;
            if (!isDateOnRecurrenceSchedule(day, pattern.start_date, pattern.recurrence_interval)) return false;
            // Check for deleted exceptions
            const deletedExs = deletedExceptionsMap.get(pattern.id);
            if (deletedExs && deletedExs.has(dStr)) return false;
            matchedClientName = pattern.client_name;
            return true;
          });

          // Fallback: try to find client from actual schedule for the target user on this day
          if (!matchedClientName && hasActualSchedule) {
            const sched = staffSchedules.find(s =>
              s.user_id === targetUserId && getScheduleDate(s.start_datetime) === dStr
            );
            matchedClientName = (sched as { client_name?: string } | undefined)?.client_name;
          }

          if (hasActualSchedule || hasRecurringShift) {
            upsertOvertimeShift(dStr, subtype, 'request', matchedClientName || 'Cover', req.request_type);
          }
        });
      });
      
      // Build set of request OT dates so patterns skip them
      const requestOTDates = new Set(
        Array.from(overtimeShiftsByDate.entries())
          .filter(([, value]) => value.source === 'request')
          .map(([date]) => date)
      );

      // Non-overtime cover days (shift_swap with no overtime_type) — informational only, £0 pay
      const nonOvertimeCoverDayDetails: Array<{ date: string; coveredFor: string }> = [];
      const nonOvertimeCoverRequests = approvedOvertimeRequests.filter(r => {
        if (r.user_id !== hr.user_id) return false;
        if (r.request_type !== 'shift_swap') return false;
        if (r.overtime_type) return false; // only non-overtime covers
        const startDate = parseISO(r.start_date);
        const endDate = parseISO(r.end_date);
        return startDate <= monthEnd && endDate >= monthStart;
      });
      nonOvertimeCoverRequests.forEach(req => {
        const startDate = parseISO(req.start_date);
        const endDate = parseISO(req.end_date);
        const effectiveStart = startDate < monthStart ? monthStart : startDate;
        const effectiveEnd = endDate > monthEnd ? monthEnd : endDate;
        const granular = getGranularCoveredDates(req)
          .filter(d => d >= format(monthStart, 'yyyy-MM-dd') && d <= format(monthEnd, 'yyyy-MM-dd'));
        const dates = granular.length > 0
          ? granular
          : (effectiveStart <= effectiveEnd
              ? eachDayOfInterval({ start: effectiveStart, end: effectiveEnd }).map(d => format(d, 'yyyy-MM-dd'))
              : []);
        const coveredForName = req.swap_with_user_id
          ? (userProfiles.find(p => p.user_id === req.swap_with_user_id)?.display_name || 'Colleague')
          : 'Colleague';
        dates.forEach(dStr => {
          nonOvertimeCoverDayDetails.push({ date: dStr, coveredFor: coveredForName });
        });
      });
      
      // Add pattern-based overtime to the map (skip dates already covered by requests)
      const userPatterns = recurringPatterns.filter(p => p.user_id === hr.user_id);
      let currentDate = new Date(monthStart);
      while (currentDate <= monthEnd) {
        const dateStr = format(currentDate, 'yyyy-MM-dd');
        const dayOfWeek = currentDate.getDay();
        
        if (!requestOTDates.has(dateStr)) {
          for (const pattern of userPatterns) {
            const patternStart = parseISO(pattern.start_date);
            const patternEnd = pattern.end_date ? parseISO(pattern.end_date) : null;
            
            if (currentDate >= patternStart && (!patternEnd || currentDate <= patternEnd)) {
              if (pattern.days_of_week.includes(dayOfWeek)) {
                const deletedExs = deletedExceptionsMap.get(pattern.id);
                if (deletedExs && deletedExs.has(dateStr)) continue;
                
                const overtimeExs = overtimeExceptionsMap.get(pattern.id);
                const dayOverride = overtimeExs?.get(dateStr);
                
                const isOvertimeForDay = dayOverride?.type === 'overtime' ? true
                  : dayOverride?.type === 'not_overtime' ? false
                  : pattern.is_overtime;
                
                if (isOvertimeForDay) {
                  const subtype: 'standard' | 'double_up' = dayOverride?.type === 'overtime'
                    ? ((dayOverride.subtype || 'standard') as 'standard' | 'double_up')
                    : ((pattern.overtime_subtype || 'standard') as 'standard' | 'double_up');
                  
                  upsertOvertimeShift(dateStr, subtype, 'pattern', pattern.client_name);
                  break;
                }
              }
            }
          }
        }
        
        currentDate.setDate(currentDate.getDate() + 1);
      }
      
      // Build final overtime details from the deduplicated map
      const overtimeDayDetails: Array<{ date: string; client: string; subtype: 'standard' | 'double_up'; source: 'pattern' | 'request'; requestType?: string }> = 
        Array.from(overtimeShiftsByDate.entries()).map(([date, value]) => ({
          date,
          client: value.client,
          subtype: value.subtype,
          source: value.source,
          requestType: value.requestType
        }));
      
      const totalStandardOTDays = overtimeDayDetails.filter(d => d.subtype === 'standard').length;
      const totalDoubleUpOTDays = overtimeDayDetails.filter(d => d.subtype === 'double_up').length;
      let overtimeDays = overtimeDayDetails.length;
      
      // Overtime pay calculation:
      // OT (Outside Normal Hours): 1.5 × dailyRate × days
      // OT (Inside Normal Hours): 0.5 × dailyRate × days (base already in salary, only premium added)
      const overtimeDailyRate = monthlyBaseSalary / 20;
      const standardOvertimePay = 1.5 * overtimeDailyRate * totalStandardOTDays;
      const doubleUpOvertimePay = 0.5 * overtimeDailyRate * totalDoubleUpOTDays;
      const calculatedOvertimePay = standardOvertimePay + doubleUpOvertimePay;
      
      // Total overtime = manual records + calculated from requests
      const overtime = overtimeManualRecords + calculatedOvertimePay;
      
      // Build overtimeRequestDetails for backward compatibility
      const overtimeRequestDetails = userOvertimeRequests.map(req => {
        const granularCoveredDates = getGranularCoveredDates(req)
          .filter(date => date >= format(monthStart, 'yyyy-MM-dd') && date <= format(monthEnd, 'yyyy-MM-dd'));
        const startDate = parseISO(req.start_date);
        const endDate = parseISO(req.end_date);
        const effectiveStart = startDate < monthStart ? monthStart : startDate;
        const effectiveEnd = endDate > monthEnd ? monthEnd : endDate;
        const daysInMonth = granularCoveredDates.length > 0
          ? granularCoveredDates.length
          : eachDayOfInterval({ start: effectiveStart, end: effectiveEnd }).length;
        return {
          type: req.request_type,
          overtimeType: req.overtime_type,
          startDate: req.start_date,
          endDate: req.end_date,
          days: daysInMonth
        };
      });
      
      // Calculate unused holiday payout or excess holiday deduction for June (end of holiday year: June 1 - May 31)
      let unusedHolidayPayout = 0;
      let unusedHolidayDays = 0;
      let excessHolidayDeduction = 0;
      let excessHolidayDays = 0;
      const selectedMonthNum = selectedMonth.getMonth(); // 0-indexed, June = 5
      
      // Get user's HR profile to check for unlimited holiday
      const userHRFull = hrProfilesFull.find(p => p.user_id === hr.user_id);
      const hasUnlimitedHoliday = userHRFull?.unlimited_holiday === true;
      
      // Only calculate holiday payout/deduction for staff who don't have unlimited holiday
      if (selectedMonthNum === 5 && !hasUnlimitedHoliday) { // June
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
        
        const employeeStartDateStr = userHRFull?.start_date || null;

        // June payroll reconciles the holiday year that JUST ENDED (June prev year → May current year).
        // Use the FULL annual allowance for that completed year, pro-rated only if the
        // employee started mid-year.
        const DEFAULT_ALLOWANCE = 15;
        const INCREASED_ALLOWANCE = 18;
        const totalDaysInYear = Math.ceil((holidayYearEnd.getTime() - holidayYearStart.getTime()) / (1000 * 60 * 60 * 24));

        let accruedAllowance = 0;
        if (employeeStartDateStr) {
          const start = parseISO(employeeStartDateStr);
          // Years employed as of the end of the completed holiday year (May 31)
          const yearsEmployedAtYearEnd = (holidayYearEnd.getTime() - start.getTime()) / (1000 * 60 * 60 * 24 * 365);
          const annualAllowance = yearsEmployedAtYearEnd >= 1 ? INCREASED_ALLOWANCE : DEFAULT_ALLOWANCE;

          if (start > holidayYearEnd) {
            accruedAllowance = 0;
          } else {
            const accrualStart = start > holidayYearStart ? start : holidayYearStart;
            const daysAccruing = Math.max(0, Math.ceil((holidayYearEnd.getTime() - accrualStart.getTime()) / (1000 * 60 * 60 * 24)));
            const fraction = Math.min(daysAccruing / totalDaysInYear, 1);
            accruedAllowance = Math.round(annualAllowance * fraction * 10) / 10;
          }
        } else {
          accruedAllowance = DEFAULT_ALLOWANCE;
        }

        const holidayBalance = accruedAllowance - userHolidaysTaken;
        
        if (holidayBalance >= 0) {
          // Staff has unused holidays - payout
          unusedHolidayDays = holidayBalance;
          unusedHolidayPayout = (monthlyBaseSalary / 20) * unusedHolidayDays;
        } else {
          // Staff has used more holidays than accrued - deduction required
          excessHolidayDays = Math.abs(holidayBalance);
          excessHolidayDeduction = (monthlyBaseSalary / 20) * excessHolidayDays;
        }
      }
      
      // Calculate unpaid holiday deduction for this month
      // Formula: (monthly pay / 20) * number of unpaid holiday days
      let unpaidHolidayDeduction = 0;
      let unpaidHolidayDays = 0;
      
      const userUnpaidHolidays = unpaidHolidayRequests.filter(r => {
        if (r.user_id !== hr.user_id) return false;
        const startDate = parseISO(r.start_date);
        const endDate = parseISO(r.end_date);
        // Check if the request overlaps with the selected month
        return startDate <= monthEnd && endDate >= monthStart;
      });
      
      userUnpaidHolidays.forEach(req => {
        const startDate = parseISO(req.start_date);
        const endDate = parseISO(req.end_date);
        
        // Calculate days that fall within this month
        const effectiveStart = startDate < monthStart ? monthStart : startDate;
        const effectiveEnd = endDate > monthEnd ? monthEnd : endDate;
        
        // Count days in this month
        let daysInMonth = req.days_requested;
        
        // If the request spans multiple months, calculate proportion for this month
        if (startDate < monthStart || endDate > monthEnd) {
          const totalDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
          const daysInThisMonth = Math.ceil((effectiveEnd.getTime() - effectiveStart.getTime()) / (1000 * 60 * 60 * 24)) + 1;
          daysInMonth = Math.round((daysInThisMonth / totalDays) * req.days_requested);
        }
        
        unpaidHolidayDays += daysInMonth;
      });
      
      // Unpaid holiday deduction = (monthly salary / 20) * unpaid holiday days
      unpaidHolidayDeduction = (monthlyBaseSalary / 20) * unpaidHolidayDays;
      
      // Pro-rata deduction for staff who started or ended mid-month
      let proRataDeduction = 0;
      let proRataWorkingDays = 0;
      let proRataTotalWorkingDays = 20; // Standard working days assumption
      const userHRFullForProRata = hrProfilesFull.find(h => h.user_id === hr.user_id);
      const staffStartDate = userHRFullForProRata?.start_date ? parseISO(userHRFullForProRata.start_date) : null;
      const staffEndDate = userHRFullForProRata?.employment_end_date ? parseISO(userHRFullForProRata.employment_end_date) : null;

      const startsThisMonth = staffStartDate && staffStartDate > monthStart && staffStartDate <= monthEnd;
      const endsThisMonth = staffEndDate && staffEndDate >= monthStart && staffEndDate < monthEnd;

      if (startsThisMonth || endsThisMonth) {
        // Count working days (Mon-Fri) in the full month
        const allDaysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });
        const totalWorkingDaysInMonth = allDaysInMonth.filter(d => {
          const dow = d.getDay();
          return dow !== 0 && dow !== 6; // Exclude weekends
        }).length;

        // Count working days within the employment window in this month
        const daysWorked = allDaysInMonth.filter(d => {
          if (staffStartDate && d < staffStartDate) return false;
          if (staffEndDate && d > staffEndDate) return false;
          const dow = d.getDay();
          return dow !== 0 && dow !== 6;
        }).length;

        proRataTotalWorkingDays = totalWorkingDaysInMonth;
        proRataWorkingDays = daysWorked;

        const daysNotWorked = totalWorkingDaysInMonth - daysWorked;
        proRataDeduction = (monthlyBaseSalary / totalWorkingDaysInMonth) * daysNotWorked;
      }
      
      // Total pay now includes holiday overtime bonus, calculated overtime pay, unused holiday payout, excess holiday deduction, unpaid holiday deduction, and pro-rata deduction
      const totalPay = monthlyBaseSalary + bonuses + overtime + expenses + holidayOvertimeBonus + unusedHolidayPayout - deductions - excessHolidayDeduction - unpaidHolidayDeduction - proRataDeduction;
      const hasSalaryRecord = salaryRecords.length > 0;
      
      // Check if excess holiday deduction already exists for this month
      const hasExcessHolidayDeduction = deductionRecords.some(r => 
        r.description?.includes('Excess holiday deduction')
      );
      
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
        standardOvertimeDays: totalStandardOTDays,
        doubleUpOvertimeDays: totalDoubleUpOTDays,
        overtimeRequestDetails,
        overtimeDayDetails: overtimeDayDetails.sort((a, b) => a.date.localeCompare(b.date)),
        nonOvertimeCoverDayDetails: nonOvertimeCoverDayDetails.sort((a, b) => a.date.localeCompare(b.date)),
        calculatedOvertimePay,
        expenses,
        deductions,
        holidayOvertimeBonus,
        holidayOvertimeDays: publicHolidayPayDisabled ? 0 : holidayOvertimeDays,
        holidayShifts: publicHolidayPayDisabled ? [] : holidayShifts,
        unusedHolidayPayout,
        unusedHolidayDays,
        excessHolidayDeduction,
        excessHolidayDays,
        unpaidHolidayDeduction,
        unpaidHolidayDays,
        proRataDeduction,
        proRataWorkingDays,
        proRataTotalWorkingDays,
        hasExcessHolidayDeduction,
        totalPay,
        totalPayInGBP,
        hasSalaryRecord,
        records: userRecords
      };
    });
  }, [hrProfiles, userProfiles, monthRecords, exchangeRates, manualRates, staffSchedules, publicHolidays, monthStart, monthEnd, recurringPatterns, patternExceptions, recurringBonuses, staffHolidays, hrProfilesFull, selectedMonth, approvedOvertimeRequests, unpaidHolidayRequests, approvedLeaveRequests]);

  // Total payroll for the month (converted to GBP)
  const totalPayroll = useMemo(() => {
    return payrollSummary.reduce((sum, s) => sum + s.totalPayInGBP, 0);
  }, [payrollSummary]);

  const payrollTotalsByStatus = useMemo(() => {
    let paid = 0, ready = 0, pending = 0;
    payrollSummary.forEach(s => {
      if (s.hasSalaryRecord) paid += s.totalPayInGBP;
      else if (readyStaff.has(s.userId)) ready += s.totalPayInGBP;
      else pending += s.totalPayInGBP;
    });
    return { paid, ready, pending };
  }, [payrollSummary, readyStaff]);

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

      const recordsToInsert: any[] = [{
        user_id: userId,
        record_type: 'salary' as any,
        amount: staff.baseSalary,
        currency: staff.currency,
        description: `Monthly salary for ${format(selectedMonth, 'MMMM yyyy')}`,
        pay_date: payDate,
        pay_period_start: payPeriodStart,
        pay_period_end: payPeriodEnd,
        created_by: user?.id!
      }];

      // Auto-create excess holiday deduction in June if applicable
      if (staff.excessHolidayDeduction > 0 && !staff.hasExcessHolidayDeduction) {
        recordsToInsert.push({
          user_id: userId,
          record_type: 'deduction' as any,
          amount: staff.excessHolidayDeduction,
          currency: staff.currency,
          description: `Excess holiday deduction: ${staff.excessHolidayDays} days over accrued allowance`,
          pay_date: payDate,
          pay_period_start: payPeriodStart,
          pay_period_end: payPeriodEnd,
          created_by: user?.id!
        });
      }

      const { error } = await supabase
        .from('staff_pay_records')
        .insert(recordsToInsert);

      if (error) throw error;

      const message = staff.excessHolidayDeduction > 0 && !staff.hasExcessHolidayDeduction
        ? `Salary and excess holiday deduction recorded for ${staff.displayName}`
        : `Salary recorded for ${staff.displayName}`;
      toast({ title: "Success", description: message });
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

  // Toggle staff to ready status (persisted per month)
  const handleToggleReady = async (userId: string) => {
    const monthKey = format(startOfMonth(selectedMonth), 'yyyy-MM-dd');
    const isCurrentlyReady = readyStaff.has(userId);

    // Optimistic update
    setReadyStaff(prev => {
      const newSet = new Set(prev);
      if (isCurrentlyReady) newSet.delete(userId);
      else newSet.add(userId);
      return newSet;
    });

    try {
      if (isCurrentlyReady) {
        const { error } = await supabase
          .from('payroll_ready_status')
          .delete()
          .eq('user_id', userId)
          .eq('pay_period_month', monthKey);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('payroll_ready_status')
          .insert({
            user_id: userId,
            pay_period_month: monthKey,
            marked_by: user?.id ?? null,
          });
        if (error) throw error;
      }
    } catch (error: any) {
      console.error('Error updating ready status:', error);
      // Revert optimistic update
      setReadyStaff(prev => {
        const newSet = new Set(prev);
        if (isCurrentlyReady) newSet.add(userId);
        else newSet.delete(userId);
        return newSet;
      });
      toast({
        title: "Error",
        description: error.message || "Failed to update ready status",
        variant: "destructive",
      });
    }
  };

  // Revert paid status back to pending (delete salary record and clear ready mark)
  const handleRevertToPending = async (userId: string) => {
    const staff = payrollSummary.find(s => s.userId === userId);
    if (!staff) return;

    const salaryRecord = staff.records.find(r => r.record_type === 'salary');
    if (!salaryRecord) return;

    const monthKey = format(startOfMonth(selectedMonth), 'yyyy-MM-dd');

    try {
      const { error } = await supabase
        .from('staff_pay_records')
        .delete()
        .eq('id', salaryRecord.id);

      if (error) throw error;

      const { error: clearReadyError } = await supabase
        .from('payroll_ready_status')
        .delete()
        .eq('user_id', userId)
        .eq('pay_period_month', monthKey);
      if (clearReadyError) console.error('Failed to clear ready status:', clearReadyError);

      setReadyStaff(prev => {
        const newSet = new Set(prev);
        newSet.delete(userId);
        return newSet;
      });

      toast({ title: "Success", description: `${staff.displayName} reverted to pending.` });
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

      // Clear ready status for processed staff (DB + state)
      const monthKey = format(startOfMonth(selectedMonth), 'yyyy-MM-dd');
      const processedIds = staffToProcess.map(s => s.userId);
      const { error: clearError } = await supabase
        .from('payroll_ready_status')
        .delete()
        .eq('pay_period_month', monthKey)
        .in('user_id', processedIds);
      if (clearError) console.error('Error clearing ready status:', clearError);

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

  const handleShowBankDetails = async (staff: typeof payrollSummary[0]) => {
    const { data } = await supabase
      .from("contractor_invoice_details")
      .select("*")
      .eq("user_id", staff.userId)
      .maybeSingle();
    setBankDetailsDialog({
      open: true,
      staffName: staff.displayName,
      details: data as Record<string, string> | null,
    });
  };

  const handleQuickInvoiceDownload = async (staff: typeof payrollSummary[0]) => {
    if (!user) return;
    setQuickInvoiceBusy(staff.userId);
    try {
      const [{ data: contractor }, { data: billTo }] = await Promise.all([
        supabase.from("contractor_invoice_details").select("*").eq("user_id", staff.userId).maybeSingle(),
        supabase.from("invoice_bill_to_settings").select("*").order("updated_at", { ascending: false }).limit(1).maybeSingle(),
      ]);
      if (!contractor || !contractor.company_name || !contractor.bank_account_name || !contractor.bank_account_number || !contractor.bank_name) {
        toast({
          title: "Invoice details missing",
          description: "Set up contractor invoice details for this staff member first.",
          variant: "destructive",
        });
        return;
      }
      const description = invoiceDescriptions[staff.userId] || `Remote support service - ${format(selectedMonth, "MMMM yyyy")}`;
      const dateRequested = format(new Date(selectedMonth.getFullYear(), selectedMonth.getMonth() + 1, 1), "yyyy-MM-dd");
      const monthStr = format(selectedMonth, "yyyy-MM-01");
      const { data: row, error } = await supabase
        .from("staff_invoices")
        .insert({
          user_id: staff.userId,
          month: monthStr,
          description,
          amount: staff.totalPay,
          currency: staff.currency,
          status: "draft",
          date_requested: dateRequested,
          created_by: user.id,
        })
        .select()
        .single();
      if (error) throw error;
      const invoiceData: InvoiceData = {
        invoiceNumber: row.invoice_number,
        dateRequested,
        description,
        amount: staff.totalPay,
        currency: staff.currency,
        companyName: contractor.company_name || "",
        contactName: contractor.contact_name || staff.displayName || "",
        phone: contractor.phone || "",
        email: contractor.email || staff.email || "",
        address: contractor.company_address || "",
        bankAccountName: contractor.bank_account_name || "",
        bankAccountNumber: contractor.bank_account_number || "",
        bankName: contractor.bank_name || "",
        sortCode: contractor.sort_code || "",
        iban: contractor.iban || "",
        swift: contractor.swift || "",
        billTo: {
          companyName: (billTo as any)?.company_name || "Care Cuddle Ltd",
          companyNumber: (billTo as any)?.company_number || undefined,
          addressLines: (billTo as any)?.address_lines || [],
        },
      };
      await downloadInvoicePdf(invoiceData);
      toast({ title: "Invoice downloaded", description: `Invoice #${row.invoice_number} for ${staff.displayName}.` });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setQuickInvoiceBusy(null);
    }
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
      <div className="flex flex-col gap-3 md:flex-row md:justify-between md:items-center">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
          <h2 className="text-xl font-semibold">Payroll Run</h2>
          <div className="flex items-center gap-1 bg-muted rounded-lg p-1 self-start">
            <Button variant="ghost" size="icon" onClick={() => setSelectedMonth(subMonths(selectedMonth, 1))}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="flex items-center gap-2 px-2 min-w-[140px] justify-center">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium text-sm">{format(selectedMonth, 'MMMM yyyy')}</span>
            </div>
            <Button variant="ghost" size="icon" onClick={() => setSelectedMonth(addMonths(selectedMonth, 1))}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={handleOpenDialog} className="flex-1 md:flex-none">
            <Plus className="h-4 w-4 mr-2" />
            Add Adjustment
          </Button>
          {readyStaffCount > 0 && (
            <Button onClick={handleRunAllPayroll} className="flex-1 md:flex-none">
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
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 md:gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-muted-foreground">Total Payroll (GBP)</div>
            <div className="text-2xl font-bold">£{totalPayroll.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
            <div className="text-xs text-muted-foreground mt-1">Converted from all currencies</div>
            <div className="mt-2 pt-2 border-t space-y-0.5 text-xs">
              <div className="flex justify-between"><span className="text-success">Paid</span><span className="font-medium">£{payrollTotalsByStatus.paid.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></div>
              <div className="flex justify-between"><span className="text-blue-500">Ready</span><span className="font-medium">£{payrollTotalsByStatus.ready.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></div>
              <div className="flex justify-between"><span className="text-warning">Pending</span><span className="font-medium">£{payrollTotalsByStatus.pending.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></div>
            </div>
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
            <div className="text-sm font-medium mb-3">Manual Currency Conversion Rates (from GBP)</div>
            <div className="flex flex-wrap gap-4">
              {currenciesInPayroll.map(currency => {
                const currInfo = CURRENCIES.find(c => c.code === currency);
                const currentRateToGBP = manualRates[currency] ?? exchangeRates[currency] ?? 0;
                // Inverted: how many units of `currency` per 1 GBP
                const invertedRate = currentRateToGBP > 0 ? 1 / currentRateToGBP : 0;
                const isManual = currency in manualRates;
                const manualInvertedDisplay = isManual && manualRates[currency] > 0
                  ? (1 / manualRates[currency]).toFixed(4)
                  : '';

                return (
                  <div key={currency} className="flex items-center gap-2">
                    <Label className="text-sm whitespace-nowrap min-w-[60px]">
                      1 £ =
                    </Label>
                    <div className="flex items-center gap-1">
                      <Input
                        type="number"
                        step="0.0001"
                        value={manualInvertedDisplay}
                        placeholder={invertedRate ? invertedRate.toFixed(4) : ''}
                        onChange={(e) => {
                          const val = e.target.value;
                          if (val === '') {
                            handleManualRateChange(currency, '');
                          } else {
                            const inv = parseFloat(val);
                            if (!isNaN(inv) && inv > 0) {
                              // Store as rate_to_gbp (inverse of what user entered)
                              handleManualRateChange(currency, String(1 / inv));
                            }
                          }
                        }}
                        className="w-28 h-8 text-sm"
                      />
                      <span className="text-muted-foreground">{currInfo?.symbol || currency}</span>
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
              Leave empty to use API rates. Enter how many units of the currency equal £1.
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

      {/* Payroll Table — desktop only */}
      <Card className="overflow-hidden hidden md:block">
        <CardHeader className="bg-muted/40 border-b">
          <CardTitle className="text-lg">Staff Payroll Summary</CardTitle>
          <CardDescription>
            Monthly breakdown for {format(selectedMonth, 'MMMM yyyy')} · Rows colored by status:
            <span className="inline-flex items-center gap-1 ml-2"><span className="inline-block w-2.5 h-2.5 rounded-sm bg-amber-200 border border-amber-400" /> Pending</span>
            <span className="inline-flex items-center gap-1 ml-2"><span className="inline-block w-2.5 h-2.5 rounded-sm bg-green-200 border border-green-500" /> Ready</span>
            <span className="inline-flex items-center gap-1 ml-2"><span className="inline-block w-2.5 h-2.5 rounded-sm bg-blue-200 border border-blue-500" /> Paid</span>
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/60 hover:bg-muted/60">
                {(() => {
                  const SortableHead = ({ k, label, align = 'left' }: { k: SortKey; label: string; align?: 'left' | 'right' }) => {
                    const active = sortKey === k;
                    const Icon = active ? (sortDir === 'asc' ? ArrowUp : ArrowDown) : ArrowUpDown;
                    return (
                      <TableHead className={`font-semibold ${align === 'right' ? 'text-right' : ''}`}>
                        <button
                          type="button"
                          onClick={() => handleSort(k)}
                          className={`inline-flex items-center gap-1 hover:text-primary transition-colors ${align === 'right' ? 'ml-auto' : ''} ${active ? 'text-primary' : ''}`}
                        >
                          <span>{label}</span>
                          <Icon className="h-3 w-3 opacity-70" />
                        </button>
                      </TableHead>
                    );
                  };
                  return (
                    <>
                      <SortableHead k="displayName" label="Staff Member" />
                      <SortableHead k="baseSalary" label="Base Salary" align="right" />
                      <SortableHead k="bonuses" label="Bonuses" align="right" />
                      <SortableHead k="overtime" label="Overtime" align="right" />
                      <SortableHead k="holidayOvertimeBonus" label="Holiday OT" align="right" />
                      <SortableHead k="unusedHolidayPayout" label="Unused Holiday" align="right" />
                      <SortableHead k="unpaidHolidayDeduction" label="Unpaid Hol" align="right" />
                      <SortableHead k="proRataDeduction" label="Pro-Rata" align="right" />
                      <SortableHead k="deductions" label="Deductions" align="right" />
                      <SortableHead k="totalPay" label="Total Pay" align="right" />
                      <SortableHead k="totalPayInGBP" label="GBP Equiv." align="right" />
                      <TableHead className="font-semibold">Actions</TableHead>
                      <TableHead className="text-right font-semibold">Status</TableHead>
                    </>
                  );
                })()}
              </TableRow>
            </TableHeader>
            <TableBody>
              {payrollSummary.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={14} className="text-center py-8 text-muted-foreground">
                    No staff with salary configured. Set up HR profiles first.
                  </TableCell>
                </TableRow>
              ) : (
                (() => {
                  // Group staff by status: Pending -> Ready -> Paid
                  const pendingGroup = payrollSummary.filter(s => !s.hasSalaryRecord && !readyStaff.has(s.userId));
                  const readyGroup = payrollSummary.filter(s => !s.hasSalaryRecord && readyStaff.has(s.userId));
                  const paidGroup = payrollSummary.filter(s => s.hasSalaryRecord);

                  const groups: Array<{
                    key: 'pending' | 'ready' | 'paid';
                    label: string;
                    headerClass: string;
                    items: typeof payrollSummary;
                  }> = [
                    { key: 'pending', label: 'Pending', headerClass: 'bg-amber-100 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200', items: sortItems(pendingGroup) },
                    { key: 'ready', label: 'Ready', headerClass: 'bg-green-100 dark:bg-green-950/40 text-green-900 dark:text-green-200', items: sortItems(readyGroup) },
                    { key: 'paid', label: 'Paid', headerClass: 'bg-blue-100 dark:bg-blue-950/40 text-blue-900 dark:text-blue-200', items: sortItems(paidGroup) },
                  ];

                  return groups.flatMap(group => {
                    if (group.items.length === 0) return [];
                    return [
                      <TableRow key={`group-header-${group.key}`} className={`${group.headerClass} hover:${group.headerClass}`}>
                        <TableCell colSpan={14} className="py-2 font-semibold text-sm uppercase tracking-wide">
                          {group.label} ({group.items.length})
                        </TableCell>
                      </TableRow>,
                      ...group.items.map(staff => {
                        const isReady = readyStaff.has(staff.userId);
                        const isOTExpanded = expandedOvertimeStaff.has(staff.userId);
                        const hasOTDetails = staff.overtimeDayDetails.length > 0 || staff.holidayShifts.length > 0 || staff.nonOvertimeCoverDayDetails.length > 0;

                        // Conditional row background:
                        // Paid -> light blue, Ready -> light green, Default/Pending -> light amber
                        const rowBgClass = staff.hasSalaryRecord
                          ? 'bg-blue-50 hover:bg-blue-100/70 dark:bg-blue-950/30 dark:hover:bg-blue-950/50'
                          : isReady
                            ? 'bg-green-50 hover:bg-green-100/70 dark:bg-green-950/30 dark:hover:bg-green-950/50'
                            : 'bg-amber-50 hover:bg-amber-100/70 dark:bg-amber-950/20 dark:hover:bg-amber-950/40';

                        return (
                          <React.Fragment key={staff.userId}>
                    <TableRow className={`transition-colors border-b ${rowBgClass}`}>
                      <TableCell className="font-medium py-3">
                        <div>
                          <div className="font-semibold">{staff.displayName}</div>
                          <div className="text-xs text-muted-foreground">{staff.email}</div>
                        </div>
                      </TableCell>
                      
                      <TableCell className="text-right">{formatCurrency(staff.baseSalary, staff.currency)}</TableCell>
                      <TableCell className="text-right text-success">
                        {staff.bonuses > 0 ? `+${formatCurrency(staff.bonuses, staff.currency)}` : '-'}
                      </TableCell>
                      <TableCell className="text-right">
                        {staff.overtime > 0 ? (
                          <div 
                            className={`flex flex-col items-end ${hasOTDetails ? 'cursor-pointer hover:opacity-80' : ''}`}
                            onClick={() => {
                              if (!hasOTDetails) return;
                              setExpandedOvertimeStaff(prev => {
                                const next = new Set(prev);
                                if (next.has(staff.userId)) next.delete(staff.userId);
                                else next.add(staff.userId);
                                return next;
                              });
                            }}
                          >
                            <span className="text-success flex items-center gap-1">
                              +{formatCurrency(staff.overtime, staff.currency)}
                              {hasOTDetails && (
                                isOTExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
                              )}
                            </span>
                            {staff.standardOvertimeDays > 0 && (
                              <span className="text-[10px] text-muted-foreground">
                                {staff.standardOvertimeDays} day{staff.standardOvertimeDays !== 1 ? 's' : ''} @ 1.5x (Outside)
                              </span>
                            )}
                            {staff.doubleUpOvertimeDays > 0 && (
                              <span className="text-[10px] text-muted-foreground">
                                {staff.doubleUpOvertimeDays} day{staff.doubleUpOvertimeDays !== 1 ? 's' : ''} @ 0.5x (Inside)
                              </span>
                            )}
                          </div>
                        ) : '-'}
                      </TableCell>
                      <TableCell className="text-right">
                        {staff.holidayOvertimeBonus > 0 ? (
                          <div 
                            className={`flex flex-col items-end ${hasOTDetails ? 'cursor-pointer hover:opacity-80' : ''}`}
                            onClick={() => {
                              if (!hasOTDetails) return;
                              setExpandedOvertimeStaff(prev => {
                                const next = new Set(prev);
                                if (next.has(staff.userId)) next.delete(staff.userId);
                                else next.add(staff.userId);
                                return next;
                              });
                            }}
                          >
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
                        ) : staff.excessHolidayDeduction > 0 ? (
                          <div className="flex flex-col items-end">
                            <span className="text-destructive">
                              -{formatCurrency(staff.excessHolidayDeduction, staff.currency)}
                            </span>
                            <span className="text-[10px] text-muted-foreground">
                              {staff.excessHolidayDays.toFixed(1)} day{staff.excessHolidayDays !== 1 ? 's' : ''} over allowance
                            </span>
                          </div>
                        ) : '-'}
                      </TableCell>
                      <TableCell className="text-right">
                        {staff.unpaidHolidayDeduction > 0 ? (
                          <div className="flex flex-col items-end">
                            <span className="text-destructive">
                              -{formatCurrency(staff.unpaidHolidayDeduction, staff.currency)}
                            </span>
                            <span className="text-[10px] text-muted-foreground">
                              {staff.unpaidHolidayDays} day{staff.unpaidHolidayDays !== 1 ? 's' : ''} unpaid
                            </span>
                          </div>
                        ) : '-'}
                      </TableCell>
                      <TableCell className="text-right">
                        {staff.proRataDeduction > 0 ? (
                          <div className="flex flex-col items-end">
                            <span className="text-destructive">
                              -{formatCurrency(staff.proRataDeduction, staff.currency)}
                            </span>
                            <span className="text-[10px] text-muted-foreground">
                              {staff.proRataWorkingDays}/{staff.proRataTotalWorkingDays} days worked
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
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setInvoiceDialog({
                              open: true,
                              staffUserId: staff.userId,
                              staffName: staff.displayName,
                              staffEmail: staff.email,
                              amount: staff.totalPay,
                              currency: staff.currency,
                            })}
                            className="h-8 w-8 p-0"
                            title="Generate Invoice"
                          >
                            <FileBadge className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleShowBankDetails(staff)}
                            className="h-8 w-8 p-0"
                            title="View bank details"
                          >
                            <Landmark className="h-4 w-4" />
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
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end">
                          {staff.hasSalaryRecord ? (
                            <Badge
                              className="group bg-blue-500 hover:bg-blue-600 text-white border-0 cursor-pointer gap-1"
                              onClick={() => handleRevertToPending(staff.userId)}
                              title="Click to set to pending"
                            >
                              <RotateCcw className="h-3 w-3" />
                              Paid
                            </Badge>
                          ) : isReady ? (
                            <Badge
                              className="group bg-green-600 hover:bg-green-700 text-white border-0 cursor-pointer gap-1"
                              onClick={() => handleRunPayroll(staff.userId)}
                              title="Click to mark as paid"
                            >
                              <CheckCircle className="h-3 w-3" />
                              Ready
                            </Badge>
                          ) : (
                            <Badge
                              variant="outline"
                              className="border-amber-500 text-amber-700 dark:text-amber-300 bg-amber-100/60 dark:bg-amber-900/30 cursor-pointer hover:bg-amber-200/60 gap-1"
                              onClick={() => handleToggleReady(staff.userId)}
                              title="Click to mark as ready"
                            >
                              <Clock className="h-3 w-3" />
                              Pending
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                    {isOTExpanded && hasOTDetails && (
                      <TableRow className="bg-muted/20">
                        <TableCell colSpan={14} className="p-0">
                          <div className="px-6 py-3 space-y-3">
                            {/* Overtime Day Details */}
                            {staff.overtimeDayDetails.length > 0 && (
                              <div>
                                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                                  Overtime Days Breakdown
                                </h4>
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1">
                                  {staff.overtimeDayDetails.map((day, idx) => (
                                    <div key={idx} className="flex items-center gap-2 text-xs py-1 px-2 rounded bg-background border">
                                      <span className="font-mono text-muted-foreground min-w-[80px]">
                                        {format(parseISO(day.date), 'EEE dd MMM')}
                                      </span>
                                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                                        day.subtype === 'standard' 
                                          ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' 
                                          : 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400'
                                      }`}>
                                        {day.subtype === 'standard' ? '1.5x Outside' : '0.5x Inside'}
                                      </span>
                                      <span className="text-muted-foreground truncate">{day.client}</span>
                                      <span className="text-[10px] text-muted-foreground/60 ml-auto">
                                        {day.source === 'pattern' ? 'Pattern' : 'Request'}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                            {/* Holiday OT Details */}
                            {staff.holidayShifts.length > 0 && (
                              <div>
                                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                                  Public Holiday Days (+0.5x)
                                </h4>
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1">
                                  {staff.holidayShifts.map((hs, idx) => (
                                    <div key={idx} className="flex items-center gap-2 text-xs py-1 px-2 rounded bg-background border">
                                      <span className="font-mono text-muted-foreground min-w-[80px]">
                                        {format(parseISO(hs.date), 'EEE dd MMM')}
                                      </span>
                                      <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                                        +0.5x Holiday
                                      </span>
                                      <span className="text-muted-foreground truncate">{hs.holidayName}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                            {/* Non-Overtime Cover Details */}
                            {staff.nonOvertimeCoverDayDetails.length > 0 && (
                              <div>
                                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                                  Non-Overtime Covers (×0 — no extra pay)
                                </h4>
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1">
                                  {staff.nonOvertimeCoverDayDetails.map((c, idx) => (
                                    <div key={idx} className="flex items-center gap-2 text-xs py-1 px-2 rounded bg-background border">
                                      <span className="font-mono text-muted-foreground min-w-[80px]">
                                        {format(parseISO(c.date), 'EEE dd MMM')}
                                      </span>
                                      <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-muted text-muted-foreground">
                                        ×0 Cover
                                      </span>
                                      <span className="text-muted-foreground truncate">Covering {c.coveredFor}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                    </React.Fragment>
                        );
                      })
                    ];
                  });
                })()
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Mobile Payroll Card List */}
      <div className="md:hidden space-y-3">
        <div className="text-sm text-muted-foreground px-1">
          {format(selectedMonth, 'MMMM yyyy')} · Tap invoice to download or email
        </div>
        {payrollSummary.length === 0 ? (
          <Card><CardContent className="p-6 text-center text-sm text-muted-foreground">
            No staff with salary configured.
          </CardContent></Card>
        ) : (() => {
          const pendingGroup = payrollSummary.filter(s => !s.hasSalaryRecord && !readyStaff.has(s.userId));
          const readyGroup = payrollSummary.filter(s => !s.hasSalaryRecord && readyStaff.has(s.userId));
          const paidGroup = payrollSummary.filter(s => s.hasSalaryRecord);
          const groups = [
            { key: 'pending' as const, label: 'Pending', items: sortItems(pendingGroup), accent: 'border-l-amber-500', bg: 'bg-amber-50 dark:bg-amber-950/20', badgeBg: 'bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200' },
            { key: 'ready' as const, label: 'Ready', items: sortItems(readyGroup), accent: 'border-l-green-500', bg: 'bg-green-50 dark:bg-green-950/20', badgeBg: 'bg-green-100 text-green-900 dark:bg-green-900/40 dark:text-green-200' },
            { key: 'paid' as const, label: 'Paid', items: sortItems(paidGroup), accent: 'border-l-blue-500', bg: 'bg-blue-50 dark:bg-blue-950/20', badgeBg: 'bg-blue-100 text-blue-900 dark:bg-blue-900/40 dark:text-blue-200' },
          ];
          return groups.filter(g => g.items.length > 0).map(group => (
            <div key={group.key} className="space-y-2">
              <div className={`flex items-center justify-between px-3 py-1.5 rounded-md text-xs font-semibold uppercase tracking-wide ${group.badgeBg}`}>
                <span>{group.label}</span>
                <span>{group.items.length}</span>
              </div>
              {group.items.map(staff => {
                const isReady = readyStaff.has(staff.userId);
                return (
                  <Card key={staff.userId} className={`border-l-4 ${group.accent} ${group.bg}`}>
                    <CardContent className="p-3 space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="font-semibold text-sm truncate">{staff.displayName}</div>
                          <div className="text-xs text-muted-foreground truncate">{staff.email}</div>
                        </div>
                        {staff.hasSalaryRecord ? (
                          <Badge className="bg-blue-500 text-white border-0 gap-1 shrink-0" onClick={() => handleRevertToPending(staff.userId)}>
                            <RotateCcw className="h-3 w-3" />Paid
                          </Badge>
                        ) : isReady ? (
                          <Badge className="bg-green-600 text-white border-0 gap-1 shrink-0" onClick={() => handleRunPayroll(staff.userId)}>
                            <CheckCircle className="h-3 w-3" />Ready
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="border-amber-500 text-amber-700 dark:text-amber-300 bg-amber-100/60 dark:bg-amber-900/30 gap-1 shrink-0" onClick={() => handleToggleReady(staff.userId)}>
                            <Clock className="h-3 w-3" />Pending
                          </Badge>
                        )}
                      </div>

                      <div className="flex items-end justify-between gap-2 pt-1 border-t">
                        <div>
                          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Total Pay</div>
                          <div className="text-xl font-bold">{formatCurrency(staff.totalPay, staff.currency)}</div>
                          {staff.currency !== 'GBP' && (
                            <div className="text-[11px] text-muted-foreground">
                              ≈ £{staff.totalPayInGBP.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </div>
                          )}
                        </div>
                        <div className="text-right text-[11px] text-muted-foreground space-y-0.5">
                          <div>Base {formatCurrency(staff.baseSalary, staff.currency)}</div>
                          {staff.overtime > 0 && <div className="text-success">+OT {formatCurrency(staff.overtime, staff.currency)}</div>}
                          {staff.bonuses > 0 && <div className="text-success">+Bonus {formatCurrency(staff.bonuses, staff.currency)}</div>}
                          {staff.deductions > 0 && <div className="text-destructive">-Ded {formatCurrency(staff.deductions, staff.currency)}</div>}
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <Button
                          variant="default"
                          size="sm"
                          className="w-full"
                          disabled={quickInvoiceBusy === staff.userId}
                          onClick={() => handleQuickInvoiceDownload(staff)}
                        >
                          <FileBadge className="h-4 w-4 mr-1.5" />
                          {quickInvoiceBusy === staff.userId ? 'Generating…' : 'Invoice'}
                        </Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="outline" size="sm" className="w-full">
                              <Edit2 className="h-4 w-4 mr-1.5" />
                              Edit
                              <ChevronDown className="h-3 w-3 ml-1 opacity-70" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-56">
                            <DropdownMenuItem onClick={() => handleOpenAdjustmentDialog(staff)}>
                              <Edit2 className="h-4 w-4 mr-2" />
                              Edit pay adjustments
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => setDescDialog({
                                open: true,
                                userId: staff.userId,
                                name: staff.displayName,
                                value: invoiceDescriptions[staff.userId] || `Remote support service - ${format(selectedMonth, "MMMM yyyy")}`,
                              })}
                            >
                              <FileText className="h-4 w-4 mr-2" />
                              Edit invoice description
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => setInvoiceDialog({
                                open: true,
                                staffUserId: staff.userId,
                                staffName: staff.displayName,
                                staffEmail: staff.email,
                                amount: staff.totalPay,
                                currency: staff.currency,
                              })}
                            >
                              <FileBadge className="h-4 w-4 mr-2" />
                              Open invoice dialog
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>

                    </CardContent>
                  </Card>
                );
              })}
            </div>
          ));
        })()}
      </div>


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

      {invoiceDialog && (
        <InvoiceGeneratorDialog
          open={invoiceDialog.open}
          onOpenChange={(open) => setInvoiceDialog(prev => prev ? { ...prev, open } : null)}
          staffUserId={invoiceDialog.staffUserId}
          staffName={invoiceDialog.staffName}
          staffEmail={invoiceDialog.staffEmail}
          month={selectedMonth}
          defaultAmount={invoiceDialog.amount}
          defaultCurrency={invoiceDialog.currency}
        />
      )}

      <Dialog open={!!descDialog?.open} onOpenChange={(open) => setDescDialog(prev => prev ? { ...prev, open } : null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Invoice description</DialogTitle>
            <DialogDescription>
              Used when downloading the invoice PDF for {descDialog?.name}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label>Description</Label>
            <Textarea
              rows={3}
              value={descDialog?.value || ''}
              onChange={(e) => setDescDialog(prev => prev ? { ...prev, value: e.target.value } : null)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDescDialog(null)}>Cancel</Button>
            <Button
              onClick={() => {
                if (!descDialog) return;
                setInvoiceDescriptions(prev => ({ ...prev, [descDialog.userId]: descDialog.value }));
                setDescDialog(null);
                toast({ title: 'Description saved', description: 'Used on the next invoice download.' });
              }}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
