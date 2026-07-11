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
import { Calendar, DollarSign, UserCircle, Briefcase, Clock, TrendingUp, CheckCircle, AlertCircle, ChevronDown, ChevronUp, FileText, RefreshCw, Users, User, Eye, FileBadge, Building2, CheckCircle2, Circle, ListChecks, Award, MapPin, ExternalLink, Handshake } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { format, startOfMonth, endOfMonth, parseISO, addMonths, eachDayOfInterval, getDay, differenceInCalendarDays } from "date-fns";
import { getCoveredDatesFromRequest } from "@/lib/coverageUtils";
import { calculateHolidayAllowance } from "./StaffHolidaysManager";
import { DocumentPreviewDialog } from "./DocumentPreviewDialog";
import { ContractorInvoiceDetailsForm } from "./ContractorInvoiceDetailsForm";
import { InvoiceGeneratorDialog } from "./InvoiceGeneratorDialog";
import { TRAINING_CATEGORIES, type TrainingItem } from "./training/TrainingItemsManager";
import { allTrainingUpToDate } from "@/lib/trainingStatus";
import { computeHolidayHandoverStatus } from "@/lib/handoverStatus";
interface UserProfile {
  user_id: string;
  display_name: string | null;
  email: string | null;
}
interface HandoverClientSummary {
  client: string;
  avgProgress: number;
  taskCount: number;
  latestTarget: string | null;
}
interface MonthlyPayPreview {
  month: Date;
  monthLabel: string;
  monthlyBaseSalary: number;
  dailyRate: number;
  bonuses: number;
  deductions: number;
  bonusItems: Array<{ label: string; amount: number; description: string | null; recurring: boolean }>;
  deductionItems: Array<{ label: string; amount: number; description: string | null }>;
  overtimeDays: number;
  overtimePay: number;
  overtimeShifts: Array<{
    date: string;
    subtype: 'standard' | 'double_up';
    source: 'pattern' | 'request';
  }>;
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
  holidayAccrualBreakdown?: {
    annualAllowance: number;
    accruedAllowance: number;
    monthsWorkedInYear: number;
    daysTakenInYear: number;
  };
  unpaidHolidayDeduction: number;
  unpaidHolidayDays: number;
  proRataDeduction: number;
  proRataWorkingDays: number;
  proRataTotalWorkingDays: number;
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
  unlimited_holiday: boolean;
  notes: string | null;
  performance_rating: string | null;
  employment_status: string | null;
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
  overtime_subtype: string | null;
}
interface ShiftPatternException {
  id: string;
  pattern_id: string;
  exception_date: string;
  exception_type: string;
  overtime_subtype: string | null;
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
  swap_with_user_id: string | null;
  overtime_type: string | null;
}
interface RecurringBonus {
  id: string;
  amount: number;
  currency: string;
  description: string | null;
  start_date: string;
  end_date: string | null;
}
interface OnboardingOwner {
  id: string;
  name: string;
  role: string | null;
  email: string | null;
  phone: string | null;
}

