import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Edit, UserCircle, AlertCircle, CheckCircle2, X, Info, Users, Trash2, Mail, Eye, BookOpen, TrendingUp, Clock, CheckCircle, Shield } from "lucide-react";
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
  scheduling_role: string;
  created_at: string;
  updated_at: string;
}

const SCHEDULING_ROLES = [
  { value: 'viewer', label: 'Viewer', description: 'Can only view schedules' },
  { value: 'editor', label: 'Editor', description: 'Can make changes to schedules' },
];

interface UserProfile {
  id: string;
  user_id: string;
  display_name: string | null;
  email: string | null;
  role: string | null;
  created_at: string;
  email_confirmed_at?: string | null;
  total_pages_viewed?: number;
  unique_pages_viewed?: number;
  last_page_viewed?: string;
  last_view_date?: string;
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

interface EmailException {
  id: string;
  email: string;
  reason: string | null;
  created_by: string;
  created_at: string;
}

interface PageView {
  page_id: string;
  page_title: string;
  view_count: number;
  last_viewed: string;
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

const APP_ROLES = [
  { value: 'viewer', label: 'Viewer', description: 'Read-only access to knowledge base' },
  { value: 'editor', label: 'Editor', description: 'Can edit pages and content' },
  { value: 'admin', label: 'Admin', description: 'Full administrative access' },
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
  
  // User management state
  const [emailExceptions, setEmailExceptions] = useState<EmailException[]>([]);
  const [newEmail, setNewEmail] = useState('');
  const [newReason, setNewReason] = useState('');
  const [addEmailDialogOpen, setAddEmailDialogOpen] = useState(false);
  const [selectedUserPageViews, setSelectedUserPageViews] = useState<PageView[]>([]);
  const [pageViewsDialogOpen, setPageViewsDialogOpen] = useState(false);
  const [pageViewsLoading, setPageViewsLoading] = useState(false);
  const [selectedProfileForViews, setSelectedProfileForViews] = useState<UserProfile | null>(null);
  
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
    notes: '',
    scheduling_role: 'viewer',
    app_role: 'viewer'
  });

