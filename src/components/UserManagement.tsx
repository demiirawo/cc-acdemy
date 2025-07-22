import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Users, Plus, Trash2, Edit, CheckCircle, Clock, Mail, BookOpen, Eye, TrendingUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface Profile {
  id: string;
  user_id: string;
  display_name: string | null;
  email: string | null;
  role: string | null;
  created_at: string;
  email_confirmed_at: string | null;
  total_pages_viewed?: number;
  unique_pages_viewed?: number;
  last_page_viewed?: string;
  last_view_date?: string;
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

export function UserManagement() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedProfile, setSelectedProfile] = useState<Profile | null>(null);
  const [newRole, setNewRole] = useState<string>('');
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [emailExceptions, setEmailExceptions] = useState<EmailException[]>([]);
  const [newEmail, setNewEmail] = useState('');
  const [newReason, setNewReason] = useState('');
  const [addEmailDialogOpen, setAddEmailDialogOpen] = useState(false);
  const [selectedUserPageViews, setSelectedUserPageViews] = useState<PageView[]>([]);
  const [pageViewsDialogOpen, setPageViewsDialogOpen] = useState(false);
  const [pageViewsLoading, setPageViewsLoading] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    fetchProfiles();
    fetchEmailExceptions();

    // Set up real-time listening for profile changes
    const channel = supabase
      .channel('user-management-updates')
      .on(
        'postgres_changes',
        {
          event: '*', // Listen to all events (INSERT, UPDATE, DELETE)
          schema: 'public',
          table: 'profiles'
        },
        (payload) => {
          console.log('Profile change detected:', payload);
          // Refetch profiles when any change occurs
          fetchProfiles();
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'email_exceptions'
        },
        (payload) => {
          console.log('Email exception change detected:', payload);
          fetchEmailExceptions();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchProfiles = async () => {
    try {
      // First, sync missing profiles to ensure all auth users have profiles
      console.log('Syncing missing profiles...');
      const { data: syncData, error: syncError } = await supabase
        .rpc('sync_missing_profiles');

      if (syncError) {
        console.error('Sync error:', syncError);
        // Don't fail completely if sync fails, just log and continue
      } else {
        console.log('Sync result:', syncData);
        if (syncData && syncData.length > 0) {
          const newProfiles = syncData.filter((profile: any) => profile.created_profile);
          if (newProfiles.length > 0) {
            toast({
              title: "Profiles Synchronized",
              description: `${newProfiles.length} missing profile(s) were created`,
            });
          }
        }
      }

      // Get profiles and aggregate page view data
      const { data, error } = await supabase.functions.invoke('get-user-profiles');

      if (error) throw error;

      if (data.success) {
        // For each profile, get page view analytics
        const profilesWithAnalytics = await Promise.all(
          (data.data || []).map(async (profile: Profile) => {
            try {
              // Get page view statistics for this user
              const { data: viewData } = await supabase
                .from('page_audit_log')
                .select('page_id, created_at')
                .eq('user_id', profile.user_id)
                .eq('operation_type', 'view');

              const totalViews = viewData?.length || 0;
              const uniquePages = new Set(viewData?.map(v => v.page_id) || []).size;
              
              // Get last page viewed
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
            } catch (error) {
              console.error('Error fetching analytics for user:', profile.user_id, error);
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

        setProfiles(profilesWithAnalytics);
      } else {
        throw new Error(data.error || 'Failed to fetch profiles');
      }
    } catch (error) {
      console.error('Error fetching profiles:', error);
      toast({
        title: "Error",
        description: "Failed to load user profiles",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const updateUserRole = async (userId: string, role: string) => {
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ role })
        .eq('user_id', userId);

      if (error) throw error;

      toast({
        title: "Success",
        description: `User role updated to ${role}`
      });

      fetchProfiles();
      setEditDialogOpen(false);
    } catch (error) {
      console.error('Error updating user role:', error);
      toast({
        title: "Error",
        description: "Failed to update user role",
        variant: "destructive"
      });
    }
  };

  const deleteProfile = async (userId: string) => {
    if (!confirm("Are you sure you want to completely delete this user? This will remove them from the system entirely and cannot be undone.")) {
      return;
    }

    try {
      console.log('Attempting to delete user:', userId);
      
      // Use edge function to delete user completely (requires admin privileges)
      const { data, error } = await supabase.functions.invoke('delete-user-completely', {
        body: { userId }
      });

      console.log('Edge function response:', { data, error });

      if (error) {
        console.error('Edge function error:', error);
        throw new Error(`Edge function error: ${error.message}`);
      }

      if (data?.success) {
        toast({
          title: "Success",
          description: data.message || "User deleted successfully"
        });
        // No need to call fetchProfiles() as real-time updates will handle it
      } else {
        throw new Error(data?.error || 'Failed to delete user - unknown error');
      }
    } catch (error) {
      console.error('Error deleting user:', error);
      toast({
        title: "Error",
        description: `Failed to delete user: ${error.message}`,
        variant: "destructive"
      });
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
      toast({
        title: "Error",
        description: "Failed to load email exceptions",
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

  const getConfirmationStatus = (emailConfirmedAt: string | null) => {
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

  const fetchUserPageViews = async (userId: string) => {
    setPageViewsLoading(true);
    try {
      // Get detailed page views for this user
      const { data: viewData } = await supabase
        .from('page_audit_log')
        .select('page_id, created_at')
        .eq('user_id', userId)
        .eq('operation_type', 'view')
        .order('created_at', { ascending: false });

      if (viewData) {
        // Group by page_id and count views
        const pageViewCounts = viewData.reduce((acc: any, view) => {
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

        // Get page titles
        const pageIds = Object.keys(pageViewCounts);
        const { data: pagesData } = await supabase
          .from('pages')
          .select('id, title')
          .in('id', pageIds);

        const pageViews: PageView[] = Object.values(pageViewCounts).map((view: any) => {
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

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading users...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 p-6 space-y-6 overflow-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">User Management</h1>
          <p className="text-muted-foreground">Manage user profiles and permissions</p>
        </div>
        <div className="flex items-center gap-2">
          <Users className="h-5 w-5 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">{profiles.length} users</span>
        </div>
      </div>

      <Tabs defaultValue="users" className="w-full">
        <TabsList>
          <TabsTrigger value="users">Users</TabsTrigger>
          <TabsTrigger value="exceptions">Email Exceptions</TabsTrigger>
        </TabsList>
        
        <TabsContent value="users" className="space-y-4"
        
        >

          <div className="grid gap-4">
            {profiles.map((profile) => (
              <Card key={profile.id} className="hover:shadow-md transition-shadow">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center">
                        <Users className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <CardTitle className="text-lg flex items-center gap-2">
                          {profile.display_name || 'No name'}
                          {(() => {
                            const status = getConfirmationStatus(profile.email_confirmed_at);
                            const StatusIcon = status.icon;
                            return (
                              <div title={status.tooltip}>
                                <StatusIcon 
                                  className={`h-4 w-4 ${status.color}`}
                                />
                              </div>
                            );
                          })()}
                        </CardTitle>
                        <p className="text-sm text-muted-foreground">
                          {profile.email || 'No email'}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={getRoleBadgeVariant(profile.role)}>
                        {profile.role || 'viewer'}
                      </Badge>
                      <Dialog open={editDialogOpen && selectedProfile?.id === profile.id} onOpenChange={setEditDialogOpen}>
                        <DialogTrigger asChild>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setSelectedProfile(profile);
                              setNewRole(profile.role || 'viewer');
                            }}
                          >
                            <Edit className="h-4 w-4 mr-2" />
                            Edit
                          </Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>Edit User Role</DialogTitle>
                          </DialogHeader>
                          <div className="space-y-4">
                            <div>
                              <Label>User</Label>
                              <p className="text-sm text-muted-foreground">
                                {profile.display_name || 'No name'} ({profile.email})
                              </p>
                            </div>
                            <div>
                              <Label htmlFor="role">Role</Label>
                              <Select value={newRole} onValueChange={setNewRole}>
                                <SelectTrigger>
                                  <SelectValue placeholder="Select role" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="viewer">Viewer</SelectItem>
                                  <SelectItem value="editor">Editor</SelectItem>
                                  <SelectItem value="admin">Admin</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="flex justify-end gap-2">
                              <Button
                                variant="outline"
                                onClick={() => setEditDialogOpen(false)}
                              >
                                Cancel
                              </Button>
                              <Button
                                onClick={() => updateUserRole(profile.user_id, newRole)}
                              >
                                Update Role
                              </Button>
                            </div>
                          </div>
                        </DialogContent>
                      </Dialog>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => deleteProfile(profile.user_id)}
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="space-y-3">
                    {/* Page Analytics Summary */}
                    <div className="grid grid-cols-3 gap-4 p-3 bg-muted/30 rounded-lg">
                      <div className="text-center">
                        <div className="flex items-center justify-center gap-1 mb-1">
                          <Eye className="h-4 w-4 text-primary" />
                          <span className="text-sm font-medium">Total Views</span>
                        </div>
                        <span className="text-lg font-bold text-foreground">
                          {profile.total_pages_viewed || 0}
                        </span>
                      </div>
                      <div className="text-center border-l border-border">
                        <div className="flex items-center justify-center gap-1 mb-1">
                          <BookOpen className="h-4 w-4 text-accent" />
                          <span className="text-sm font-medium">Unique Pages</span>
                        </div>
                        <span className="text-lg font-bold text-foreground">
                          {profile.unique_pages_viewed || 0}
                        </span>
                      </div>
                      <div className="text-center border-l border-border">
                        <div className="text-center">
                          <div className="flex items-center justify-center gap-1 mb-1">
                            <TrendingUp className="h-4 w-4 text-success" />
                            <span className="text-sm font-medium">Activity</span>
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setSelectedProfile(profile);
                              fetchUserPageViews(profile.user_id);
                              setPageViewsDialogOpen(true);
                            }}
                            className="h-8 text-xs"
                          >
                            View Details
                          </Button>
                        </div>
                      </div>
                    </div>
                    
                    {/* Last Activity */}
                    {profile.last_page_viewed && (
                      <div className="text-sm text-muted-foreground">
                        <span className="font-medium">Last viewed:</span> {profile.last_page_viewed}
                        {profile.last_view_date && (
                          <span className="ml-2">
                            ({new Date(profile.last_view_date).toLocaleDateString()})
                          </span>
                        )}
                      </div>
                    )}
                    
                    {/* User Info */}
                    <div className="flex items-center justify-between text-sm text-muted-foreground pt-2 border-t border-border">
                      <span>Created: {new Date(profile.created_at).toLocaleDateString()}</span>
                      <span>ID: {profile.user_id.substring(0, 8)}...</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {profiles.length === 0 && (
            <div className="text-center py-12">
              <Users className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-medium text-foreground mb-2">No users found</h3>
              <p className="text-muted-foreground">No user profiles have been created yet.</p>
            </div>
          )}
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
                    <Button
                      variant="outline"
                      onClick={() => setAddEmailDialogOpen(false)}
                    >
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

      {/* Page Views Detail Dialog */}
      <Dialog open={pageViewsDialogOpen} onOpenChange={setPageViewsDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Page Views - {selectedProfile?.display_name || 'User'}
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