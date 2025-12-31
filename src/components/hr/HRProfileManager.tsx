import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Edit, UserCircle } from "lucide-react";

interface HRProfile {
  id: string;
  user_id: string;
  employee_id: string | null;
  job_title: string | null;
  department: string | null;
  start_date: string | null;
  base_currency: string;
  annual_holiday_allowance: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

interface UserProfile {
  id: string;
  user_id: string;
  display_name: string | null;
  email: string | null;
}

const CURRENCIES = [
  { code: 'GBP', name: 'British Pound', symbol: '£' },
  { code: 'USD', name: 'US Dollar', symbol: '$' },
  { code: 'EUR', name: 'Euro', symbol: '€' },
  { code: 'INR', name: 'Indian Rupee', symbol: '₹' },
  { code: 'AED', name: 'UAE Dirham', symbol: 'د.إ' },
  { code: 'AUD', name: 'Australian Dollar', symbol: 'A$' },
  { code: 'CAD', name: 'Canadian Dollar', symbol: 'C$' },
  { code: 'PHP', name: 'Philippine Peso', symbol: '₱' },
  { code: 'ZAR', name: 'South African Rand', symbol: 'R' },
  { code: 'NGN', name: 'Nigerian Naira', symbol: '₦' },
];

export function HRProfileManager() {
  const [profiles, setProfiles] = useState<(HRProfile & { user?: UserProfile })[]>([]);
  const [userProfiles, setUserProfiles] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingProfile, setEditingProfile] = useState<HRProfile | null>(null);
  const { toast } = useToast();