  useEffect(() => {
    fetchData();
    fetchEmailExceptions();

    // Set up real-time listening for profile changes
    const channel = supabase
      .channel('staff-profiles-updates')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'profiles'
        },
        () => {
          fetchData();
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'email_exceptions'
        },
        () => {
          fetchEmailExceptions();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchData = async () => {
    try {
      // First sync missing profiles
      const { error: syncError } = await supabase.rpc('sync_missing_profiles');
      if (syncError) {
        console.error('Sync error:', syncError);
      }

      // Fetch profiles with confirmation status via edge function
      const { data: profilesData, error: profilesError } = await supabase.functions.invoke('get-user-profiles');

      if (profilesError) throw profilesError;

      if (profilesData.success) {
        // For each profile, get page view analytics
        const profilesWithAnalytics = await Promise.all(
          (profilesData.data || []).map(async (profile: UserProfile) => {
            try {
              const { data: viewData } = await supabase
                .from('page_audit_log')
                .select('page_id, created_at')
                .eq('user_id', profile.user_id)
                .eq('operation_type', 'view');

              const totalViews = viewData?.length || 0;
              const uniquePages = new Set(viewData?.map(v => v.page_id) || []).size;
              
              const lastView = viewData?.sort((a, b) => 
                new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
              )[0];

              let lastPageTitle = '';
              if (lastView) {
                const { data: pageData } = await supabase
                  .from('pages')
                  .select('title')
                  .eq('id', lastView.page_id)
                  .single();
                lastPageTitle = pageData?.title || 'Unknown Page';
              }

              return {
                ...profile,
                total_pages_viewed: totalViews,
                unique_pages_viewed: uniquePages,
                last_page_viewed: lastPageTitle,
                last_view_date: lastView?.created_at
              };
            } catch {
              return {
                ...profile,
                total_pages_viewed: 0,
                unique_pages_viewed: 0,
                last_page_viewed: '',
                last_view_date: null
              };
            }
          })
        );

        setUserProfiles(profilesWithAnalytics);
      }

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

  const fetchEmailExceptions = async () => {
    try {
      const { data, error } = await supabase
        .from('email_exceptions')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setEmailExceptions(data || []);
    } catch (error) {
      console.error('Error fetching email exceptions:', error);
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
        notes: existingHR.notes || '',
        scheduling_role: existingHR.scheduling_role || 'viewer',
        app_role: userProfile.role || 'viewer'
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
        notes: '',
        scheduling_role: 'viewer',
        app_role: userProfile.role || 'viewer'
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
      // Update display name and role in profiles table
      const profileUpdate: { display_name?: string; role?: string } = {};
      if (formData.display_name.trim()) {
        profileUpdate.display_name = formData.display_name.trim();
      }
      if (formData.app_role) {
        profileUpdate.role = formData.app_role;
      }
      
      if (Object.keys(profileUpdate).length > 0) {
        const { error: profileUpdateError } = await supabase
          .from('profiles')
          .update(profileUpdate)
          .eq('user_id', formData.user_id);

        if (profileUpdateError) throw profileUpdateError;
      }

      const profileData = {
        user_id: formData.user_id,
        employee_id: formData.employee_id || null,
        job_title: formData.job_title || null,
        department: null,
        start_date: formData.start_date || null,
        base_currency: formData.base_currency,
        base_salary: formData.base_salary || null,
        pay_frequency: formData.pay_frequency || 'monthly',
        annual_holiday_allowance: formData.annual_holiday_allowance,
        notes: formData.notes || null,
        scheduling_role: formData.scheduling_role
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
      const { error: deleteError } = await supabase
        .from('staff_client_assignments')
        .delete()
        .eq('staff_user_id', formData.user_id);

      if (deleteError) throw deleteError;

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

      toast({ title: "Success", description: editingProfile ? "Staff profile updated" : "Staff profile created" });
      setDialogOpen(false);
      fetchData();
    } catch (error: any) {
      console.error('Error saving profile:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to save profile",
        variant: "destructive"
      });
    }
  };

  const deleteUser = async (userId: string) => {
    if (!confirm("Are you sure you want to completely delete this user? This will remove them from the system entirely and cannot be undone.")) {
      return;
    }

    try {
      const { data, error } = await supabase.functions.invoke('delete-user-completely', {
        body: { userId }
      });

      if (error) throw new Error(error.message);

      if (data?.success) {
        toast({
          title: "Success",
          description: data.message || "User deleted successfully"
        });
      } else {
        throw new Error(data?.error || 'Failed to delete user');
      }
    } catch (error: any) {
      console.error('Error deleting user:', error);
      toast({
        title: "Error",
        description: `Failed to delete user: ${error.message}`,
        variant: "destructive"
      });
    }
  };

  const addEmailException = async () => {
    if (!newEmail.trim()) {
      toast({
        title: "Error",
        description: "Email address is required",
        variant: "destructive"
      });
      return;
    }

    try {
      const { error } = await supabase
        .from('email_exceptions')
        .insert({
          email: newEmail.toLowerCase().trim(),
          reason: newReason.trim() || null,
          created_by: (await supabase.auth.getUser()).data.user?.id
        });

      if (error) throw error;

      toast({
        title: "Success",
        description: "Email exception added successfully"
      });

      setNewEmail('');
      setNewReason('');
      setAddEmailDialogOpen(false);
    } catch (error) {
      console.error('Error adding email exception:', error);
      toast({
        title: "Error",
        description: "Failed to add email exception",
        variant: "destructive"
      });
    }
  };

  const deleteEmailException = async (id: string) => {
    try {
      const { error } = await supabase
        .from('email_exceptions')
        .delete()
        .eq('id', id);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Email exception removed successfully"
      });
    } catch (error) {
      console.error('Error deleting email exception:', error);
      toast({
        title: "Error",
        description: "Failed to remove email exception",
        variant: "destructive"
      });
    }
  };

  const fetchUserPageViews = async (userId: string) => {
    setPageViewsLoading(true);
    try {
      const { data: viewData } = await supabase
        .from('page_audit_log')
        .select('page_id, created_at')
        .eq('user_id', userId)
        .eq('operation_type', 'view')
        .order('created_at', { ascending: false });

      if (viewData) {
        const pageViewCounts = viewData.reduce((acc: Record<string, { pageId: string; count: number; lastViewed: string }>, view) => {
          if (acc[view.page_id]) {
            acc[view.page_id].count++;
            if (new Date(view.created_at) > new Date(acc[view.page_id].lastViewed)) {
              acc[view.page_id].lastViewed = view.created_at;
            }
          } else {
            acc[view.page_id] = {
              pageId: view.page_id,
              count: 1,
              lastViewed: view.created_at
            };
          }
          return acc;
        }, {});

        const pageIds = Object.keys(pageViewCounts);
        const { data: pagesData } = await supabase
          .from('pages')
          .select('id, title')
          .in('id', pageIds);

        const pageViews: PageView[] = Object.values(pageViewCounts).map((view) => {
          const page = pagesData?.find(p => p.id === view.pageId);
          return {
            page_id: view.pageId,
            page_title: page?.title || 'Unknown Page',
            view_count: view.count,
            last_viewed: view.lastViewed
          };
        }).sort((a, b) => b.view_count - a.view_count);

        setSelectedUserPageViews(pageViews);
      }
    } catch (error) {
      console.error('Error fetching user page views:', error);
      toast({
        title: "Error",
        description: "Failed to load page views",
        variant: "destructive"
      });
    } finally {
      setPageViewsLoading(false);
    }
  };

  const getRoleBadgeVariant = (role: string | null) => {
    switch (role) {
      case 'admin':
        return 'destructive';
      case 'editor':
        return 'default';
      case 'viewer':
      default:
        return 'secondary';
    }
  };

  const getConfirmationStatus = (emailConfirmedAt: string | null | undefined) => {
    if (emailConfirmedAt) {
      return {
        icon: CheckCircle,
        color: "text-green-600",
        tooltip: "Account confirmed"
      };
    } else {
      return {
        icon: Clock,
        color: "text-amber-600",
        tooltip: "Pending confirmation"
      };
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
          <h2 className="text-xl font-semibold">Staff Profiles</h2>
          <p className="text-sm text-muted-foreground mt-1">
            {usersWithHR} of {totalUsers} staff members have HR profiles configured
            {usersWithoutHR > 0 && (
              <span className="text-warning"> • {usersWithoutHR} need setup</span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Users className="h-5 w-5 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">{totalUsers} users</span>
        </div>
      </div>

      <Tabs defaultValue="staff" className="w-full">
        <TabsList>
          <TabsTrigger value="staff" className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            Staff Members
          </TabsTrigger>
          <TabsTrigger value="exceptions" className="flex items-center gap-2">
            <Mail className="h-4 w-4" />
            Email Exceptions
          </TabsTrigger>
        </TabsList>

        <TabsContent value="staff" className="space-y-4">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Staff Member</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>App Role</TableHead>
                    <TableHead>Job Title</TableHead>
                    <TableHead>Scheduling</TableHead>
                    <TableHead>Clients</TableHead>
                    <TableHead>Activity</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {userProfiles.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                        No staff members found.
                      </TableCell>
                    </TableRow>
                  ) : (
                    userProfiles.map(user => {
                      const hrProfile = getHRProfile(user.user_id);
                      const hasHR = !!hrProfile;
                      const userClients = getClientsForUser(user.user_id);
                      const confirmStatus = getConfirmationStatus(user.email_confirmed_at);
                      const StatusIcon = confirmStatus.icon;
                      
                      return (
                        <TableRow key={user.user_id}>
                          <TableCell className="font-medium">
                            <div className="flex items-center gap-2">
                              <UserCircle className="h-5 w-5 text-muted-foreground" />
                              <div>
                                <div className="flex items-center gap-1">
                                  {user.display_name || 'No name'}
                                  <div title={confirmStatus.tooltip}>
                                    <StatusIcon className={`h-3 w-3 ${confirmStatus.color}`} />
                                  </div>
                                </div>
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
                          <TableCell>
                            <Badge variant={getRoleBadgeVariant(user.role)}>
                              <Shield className="h-3 w-3 mr-1" />
                              {user.role || 'viewer'}
                            </Badge>
                          </TableCell>
                          <TableCell>{hrProfile?.job_title || '-'}</TableCell>
                          <TableCell>
                            {hrProfile?.scheduling_role === 'editor' ? (
                              <Badge variant="default" className="bg-primary text-primary-foreground">
                                Editor
                              </Badge>
                            ) : (
                              <Badge variant="secondary">
                                Viewer
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            {userClients.length > 0 ? (
                              <div className="flex flex-wrap gap-1 max-w-[150px]">
                                {userClients.slice(0, 2).map((client, idx) => (
                                  <Badge key={idx} variant="secondary" className="text-xs">
                                    {client}
                                  </Badge>
                                ))}
                                {userClients.length > 2 && (
                                  <Badge variant="outline" className="text-xs">
                                    +{userClients.length - 2}
                                  </Badge>
                                )}
                              </div>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => {
                                      setSelectedProfileForViews(user);
                                      fetchUserPageViews(user.user_id);
                                      setPageViewsDialogOpen(true);
                                    }}
                                    className="h-8 px-2"
                                  >
                                    <Eye className="h-3 w-3 mr-1" />
                                    {user.total_pages_viewed || 0}
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>{user.unique_pages_viewed || 0} unique pages viewed</p>
                                  {user.last_page_viewed && (
                                    <p className="text-xs">Last: {user.last_page_viewed}</p>
                                  )}
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              <Button variant="ghost" size="sm" onClick={() => handleOpenDialog(user)}>
                                <Edit className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => deleteUser(user.user_id)}
                                className="text-destructive hover:text-destructive"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
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
        </TabsContent>

        <TabsContent value="exceptions" className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold">Email Exceptions</h3>
              <p className="text-sm text-muted-foreground">Allow specific email addresses to access the platform</p>
            </div>
            <Dialog open={addEmailDialogOpen} onOpenChange={setAddEmailDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Exception
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add Email Exception</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="email">Email Address</Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="user@example.com"
                      value={newEmail}
                      onChange={(e) => setNewEmail(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="reason">Reason (Optional)</Label>
                    <Textarea
                      id="reason"
                      placeholder="Explain why this email should have access..."
                      value={newReason}
                      onChange={(e) => setNewReason(e.target.value)}
                    />
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={() => setAddEmailDialogOpen(false)}>
                      Cancel
                    </Button>
                    <Button onClick={addEmailException}>
                      Add Exception
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          <div className="grid gap-4">
            {emailExceptions.map((exception) => (
              <Card key={exception.id}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                        <Mail className="h-5 w-5 text-blue-600" />
                      </div>
                      <div>
                        <CardTitle className="text-lg">{exception.email}</CardTitle>
                        {exception.reason && (
                          <p className="text-sm text-muted-foreground">{exception.reason}</p>
                        )}
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => deleteEmailException(exception.id)}
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="text-sm text-muted-foreground">
                    Added: {new Date(exception.created_at).toLocaleDateString()}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {emailExceptions.length === 0 && (
            <div className="text-center py-12">
              <Mail className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-medium text-foreground mb-2">No email exceptions</h3>
              <p className="text-muted-foreground">No email exceptions have been added yet.</p>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Edit Profile Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingProfile ? 'Edit Staff Profile' : 'Set Up Staff Profile'}
            </DialogTitle>
            <DialogDescription>
              {selectedUserId && userProfiles.find(u => u.user_id === selectedUserId) && (
                <span>
                  Configure details for <strong>{userProfiles.find(u => u.user_id === selectedUserId)?.display_name || userProfiles.find(u => u.user_id === selectedUserId)?.email}</strong>
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
              <Label className="flex items-center gap-2">
                <Shield className="h-4 w-4" />
                Application Role
              </Label>
              <Select
                value={formData.app_role}
                onValueChange={(value) => setFormData({ ...formData, app_role: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {APP_ROLES.map(role => (
                    <SelectItem key={role.value} value={role.value}>
                      <div className="flex flex-col">
                        <span>{role.label}</span>
                        <span className="text-xs text-muted-foreground">{role.description}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Controls access to knowledge base features. Admins have full access.
              </p>
            </div>

            <div className="space-y-2">
              <Label>Scheduling Role</Label>
              <Select
                value={formData.scheduling_role}
                onValueChange={(value) => setFormData({ ...formData, scheduling_role: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SCHEDULING_ROLES.map(role => (
                    <SelectItem key={role.value} value={role.value}>
                      <span>{role.label}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Controls access to schedule management for assigned clients.
              </p>
            </div>

            <div className="space-y-2">
              <Label>Assigned Clients</Label>
              
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
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Base Salary</Label>
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
                <Label>Currency</Label>
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
                <Label>Pay Frequency</Label>
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
                        </>
                      );
                    })()}
                  </div>
                </CardContent>
              </Card>
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

      {/* Page Views Detail Dialog */}
      <Dialog open={pageViewsDialogOpen} onOpenChange={setPageViewsDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Page Views - {selectedProfileForViews?.display_name || 'User'}
            </DialogTitle>
          </DialogHeader>
          
          {pageViewsLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          ) : (
            <div className="space-y-4">
              {selectedUserPageViews.length > 0 ? (
                <div className="grid gap-3">
                  {selectedUserPageViews.map((pageView) => (
                    <Card key={pageView.page_id} className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <h4 className="font-medium text-foreground mb-1">
                            {pageView.page_title}
                          </h4>
                          <div className="flex items-center gap-4 text-sm text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <Eye className="h-3 w-3" />
                              {pageView.view_count} view{pageView.view_count !== 1 ? 's' : ''}
                            </span>
                            <span>
                              Last viewed: {new Date(pageView.last_viewed).toLocaleDateString()}
                            </span>
                          </div>
                        </div>
                        <Badge variant="secondary">
                          {pageView.view_count}
                        </Badge>
                      </div>
                    </Card>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <BookOpen className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground">No pages viewed yet</p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
