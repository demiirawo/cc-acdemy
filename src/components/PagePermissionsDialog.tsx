import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Trash2, Plus, Users, Shield, Globe, Copy, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useUserRole } from "@/hooks/useUserRole";

interface Permission {
  id: string;
  user_id: string | null;
  space_id: string | null;
  permission_type: string;
  profiles?: {
    display_name?: string;
    email?: string;
  } | null;
}

interface Profile {
  id: string;
  user_id: string;
  display_name: string | null;
  email: string | null;
}

interface Page {
  id: string;
  title: string;
  is_public: boolean | null;
  public_token: string | null;
  created_by: string;
}

interface PagePermissionsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pageId: string;
  pageTitle: string;
}

export function PagePermissionsDialog({
  open,
  onOpenChange,
  pageId,
  pageTitle
}: PagePermissionsDialogProps) {
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [page, setPage] = useState<Page | null>(null);
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [selectedPermissionType, setSelectedPermissionType] = useState<string>("read");
  const [loading, setLoading] = useState(false);
  const [loadingData, setLoadingData] = useState(true);
  const [publicLinkCopied, setPublicLinkCopied] = useState(false);
  const [visibilityType, setVisibilityType] = useState<'public' | 'domain' | 'admin'>('public');
  
  const { user } = useAuth();
  const { toast } = useToast();
  const { isAdmin } = useUserRole();

  useEffect(() => {
    if (open && pageId) {
      fetchData();
    }
  }, [open, pageId]);

  const fetchData = async () => {
    try {
      setLoadingData(true);
      
      // Fetch page details
      const { data: pageData, error: pageError } = await supabase
        .from('pages')
        .select('id, title, is_public, public_token, created_by')
        .eq('id', pageId)
        .single();

      if (pageError) throw pageError;
      setPage(pageData);

      // Fetch existing permissions
      const { data: permissionsData, error: permissionsError } = await supabase
        .from('page_permissions')
        .select('*')
        .eq('page_id', pageId);

      if (permissionsError) throw permissionsError;

      // Enrich permissions with profile data
      const enrichedPermissions = await Promise.all(
        (permissionsData || []).map(async (permission) => {
          if (permission.user_id) {
            const { data: profileData } = await supabase
              .from('profiles')
              .select('display_name, email')
              .eq('user_id', permission.user_id)
              .single();
            
            return {
              ...permission,
              profiles: profileData
            };
          }
          return {
            ...permission,
            profiles: null
          };
        })
      );

      setPermissions(enrichedPermissions);

      // Fetch all profiles for user selection
      const { data: profilesData, error: profilesError } = await supabase
        .from('profiles')
        .select('id, user_id, display_name, email')
        .order('display_name');

      if (profilesError) throw profilesError;
      setProfiles(profilesData || []);
    } catch (error) {
      console.error('Error fetching data:', error);
      toast({
        title: "Error",
        description: "Failed to load page permissions.",
        variant: "destructive",
      });
    } finally {
      setLoadingData(false);
    }
  };

  const handleAddPermission = async () => {
    if (!selectedUserId || !selectedPermissionType) {
      toast({
        title: "Error",
        description: "Please select a user and permission type.",
        variant: "destructive",
      });
      return;
    }

    // Check if permission already exists
    const existingPermission = permissions.find(p => p.user_id === selectedUserId);
    if (existingPermission) {
      toast({
        title: "Error",
        description: "This user already has permissions for this page.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);

    try {
      const { data, error } = await supabase
        .from('page_permissions')
        .insert({
          page_id: pageId,
          user_id: selectedUserId,
          permission_type: selectedPermissionType
        })
        .select()
        .single();

      if (error) throw error;

      // Fetch profile data for the new permission
      const { data: profileData } = await supabase
        .from('profiles')
        .select('display_name, email')
        .eq('user_id', selectedUserId)
        .single();

      const enrichedPermission = {
        ...data,
        profiles: profileData
      };

      setPermissions([...permissions, enrichedPermission]);
      setSelectedUserId("");
      setSelectedPermissionType("read");

      toast({
        title: "Permission added",
        description: "User permission has been added successfully.",
      });
    } catch (error) {
      console.error('Error adding permission:', error);
      toast({
        title: "Error",
        description: "Failed to add permission. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleRemovePermission = async (permissionId: string) => {
    setLoading(true);

    try {
      const { error } = await supabase
        .from('page_permissions')
        .delete()
        .eq('id', permissionId);

      if (error) throw error;

      setPermissions(permissions.filter(p => p.id !== permissionId));

      toast({
        title: "Permission removed",
        description: "User permission has been removed successfully.",
      });
    } catch (error) {
      console.error('Error removing permission:', error);
      toast({
        title: "Error",
        description: "Failed to remove permission. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleTogglePublic = async () => {
    if (!page) return;

    setLoading(true);

    try {
      const newPublicState = !page.is_public;
      
      const { data, error } = await supabase
        .from('pages')
        .update({ 
          is_public: newPublicState,
          public_token: newPublicState ? page.public_token || crypto.randomUUID() : null
        })
        .eq('id', pageId)
        .select('id, title, is_public, public_token, created_by')
        .single();

      if (error) throw error;

      setPage(data);

      toast({
        title: newPublicState ? "Page made public" : "Page made private",
        description: newPublicState 
          ? "Anyone with the link can now view this page."
          : "Page is now private and requires permissions to view.",
      });
    } catch (error) {
      console.error('Error toggling public state:', error);
      toast({
        title: "Error",
        description: "Failed to update page visibility. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCopyPublicLink = async () => {
    if (!page?.public_token) return;

    const publicUrl = `${window.location.origin}/public/${page.public_token}`;
    
    try {
      await navigator.clipboard.writeText(publicUrl);
      setPublicLinkCopied(true);
      setTimeout(() => setPublicLinkCopied(false), 2000);
      
      toast({
        title: "Link copied",
        description: "Public link has been copied to clipboard.",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to copy link to clipboard.",
        variant: "destructive",
      });
    }
  };

  const getPermissionColor = (type: string) => {
    switch (type) {
      case 'admin': return 'destructive';
      case 'write': return 'default';
      case 'read': return 'secondary';
      default: return 'outline';
    }
  };

  const availableUsers = profiles.filter(profile => 
    !permissions.some(p => p.user_id === profile.user_id) &&
    profile.user_id !== user?.id // Don't show current user
  );

  if (loadingData) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl">
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Page Permissions
          </DialogTitle>
          <DialogDescription>
            Manage who can access "{pageTitle}" and their permission levels.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Visibility Settings */}
          <div className="border rounded-lg p-4">
            <div className="flex items-center gap-2 mb-4">
              <Globe className="h-5 w-5 text-muted-foreground" />
              <h3 className="font-semibold">Page Visibility</h3>
            </div>
            
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 border rounded-md">
                <div>
                  <div className="font-medium">Public</div>
                  <div className="text-sm text-muted-foreground">Anyone with the link can view</div>
                </div>
                <input
                  type="radio"
                  name="visibility"
                  value="public"
                  checked={visibilityType === 'public'}
                  onChange={(e) => setVisibilityType(e.target.value as 'public' | 'domain' | 'admin')}
                  disabled={!isAdmin}
                  className="h-4 w-4"
                />
              </div>
              
              <div className="flex items-center justify-between p-3 border rounded-md">
                <div>
                  <div className="font-medium">Care-cuddle.co.uk domain only</div>
                  <div className="text-sm text-muted-foreground">Only users with care-cuddle.co.uk email addresses</div>
                </div>
                <input
                  type="radio"
                  name="visibility"
                  value="domain"
                  checked={visibilityType === 'domain'}
                  onChange={(e) => setVisibilityType(e.target.value as 'public' | 'domain' | 'admin')}
                  disabled={!isAdmin}
                  className="h-4 w-4"
                />
              </div>
              
              <div className="flex items-center justify-between p-3 border rounded-md">
                <div>
                  <div className="font-medium">Admin only</div>
                  <div className="text-sm text-muted-foreground">Only administrators can access</div>
                </div>
                <input
                  type="radio"
                  name="visibility"
                  value="admin"
                  checked={visibilityType === 'admin'}
                  onChange={(e) => setVisibilityType(e.target.value as 'public' | 'domain' | 'admin')}
                  disabled={!isAdmin}
                  className="h-4 w-4"
                />
              </div>
            </div>

            {visibilityType === 'public' && page?.public_token && (
              <div className="flex items-center gap-2 p-3 bg-muted rounded-md mt-4">
                <Input
                  value={`${window.location.origin}/public/${page.public_token}`}
                  readOnly
                  className="flex-1 text-xs"
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCopyPublicLink}
                  className="shrink-0"
                >
                  {publicLinkCopied ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              </div>
            )}
          </div>

          {/* User Permissions */}
          <div className="border rounded-lg p-4">
            <div className="flex items-center gap-2 mb-4">
              <Users className="h-5 w-5 text-muted-foreground" />
              <h3 className="font-semibold">User Permissions</h3>
            </div>

            {/* Add New Permission - Only for admins */}
            {isAdmin && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mb-4">
                <Select 
                  value={selectedUserId} 
                  onValueChange={setSelectedUserId}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select user" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableUsers.map((profile) => (
                      <SelectItem key={profile.user_id} value={profile.user_id}>
                        <div className="flex items-center gap-2">
                          <Avatar className="h-6 w-6">
                            <AvatarFallback className="text-xs">
                              {profile.display_name?.charAt(0) || profile.email?.charAt(0) || 'U'}
                            </AvatarFallback>
                          </Avatar>
                          <div className="text-left">
                            <div className="font-medium">
                              {profile.display_name || 'Unknown User'}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {profile.email}
                            </div>
                          </div>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select 
                  value={selectedPermissionType} 
                  onValueChange={setSelectedPermissionType}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Permission type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="read">Read Only</SelectItem>
                    <SelectItem value="write">Read & Write</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                  </SelectContent>
                </Select>

                <Button
                  onClick={handleAddPermission}
                  disabled={loading || !selectedUserId}
                  className="w-full"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add
                </Button>
              </div>
            )}

            {/* Existing Permissions */}
            <div className="space-y-2">
              {permissions.length > 0 ? (
                permissions.map((permission) => (
                  <div
                    key={permission.id}
                    className="flex items-center justify-between p-3 bg-muted rounded-md"
                  >
                    <div className="flex items-center gap-3">
                      <Avatar className="h-8 w-8">
                        <AvatarFallback className="text-xs">
                          {permission.profiles?.display_name?.charAt(0) || 
                           permission.profiles?.email?.charAt(0) || 'U'}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <div className="font-medium">
                          {permission.profiles?.display_name || 'Unknown User'}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {permission.profiles?.email}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={getPermissionColor(permission.permission_type)}>
                        {permission.permission_type}
                      </Badge>
                      {isAdmin && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRemovePermission(permission.id)}
                          disabled={loading}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-6 text-muted-foreground">
                  <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>No user permissions set</p>
                  <p className="text-xs">Only the page creator can access this page</p>
                </div>
              )}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
