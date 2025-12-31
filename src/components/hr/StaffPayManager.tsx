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
import { Plus, DollarSign, TrendingUp, TrendingDown, Calendar, ChevronLeft, ChevronRight, Calculator, FileText, RefreshCw, Check, X, Edit2, MessageSquare } from "lucide-react";
import { format, startOfMonth, endOfMonth, addMonths, subMonths, parseISO } from "date-fns";

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

interface InlineEditState {
  staffId: string;
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
  const [inlineEdit, setInlineEdit] = useState<InlineEditState | null>(null);
  const [savingInline, setSavingInline] = useState(false);
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

  const handleRunAllPayroll = async () => {
    const staffToProcess = payrollSummary.filter(s => !s.hasSalaryRecord);
    if (staffToProcess.length === 0) {
      toast({ title: "Info", description: "All staff have already been paid this month" });
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

  // Start inline editing for a staff row
  const handleStartInlineEdit = (staff: typeof payrollSummary[0]) => {
    // Get existing bonus/deduction records for this month
    const bonusRecord = staff.records.find(r => r.record_type === 'bonus');
    const deductionRecord = staff.records.find(r => r.record_type === 'deduction');
    
    setInlineEdit({
      staffId: staff.userId,
      bonusAmount: staff.bonuses,
      bonusComment: bonusRecord?.description || '',
      deductionAmount: staff.deductions,
      deductionComment: deductionRecord?.description || ''
    });
  };

  const handleCancelInlineEdit = () => {
    setInlineEdit(null);
  };

  const handleSaveInlineEdit = async () => {
    if (!inlineEdit) return;
    
    const staff = payrollSummary.find(s => s.userId === inlineEdit.staffId);
    if (!staff) return;

    setSavingInline(true);
    
    try {
      const payDate = format(endOfMonth(selectedMonth), 'yyyy-MM-dd');
      const payPeriodStart = format(startOfMonth(selectedMonth), 'yyyy-MM-dd');
      const payPeriodEnd = payDate;

      // Handle bonus changes
      const existingBonusRecord = staff.records.find(r => r.record_type === 'bonus');
      
      if (inlineEdit.bonusAmount > 0) {
        if (existingBonusRecord) {
          // Update existing bonus
          const { error } = await supabase
            .from('staff_pay_records')
            .update({
              amount: inlineEdit.bonusAmount,
              description: inlineEdit.bonusComment || null
            })
            .eq('id', existingBonusRecord.id);
          if (error) throw error;
        } else {
          // Create new bonus
          const { error } = await supabase
            .from('staff_pay_records')
            .insert({
              user_id: inlineEdit.staffId,
              record_type: 'bonus' as any,
              amount: inlineEdit.bonusAmount,
              currency: staff.currency,
              description: inlineEdit.bonusComment || null,
              pay_date: payDate,
              pay_period_start: payPeriodStart,
              pay_period_end: payPeriodEnd,
              created_by: user?.id!
            });
          if (error) throw error;
        }
      } else if (existingBonusRecord && inlineEdit.bonusAmount === 0) {
        // Delete bonus if amount is 0
        const { error } = await supabase
          .from('staff_pay_records')
          .delete()
          .eq('id', existingBonusRecord.id);
        if (error) throw error;
      }

      // Handle deduction changes
      const existingDeductionRecord = staff.records.find(r => r.record_type === 'deduction');
      
      if (inlineEdit.deductionAmount > 0) {
        if (existingDeductionRecord) {
          // Update existing deduction
          const { error } = await supabase
            .from('staff_pay_records')
            .update({
              amount: inlineEdit.deductionAmount,
              description: inlineEdit.deductionComment || null
            })
            .eq('id', existingDeductionRecord.id);
          if (error) throw error;
        } else {
          // Create new deduction
          const { error } = await supabase
            .from('staff_pay_records')
            .insert({
              user_id: inlineEdit.staffId,
              record_type: 'deduction' as any,
              amount: inlineEdit.deductionAmount,
              currency: staff.currency,
              description: inlineEdit.deductionComment || null,
              pay_date: payDate,
              pay_period_start: payPeriodStart,
              pay_period_end: payPeriodEnd,
              created_by: user?.id!
            });
          if (error) throw error;
        }
      } else if (existingDeductionRecord && inlineEdit.deductionAmount === 0) {
        // Delete deduction if amount is 0
        const { error } = await supabase
          .from('staff_pay_records')
          .delete()
          .eq('id', existingDeductionRecord.id);
        if (error) throw error;
      }

      toast({ title: "Success", description: "Adjustments saved" });
      setInlineEdit(null);
      fetchData();
    } catch (error: any) {
      console.error('Error saving inline edit:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to save adjustments",
        variant: "destructive"
      });
    } finally {
      setSavingInline(false);
    }
  };

  const unpaidStaffCount = payrollSummary.filter(s => !s.hasSalaryRecord).length;

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
          {unpaidStaffCount > 0 && (
            <Button onClick={handleRunAllPayroll}>
              <Calculator className="h-4 w-4 mr-2" />
              Run Payroll ({unpaidStaffCount})
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
            <div className="text-sm text-muted-foreground">Pending</div>
            <div className="text-2xl font-bold text-warning">{unpaidStaffCount}</div>
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
                  const isEditing = inlineEdit?.staffId === staff.userId;
                  const bonusRecord = staff.records.find(r => r.record_type === 'bonus');
                  const deductionRecord = staff.records.find(r => r.record_type === 'deduction');
                  
                  return (
                    <TableRow 
                      key={staff.userId} 
                      className={isEditing ? 'bg-muted/50' : 'cursor-pointer hover:bg-muted/30'}
                      onClick={() => !isEditing && handleStartInlineEdit(staff)}
                    >
                      <TableCell className="font-medium">
                        <div>
                          <div>{staff.displayName}</div>
                          <div className="text-xs text-muted-foreground">{staff.email}</div>
                        </div>
                      </TableCell>
                      <TableCell>
                        {staff.hasSalaryRecord ? (
                          <Badge variant="default" className="bg-success">Paid</Badge>
                        ) : (
                          <Badge variant="outline" className="border-warning text-warning-foreground">Pending</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">{formatCurrency(staff.baseSalary, staff.currency)}</TableCell>
                      
                      {/* Bonuses - Editable */}
                      <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                        {isEditing ? (
                          <div className="space-y-1">
                            <Input
                              type="number"
                              value={inlineEdit.bonusAmount || ''}
                              onChange={(e) => setInlineEdit({
                                ...inlineEdit,
                                bonusAmount: parseFloat(e.target.value) || 0
                              })}
                              className="w-24 h-8 text-sm text-right"
                              step="0.01"
                              min="0"
                              placeholder="0.00"
                            />
                            <div className="flex items-center gap-1">
                              <MessageSquare className="h-3 w-3 text-muted-foreground" />
                              <Input
                                type="text"
                                value={inlineEdit.bonusComment}
                                onChange={(e) => setInlineEdit({
                                  ...inlineEdit,
                                  bonusComment: e.target.value
                                })}
                                className="w-full h-7 text-xs"
                                placeholder="Reason for bonus..."
                              />
                            </div>
                          </div>
                        ) : (
                          <div>
                            <div className="text-success">
                              {staff.bonuses > 0 ? `+${formatCurrency(staff.bonuses, staff.currency)}` : '-'}
                            </div>
                            {bonusRecord?.description && (
                              <div className="text-xs text-muted-foreground truncate max-w-[120px]" title={bonusRecord.description}>
                                {bonusRecord.description}
                              </div>
                            )}
                          </div>
                        )}
                      </TableCell>
                      
                      {/* Overtime - Read only (auto calculated) */}
                      <TableCell className="text-right text-success">
                        {staff.overtime > 0 ? `+${formatCurrency(staff.overtime, staff.currency)}` : '-'}
                      </TableCell>
                      
                      {/* Deductions - Editable */}
                      <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                        {isEditing ? (
                          <div className="space-y-1">
                            <Input
                              type="number"
                              value={inlineEdit.deductionAmount || ''}
                              onChange={(e) => setInlineEdit({
                                ...inlineEdit,
                                deductionAmount: parseFloat(e.target.value) || 0
                              })}
                              className="w-24 h-8 text-sm text-right"
                              step="0.01"
                              min="0"
                              placeholder="0.00"
                            />
                            <div className="flex items-center gap-1">
                              <MessageSquare className="h-3 w-3 text-muted-foreground" />
                              <Input
                                type="text"
                                value={inlineEdit.deductionComment}
                                onChange={(e) => setInlineEdit({
                                  ...inlineEdit,
                                  deductionComment: e.target.value
                                })}
                                className="w-full h-7 text-xs"
                                placeholder="Reason for deduction..."
                              />
                            </div>
                          </div>
                        ) : (
                          <div>
                            <div className="text-destructive">
                              {staff.deductions > 0 ? `-${formatCurrency(staff.deductions, staff.currency)}` : '-'}
                            </div>
                            {deductionRecord?.description && (
                              <div className="text-xs text-muted-foreground truncate max-w-[120px]" title={deductionRecord.description}>
                                {deductionRecord.description}
                              </div>
                            )}
                          </div>
                        )}
                      </TableCell>
                      
                      <TableCell className="text-right font-bold">{formatCurrency(staff.totalPay, staff.currency)}</TableCell>
                      <TableCell className="text-right font-medium text-muted-foreground">
                        {staff.currency !== 'GBP' ? `£${staff.totalPayInGBP.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '-'}
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center gap-1">
                          {isEditing ? (
                            <>
                              <Button 
                                variant="ghost" 
                                size="sm" 
                                onClick={handleSaveInlineEdit}
                                disabled={savingInline}
                                className="h-8 w-8 p-0"
                              >
                                <Check className="h-4 w-4 text-success" />
                              </Button>
                              <Button 
                                variant="ghost" 
                                size="sm" 
                                onClick={handleCancelInlineEdit}
                                disabled={savingInline}
                                className="h-8 w-8 p-0"
                              >
                                <X className="h-4 w-4 text-destructive" />
                              </Button>
                            </>
                          ) : (
                            <>
                              <Button 
                                variant="ghost" 
                                size="sm" 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleStartInlineEdit(staff);
                                }}
                                className="h-8 w-8 p-0"
                              >
                                <Edit2 className="h-4 w-4" />
                              </Button>
                              {!staff.hasSalaryRecord && (
                                <Button variant="ghost" size="sm" onClick={() => handleRunPayroll(staff.userId)}>
                                  <FileText className="h-4 w-4 mr-1" />
                                  Pay
                                </Button>
                              )}
                            </>
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
    </div>
  );
}
