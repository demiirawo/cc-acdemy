import { useState, useEffect, useMemo } from "react";
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
import { Plus, DollarSign, TrendingUp, TrendingDown, Calendar, ChevronLeft, ChevronRight, Calculator, FileText, RefreshCw, Edit2, CheckCircle, Clock, RotateCcw, Sparkles } from "lucide-react";
import { format, startOfMonth, endOfMonth, addMonths, subMonths, parseISO } from "date-fns";

// Nigerian Public Holidays for 2025
const NIGERIAN_PUBLIC_HOLIDAYS_2025 = [
  { date: "2025-01-01", name: "New Year's Day" },
  { date: "2025-03-30", name: "Eid-el-Fitr (Estimated)" },
  { date: "2025-03-31", name: "Eid-el-Fitr Holiday (Estimated)" },
  { date: "2025-04-18", name: "Good Friday" },
  { date: "2025-04-21", name: "Easter Monday" },
  { date: "2025-05-01", name: "Workers' Day" },
  { date: "2025-05-27", name: "Children's Day" },
  { date: "2025-06-06", name: "Eid-el-Kabir (Estimated)" },
  { date: "2025-06-07", name: "Eid-el-Kabir Holiday (Estimated)" },
  { date: "2025-06-12", name: "Democracy Day" },
  { date: "2025-09-05", name: "Eid-el-Maulud (Estimated)" },
  { date: "2025-10-01", name: "Independence Day" },
  { date: "2025-12-25", name: "Christmas Day" },
  { date: "2025-12-26", name: "Boxing Day" },
];

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

interface AdjustmentEditState {
  staffId: string;
  staffName: string;
  currency: string;
  bonusAmount: number;
  bonusComment: string;
  deductionAmount: number;
  deductionComment: string;
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
  }, []);

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
      
      // Sum additions and deductions from records
      const salaryRecords = userRecords.filter(r => r.record_type === 'salary');
      const bonusRecords = userRecords.filter(r => r.record_type === 'bonus');
      const overtimeRecords = userRecords.filter(r => r.record_type === 'overtime');
      const expenseRecords = userRecords.filter(r => r.record_type === 'expense');
      const deductionRecords = userRecords.filter(r => r.record_type === 'deduction');
      
      const salaryPaid = salaryRecords.reduce((sum, r) => sum + r.amount, 0);
      const bonuses = bonusRecords.reduce((sum, r) => sum + r.amount, 0);
      const overtime = overtimeRecords.reduce((sum, r) => sum + r.amount, 0);
      const expenses = expenseRecords.reduce((sum, r) => sum + r.amount, 0);
      const deductions = deductionRecords.reduce((sum, r) => sum + r.amount, 0);
      
      const totalPay = monthlyBaseSalary + bonuses + overtime + expenses - deductions;
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
        expenses,
        deductions,
        totalPay,
        totalPayInGBP,
        hasSalaryRecord,
        records: userRecords
      };
    });
  }, [hrProfiles, userProfiles, monthRecords, exchangeRates, manualRates]);

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
    
    setAdjustmentEdit({
      staffId: staff.userId,
      staffName: staff.displayName,
      currency: staff.currency,
      bonusAmount: staff.bonuses,
      bonusComment: bonusRecord?.description || '',
      deductionAmount: staff.deductions,
      deductionComment: deductionRecord?.description || ''
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

      // Handle bonus changes
      const existingBonusRecord = staff.records.find(r => r.record_type === 'bonus');
      
      if (adjustmentEdit.bonusAmount > 0) {
        if (existingBonusRecord) {
          const { error } = await supabase
            .from('staff_pay_records')
            .update({
              amount: adjustmentEdit.bonusAmount,
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
              amount: adjustmentEdit.bonusAmount,
              currency: staff.currency,
              description: adjustmentEdit.bonusComment || null,
              pay_date: payDate,
              pay_period_start: payPeriodStart,
              pay_period_end: payPeriodEnd,
              created_by: user?.id!
            });
          if (error) throw error;
        }
      } else if (existingBonusRecord && adjustmentEdit.bonusAmount === 0) {
        const { error } = await supabase
          .from('staff_pay_records')
          .delete()
          .eq('id', existingBonusRecord.id);
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

      toast({ title: "Success", description: "Adjustments saved" });
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
                  <span className="font-medium">Nigerian Public Holidays 2025</span>
                  <Badge variant="secondary" className="ml-2">1.5x Overtime Rate</Badge>
                </div>
              </AccordionTrigger>
              <AccordionContent className="pt-4">
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    Staff working on any of these public holidays are entitled to overtime pay at <strong>1.5× their usual hourly rate</strong>.
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                    {NIGERIAN_PUBLIC_HOLIDAYS_2025.map((holiday) => {
                      const holidayDate = parseISO(holiday.date);
                      const isPast = holidayDate < new Date();
                      
                      return (
                        <div 
                          key={holiday.date} 
                          className={`flex items-center justify-between p-2 rounded-md border ${
                            isPast ? 'bg-muted/30 text-muted-foreground' : 'bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800'
                          }`}
                        >
                          <span className="text-sm font-medium">{holiday.name}</span>
                          <span className="text-xs text-muted-foreground">
                            {format(holidayDate, 'dd MMM')}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                  <p className="text-xs text-muted-foreground italic">
                    Note: Islamic holiday dates are estimated and may vary based on moon sighting.
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
                
                <TableHead className="text-right">Deductions</TableHead>
                <TableHead className="text-right">Total Pay</TableHead>
                <TableHead className="text-right">GBP Equiv.</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {payrollSummary.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={10} className="text-center py-8 text-muted-foreground">
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
                      <TableCell className="text-right text-success">
                        {staff.overtime > 0 ? `+${formatCurrency(staff.overtime, staff.currency)}` : '-'}
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
              {/* Bonus Section */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-success" />
                  <Label className="text-base font-medium">Bonus</Label>
                </div>
                <div className="space-y-2 pl-6">
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
