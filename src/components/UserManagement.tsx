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
import { Users, Plus, Trash2, Edit, CheckCircle, Clock, Mail } from "lucide-react";
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
}

interface EmailException {
  id: string;
  email: string;
  reason: string | null;
  created_by: string;
  created_at: string;
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

      // Then use the edge function to get profiles with confirmation status
      const { data, error } = await supabase.functions.invoke('get-user-profiles');

      if (error) throw error;

      if (data.success) {
        setProfiles(data.data || []);
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
                  <div className="flex items-center justify-between text-sm text-muted-foreground">
                    <span>Created: {new Date(profile.created_at).toLocaleDateString()}</span>
                    <span>ID: {profile.user_id.substring(0, 8)}...</span>
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
    </div>
  );
}