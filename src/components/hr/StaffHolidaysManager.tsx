import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Plus, Check, X, Calendar } from "lucide-react";
import { format } from "date-fns";

interface Holiday {
  id: string;
  user_id: string;
  absence_type: string;
  start_date: string;
  end_date: string;
  days_taken: number;
  status: string;
  notes: string | null;
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
}

interface UserProfile {
  user_id: string;
  display_name: string | null;
  email: string | null;
}

interface HRProfile {
  user_id: string;
  start_date: string | null;
  annual_holiday_allowance: number | null;
}

// Calculate holiday allowance based on employment length
// 15 days for first year, increases to 18 days after 1+ year of employment
// Pro-rata accrual based on time within the current holiday year (June 1st - May 31st)
export const calculateHolidayAllowance = (startDate: string | null): { 
  annualAllowance: number; 
  accruedAllowance: number; 
  yearsEmployed: number;
  isProRata: boolean;
} => {
  const DEFAULT_ALLOWANCE = 15;
  const INCREASED_ALLOWANCE = 18;
  
  if (!startDate) {
    return { 
      annualAllowance: DEFAULT_ALLOWANCE, 
      accruedAllowance: DEFAULT_ALLOWANCE, 
      yearsEmployed: 0,
      isProRata: false
    };
  }
  
  const start = new Date(startDate);
  const now = new Date();
  const yearsEmployed = (now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24 * 365);
  
  // Determine annual allowance based on years employed
  const annualAllowance = yearsEmployed >= 1 ? INCREASED_ALLOWANCE : DEFAULT_ALLOWANCE;
  
  // Calculate the current holiday year (June 1st - May 31st)
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth(); // 0-indexed, so June = 5
  
  // Holiday year starts on June 1st
  const holidayYearStart = currentMonth >= 5 
    ? new Date(currentYear, 5, 1) // June 1st of current year
    : new Date(currentYear - 1, 5, 1); // June 1st of previous year
  
  const holidayYearEnd = currentMonth >= 5
    ? new Date(currentYear + 1, 4, 31) // May 31st of next year
    : new Date(currentYear, 4, 31); // May 31st of current year
  
  // If employee started before the current holiday year, they get full allowance
  if (start <= holidayYearStart) {
    return { 
      annualAllowance, 
      accruedAllowance: annualAllowance, 
      yearsEmployed,
      isProRata: false
    };
  }
  
  // If employee started during current holiday year, calculate pro-rata
  const totalDaysInYear = Math.ceil((holidayYearEnd.getTime() - holidayYearStart.getTime()) / (1000 * 60 * 60 * 24));
  const daysEmployedInYear = Math.ceil((now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
  
  // Pro-rata calculation: (days employed / total days) * annual allowance
  const proRataFraction = Math.min(daysEmployedInYear / totalDaysInYear, 1);
  const accruedAllowance = Math.round(annualAllowance * proRataFraction * 10) / 10; // Round to 1 decimal
  
  return { 
    annualAllowance, 
    accruedAllowance, 
    yearsEmployed,
    isProRata: true
  };
};

const ABSENCE_TYPES = [
  { value: 'holiday', label: 'Holiday' },
  { value: 'sick', label: 'Sick Leave' },
  { value: 'personal', label: 'Personal Leave' },
  { value: 'maternity', label: 'Maternity Leave' },
  { value: 'paternity', label: 'Paternity Leave' },
  { value: 'unpaid', label: 'Unpaid Leave' },
  { value: 'other', label: 'Other' },
];

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-warning/20 text-warning-foreground border-warning',
  approved: 'bg-success/20 text-success border-success',
  rejected: 'bg-destructive/20 text-destructive border-destructive',
};

export function StaffHolidaysManager() {
  const [holidays, setHolidays] = useState<(Holiday & { user?: UserProfile; hrProfile?: HRProfile })[]>([]);
  const [userProfiles, setUserProfiles] = useState<UserProfile[]>([]);
  const [hrProfiles, setHRProfiles] = useState<HRProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const { toast } = useToast();

  const [formData, setFormData] = useState({
    user_id: '',
    absence_type: 'holiday',
    start_date: '',
    end_date: '',
    days_taken: 1,
    notes: ''
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

      const { data: hrData, error: hrError } = await supabase
        .from('hr_profiles')
        .select('user_id, start_date, annual_holiday_allowance');

      if (hrError) throw hrError;
      setHRProfiles(hrData || []);

      const { data: holidayData, error: holidayError } = await supabase
        .from('staff_holidays')
        .select('*')
        .order('start_date', { ascending: false });

      if (holidayError) throw holidayError;

      const mergedHolidays = (holidayData || []).map(h => ({
        ...h,
        user: users?.find(u => u.user_id === h.user_id),
        hrProfile: hrData?.find(hr => hr.user_id === h.user_id)
      }));

      setHolidays(mergedHolidays);
    } catch (error) {
      console.error('Error fetching holidays:', error);
      toast({
        title: "Error",
        description: "Failed to load holiday data",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleOpenDialog = () => {
    setFormData({
      user_id: '',
      absence_type: 'holiday',
      start_date: '',
      end_date: '',
      days_taken: 1,
      notes: ''
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formData.user_id || !formData.start_date || !formData.end_date) {
      toast({
        title: "Error",
        description: "Please fill in all required fields",
        variant: "destructive"
      });
      return;
    }

    try {
      const { error } = await supabase
        .from('staff_holidays')
        .insert([{
          user_id: formData.user_id,
          absence_type: formData.absence_type as any,
          start_date: formData.start_date,
          end_date: formData.end_date,
          days_taken: formData.days_taken,
          status: 'approved',
          notes: formData.notes || null
        }]);

      if (error) throw error;

      toast({ title: "Success", description: "Holiday/absence recorded" });
      setDialogOpen(false);
      fetchData();
    } catch (error: any) {
      console.error('Error saving holiday:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to save holiday",
        variant: "destructive"
      });
    }
  };

  const handleUpdateStatus = async (id: string, status: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      const { error } = await supabase
        .from('staff_holidays')
        .update({
          status,
          approved_by: user?.id,
          approved_at: new Date().toISOString()
        })
        .eq('id', id);

      if (error) throw error;

      toast({ title: "Success", description: `Holiday ${status}` });
      fetchData();
    } catch (error) {
      console.error('Error updating status:', error);
      toast({
        title: "Error",
        description: "Failed to update status",
        variant: "destructive"
      });
    }
  };

  const calculateDays = () => {
    if (formData.start_date && formData.end_date) {
      const start = new Date(formData.start_date);
      const end = new Date(formData.end_date);
      const diffTime = Math.abs(end.getTime() - start.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
      setFormData(prev => ({ ...prev, days_taken: diffDays }));
    }
  };

  useEffect(() => {
    calculateDays();
  }, [formData.start_date, formData.end_date]);

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
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold">Staff Holidays & Absences</h2>
        <Button onClick={handleOpenDialog}>
          <Plus className="h-4 w-4 mr-2" />
          Record Absence
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Staff Member</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Start Date</TableHead>
                <TableHead>End Date</TableHead>
                <TableHead>Days</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Notes</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {holidays.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                    No holiday/absence records found.
                  </TableCell>
                </TableRow>
              ) : (
                holidays.map(holiday => (
                  <TableRow key={holiday.id}>
                    <TableCell className="font-medium">
                      {holiday.user?.display_name || holiday.user?.email || 'Unknown'}
                    </TableCell>
                    <TableCell className="capitalize">
                      {ABSENCE_TYPES.find(t => t.value === holiday.absence_type)?.label || holiday.absence_type}
                    </TableCell>
                    <TableCell>{format(new Date(holiday.start_date), 'dd MMM yyyy')}</TableCell>
                    <TableCell>{format(new Date(holiday.end_date), 'dd MMM yyyy')}</TableCell>
                    <TableCell>{holiday.days_taken}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={STATUS_COLORS[holiday.status] || ''}>
                        {holiday.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate">{holiday.notes || '-'}</TableCell>
                    <TableCell>
                      {holiday.status === 'pending' && (
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleUpdateStatus(holiday.id, 'approved')}
                            className="text-success hover:text-success"
                          >
                            <Check className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleUpdateStatus(holiday.id, 'rejected')}
                            className="text-destructive hover:text-destructive"
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Record Holiday/Absence</DialogTitle>
            <DialogDescription>
              Record a new holiday or absence for a staff member
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Staff Member *</Label>
              <Select
                value={formData.user_id}
                onValueChange={(value) => setFormData({ ...formData, user_id: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select staff member" />
                </SelectTrigger>
                <SelectContent>
                  {userProfiles.map(user => (
                    <SelectItem key={user.user_id} value={user.user_id}>
                      {user.display_name || user.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Absence Type *</Label>
              <Select
                value={formData.absence_type}
                onValueChange={(value) => setFormData({ ...formData, absence_type: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ABSENCE_TYPES.map(type => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Start Date *</Label>
                <Input
                  type="date"
                  value={formData.start_date}
                  onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>End Date *</Label>
                <Input
                  type="date"
                  value={formData.end_date}
                  onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Days Taken</Label>
              <Input
                type="number"
                value={formData.days_taken}
                onChange={(e) => setFormData({ ...formData, days_taken: parseFloat(e.target.value) || 0 })}
                step="0.5"
              />
              <p className="text-xs text-muted-foreground">Auto-calculated from dates, adjust for half days</p>
            </div>

            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder="Additional notes..."
                rows={2}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave}>Record Absence</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
