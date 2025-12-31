import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Calendar, DollarSign, UserCircle, Briefcase, Clock } from "lucide-react";
import { format } from "date-fns";

interface HRProfile {
  id: string;
  employee_id: string | null;
  job_title: string | null;
  department: string | null;
  start_date: string | null;
  base_currency: string;
  base_salary: number | null;
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
