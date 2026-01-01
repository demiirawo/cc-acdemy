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
import { Plus, Edit, UserCircle, AlertCircle, CheckCircle2, X, Info } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { calculateHolidayAllowance } from "./StaffHolidaysManager";

interface HRProfile {
  id: string;
  user_id: string;
  employee_id: string | null;
  job_title: string | null;
  department: string | null;
  start_date: string | null;
  base_currency: string;
  base_salary: number | null;
  pay_frequency: string | null;
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

interface ClientAssignment {
  id: string;
  staff_user_id: string;
  client_name: string;
  notes: string | null;
}

interface Client {
  id: string;
  name: string;
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

const PAY_FREQUENCIES = [
  { value: 'weekly', label: 'Weekly' },
  { value: 'bi-weekly', label: 'Bi-Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'annually', label: 'Annually' },
];

export function HRProfileManager() {
  const [hrProfiles, setHRProfiles] = useState<HRProfile[]>([]);
  const [userProfiles, setUserProfiles] = useState<UserProfile[]>([]);
  const [clientAssignments, setClientAssignments] = useState<ClientAssignment[]>([]);
  const [allClients, setAllClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingProfile, setEditingProfile] = useState<HRProfile | null>(null);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [newClientName, setNewClientName] = useState('');
  const [staffClients, setStaffClients] = useState<string[]>([]);
  const [selectedClient, setSelectedClient] = useState<string>('');
  const { toast } = useToast();

  const [formData, setFormData] = useState({
    user_id: '',
    display_name: '',
    employee_id: '',
    job_title: '',
    start_date: '',
    base_currency: 'GBP',
    base_salary: 0,
    pay_frequency: 'monthly',
    annual_holiday_allowance: 28,
    notes: ''
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      // Fetch all user profiles from User Management
      const { data: users, error: usersError } = await supabase
        .from('profiles')
        .select('id, user_id, display_name, email')
        .order('display_name');

      if (usersError) throw usersError;
      setUserProfiles(users || []);

      // Fetch all HR profiles
      const { data: hrData, error: hrError } = await supabase
        .from('hr_profiles')
        .select('*');

      if (hrError) throw hrError;
      setHRProfiles(hrData || []);

      // Fetch all client assignments
      const { data: clientData, error: clientError } = await supabase
        .from('staff_client_assignments')
        .select('*');

      if (clientError) throw clientError;
      setClientAssignments(clientData || []);

      // Fetch all clients from the clients table
      const { data: clientsData, error: clientsError } = await supabase
        .from('clients')
        .select('id, name')
        .order('name');

      if (clientsError) throw clientsError;
      setAllClients(clientsData || []);
    } catch (error) {
      console.error('Error fetching data:', error);
      toast({
        title: "Error",
        description: "Failed to load staff profiles",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  // Get HR profile for a user
  const getHRProfile = (userId: string): HRProfile | undefined => {
    return hrProfiles.find(hr => hr.user_id === userId);
  };

  // Get clients for a user
  const getClientsForUser = (userId: string): string[] => {
    return clientAssignments
      .filter(ca => ca.staff_user_id === userId)
      .map(ca => ca.client_name);
  };

  const handleOpenDialog = (userProfile: UserProfile) => {
    setSelectedUserId(userProfile.user_id);
    const existingHR = getHRProfile(userProfile.user_id);
    const userClients = getClientsForUser(userProfile.user_id);
    setStaffClients(userClients);
    setNewClientName('');
    setSelectedClient('');
    
    if (existingHR) {
      setEditingProfile(existingHR);
      setFormData({
        user_id: existingHR.user_id,
        display_name: userProfile.display_name || '',
        employee_id: existingHR.employee_id || '',
        job_title: existingHR.job_title || '',
        start_date: existingHR.start_date || '',
        base_currency: existingHR.base_currency,
        base_salary: existingHR.base_salary || 0,
        pay_frequency: existingHR.pay_frequency || 'monthly',
        annual_holiday_allowance: existingHR.annual_holiday_allowance || 28,
        notes: existingHR.notes || ''
      });
    } else {
      setEditingProfile(null);
      setFormData({
        user_id: userProfile.user_id,
        display_name: userProfile.display_name || '',
        employee_id: '',
        job_title: '',
        start_date: '',
        base_currency: 'GBP',
        base_salary: 0,
        pay_frequency: 'monthly',
        annual_holiday_allowance: 28,
        notes: ''
      });
    }
    setDialogOpen(true);
  };

  const handleAddClient = async (clientName?: string) => {
    const trimmed = (clientName || newClientName).trim();
    if (!trimmed) return;
    if (staffClients.includes(trimmed)) {
      toast({
        title: "Already assigned",
        description: "This client is already assigned to this staff member",
        variant: "destructive"
      });
      return;
    }
    
    // Check if client exists in database, if not add it
    const existingClient = allClients.find(c => c.name.toLowerCase() === trimmed.toLowerCase());
    if (!existingClient) {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data: newClient, error } = await supabase
            .from('clients')
            .insert({ name: trimmed, created_by: user.id })
            .select()
            .single();
          
          if (!error && newClient) {
            setAllClients([...allClients, newClient]);
          }
        }
      } catch (error) {
        console.error('Error adding client to database:', error);
      }
    }
    
    setStaffClients([...staffClients, trimmed]);
    setNewClientName('');
    setSelectedClient('');
  };

  const handleSelectClient = (clientName: string) => {
    if (clientName && !staffClients.includes(clientName)) {
      setStaffClients([...staffClients, clientName]);
    }
    setSelectedClient('');
  };

  const handleRemoveClient = (clientName: string) => {
    setStaffClients(staffClients.filter(c => c !== clientName));
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
      // Update display name in profiles table
      if (formData.display_name.trim()) {
        const { error: profileUpdateError } = await supabase
          .from('profiles')
          .update({ display_name: formData.display_name.trim() })
          .eq('user_id', formData.user_id);

        if (profileUpdateError) throw profileUpdateError;
      }

      const profileData = {
        user_id: formData.user_id,
        employee_id: formData.employee_id || null,
        job_title: formData.job_title || null,
        department: null, // Keep for backwards compatibility
        start_date: formData.start_date || null,
        base_currency: formData.base_currency,
        base_salary: formData.base_salary || null,
        pay_frequency: formData.pay_frequency || 'monthly',
        annual_holiday_allowance: formData.annual_holiday_allowance,
        notes: formData.notes || null
      };

      if (editingProfile) {
        const { error } = await supabase
          .from('hr_profiles')
          .update(profileData)
          .eq('id', editingProfile.id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('hr_profiles')
          .insert(profileData);

        if (error) throw error;
      }

      // Update client assignments
      // First, delete existing assignments for this user
      const { error: deleteError } = await supabase
        .from('staff_client_assignments')
        .delete()
        .eq('staff_user_id', formData.user_id);

      if (deleteError) throw deleteError;

      // Then insert new assignments
      if (staffClients.length > 0) {
        const assignmentsToInsert = staffClients.map(clientName => ({
          staff_user_id: formData.user_id,
          client_name: clientName
        }));

        const { error: insertError } = await supabase
          .from('staff_client_assignments')
          .insert(assignmentsToInsert);

        if (insertError) throw insertError;
      }

      toast({ title: "Success", description: editingProfile ? "HR profile updated" : "HR profile created" });
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

  // Count stats
  const totalUsers = userProfiles.length;
  const usersWithHR = hrProfiles.length;
  const usersWithoutHR = totalUsers - usersWithHR;

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
        <div>
          <h2 className="text-xl font-semibold">Staff HR Profiles</h2>
          <p className="text-sm text-muted-foreground mt-1">
            {usersWithHR} of {totalUsers} staff members have HR profiles configured
            {usersWithoutHR > 0 && (
              <span className="text-warning"> • {usersWithoutHR} need setup</span>
            )}
          </p>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Staff Member</TableHead>
                <TableHead>HR Status</TableHead>
                <TableHead>Job Title</TableHead>
                <TableHead>Base Salary</TableHead>
                <TableHead>Clients</TableHead>
                <TableHead>Holiday Allowance</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {userProfiles.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    No staff members found. Add users through User Management first.
                  </TableCell>
                </TableRow>
              ) : (
                userProfiles.map(user => {
                  const hrProfile = getHRProfile(user.user_id);
                  const hasHR = !!hrProfile;
                  const userClients = getClientsForUser(user.user_id);
                  
                  return (
                    <TableRow key={user.user_id}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <UserCircle className="h-5 w-5 text-muted-foreground" />
                          <div>
                            <div>{user.display_name || 'No name'}</div>
                            <div className="text-xs text-muted-foreground">{user.email}</div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        {hasHR ? (
                          <Badge variant="outline" className="bg-success/20 text-success border-success">
                            <CheckCircle2 className="h-3 w-3 mr-1" />
                            Configured
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="bg-warning/20 text-warning-foreground border-warning">
                            <AlertCircle className="h-3 w-3 mr-1" />
                            Not Set Up
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>{hrProfile?.job_title || '-'}</TableCell>
                      <TableCell>
                        {hrProfile?.base_salary ? (
                          <span className="font-medium">
                            {CURRENCIES.find(c => c.code === hrProfile.base_currency)?.symbol || '£'}
                            {hrProfile.base_salary.toLocaleString()}
                            <span className="text-xs text-muted-foreground ml-1">
                              /{hrProfile.pay_frequency || 'monthly'}
                            </span>
                          </span>
                        ) : '-'}
                      </TableCell>
                      <TableCell>
                        {userClients.length > 0 ? (
                          <div className="flex flex-wrap gap-1 max-w-[200px]">
                            {userClients.slice(0, 3).map((client, idx) => (
                              <Badge key={idx} variant="secondary" className="text-xs">
                                {client}
                              </Badge>
                            ))}
                            {userClients.length > 3 && (
                              <Badge variant="outline" className="text-xs">
                                +{userClients.length - 3} more
                              </Badge>
                            )}
                          </div>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {hrProfile?.start_date ? (
                          (() => {
                            const allowanceInfo = calculateHolidayAllowance(hrProfile.start_date);
                            return (
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <div className="flex items-center gap-1 cursor-help">
                                      <span>{allowanceInfo.annualAllowance} days</span>
                                      <Badge variant="outline" className="text-xs">
                                        {allowanceInfo.accruedAllowance.toFixed(1)} accrued
                                      </Badge>
                                      <Info className="h-3 w-3 text-muted-foreground" />
                                    </div>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <div className="text-xs space-y-1">
                                      <p><strong>Annual:</strong> {allowanceInfo.annualAllowance} days</p>
                                      <p><strong>Accrued:</strong> {allowanceInfo.accruedAllowance.toFixed(1)} days</p>
                                      {allowanceInfo.yearsEmployed >= 1 ? (
                                        <p className="text-success">18 days (1+ year employed)</p>
                                      ) : (
                                        <p>15 days (first year)</p>
                                      )}
                                      {allowanceInfo.isProRata && (
                                        <p className="text-warning">Pro-rata: started during this holiday year</p>
                                      )}
                                    </div>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            );
                          })()
                        ) : (
                          <span className="text-muted-foreground">15 days (default)</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="sm" onClick={() => handleOpenDialog(user)}>
                          <Edit className="h-4 w-4 mr-1" />
                          {hasHR ? 'Edit' : 'Setup'}
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingProfile ? 'Edit HR Profile' : 'Set Up HR Profile'}
            </DialogTitle>
            <DialogDescription>
              {selectedUserId && userProfiles.find(u => u.user_id === selectedUserId) && (
                <span>
                  Configure HR details for <strong>{userProfiles.find(u => u.user_id === selectedUserId)?.display_name || userProfiles.find(u => u.user_id === selectedUserId)?.email}</strong>
                </span>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">

            <div className="space-y-2">
              <Label>Display Name</Label>
              <Input
                value={formData.display_name}
                onChange={(e) => setFormData({ ...formData, display_name: e.target.value })}
                placeholder="How their name appears in the system"
              />
              <p className="text-xs text-muted-foreground">This is how the staff member's name will appear throughout the system</p>
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

            <div className="space-y-2">
              <Label>Assigned Clients</Label>
              
              {/* Dropdown for existing clients */}
              {allClients.filter(c => !staffClients.includes(c.name)).length > 0 && (
                <Select
                  value={selectedClient}
                  onValueChange={handleSelectClient}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select existing client..." />
                  </SelectTrigger>
                  <SelectContent>
                    {allClients
                      .filter(c => !staffClients.includes(c.name))
                      .map(client => (
                        <SelectItem key={client.id} value={client.name}>
                          {client.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              )}
              
              {/* Input for new clients */}
              <div className="flex gap-2">
                <Input
                  value={newClientName}
                  onChange={(e) => setNewClientName(e.target.value)}
                  placeholder="Or add new client..."
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddClient();
                    }
                  }}
                />
                <Button type="button" variant="secondary" onClick={() => handleAddClient()}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              
              {staffClients.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {staffClients.map((client, idx) => (
                    <Badge key={idx} variant="secondary" className="flex items-center gap-1 pr-1">
                      {client}
                      <button
                        type="button"
                        onClick={() => handleRemoveClient(client)}
                        className="ml-1 rounded-full hover:bg-destructive/20 p-0.5"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
              <p className="text-xs text-muted-foreground mt-1">
                Select from existing clients or type a new name and press Enter
              </p>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Base Salary *</Label>
                <Input
                  type="number"
                  value={formData.base_salary}
                  onChange={(e) => setFormData({ ...formData, base_salary: parseFloat(e.target.value) || 0 })}
                  placeholder="0.00"
                  step="0.01"
                  min="0"
                />
              </div>
              <div className="space-y-2">
                <Label>Currency *</Label>
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
                        {currency.symbol} {currency.code}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Pay Frequency *</Label>
                <Select
                  value={formData.pay_frequency}
                  onValueChange={(value) => setFormData({ ...formData, pay_frequency: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PAY_FREQUENCIES.map(freq => (
                      <SelectItem key={freq.value} value={freq.value}>
                        {freq.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Start Date</Label>
              <Input
                type="date"
                value={formData.start_date}
                onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">
                Holiday allowance is automatically calculated based on start date
              </p>
            </div>

            {formData.start_date && (
              <Card className="bg-muted/50">
                <CardContent className="p-3">
                  <div className="text-sm space-y-1">
                    {(() => {
                      const allowanceInfo = calculateHolidayAllowance(formData.start_date);
                      return (
                        <>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Annual Allowance:</span>
                            <span className="font-medium">{allowanceInfo.annualAllowance} days</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Accrued to date:</span>
                            <span className="font-medium">{allowanceInfo.accruedAllowance} days</span>
                          </div>
                          {allowanceInfo.yearsEmployed >= 1 ? (
                            <p className="text-xs text-success mt-2">
                              ✓ 18 days/year (1+ year employed)
                            </p>
                          ) : (
                            <p className="text-xs text-muted-foreground mt-2">
                              15 days/year (increases to 18 after 1 year)
                            </p>
                          )}
                          {allowanceInfo.isProRata && (
                            <p className="text-xs text-warning mt-1">
                              Pro-rata: employee started during current holiday year (Jun-May)
                            </p>
                          )}
                        </>
                      );
                    })()}
                  </div>
                </CardContent>
              </Card>
            )}

            {!formData.start_date && (
              <p className="text-xs text-muted-foreground">
                No start date set — defaulting to 15 days holiday allowance
              </p>
            )}

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