  const [formData, setFormData] = useState({
    user_id: '',
    employee_id: '',
    job_title: '',
    department: '',
    start_date: '',
    base_currency: 'GBP',
    annual_holiday_allowance: 28,
    notes: ''
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      // Fetch all user profiles
      const { data: users, error: usersError } = await supabase
        .from('profiles')
        .select('id, user_id, display_name, email')
        .order('display_name');

      if (usersError) throw usersError;
      setUserProfiles(users || []);

      // Fetch all HR profiles
      const { data: hrProfiles, error: hrError } = await supabase
        .from('hr_profiles')
        .select('*')
        .order('created_at', { ascending: false });

      if (hrError) throw hrError;

      // Merge HR profiles with user info
      const mergedProfiles = (hrProfiles || []).map(hr => ({
        ...hr,
        user: users?.find(u => u.user_id === hr.user_id)
      }));

      setProfiles(mergedProfiles);
    } catch (error) {
      console.error('Error fetching HR profiles:', error);
      toast({
        title: "Error",
        description: "Failed to load HR profiles",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleOpenDialog = (profile?: HRProfile) => {
    if (profile) {
      setEditingProfile(profile);
      setFormData({
        user_id: profile.user_id,
        employee_id: profile.employee_id || '',
        job_title: profile.job_title || '',
        department: profile.department || '',
        start_date: profile.start_date || '',
        base_currency: profile.base_currency,
        annual_holiday_allowance: profile.annual_holiday_allowance || 28,
        notes: profile.notes || ''
      });
    } else {
      setEditingProfile(null);
      setFormData({
        user_id: '',
        employee_id: '',
        job_title: '',
        department: '',
        start_date: '',
        base_currency: 'GBP',
        annual_holiday_allowance: 28,
        notes: ''
      });
    }
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formData.user_id) {
      toast({
        title: "Error",
        description: "Please select a staff member",
        variant: "destructive"
      });
      return;
    }

    try {
      const profileData = {
        user_id: formData.user_id,
        employee_id: formData.employee_id || null,
        job_title: formData.job_title || null,
        department: formData.department || null,
        start_date: formData.start_date || null,
        base_currency: formData.base_currency,
        annual_holiday_allowance: formData.annual_holiday_allowance,
        notes: formData.notes || null
      };

      if (editingProfile) {
        const { error } = await supabase
          .from('hr_profiles')
          .update(profileData)
          .eq('id', editingProfile.id);

        if (error) throw error;
        toast({ title: "Success", description: "HR profile updated" });
      } else {
        const { error } = await supabase
          .from('hr_profiles')
          .insert(profileData);

        if (error) throw error;
        toast({ title: "Success", description: "HR profile created" });
      }

      setDialogOpen(false);
      fetchData();
    } catch (error: any) {
      console.error('Error saving HR profile:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to save HR profile",
        variant: "destructive"
      });
    }
  };

  // Get users without HR profiles for new profile creation
  const usersWithoutHRProfile = userProfiles.filter(
    u => !profiles.some(p => p.user_id === u.user_id)
  );

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
        <h2 className="text-xl font-semibold">Staff HR Profiles</h2>
        <Button onClick={() => handleOpenDialog()}>
          <Plus className="h-4 w-4 mr-2" />
          Add HR Profile
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Staff Member</TableHead>
                <TableHead>Employee ID</TableHead>
                <TableHead>Job Title</TableHead>
                <TableHead>Department</TableHead>
                <TableHead>Currency</TableHead>
                <TableHead>Holiday Allowance</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {profiles.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    No HR profiles found. Click "Add HR Profile" to create one.
                  </TableCell>
                </TableRow>
              ) : (
                profiles.map(profile => (
                  <TableRow key={profile.id}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <UserCircle className="h-5 w-5 text-muted-foreground" />
                        {profile.user?.display_name || profile.user?.email || 'Unknown'}
                      </div>
                    </TableCell>
                    <TableCell>{profile.employee_id || '-'}</TableCell>
                    <TableCell>{profile.job_title || '-'}</TableCell>
                    <TableCell>{profile.department || '-'}</TableCell>
                    <TableCell>{profile.base_currency}</TableCell>
                    <TableCell>{profile.annual_holiday_allowance} days</TableCell>
                    <TableCell>
                      <Button variant="ghost" size="sm" onClick={() => handleOpenDialog(profile)}>
                        <Edit className="h-4 w-4" />
                      </Button>
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
            <DialogTitle>{editingProfile ? 'Edit HR Profile' : 'Create HR Profile'}</DialogTitle>
            <DialogDescription>
              {editingProfile ? 'Update the HR profile details' : 'Create a new HR profile for a staff member'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Staff Member *</Label>
              <Select
                value={formData.user_id}
                onValueChange={(value) => setFormData({ ...formData, user_id: value })}
                disabled={!!editingProfile}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select staff member" />
                </SelectTrigger>
                <SelectContent>
                  {(editingProfile ? userProfiles : usersWithoutHRProfile).map(user => (
                    <SelectItem key={user.user_id} value={user.user_id}>
                      {user.display_name || user.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Employee ID</Label>
                <Input
                  value={formData.employee_id}
                  onChange={(e) => setFormData({ ...formData, employee_id: e.target.value })}
                  placeholder="EMP001"
                />
              </div>
              <div className="space-y-2">
                <Label>Job Title</Label>
                <Input
                  value={formData.job_title}
                  onChange={(e) => setFormData({ ...formData, job_title: e.target.value })}
                  placeholder="Care Assistant"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Department</Label>
                <Input
                  value={formData.department}
                  onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                  placeholder="Operations"
                />
              </div>
              <div className="space-y-2">
                <Label>Start Date</Label>
                <Input
                  type="date"
                  value={formData.start_date}
                  onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Base Currency *</Label>
                <Select
                  value={formData.base_currency}
                  onValueChange={(value) => setFormData({ ...formData, base_currency: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CURRENCIES.map(currency => (
                      <SelectItem key={currency.code} value={currency.code}>
                        {currency.symbol} {currency.code} - {currency.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Annual Holiday Allowance (days)</Label>
                <Input
                  type="number"
                  value={formData.annual_holiday_allowance}
                  onChange={(e) => setFormData({ ...formData, annual_holiday_allowance: parseInt(e.target.value) || 0 })}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder="Additional notes..."
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave}>
              {editingProfile ? 'Update' : 'Create'} Profile
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
