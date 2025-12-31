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
import { Plus, DollarSign, TrendingUp, TrendingDown, Calendar, ChevronLeft, ChevronRight, Calculator, FileText } from "lucide-react";
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

export function StaffPayManager() {
  const [payRecords, setPayRecords] = useState<(PayRecord & { user?: UserProfile })[]>([]);
  const [userProfiles, setUserProfiles] = useState<UserProfile[]>([]);
  const [hrProfiles, setHRProfiles] = useState<HRProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(new Date());
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
  }, []);

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
        hasSalaryRecord,
        records: userRecords
      };
    });
  }, [hrProfiles, userProfiles, monthRecords]);

  // Total payroll for the month
  const totalPayroll = useMemo(() => {
    return payrollSummary.reduce((sum, s) => sum + s.totalPay, 0);
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

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-muted-foreground">Total Payroll</div>
            <div className="text-2xl font-bold">{formatCurrency(totalPayroll, 'GBP')}</div>
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
                <TableHead className="text-right">Expenses</TableHead>
                <TableHead className="text-right">Deductions</TableHead>
                <TableHead className="text-right">Total Pay</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {payrollSummary.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                    No staff with salary configured. Set up HR profiles first.
                  </TableCell>
                </TableRow>
              ) : (
                payrollSummary.map(staff => (
                  <TableRow key={staff.userId}>
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
                    <TableCell className="text-right text-success">
                      {staff.bonuses > 0 ? `+${formatCurrency(staff.bonuses, staff.currency)}` : '-'}
                    </TableCell>
                    <TableCell className="text-right text-success">
                      {staff.overtime > 0 ? `+${formatCurrency(staff.overtime, staff.currency)}` : '-'}
                    </TableCell>
                    <TableCell className="text-right text-success">
                      {staff.expenses > 0 ? `+${formatCurrency(staff.expenses, staff.currency)}` : '-'}
                    </TableCell>
                    <TableCell className="text-right text-destructive">
                      {staff.deductions > 0 ? `-${formatCurrency(staff.deductions, staff.currency)}` : '-'}
                    </TableCell>
                    <TableCell className="text-right font-bold">{formatCurrency(staff.totalPay, staff.currency)}</TableCell>
                    <TableCell>
                      {!staff.hasSalaryRecord && (
                        <Button variant="ghost" size="sm" onClick={() => handleRunPayroll(staff.userId)}>
                          <FileText className="h-4 w-4 mr-1" />
                          Pay
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))
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