interface OnboardingStep {
  id: string;
  title: string;
  description: string | null;
  sort_order: number;
  step_type: string;
  target_page_id: string | null;
  external_url: string | null;
  stage: string;
  owner?: OnboardingOwner | null;
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
    label: 'Overtime (Outside Normal Hours)',
    icon: 'clock'
  },
  'overtime_double_up': {
    label: 'Overtime (Inside Normal Hours)',
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

// Unified high-level status pill used across the profile accordions.
type StatusTone = 'success' | 'warning' | 'danger' | 'neutral';
const STATUS_TONE_CLASS: Record<StatusTone, string> = {
  success: 'bg-green-100 text-green-700 border-green-200',
  warning: 'bg-amber-100 text-amber-700 border-amber-200',
  danger: 'bg-red-100 text-red-700 border-red-200',
  neutral: 'bg-muted text-muted-foreground border-border',
};
const STATUS_DOT_CLASS: Record<StatusTone, string> = {
  success: 'bg-green-500',
  warning: 'bg-amber-500',
  danger: 'bg-red-500',
  neutral: 'bg-muted-foreground/60',
};
// Performance rating tiers (tier-list style). Order defines the click cycle.
const RANK_ORDER = ['S', 'A', 'B', 'C', 'D'] as const;
type Rank = typeof RANK_ORDER[number];
const RANK_STYLES: Record<Rank, { label: string; tile: string; glow: string; emoji: string }> = {
  S: { label: 'S Rank', tile: 'bg-gradient-to-br from-amber-300 via-yellow-400 to-amber-500 text-amber-950', glow: 'shadow-[0_0_18px_rgba(251,191,36,0.7)]', emoji: '👑' },
  A: { label: 'A Rank', tile: 'bg-gradient-to-br from-emerald-300 to-green-500 text-emerald-950', glow: 'shadow-[0_0_16px_rgba(16,185,129,0.55)]', emoji: '⭐' },
  B: { label: 'B Rank', tile: 'bg-gradient-to-br from-sky-300 to-blue-500 text-sky-950', glow: 'shadow-[0_0_16px_rgba(59,130,246,0.5)]', emoji: '✨' },
  C: { label: 'C Rank', tile: 'bg-gradient-to-br from-violet-300 to-purple-500 text-violet-950', glow: 'shadow-[0_0_14px_rgba(168,85,247,0.45)]', emoji: '🔧' },
  D: { label: 'D Rank', tile: 'bg-gradient-to-br from-slate-300 to-slate-500 text-slate-900', glow: '', emoji: '🌱' },
};

function StatusPill({ tone, children }: { tone: StatusTone; children: React.ReactNode }) {
  return (
    <span className={cn("ml-2 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium", STATUS_TONE_CLASS[tone])}>
      <span className={cn("h-1.5 w-1.5 rounded-full", STATUS_DOT_CLASS[tone])} />
      {children}
    </span>
  );
}

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
  const [coveredUserPatterns, setCoveredUserPatterns] = useState<RecurringShiftPattern[]>([]);
  const [recurringBonuses, setRecurringBonuses] = useState<RecurringBonus[]>([]);
  const [onboardingData, setOnboardingData] = useState<OnboardingFormData | null>(null);
  const [onboardingSteps, setOnboardingSteps] = useState<OnboardingStep[]>([]);
  const [onboardingCompletedIds, setOnboardingCompletedIds] = useState<Set<string>>(new Set());
  const [trainingItems, setTrainingItems] = useState<TrainingItem[]>([]);
  const [trainingRecords, setTrainingRecords] = useState<{ training_item_id: string; completed_date: string }[]>([]);
  const [hasContractorDetails, setHasContractorDetails] = useState(false);
  const [scheduleClients, setScheduleClients] = useState<string[]>([]);
  const [ownHandovers, setOwnHandovers] = useState<HandoverClientSummary[]>([]);
  const [coveringHandovers, setCoveringHandovers] = useState<(HandoverClientSummary & { coveredName: string })[]>([]);
  const [nextHoliday, setNextHoliday] = useState<{ start_date: string; end_date: string; noCoverRequired: boolean } | null>(null);
  const [expandedMonths, setExpandedMonths] = useState<Set<string>>(new Set([format(new Date(), 'yyyy-MM')]));
  const [documentPreview, setDocumentPreview] = useState<{
    open: boolean;
    filePath: string | null;
    documentType: string;
    documentLabel: string;
  }>({ open: false, filePath: null, documentType: '', documentLabel: '' });
  const [invoiceDialog, setInvoiceDialog] = useState<{
    open: boolean;
    month: Date;
    amount: number;
    currency: string;
  } | null>(null);

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
      } = await supabase.from('recurring_shift_patterns').select('id, user_id, days_of_week, start_time, end_time, start_date, end_date, is_overtime, overtime_subtype, recurrence_interval').eq('user_id', targetUserId);
      setRecurringPatterns(patterns || []);

      // Fetch pattern exceptions
      if (patterns && patterns.length > 0) {
        const patternIds = patterns.map(p => p.id);
        const {
          data: exceptions
        } = await supabase.from('shift_pattern_exceptions').select('id, pattern_id, exception_date, exception_type, overtime_subtype').in('pattern_id', patternIds);
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

      // Fetch covered users' recurring patterns for shift_swap requests
      const coveredUserIds = [...new Set(
        (requestsData || [])
          .filter(r => r.request_type === 'shift_swap' && r.swap_with_user_id)
          .map(r => r.swap_with_user_id)
      )].filter(Boolean) as string[];
      
      if (coveredUserIds.length > 0) {
        const { data: coveredPatterns } = await supabase
          .from('recurring_shift_patterns')
          .select('id, user_id, days_of_week, start_time, end_time, start_date, end_date, is_overtime, overtime_subtype')
          .in('user_id', coveredUserIds);
        setCoveredUserPatterns(coveredPatterns || []);
      } else {
        setCoveredUserPatterns([]);
      }

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

      // Fetch onboarding steps + user progress
      const { data: stepsData } = await supabase
        .from('onboarding_steps')
        .select('id, title, description, sort_order, step_type, target_page_id, external_url, stage, owner:onboarding_owners(id, name, role, email, phone)')
        .order('stage', { ascending: true })
        .order('sort_order', { ascending: true });

      const { data: completionsData } = await supabase
        .from('onboarding_completions')
        .select('step_id')
        .eq('user_id', targetUserId);

      const internalPageIds = (stepsData || [])
        .filter(s => s.step_type === 'internal_page' && s.target_page_id)
        .map(s => s.target_page_id as string);

      let acknowledgedPageIds: string[] = [];
      if (internalPageIds.length > 0) {
        const { data: ackData } = await supabase
          .from('page_acknowledgements')
          .select('page_id')
          .eq('user_id', targetUserId)
          .in('page_id', internalPageIds);
        acknowledgedPageIds = (ackData || []).map(a => a.page_id);
      }

      // Fetch training items + this user's training records (also drives the
      // training-linked onboarding step's completion).
      const { data: tItems } = await supabase
        .from('training_items')
        .select('id, name, description, refresh_frequency_months, sort_order, is_active, category')
        .eq('is_active', true)
        .order('sort_order', { ascending: true });
      const { data: tRecords } = await supabase
        .from('training_records')
        .select('training_item_id, completed_date')
        .eq('user_id', targetUserId);
      setTrainingItems((tItems || []) as TrainingItem[]);
      setTrainingRecords(tRecords || []);

      const trainingDone = allTrainingUpToDate(
        (tItems || []).map(t => ({ id: t.id, refresh_frequency_months: t.refresh_frequency_months })),
        new Map((tRecords || []).map(r => [r.training_item_id, r.completed_date]))
      );

      const completedIds = new Set<string>([
        ...((completionsData || []).map(c => c.step_id)),
        // For internal_page steps, treat acknowledged pages as completed
        ...((stepsData || [])
          .filter(s => s.step_type === 'internal_page' && s.target_page_id && acknowledgedPageIds.includes(s.target_page_id))
          .map(s => s.id)),
        // Training-linked steps complete when all active training is up to date
        ...((stepsData || [])
          .filter(s => s.step_type === 'training' && trainingDone)
          .map(s => s.id)),
      ]);

      setOnboardingSteps((stepsData || []) as OnboardingStep[]);
      setOnboardingCompletedIds(completedIds);

      // Whether contractor/invoicing details are on file for this user
      const { count: contractorCount } = await supabase
        .from('contractor_invoice_details')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', targetUserId);
      setHasContractorDetails((contractorCount ?? 0) > 0);

      // Clients this person is scheduled to work with over the next 4 weeks
      // (derived from recurring shift patterns active in the window).
      const todayISO = format(new Date(), 'yyyy-MM-dd');
      const horizon = new Date();
      horizon.setDate(horizon.getDate() + 28);
      const horizonISO = format(horizon, 'yyyy-MM-dd');
      const { data: clientPatterns } = await supabase
        .from('recurring_shift_patterns')
        .select('client_name, start_date, end_date')
        .eq('user_id', targetUserId)
        .lte('start_date', horizonISO)
        .or(`end_date.is.null,end_date.gte.${todayISO}`);
      const clientNames = Array.from(
        new Set((clientPatterns || []).map(p => (p.client_name || '').trim()).filter(Boolean))
      ).sort((a, b) => a.localeCompare(b));
      setScheduleClients(clientNames);

      // Handover tracker relevant to this staff member: handover for THEIR next
      // upcoming/current approved leave (must be complete before it starts —
      // uses the shared status utility so this matches the definition used on
      // the request page, schedule, admin lists, and reminder emails), plus any
      // clients they're currently covering for someone else's approved holiday
      // (so a covering staff member can jump straight to the tracker for the
      // person they're covering).
      const aggregateHandovers = (tasks: { client_name: string; progress: number | null; target_date: string | null }[]) => {
        const grouped = new Map<string, { sum: number; count: number; latest: string | null }>();
        for (const t of tasks) {
          if (!t.client_name) continue;
          const cur = grouped.get(t.client_name) || { sum: 0, count: 0, latest: null };
          cur.sum += t.progress ?? 0;
          cur.count += 1;
          if (t.target_date && (!cur.latest || t.target_date > cur.latest)) cur.latest = t.target_date;
          grouped.set(t.client_name, cur);
        }
        return grouped;
      };

      const upcomingOrCurrentHoliday = (holidayData || [])
        .filter(h => h.status === 'approved' && h.end_date >= todayISO)
        .sort((a, b) => a.start_date.localeCompare(b.start_date))[0] || null;
      setNextHoliday(upcomingOrCurrentHoliday
        ? {
            start_date: upcomingOrCurrentHoliday.start_date,
            end_date: upcomingOrCurrentHoliday.end_date,
            noCoverRequired: !!upcomingOrCurrentHoliday.no_cover_required,
          }
        : null);

      if (upcomingOrCurrentHoliday && !upcomingOrCurrentHoliday.no_cover_required) {
        const { clients } = await computeHolidayHandoverStatus(
          targetUserId, upcomingOrCurrentHoliday.start_date, upcomingOrCurrentHoliday.end_date
        );
        setOwnHandovers(
          clients
            .map(c => ({ client: c.client, avgProgress: c.avgProgress, taskCount: c.taskCount, latestTarget: null }))
            .sort((a, b) => a.client.localeCompare(b.client))
        );
      } else {
        setOwnHandovers([]);
      }

      // Clients covered for someone else (active/upcoming approved shift_swap where
      // this person is the covering party).
      const { data: coverRequests } = await supabase
        .from('staff_requests')
        .select('swap_with_user_id, end_date')
        .eq('request_type', 'shift_swap')
        .eq('status', 'approved')
        .eq('user_id', targetUserId)
        .gte('end_date', todayISO);

      const handoverCoveredUserIds = Array.from(new Set((coverRequests || []).map(r => r.swap_with_user_id).filter(Boolean))) as string[];
      const coveringList: (HandoverClientSummary & { coveredName: string })[] = [];
      if (handoverCoveredUserIds.length > 0) {
        const { data: coveredProfiles } = await supabase
          .from('profiles')
          .select('user_id, display_name, email')
          .in('user_id', handoverCoveredUserIds);
        const coveredNameMap = new Map((coveredProfiles || []).map(p => [p.user_id, p.display_name || p.email || 'Unknown']));

        const { data: coveredPatterns } = await supabase
          .from('recurring_shift_patterns')
          .select('user_id, client_name')
          .in('user_id', handoverCoveredUserIds);

        const clientsByCoveredUser = new Map<string, Set<string>>();
        (coveredPatterns || []).forEach(p => {
          if (!p.client_name || p.client_name === 'Care Cuddle') return;
          if (!clientsByCoveredUser.has(p.user_id)) clientsByCoveredUser.set(p.user_id, new Set());
          clientsByCoveredUser.get(p.user_id)!.add(p.client_name);
        });

        const allCoveringClients = Array.from(new Set(Array.from(clientsByCoveredUser.values()).flatMap(s => Array.from(s))));
        const { data: coveringTasks } = allCoveringClients.length > 0
          ? await supabase.from('client_handover_tasks').select('client_name, progress, target_date').in('client_name', allCoveringClients)
          : { data: [] as { client_name: string; progress: number | null; target_date: string | null }[] };
        const coveringGrouped = aggregateHandovers(coveringTasks || []);

        for (const [coveredUserId, clients] of clientsByCoveredUser.entries()) {
          const coveredName = coveredNameMap.get(coveredUserId) || 'Unknown';
          for (const client of clients) {
            const agg = coveringGrouped.get(client);
            coveringList.push({
              client,
              coveredName,
              avgProgress: agg ? Math.round(agg.sum / agg.count) : 0,
              taskCount: agg ? agg.count : 0,
              latestTarget: agg ? agg.latest : null,
            });
          }
        }
        coveringList.sort((a, b) => a.coveredName.localeCompare(b.coveredName) || a.client.localeCompare(b.client));
      }
      setCoveringHandovers(coveringList);

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

    // Create exceptions maps - separate deleted from overtime overrides
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
              // Only skip if there's a 'deleted' exception
              const deletedExs = deletedExceptionsMap.get(pattern.id);
              if (!deletedExs || !deletedExs.has(dateStr)) {
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

      // Build set of dates the user is on approved leave (paid or unpaid)
      // Staff on leave should NOT receive public holiday overtime
      const userLeaveDates = new Set<string>();
      const userLeaveReqs = staffRequests.filter(req => 
        req.status === 'approved' && 
        (req.request_type === 'holiday_paid' || req.request_type === 'holiday_unpaid')
      );
      userLeaveReqs.forEach(req => {
        const leaveStart = parseISO(req.start_date);
        const leaveEnd = parseISO(req.end_date);
        const leaveDays = eachDayOfInterval({ start: leaveStart, end: leaveEnd });
        leaveDays.forEach(d => userLeaveDates.add(format(d, 'yyyy-MM-dd')));
      });

      // Count holiday days
      const countedHolidayDates = new Set<string>();
      const holidayShifts: Array<{
        date: string;
        holidayName: string;
      }> = [];

      // Check actual schedules
      for (const schedule of userSchedulesInMonth) {
        const scheduleDate = format(new Date(schedule.start_datetime), 'yyyy-MM-dd');
        if (holidayDatesMap.has(scheduleDate) && !countedHolidayDates.has(scheduleDate) && !userLeaveDates.has(scheduleDate)) {
          countedHolidayDates.add(scheduleDate);
          holidayShifts.push({
            date: scheduleDate,
            holidayName: holidayDatesMap.get(scheduleDate) || 'Public Holiday'
          });
        }
      }

      // Check virtual schedules
      for (const dateStr of virtualScheduleDates) {
        if (holidayDatesMap.has(dateStr) && !actualScheduleDates.has(dateStr) && !countedHolidayDates.has(dateStr) && !userLeaveDates.has(dateStr)) {
          countedHolidayDates.add(dateStr);
          holidayShifts.push({
            date: dateStr,
            holidayName: holidayDatesMap.get(dateStr) || 'Public Holiday'
          });
        }
      }

      // Check approved cover requests (shift_swap, overtime) for public holiday days
      // When covering someone's holiday, the staff member may work on a public holiday
      // but won't have a recurring pattern or actual schedule for that client
      const coverRequests = staffRequests.filter(req => 
        req.status === 'approved' && 
        (req.request_type === 'shift_swap' || req.request_type === 'overtime' || req.request_type === 'overtime_standard' || req.request_type === 'overtime_double_up')
      );
      coverRequests.forEach(req => {
        const reqStart = parseISO(req.start_date);
        const reqEnd = parseISO(req.end_date);
        if (reqStart <= monthEnd && reqEnd >= monthStart) {
          let coverDate = new Date(Math.max(reqStart.getTime(), monthStart.getTime()));
          const coverEndDate = new Date(Math.min(reqEnd.getTime(), monthEnd.getTime()));
          while (coverDate <= coverEndDate) {
            const coverDateStr = format(coverDate, 'yyyy-MM-dd');
            if (holidayDatesMap.has(coverDateStr) && !countedHolidayDates.has(coverDateStr) && !userLeaveDates.has(coverDateStr)) {
              countedHolidayDates.add(coverDateStr);
              holidayShifts.push({
                date: coverDateStr,
                holidayName: holidayDatesMap.get(coverDateStr) || 'Public Holiday'
              });
            }
            coverDate.setDate(coverDate.getDate() + 1);
          }
        }
      });

      const publicHolidayPayDisabled = !!(hrProfile as any)?.public_holiday_pay_disabled;
      const holidayOvertimeDays = publicHolidayPayDisabled ? 0 : countedHolidayDates.size;
      // Base day pay is already in salary, so we only add the 0.5x overtime bonus
      const holidayOvertimeBonus = publicHolidayPayDisabled ? 0 : countedHolidayDates.size * dailyRate * 0.5;
      if (publicHolidayPayDisabled) {
        holidayShifts.length = 0;
      }

      // Get bonuses and deductions for this month from pay records
      const monthRecords = payRecords.filter(r => {
        const payDate = parseISO(r.pay_date);
        return payDate >= monthStart && payDate <= monthEnd;
      });
      const oneOffBonusRecords = monthRecords.filter(r => r.record_type === 'bonus');
      const deductionRecords = monthRecords.filter(r => r.record_type === 'deduction');
      const oneOffBonuses = oneOffBonusRecords.reduce((sum, r) => sum + r.amount, 0);

      // Add recurring bonuses that are active for this month
      const activeRecurringBonusesList = recurringBonuses.filter(bonus => {
        const bonusStart = parseISO(bonus.start_date);
        const bonusEnd = bonus.end_date ? parseISO(bonus.end_date) : null;
        return bonusStart <= monthEnd && (!bonusEnd || bonusEnd >= monthStart);
      });
      const activeRecurringBonuses = activeRecurringBonusesList.reduce((sum, bonus) => sum + bonus.amount, 0);
      const bonuses = oneOffBonuses + activeRecurringBonuses;
      const deductions = deductionRecords.reduce((sum, r) => sum + r.amount, 0);

      const bonusItems = [
        ...oneOffBonusRecords.map(r => ({
          label: r.description || 'Bonus',
          amount: r.amount,
          description: r.description,
          recurring: false,
        })),
        ...activeRecurringBonusesList.map(b => ({
          label: b.description || 'Recurring Bonus',
          amount: b.amount,
          description: b.description,
          recurring: true,
        })),
      ];
      const deductionItems = deductionRecords.map(r => ({
        label: r.description || 'Deduction',
        amount: r.amount,
        description: r.description,
      }));

      // Calculate overtime from approved requests and recurring patterns
      // Count by unique date (one overtime day per calendar day)
      const overtimeShiftsByDate = new Map<string, {
        subtype: 'standard' | 'double_up';
        source: 'pattern' | 'request';
      }>();

      const upsertOvertimeShift = (
        dateStr: string,
        subtype: 'standard' | 'double_up',
        source: 'pattern' | 'request'
      ) => {
        const existing = overtimeShiftsByDate.get(dateStr);

        if (!existing) {
          overtimeShiftsByDate.set(dateStr, { subtype, source });
          return;
        }

        // Prefer request source when both exist for the same date
        const preferredSource: 'pattern' | 'request' =
          existing.source === 'request' || source === 'request' ? 'request' : 'pattern';

        // If mixed subtypes exist on same day, prefer standard (higher multiplier)
        const preferredSubtype: 'standard' | 'double_up' =
          existing.subtype === 'standard' || subtype === 'standard' ? 'standard' : 'double_up';

        overtimeShiftsByDate.set(dateStr, {
          subtype: preferredSubtype,
          source: preferredSource
        });
      };

      // Include shift_swap requests that have an overtime_type set (cover shifts with OT)
      const approvedOvertimeRequests = staffRequests.filter(req => {
        if (req.status !== 'approved') return false;
        if (req.request_type === 'overtime' || req.request_type === 'overtime_standard' || req.request_type === 'overtime_double_up') return true;
        if (req.request_type === 'shift_swap' && req.overtime_type) return true;
        return false;
      });

      approvedOvertimeRequests.forEach(req => {
        const reqStart = parseISO(req.start_date);
        const reqEnd = parseISO(req.end_date);

        if (reqStart <= monthEnd && reqEnd >= monthStart) {
          const overlapStart = reqStart > monthStart ? reqStart : monthStart;
          const overlapEnd = reqEnd < monthEnd ? reqEnd : monthEnd;
          const isInsideHours = req.request_type === 'overtime_double_up' || req.overtime_type === 'standard_hours';
          const subtype: 'standard' | 'double_up' = isInsideHours ? 'double_up' : 'standard';

          // For shift swaps, use the covered user's patterns; otherwise use current user's patterns
          const targetUserId = (req.request_type === 'shift_swap' && req.swap_with_user_id)
            ? req.swap_with_user_id
            : null;
          const targetPatterns = targetUserId
            ? coveredUserPatterns.filter(p => p.user_id === targetUserId && !p.is_overtime)
            : recurringPatterns.filter(p => !p.is_overtime);

          // Count only the dates actually assigned for cover (structured covered_dates),
          // clamped to this month's overlap -- never the full start->end span, which would
          // refill days a non-contiguous cover deliberately excluded and over-pay OT.
          // Mirrors the authoritative payroll engine (StaffPayManager.getGranularCoveredDates).
          const granularCoveredDates = getCoveredDatesFromRequest({
            start_date: req.start_date,
            end_date: req.end_date,
            coverage_metadata: (req as any).coverage_metadata ?? null,
          }).filter(d => d >= format(overlapStart, 'yyyy-MM-dd') && d <= format(overlapEnd, 'yyyy-MM-dd'));

          const daysInRange = granularCoveredDates.length > 0
            ? granularCoveredDates.map(d => parseISO(d))
            : eachDayOfInterval({ start: overlapStart, end: overlapEnd });

          // Only count days where the target user actually has a working shift pattern
          for (const day of daysInRange) {
            const dateStr = format(day, 'yyyy-MM-dd');
            const dayOfWeek = getDay(day);
            
            const isWorkingDay = targetPatterns.some(pattern => {
              const patternStart = parseISO(pattern.start_date);
              const patternEnd = pattern.end_date ? parseISO(pattern.end_date) : null;
              if (day < patternStart || (patternEnd && day > patternEnd)) return false;
              if (!pattern.days_of_week.includes(dayOfWeek)) return false;
              const deletedExs = deletedExceptionsMap.get(pattern.id);
              if (deletedExs && deletedExs.has(dateStr)) return false;
              return true;
            });
            
            if (isWorkingDay) {
              upsertOvertimeShift(dateStr, subtype, 'request');
            }
          }
        }
      });

      // Request dates take precedence over patterns for the same day
      const requestOTDates = new Set(
        Array.from(overtimeShiftsByDate.entries())
          .filter(([, value]) => value.source === 'request')
          .map(([date]) => date)
      );

      // Also count recurring overtime patterns and per-day overtime exceptions
      for (const day of monthDays) {
        const dateStr = format(day, 'yyyy-MM-dd');
        const dayOfWeek = getDay(day);

        // Skip if already covered by a request entry for this date
        if (requestOTDates.has(dateStr)) continue;

        for (const pattern of recurringPatterns) {
          const patternStart = parseISO(pattern.start_date);
          const patternEnd = pattern.end_date ? parseISO(pattern.end_date) : null;

          if (day >= patternStart && (!patternEnd || day <= patternEnd)) {
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

                upsertOvertimeShift(dateStr, subtype, 'pattern');
                break;
              }
            }
          }
        }
      }

      const overtimeShifts = Array.from(overtimeShiftsByDate.entries()).map(([date, value]) => ({
        date,
        subtype: value.subtype,
        source: value.source
      }));

      const totalStandardOTDays = overtimeShifts.filter(shift => shift.subtype === 'standard').length;
      const totalDoubleUpOTDays = overtimeShifts.filter(shift => shift.subtype === 'double_up').length;
      const overtimeDays = overtimeShifts.length;

      // Overtime pay:
      // Standard/Outside OT = 1.5 × dailyRate × days (outside normal hours, full pay)
      // Double Up/Inside OT = 0.5 × dailyRate × days (during normal hours, premium only)
      const overtimePay = (1.5 * dailyRate * totalStandardOTDays) + (0.5 * dailyRate * totalDoubleUpOTDays);

      // Calculate unused holiday payout or excess holiday deduction for June (end of holiday year)
      // Holiday year runs June 1 to May 31, so June payroll includes payout for unused days or deduction for excess
      // Skip this calculation if staff has unlimited holiday
      let unusedHolidayPayout = 0;
      let unusedHolidayDays = 0;
      let excessHolidayDeduction = 0;
      let excessHolidayDays = 0;
      let holidayAccrualBreakdown: MonthlyPayPreview['holidayAccrualBreakdown'] | undefined;
      const targetMonthNum = targetMonth.getMonth(); // 0-indexed, June = 5

      if (targetMonthNum === 5 && !hrProfile.unlimited_holiday) {
        // June - only calculate for staff with limited holiday
        // Calculate holidays taken in the holiday year ending May 31 of the same year
        const holidayYearStart = new Date(targetMonth.getFullYear() - 1, 5, 1); // June 1 of previous year
        const holidayYearEnd = new Date(targetMonth.getFullYear(), 4, 31); // May 31 of current year

        const holidaysTakenInYear = holidays.filter(h => {
          const startDate = parseISO(h.start_date);
          return h.status === 'approved' && h.absence_type === 'holiday' && startDate >= holidayYearStart && startDate <= holidayYearEnd;
        }).reduce((sum, h) => sum + Number(h.days_taken), 0);

        // June payroll reconciles the holiday year that JUST ENDED (June prev → May current).
        // Use the FULL annual allowance for that completed year, pro-rated only if the
        // employee started mid-year. This matches StaffPayManager's logic.
        const DEFAULT_ALLOWANCE = 15;
        const INCREASED_ALLOWANCE = 18;
        const totalDaysInYear = Math.ceil((holidayYearEnd.getTime() - holidayYearStart.getTime()) / (1000 * 60 * 60 * 24));

        // Tenure-based: 15 days default, 18 after 1+ year of employment as of the START
        // of the holiday year being reconciled.
        let accruedAllowance = 0;
        let annualAllowanceForYear = DEFAULT_ALLOWANCE;
        let monthsWorkedInYear = 12;
        if (hrProfile.start_date) {
          const start = parseISO(hrProfile.start_date);
          const yearsEmployedAtYearEnd = (holidayYearEnd.getTime() - start.getTime()) / (1000 * 60 * 60 * 24 * 365);
          annualAllowanceForYear = yearsEmployedAtYearEnd >= 1 ? INCREASED_ALLOWANCE : DEFAULT_ALLOWANCE;

          if (start > holidayYearEnd) {
            accruedAllowance = 0;
            monthsWorkedInYear = 0;
          } else {
            const accrualStart = start > holidayYearStart ? start : holidayYearStart;
            const daysAccruing = Math.max(0, Math.ceil((holidayYearEnd.getTime() - accrualStart.getTime()) / (1000 * 60 * 60 * 24)));
            const fraction = Math.min(daysAccruing / totalDaysInYear, 1);
            accruedAllowance = Math.round(annualAllowanceForYear * fraction * 10) / 10;
            monthsWorkedInYear = Math.round((daysAccruing / 30.4375) * 10) / 10;
          }
        } else {
          accruedAllowance = DEFAULT_ALLOWANCE;
          annualAllowanceForYear = DEFAULT_ALLOWANCE;
        }

        holidayAccrualBreakdown = {
          annualAllowance: annualAllowanceForYear,
          accruedAllowance,
          monthsWorkedInYear,
          daysTakenInYear: holidaysTakenInYear,
        };

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

      // Calculate unpaid holiday deductions for this month
      let unpaidHolidayDays = 0;
      const approvedUnpaidHolidays = staffRequests.filter(req => 
        req.status === 'approved' && req.request_type === 'holiday_unpaid'
      );
      approvedUnpaidHolidays.forEach(req => {
        const reqStart = parseISO(req.start_date);
        const reqEnd = parseISO(req.end_date);
        // Count days that fall within this month
        if (reqStart <= monthEnd && reqEnd >= monthStart) {
          const overlapStart = reqStart > monthStart ? reqStart : monthStart;
          const overlapEnd = reqEnd < monthEnd ? reqEnd : monthEnd;
          const daysInMonth = Math.ceil((overlapEnd.getTime() - overlapStart.getTime()) / (1000 * 60 * 60 * 24)) + 1;
          unpaidHolidayDays += Math.min(daysInMonth, req.days_requested);
        }
      });
      const unpaidHolidayDeduction = (monthlyBaseSalary / 20) * unpaidHolidayDays;

      // Pro-rata deduction for staff who started mid-month
      let proRataDeduction = 0;
      let proRataWorkingDays = 0;
      let proRataTotalWorkingDays = 20;
      if (hrProfile.start_date) {
        const staffStartDate = parseISO(hrProfile.start_date);
        if (staffStartDate > monthStart && staffStartDate <= monthEnd) {
          const allDaysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });
          const totalWorkingDaysInMonth = allDaysInMonth.filter(d => {
            const dow = d.getDay();
            return dow !== 0 && dow !== 6;
          }).length;
          const daysWorked = allDaysInMonth.filter(d => {
            if (d < staffStartDate) return false;
            const dow = d.getDay();
            return dow !== 0 && dow !== 6;
          }).length;
          proRataTotalWorkingDays = totalWorkingDaysInMonth;
          proRataWorkingDays = daysWorked;
          const daysNotWorked = totalWorkingDaysInMonth - daysWorked;
          proRataDeduction = (monthlyBaseSalary / totalWorkingDaysInMonth) * daysNotWorked;
        }
      }

      const totalPay = monthlyBaseSalary + bonuses + overtimePay + holidayOvertimeBonus + unusedHolidayPayout - deductions - excessHolidayDeduction - unpaidHolidayDeduction - proRataDeduction;

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
        bonusItems,
        deductionItems,
        overtimeDays,
        overtimePay,
        overtimeShifts: overtimeShifts.sort((a, b) => a.date.localeCompare(b.date)),
        holidayOvertimeDays,
        holidayOvertimeBonus,
        holidayShifts,
        unusedHolidayPayout,
        unusedHolidayDays,
        excessHolidayDeduction,
        excessHolidayDays,
        holidayAccrualBreakdown,
        unpaidHolidayDeduction,
        unpaidHolidayDays,
        proRataDeduction,
        proRataWorkingDays,
        proRataTotalWorkingDays,
        totalPay,
        payrollStatus,
        currency: hrProfile.base_currency
      });
    }
    return previews;
  }, [hrProfile, staffSchedules, recurringPatterns, coveredUserPatterns, patternExceptions, publicHolidays, payRecords, recurringBonuses, holidays, staffRequests]);
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
  // Cycle the performance rating S → A → B → C → D → S on click (admin only).
  const cyclePerformanceRating = async () => {
    if (!hrProfile || !isAdmin) return;
    const cur = hrProfile.performance_rating as Rank | null;
    const idx = RANK_ORDER.indexOf(cur as Rank);
    const next = RANK_ORDER[(idx + 1) % RANK_ORDER.length];
    const prev = hrProfile;
    setHRProfile({ ...hrProfile, performance_rating: next }); // optimistic
    const { error } = await supabase
      .from('hr_profiles')
      .update({ performance_rating: next })
      .eq('id', hrProfile.id);
    if (error) {
      setHRProfile(prev);
      toast({ title: "Couldn't update rating", description: error.message, variant: "destructive" });
    }
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
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
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
                {hrProfile.unlimited_holiday ? (
                  <p className="font-medium text-primary">Unlimited</p>
                ) : (
                  <p className="font-medium">
                    {totalHolidaysTaken} / {allowanceInfo.annualAllowance} days used
                    <span className="text-muted-foreground text-sm ml-1">({allowanceInfo.accruedAllowance.toFixed(1)} accrued)</span>
                  </p>
                )}
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

        {/* Performance Rating — click to cycle tiers (admin) */}
        {(() => {
          const rank = (hrProfile.performance_rating as Rank | null);
          const style = rank ? RANK_STYLES[rank] : null;
          return (
            <Card
              onClick={cyclePerformanceRating}
              title={isAdmin ? "Click to change performance rating" : undefined}
              className={cn(
                "overflow-hidden transition-all duration-200",
                isAdmin && "cursor-pointer hover:shadow-lg hover:-translate-y-0.5 active:scale-[0.98]"
              )}
            >
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div
                    key={rank || 'none'}
                    className={cn(
                      "flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-lg text-xl font-extrabold animate-in zoom-in-50 duration-300",
                      style ? cn(style.tile, style.glow) : "bg-primary/10 text-primary"
                    )}
                  >
                    {rank ?? "?"}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm text-muted-foreground">Performance Rating</p>
                    <p className="font-medium flex items-center gap-1.5">
                      {style ? (
                        <>
                          <span>{style.emoji}</span>
                          {style.label}
                        </>
                      ) : (
                        <span className="text-muted-foreground">{isAdmin ? "Tap to rate" : "Not rated"}</span>
                      )}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })()}
      </div>

      {/* Onboarding Steps Progress — only for staff currently in onboarding */}
      {onboardingSteps.length > 0
        && ['onboarding_probation', 'onboarding_passed'].includes(hrProfile.employment_status || '')
        && (() => {
        const STAGE_ORDER = ["Getting Started", "System & Tools", "Company Policies", "Training", "Final Checks"];
        const stepsByStage = onboardingSteps.reduce((acc, step) => {
          const key = step.stage || "Getting Started";
          if (!acc[key]) acc[key] = [];
          acc[key].push(step);
          return acc;
        }, {} as Record<string, OnboardingStep[]>);
        const stages = STAGE_ORDER.filter(s => stepsByStage[s]?.length > 0);
        // Count only steps in a known stage (those shown); steps in an
        // unrecognised/typo stage are hidden and must not inflate the total.
        const STAGE_SET = new Set(STAGE_ORDER);
        const countableSteps = onboardingSteps.filter(s => STAGE_SET.has(s.stage || 'Getting Started'));
        const totalSteps = countableSteps.length;
        const completedSteps = countableSteps.filter(s => onboardingCompletedIds.has(s.id)).length;
        const progressPct = totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0;
        const allDone = completedSteps === totalSteps;

        return (
          <Accordion type="single" collapsible className="w-full">
            <AccordionItem value="onboarding-steps" className="border-2 border-primary/20 rounded-lg bg-card">
              <AccordionTrigger className="px-6 py-4 hover:no-underline">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <ListChecks className="h-5 w-5 text-primary flex-shrink-0" />
                  <span className="text-lg font-semibold">Onboarding Progress</span>
                  <StatusPill tone={allDone ? "success" : completedSteps > 0 ? "warning" : "neutral"}>
                    {allDone ? "Complete" : `${completedSteps} / ${totalSteps} steps`}
                  </StatusPill>
                </div>
              </AccordionTrigger>
              <AccordionContent className="px-6 pb-6">
                {/* Overall progress bar */}
                <div className="mb-6">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-muted-foreground">Overall completion</span>
                    <span className="text-sm font-semibold text-primary">{progressPct}%</span>
                  </div>
                  <Progress value={progressPct} className="h-2.5" />
                  {allDone && (
                    <p className="text-sm text-green-600 font-medium mt-2 flex items-center gap-1.5">
                      <CheckCircle2 className="h-4 w-4" /> All onboarding steps complete!
                    </p>
                  )}
                </div>

                {/* Stages */}
                <div className="space-y-5">
                  {stages.map(stageName => {
                    const stageSteps = stepsByStage[stageName];
                    const stageDone = stageSteps.filter(s => onboardingCompletedIds.has(s.id)).length;
                    const stageTotal = stageSteps.length;
                    const stageComplete = stageDone === stageTotal;

                    return (
                      <div key={stageName}>
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="text-sm font-semibold text-foreground">{stageName}</h4>
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                            stageComplete
                              ? "bg-green-100 text-green-700"
                              : "bg-muted text-muted-foreground"
                          }`}>
                            {stageDone}/{stageTotal}
                          </span>
                        </div>
                        <div className="space-y-2">
                          {stageSteps.map(step => {
                            const done = onboardingCompletedIds.has(step.id);
                            return (
                              <div
                                key={step.id}
                                className={`flex items-start gap-3 rounded-lg px-3 py-2.5 ${
                                  done ? "bg-green-50 border border-green-200" : "bg-muted/40 border border-border"
                                }`}
                              >
                                {done
                                  ? <CheckCircle2 className="h-4 w-4 text-green-600 flex-shrink-0 mt-0.5" />
                                  : <Circle className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />}
                                <div className="min-w-0">
                                  <p className={`text-sm font-medium leading-snug ${done ? "text-green-800" : "text-foreground"}`}>
                                    {step.title}
                                  </p>
                                  {step.description && (
                                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                                      {step.description.replace(/(https?:\/\/[^\s]+)/g, '[link]')}
                                    </p>
                                  )}
                                </div>
                                {done && (
                                  <span className="ml-auto flex-shrink-0 text-xs text-green-700 font-medium">Done</span>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        );
      })()}

      {/* Training Matrix (per-staff view) */}
      {trainingItems.length > 0 && (() => {
        const recFor = (id: string) => trainingRecords.find(r => r.training_item_id === id) || null;
        const statusOf = (item: TrainingItem): 'none' | 'valid' | 'due_soon' | 'expired' | 'complete' => {
          const rec = recFor(item.id);
          if (!rec) return 'none';
          if (item.refresh_frequency_months == null) return 'complete';
          const exp = addMonths(parseISO(rec.completed_date), item.refresh_frequency_months);
          const days = differenceInCalendarDays(exp, new Date());
          if (days < 0) return 'expired';
          if (days <= 30) return 'due_soon';
          return 'valid';
        };
        const STATUS_CLASS: Record<string, string> = {
          complete: "bg-green-100 text-green-800 border-green-300",
          valid: "bg-green-100 text-green-800 border-green-300",
          due_soon: "bg-amber-100 text-amber-800 border-amber-300",
          expired: "bg-red-100 text-red-800 border-red-300",
          none: "bg-muted text-muted-foreground border-dashed",
        };
        const total = trainingItems.length;
        const upToDate = trainingItems.filter(it => ['complete', 'valid', 'due_soon'].includes(statusOf(it))).length;
        const expiredCount = trainingItems.filter(it => statusOf(it) === 'expired').length;
        const recordedCount = trainingItems.filter(it => statusOf(it) !== 'none').length;
        const pct = total ? Math.round((upToDate / total) * 100) : 0;
        const trainingTone: StatusTone =
          expiredCount > 0 ? 'danger' : upToDate === total ? 'success' : recordedCount > 0 ? 'warning' : 'neutral';

        const grouped: Record<string, TrainingItem[]> = {};
        trainingItems.forEach(it => {
          const k = it.category || 'Other';
          (grouped[k] ||= []).push(it);
        });
        const cats = [...TRAINING_CATEGORIES, ...Object.keys(grouped).filter(c => !(TRAINING_CATEGORIES as readonly string[]).includes(c) && c !== 'Other'), 'Other']
          .filter(c => grouped[c]?.length);

        return (
          <Accordion type="single" collapsible className="w-full">
            <AccordionItem value="training" className="border-2 border-primary/20 rounded-lg bg-card">
              <AccordionTrigger className="px-6 py-4 hover:no-underline">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <Award className="h-5 w-5 text-primary flex-shrink-0" />
                  <span className="text-lg font-semibold">Training</span>
                  <StatusPill tone={trainingTone}>
                    {expiredCount > 0 ? `${expiredCount} overdue` : `${pct}% up to date`}
                  </StatusPill>
                </div>
              </AccordionTrigger>
              <AccordionContent className="px-6 pb-6">
                <div className="space-y-5">
                  {cats.map(cat => (
                    <div key={cat}>
                      <h4 className="text-sm font-semibold text-foreground mb-2">{cat}</h4>
                      <div className="space-y-2">
                        {grouped[cat].map(item => {
                          const rec = recFor(item.id);
                          const st = statusOf(item);
                          return (
                            <div key={item.id} className="flex items-center justify-between gap-3 rounded-lg border bg-muted/30 px-3 py-2">
                              <span className="text-sm font-medium">{item.name}</span>
                              <span className={cn("flex-shrink-0 rounded border px-2 py-0.5 text-xs font-medium", STATUS_CLASS[st])}>
                                {rec ? format(parseISO(rec.completed_date), "d MMM yyyy") : "Not recorded"}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        );
      })()}

      {/* Clients — scheduled over the next 4 weeks */}
      <Accordion type="single" collapsible className="w-full">
        <AccordionItem value="clients" className="border-2 border-primary/20 rounded-lg bg-card">
          <AccordionTrigger className="px-6 py-4 hover:no-underline">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <MapPin className="h-5 w-5 text-primary flex-shrink-0" />
              <span className="text-lg font-semibold">Clients</span>
              <StatusPill tone={scheduleClients.length > 0 ? 'success' : 'neutral'}>
                {scheduleClients.length} in next 4 weeks
              </StatusPill>
            </div>
          </AccordionTrigger>
          <AccordionContent className="px-6 pb-6">
            <p className="text-sm text-muted-foreground mb-3">
              Clients this team member is scheduled to work with over the next 4 weeks, from their recurring shifts.
            </p>
            {scheduleClients.length === 0 ? (
              <p className="text-sm text-muted-foreground">No scheduled client shifts in the next 4 weeks.</p>
            ) : (
              <div className="grid gap-2">
                {scheduleClients.map(name => (
                  <div key={name} className="flex items-center justify-between gap-3 rounded-lg border bg-muted/30 px-3 py-2.5">
                    <div className="flex items-center gap-2 min-w-0">
                      <Building2 className="h-4 w-4 text-primary flex-shrink-0" />
                      <span className="text-sm font-medium truncate">{name}</span>
                    </div>
                    <a
                      href={`/public/schedule/${encodeURIComponent(name)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-sm text-primary hover:underline flex-shrink-0"
                    >
                      Public page <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  </div>
                ))}
              </div>
            )}
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      {/* Handover — this person's own clients' in-progress handovers, plus any
          clients they're currently covering for someone else's holiday. Also
          shown when the next leave is marked no-cover-required, to make it
          explicit that no handover is needed. */}
      {(ownHandovers.length > 0 || coveringHandovers.length > 0 || nextHoliday?.noCoverRequired) && (() => {
        const progressTone = (pct: number): StatusTone => pct >= 100 ? 'success' : pct > 0 ? 'warning' : 'neutral';
        const HandoverRow = ({ client, avgProgress, taskCount, latestTarget, subtitle }: HandoverClientSummary & { subtitle?: string }) => (
          <div className="flex items-center justify-between gap-3 rounded-lg border bg-muted/30 px-3 py-2.5">
            <div className="flex items-center gap-2 min-w-0">
              <Building2 className="h-4 w-4 text-primary flex-shrink-0" />
              <div className="min-w-0">
                <span className="text-sm font-medium truncate block">{client}</span>
                {subtitle && <span className="text-xs text-muted-foreground truncate block">{subtitle}</span>}
              </div>
            </div>
            <div className="flex items-center gap-3 flex-shrink-0">
              {taskCount > 0 ? (
                <StatusPill tone={progressTone(avgProgress)}>
                  {avgProgress}% · {taskCount} task{taskCount !== 1 ? 's' : ''}
                  {latestTarget ? ` · due ${format(parseISO(latestTarget), 'd MMM')}` : ''}
                </StatusPill>
              ) : (
                <StatusPill tone="neutral">Not started</StatusPill>
              )}
              <a
                href={`/public/schedule/${encodeURIComponent(client)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
              >
                Open tracker <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </div>
          </div>
        );
        const ownComplete = ownHandovers.length > 0 && ownHandovers.every(h => h.taskCount > 0 && h.avgProgress >= 100);
        const daysUntilLeave = nextHoliday ? differenceInCalendarDays(parseISO(nextHoliday.start_date), new Date()) : null;
        const leaveUrgent = daysUntilLeave !== null && !ownComplete && daysUntilLeave <= 3;
        const overallTone: StatusTone =
          (ownHandovers.length > 0 && !ownComplete) || coveringHandovers.length > 0
            ? (leaveUrgent ? 'danger' : 'warning')
            : 'neutral';
        return (
          <Accordion type="single" collapsible className="w-full">
            <AccordionItem value="handover" className="border-2 border-primary/20 rounded-lg bg-card">
              <AccordionTrigger className="px-6 py-4 hover:no-underline">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <Handshake className="h-5 w-5 text-primary flex-shrink-0" />
                  <span className="text-lg font-semibold">Handover</span>
                  <StatusPill tone={overallTone}>
                    {ownHandovers.length + coveringHandovers.length} relevant
                  </StatusPill>
                </div>
              </AccordionTrigger>
              <AccordionContent className="px-6 pb-6 space-y-4">
                {nextHoliday?.noCoverRequired && (
                  <div className="flex items-center gap-2 rounded-lg border border-success/30 bg-success/10 px-3 py-2.5 text-sm text-success">
                    <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
                    <span>
                      Your leave starting {format(parseISO(nextHoliday.start_date), 'd MMM yyyy')} is marked as{' '}
                      <strong>no cover required</strong> — no handover is needed for it.
                    </span>
                  </div>
                )}
                {coveringHandovers.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-sm font-medium">Covering for someone else</p>
                    <p className="text-xs text-muted-foreground mb-1">
                      Reach out to the person you're covering and open each client's handover tracker below.
                    </p>
                    <div className="grid gap-2">
                      {coveringHandovers.map(h => (
                        <HandoverRow key={`${h.coveredName}-${h.client}`} {...h} subtitle={`Covering ${h.coveredName}`} />
                      ))}
                    </div>
                  </div>
                )}
                {ownHandovers.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-sm font-medium">Before your leave</p>
                    <p className={cn(
                      "text-xs mb-1",
                      leaveUrgent ? "text-destructive font-medium" : "text-muted-foreground"
                    )}>
                      {ownHandovers.length > 1 && (
                        <span className="block font-medium">
                          You work with {ownHandovers.length} clients — each one needs its own handover.
                        </span>
                      )}
                      {nextHoliday && daysUntilLeave !== null
                        ? ownComplete
                          ? `Your handover${ownHandovers.length > 1 ? 's are' : ' is'} complete for your leave starting ${format(parseISO(nextHoliday.start_date), 'd MMM yyyy')}.`
                          : daysUntilLeave >= 0
                            ? `${ownHandovers.length > 1 ? 'All handovers' : 'Handover'} must be completed before your leave starts on ${format(parseISO(nextHoliday.start_date), 'd MMM yyyy')} (${daysUntilLeave} day${daysUntilLeave !== 1 ? 's' : ''} left).`
                            : `Your leave has already started and handover is not yet complete.`
                        : "Handover status for the clients you're scheduled for."}
                    </p>
                    <div className="grid gap-2">
                      {ownHandovers.map(h => (
                        <HandoverRow key={h.client} {...h} />
                      ))}
                    </div>
                  </div>
                )}
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        );
      })()}

      {/* Personal Details Section - from onboarding form */}
      {onboardingData && <Accordion type="single" collapsible className="w-full">
          <AccordionItem value="personal-details" className="border-2 border-primary/20 rounded-lg bg-card">
            <AccordionTrigger className="px-6 py-4 hover:no-underline">
              <div className="flex items-center gap-2">
                <User className="h-5 w-5 text-primary" />
                <span className="text-lg font-semibold">Personal Details</span>
                <StatusPill tone={onboardingData.form_status === 'complete' ? 'success' : 'warning'}>
                  {onboardingData.form_status === 'complete' ? 'Complete' : 'In progress'}
                </StatusPill>
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
                    {/* Photograph */}
                    {onboardingData.photograph_path ? (
                      <button
                        type="button"
                        onClick={() => setDocumentPreview({
                          open: true,
                          filePath: onboardingData.photograph_path!,
                          documentType: 'Staff Photograph',
                          documentLabel: 'Photograph'
                        })}
                        className="border border-green-200 bg-green-50 dark:bg-green-950/20 dark:border-green-800 rounded-lg p-4 space-y-2 text-left hover:border-green-400 hover:bg-green-100 dark:hover:bg-green-950/30 transition-colors cursor-pointer"
                      >
                        <p className="text-xs text-muted-foreground">Photograph</p>
                        <p className="font-medium text-sm">Staff photograph</p>
                        <div className="h-20 flex items-center justify-center bg-green-100 dark:bg-green-900/30 rounded">
                          <div className="flex flex-col items-center gap-1">
                            <Eye className="h-6 w-6 text-green-600 dark:text-green-400" />
                            <span className="text-xs font-medium text-green-600 dark:text-green-400">Click to view</span>
                          </div>
                        </div>
                      </button>
                    ) : (
                      <div className="border border-dashed border-muted-foreground/30 rounded-lg p-4 space-y-2 opacity-60">
                        <p className="text-xs text-muted-foreground">Photograph</p>
                        <p className="font-medium text-sm text-muted-foreground">Staff photograph</p>
                        <div className="h-20 flex items-center justify-center bg-muted/30 rounded">
                          <p className="text-xs text-muted-foreground">No document uploaded</p>
                        </div>
                      </div>
                    )}

                    {/* ID Document 1 */}
                    {onboardingData.proof_of_id_1_path ? (
                      <button
                        type="button"
                        onClick={() => setDocumentPreview({
                          open: true,
                          filePath: onboardingData.proof_of_id_1_path!,
                          documentType: onboardingData.proof_of_id_1_type || 'ID Document',
                          documentLabel: 'ID Document 1'
                        })}
                        className="border border-green-200 bg-green-50 dark:bg-green-950/20 dark:border-green-800 rounded-lg p-4 space-y-2 text-left hover:border-green-400 hover:bg-green-100 dark:hover:bg-green-950/30 transition-colors cursor-pointer"
                      >
                        <p className="text-xs text-muted-foreground">ID Document 1</p>
                        <p className="font-medium text-sm">{onboardingData.proof_of_id_1_type || 'ID Document'}</p>
                        <div className="h-20 flex items-center justify-center bg-green-100 dark:bg-green-900/30 rounded">
                          <div className="flex flex-col items-center gap-1">
                            <Eye className="h-6 w-6 text-green-600 dark:text-green-400" />
                            <span className="text-xs font-medium text-green-600 dark:text-green-400">Click to view</span>
                          </div>
                        </div>
                      </button>
                    ) : (
                      <div className="border border-dashed border-muted-foreground/30 rounded-lg p-4 space-y-2 opacity-60">
                        <p className="text-xs text-muted-foreground">ID Document 1</p>
                        <p className="font-medium text-sm text-muted-foreground">Not provided</p>
                        <div className="h-20 flex items-center justify-center bg-muted/30 rounded">
                          <p className="text-xs text-muted-foreground">No document uploaded</p>
                        </div>
                      </div>
                    )}

                    {/* ID Document 2 */}
                    {onboardingData.proof_of_id_2_path ? (
                      <button
                        type="button"
                        onClick={() => setDocumentPreview({
                          open: true,
                          filePath: onboardingData.proof_of_id_2_path!,
                          documentType: onboardingData.proof_of_id_2_type || 'ID Document',
                          documentLabel: 'ID Document 2'
                        })}
                        className="border border-green-200 bg-green-50 dark:bg-green-950/20 dark:border-green-800 rounded-lg p-4 space-y-2 text-left hover:border-green-400 hover:bg-green-100 dark:hover:bg-green-950/30 transition-colors cursor-pointer"
                      >
                        <p className="text-xs text-muted-foreground">ID Document 2</p>
                        <p className="font-medium text-sm">{onboardingData.proof_of_id_2_type || 'ID Document'}</p>
                        <div className="h-20 flex items-center justify-center bg-green-100 dark:bg-green-900/30 rounded">
                          <div className="flex flex-col items-center gap-1">
                            <Eye className="h-6 w-6 text-green-600 dark:text-green-400" />
                            <span className="text-xs font-medium text-green-600 dark:text-green-400">Click to view</span>
                          </div>
                        </div>
                      </button>
                    ) : (
                      <div className="border border-dashed border-muted-foreground/30 rounded-lg p-4 space-y-2 opacity-60">
                        <p className="text-xs text-muted-foreground">ID Document 2</p>
                        <p className="font-medium text-sm text-muted-foreground">Not provided</p>
                        <div className="h-20 flex items-center justify-center bg-muted/30 rounded">
                          <p className="text-xs text-muted-foreground">No document uploaded</p>
                        </div>
                      </div>
                    )}

                    {/* Proof of Address */}
                    {onboardingData.proof_of_address_path ? (
                      <button
                        type="button"
                        onClick={() => setDocumentPreview({
                          open: true,
                          filePath: onboardingData.proof_of_address_path!,
                          documentType: onboardingData.proof_of_address_type || 'Address Document',
                          documentLabel: 'Proof of Address'
                        })}
                        className="border border-green-200 bg-green-50 dark:bg-green-950/20 dark:border-green-800 rounded-lg p-4 space-y-2 text-left hover:border-green-400 hover:bg-green-100 dark:hover:bg-green-950/30 transition-colors cursor-pointer"
                      >
                        <p className="text-xs text-muted-foreground">Proof of Address</p>
                        <p className="font-medium text-sm">{onboardingData.proof_of_address_type || 'Address document'}</p>
                        <div className="h-20 flex items-center justify-center bg-green-100 dark:bg-green-900/30 rounded">
                          <div className="flex flex-col items-center gap-1">
                            <Eye className="h-6 w-6 text-green-600 dark:text-green-400" />
                            <span className="text-xs font-medium text-green-600 dark:text-green-400">Click to view</span>
                          </div>
                        </div>
                      </button>
                    ) : (
                      <div className="border border-dashed border-muted-foreground/30 rounded-lg p-4 space-y-2 opacity-60">
                        <p className="text-xs text-muted-foreground">Proof of Address</p>
                        <p className="font-medium text-sm text-muted-foreground">Not provided</p>
                        <div className="h-20 flex items-center justify-center bg-muted/30 rounded">
                          <p className="text-xs text-muted-foreground">No document uploaded</p>
                        </div>
                      </div>
                    )}
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
          <AccordionItem value="pay-forecast" className="border-2 border-primary/20 rounded-lg bg-card">
            <AccordionTrigger className="px-6 py-4 hover:no-underline">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-primary" />
                <span className="text-lg font-semibold">12-Month Pay Forecast</span>
                {(() => {
                  const nowKey = format(new Date(), 'yyyy-MM');
                  const current = monthlyPreviews.find(p => format(p.month, 'yyyy-MM') === nowKey) || monthlyPreviews[0];
                  const st = current?.payrollStatus;
                  const tone: StatusTone = st === 'paid' ? 'success' : st === 'ready' ? 'warning' : 'neutral';
                  const label = st === 'paid' ? 'Paid this month' : st === 'ready' ? 'Ready to pay' : 'Pending';
                  return <StatusPill tone={tone}>{label}</StatusPill>;
                })()}
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
                  return <Badge variant="outline" className="bg-primary/15 text-primary border-primary">
                              <CheckCircle className="h-3 w-3 mr-1" />
                              Ready
                            </Badge>;
                } else {
                  return <Badge variant="outline" className="bg-muted text-muted-foreground border-muted-foreground">
                              <AlertCircle className="h-3 w-3 mr-1" />
                              Pending
                            </Badge>;
                }
              };
              // Calculate payment date (1 month after the work month, on the 1st)
              const paymentDate = addMonths(preview.month, 1);
              const paymentDateLabel = `${format(paymentDate, 'MMMM')} 1st`;
              
              return <Collapsible key={monthKey} open={isExpanded} onOpenChange={() => toggleMonth(monthKey)}>
                          <CollapsibleTrigger className="w-full">
                            <div className={`flex items-center justify-between p-4 rounded-lg border hover:bg-muted/50 transition-colors ${isCurrentMonth ? 'border-primary bg-primary/5' : ''}`}>
                              <div className="flex items-center gap-3">
                                {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                                <span className="font-medium">{preview.monthLabel} <span className="text-muted-foreground font-normal">(Paid {paymentDateLabel})</span></span>
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
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setInvoiceDialog({
                                      open: true,
                                      month: preview.month,
                                      amount: preview.totalPay,
                                      currency: preview.currency,
                                    });
                                  }}
                                >
                                  <FileBadge className="h-4 w-4 mr-1" />
                                  Generate Invoice
                                </Button>
                              </div>
                            </div>
                          </CollapsibleTrigger>
                          <CollapsibleContent>
                            <div className="px-4 pb-4 pt-2 ml-7 border-l-2 border-muted">
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                {/* Left column - Breakdown */}
                                <div className="space-y-3">
                                  <div className="py-2 border-b">
                                    <div className="flex justify-between items-center">
                                      <span className="text-muted-foreground">Base Salary</span>
                                      <span className="font-medium">{formatCurrency(preview.monthlyBaseSalary, preview.currency)}</span>
                                    </div>
                                    <div className="text-xs text-muted-foreground/70 mt-1">
                                      Daily rate: {formatCurrency(preview.dailyRate, preview.currency)} (base ÷ 20 working days)
                                    </div>
                                  </div>
                                  
                                  {preview.bonusItems.length > 0 && preview.bonusItems.map((item, idx) => (
                                    <div key={`b-${idx}`} className="py-2 border-b">
                                      <div className="flex justify-between items-center">
                                        <span className="text-muted-foreground flex items-center gap-2">
                                          {item.recurring ? 'Recurring Bonus' : 'Bonus'}
                                          {item.description && (
                                            <span className="text-xs italic text-muted-foreground/80">— {item.description}</span>
                                          )}
                                        </span>
                                        <span className="font-medium text-success">+{formatCurrency(item.amount, preview.currency)}</span>
                                      </div>
                                    </div>
                                  ))}
                                  
                                  {preview.overtimePay > 0 && <div className="py-2 border-b">
                                      <div className="flex justify-between items-center">
                                        <span className="text-muted-foreground">Overtime Pay ({preview.overtimeDays} days)</span>
                                        <span className="font-medium text-success">+{formatCurrency(preview.overtimePay, preview.currency)}</span>
                                      </div>
                                      <div className="text-xs text-muted-foreground/70 mt-1">
                                        Outside hours: 1.5 × daily rate · Inside hours: 0.5 × daily rate (premium only)
                                      </div>
                                      {preview.overtimeShifts.length > 0 && (
                                        <div className="mt-2 ml-4 space-y-1">
                                          {preview.overtimeShifts.map((shift, idx) => (
                                            <div key={idx} className="flex items-center gap-2 text-xs text-muted-foreground">
                                              <span>{format(parseISO(shift.date), 'EEE d MMM')}</span>
                                              <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                                                {shift.subtype === 'standard' ? 'Outside (1.5×)' : 'Inside (0.5×)'}
                                              </Badge>
                                              <span className="text-muted-foreground/60">{shift.source === 'request' ? 'Cover' : 'Pattern'}</span>
                                            </div>
                                          ))}
                                        </div>
                                      )}
                                    </div>}
                                  
                                  {preview.holidayOvertimeBonus > 0 && <div className="py-2 border-b">
                                      <div className="flex justify-between items-center">
                                        <span className="text-muted-foreground">Public Holiday Overtime ({preview.holidayOvertimeDays} days)</span>
                                        <span className="font-medium text-amber-600">+{formatCurrency(preview.holidayOvertimeBonus, preview.currency)}</span>
                                      </div>
                                      <div className="text-xs text-muted-foreground/70 mt-1">
                                        {preview.holidayOvertimeDays} × {formatCurrency(preview.dailyRate, preview.currency)} × 0.5 (premium only — base day already in salary)
                                      </div>
                                    </div>}
                                  
                                  {preview.unusedHolidayPayout > 0 && <div className="py-2 border-b">
                                      <div className="flex justify-between items-center">
                                        <span className="text-muted-foreground">Unused Holiday Payout ({preview.unusedHolidayDays.toFixed(1)} days)</span>
                                        <span className="font-medium text-success">+{formatCurrency(preview.unusedHolidayPayout, preview.currency)}</span>
                                      </div>
                                      {preview.holidayAccrualBreakdown && <div className="text-xs text-muted-foreground/70 mt-1">
                                        Accrued {preview.holidayAccrualBreakdown.accruedAllowance.toFixed(1)} days
                                        {' '}({preview.holidayAccrualBreakdown.monthsWorkedInYear} months worked × {preview.holidayAccrualBreakdown.annualAllowance} days/year)
                                        {' '}− {preview.holidayAccrualBreakdown.daysTakenInYear} taken = {preview.unusedHolidayDays.toFixed(1)} unused
                                      </div>}
                                      <div className="text-xs text-muted-foreground/70 mt-1">
                                        {preview.unusedHolidayDays.toFixed(1)} × ({formatCurrency(preview.monthlyBaseSalary, preview.currency)} ÷ 20) — end-of-holiday-year payout
                                      </div>
                                    </div>}
                                  
                                  {preview.excessHolidayDeduction > 0 && <div className="py-2 border-b">
                                      <div className="flex justify-between items-center">
                                        <span className="text-muted-foreground">Excess Holiday Deduction ({preview.excessHolidayDays.toFixed(1)} days over allowance)</span>
                                        <span className="font-medium text-destructive">-{formatCurrency(preview.excessHolidayDeduction, preview.currency)}</span>
                                      </div>
                                      <div className="text-xs text-muted-foreground/70 mt-1">
                                        {preview.excessHolidayDays.toFixed(1)} × ({formatCurrency(preview.monthlyBaseSalary, preview.currency)} ÷ 20)
                                      </div>
                                    </div>}
                                  
                                  {preview.unpaidHolidayDeduction > 0 && <div className="py-2 border-b">
                                      <div className="flex justify-between items-center">
                                        <span className="text-muted-foreground">Unpaid Holiday ({preview.unpaidHolidayDays} days)</span>
                                        <span className="font-medium text-destructive">-{formatCurrency(preview.unpaidHolidayDeduction, preview.currency)}</span>
                                      </div>
                                      <div className="text-xs text-muted-foreground/70 mt-1">
                                        {preview.unpaidHolidayDays} × ({formatCurrency(preview.monthlyBaseSalary, preview.currency)} ÷ 20)
                                      </div>
                                    </div>}
                                  
                                  {preview.proRataDeduction > 0 && <div className="py-2 border-b">
                                      <div className="flex justify-between items-center">
                                        <span className="text-muted-foreground">Pro-Rata Deduction ({preview.proRataWorkingDays}/{preview.proRataTotalWorkingDays} days worked)</span>
                                        <span className="font-medium text-destructive">-{formatCurrency(preview.proRataDeduction, preview.currency)}</span>
                                      </div>
                                      <div className="text-xs text-muted-foreground/70 mt-1">
                                        ({preview.proRataTotalWorkingDays - preview.proRataWorkingDays} days not worked) × ({formatCurrency(preview.monthlyBaseSalary, preview.currency)} ÷ {preview.proRataTotalWorkingDays})
                                      </div>
                                    </div>}

                                  {preview.deductionItems.length > 0 && preview.deductionItems.map((item, idx) => (
                                    <div key={`d-${idx}`} className="py-2 border-b">
                                      <div className="flex justify-between items-center">
                                        <span className="text-muted-foreground flex items-center gap-2">
                                          Deduction
                                          {item.description && (
                                            <span className="text-xs italic text-muted-foreground/80">— {item.description}</span>
                                          )}
                                        </span>
                                        <span className="font-medium text-destructive">-{formatCurrency(item.amount, preview.currency)}</span>
                                      </div>
                                    </div>
                                  ))}
                                  
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

      {/* Contractor / Invoicing Details Section */}
      {selectedUserId && (
        <Accordion type="single" collapsible className="w-full">
          <AccordionItem value="contractor-details" className="border-2 border-primary/20 rounded-lg bg-card">
            <AccordionTrigger className="px-6 py-4 hover:no-underline">
              <div className="flex items-center gap-2">
                <Building2 className="h-5 w-5 text-primary" />
                <span className="text-lg font-semibold">Contractor / Invoicing Details</span>
                <StatusPill tone={hasContractorDetails ? 'success' : 'neutral'}>
                  {hasContractorDetails ? 'On file' : 'Not set'}
                </StatusPill>
              </div>
            </AccordionTrigger>
            <AccordionContent className="px-6 pb-4">
              <ContractorInvoiceDetailsForm
                userId={selectedUserId}
                defaultContactName={allStaff.find(s => s.user_id === selectedUserId)?.display_name || undefined}
                defaultEmail={allStaff.find(s => s.user_id === selectedUserId)?.email || undefined}
              />
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      )}

      {/* My Requests Section */}
      <Accordion type="single" collapsible className="w-full">
        <AccordionItem value="my-requests" className="border-2 border-primary/20 rounded-lg bg-card">
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
                const exceptionSet = new Set(
                  patternExceptions.map(e => `${e.pattern_id}:${e.exception_date}`)
                );
                while (currentDate <= endDate) {
                  const dayOfWeek = currentDate.getDay();
                  const currentDateStr = format(currentDate, 'yyyy-MM-dd');
                  recurringPatterns.forEach(pattern => {
                    const patternStart = new Date(pattern.start_date);
                    const patternEnd = pattern.end_date ? new Date(pattern.end_date) : null;
                    if (currentDate < patternStart) return;
                    if (patternEnd && currentDate > patternEnd) return;
                    if (!pattern.days_of_week.includes(dayOfWeek)) return;
                    // Honor recurrence interval (weekly/biweekly/monthly)
                    const interval = (pattern as any).recurrence_interval || 'weekly';
                    if (interval !== 'weekly') {
                      const diffDays = Math.floor((currentDate.getTime() - patternStart.getTime()) / (1000 * 60 * 60 * 24));
                      const diffWeeks = Math.floor(diffDays / 7);
                      if (interval === 'biweekly' && diffWeeks % 2 !== 0) return;
                      if (interval === 'monthly' && diffWeeks % 4 !== 0) return;
                    }
                    // Skip exceptions (cancelled shifts)
                    if (exceptionSet.has(`${pattern.id}:${currentDateStr}`)) return;
                    const startTime = pattern.start_time.substring(0, 5);
                    const endTime = pattern.end_time.substring(0, 5);
                    const shiftTime = `${startTime} - ${endTime}`;
                    result.push({
                      date: new Date(currentDate),
                      shiftTime
                    });
                  });
                  currentDate.setDate(currentDate.getDate() + 1);
                }

                // Sort by date
                result.sort((a, b) => a.date.getTime() - b.date.getTime());
                return result;
              };
              const dayBreakdown = getDayByDayBreakdown();
              // Count unique calendar days (multiple shifts on same day = 1 working day)
              const uniqueWorkingDays = new Set(dayBreakdown.map(d => format(d.date, 'yyyy-MM-dd'))).size;
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
                                {request.details?.includes('Imported from historical records')
                                  ? request.days_requested > 0 && ` (${request.days_requested} day${request.days_requested !== 1 ? 's' : ''})`
                                  : uniqueWorkingDays > 0 
                                    ? ` (${uniqueWorkingDays} working day${uniqueWorkingDays !== 1 ? 's' : ''})`
                                    : request.days_requested > 0 && ` (${request.days_requested} day${request.days_requested !== 1 ? 's' : ''})`
                                }
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
                                {request.details?.includes('Imported from historical records')
                                  ? request.days_requested > 0 && ` (${request.days_requested} day${request.days_requested !== 1 ? 's' : ''})`
                                  : uniqueWorkingDays > 0 
                                    ? ` (${uniqueWorkingDays} working day${uniqueWorkingDays !== 1 ? 's' : ''})`
                                    : request.days_requested > 0 && ` (${request.days_requested} day${request.days_requested !== 1 ? 's' : ''})`
                                }
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

      {/* Invoice Generator Dialog */}
      {invoiceDialog && selectedUserId && (
        <InvoiceGeneratorDialog
          open={invoiceDialog.open}
          onOpenChange={(open) => setInvoiceDialog(prev => prev ? { ...prev, open } : null)}
          staffUserId={selectedUserId}
          staffName={allStaff.find(s => s.user_id === selectedUserId)?.display_name || undefined}
          staffEmail={allStaff.find(s => s.user_id === selectedUserId)?.email || undefined}
          month={invoiceDialog.month}
          defaultAmount={invoiceDialog.amount}
          defaultCurrency={invoiceDialog.currency}
        />
      )}
    </div>;
}