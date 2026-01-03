import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Edit, Trash2, User, Mail, Phone, Briefcase } from "lucide-react";

interface OnboardingOwner {
  id: string;
  name: string;
  role: string | null;
  email: string | null;
  phone: string | null;
  created_at: string;
}

export function OnboardingOwnersManager() {
  const [owners, setOwners] = useState<OnboardingOwner[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingOwner, setEditingOwner] = useState<OnboardingOwner | null>(null);
  const { user } = useAuth();
  const { toast } = useToast();

  // Form state
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");

  useEffect(() => {
    fetchOwners();
  }, []);

  const fetchOwners = async () => {
    try {
      const { data, error } = await supabase
        .from('onboarding_owners')
        .select('*')
        .order('name', { ascending: true });

      if (error) throw error;
      setOwners(data || []);
    } catch (error) {
      console.error('Error fetching owners:', error);
      toast({
        title: "Error",
        description: "Failed to load owners",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setName("");
    setRole("");
    setEmail("");
    setPhone("");
    setEditingOwner(null);
  };

  const openEditDialog = (owner: OnboardingOwner) => {
    setEditingOwner(owner);
    setName(owner.name);
    setRole(owner.role || "");
    setEmail(owner.email || "");
    setPhone(owner.phone || "");
    setDialogOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!user) return;

    try {
      const ownerData = {
        name,
        role: role || null,
        email: email || null,
        phone: phone || null,
      };

      if (editingOwner) {
        const { error } = await supabase
          .from('onboarding_owners')
          .update(ownerData)
          .eq('id', editingOwner.id);

        if (error) throw error;
        toast({ title: "Owner updated successfully" });
      } else {
        const { error } = await supabase
          .from('onboarding_owners')
          .insert({ 
            ...ownerData, 
            created_by: user.id,
          });

        if (error) throw error;
        toast({ title: "Owner created successfully" });
      }

      setDialogOpen(false);
      resetForm();
      fetchOwners();
    } catch (error) {
      console.error('Error saving owner:', error);
      toast({
        title: "Error",
        description: "Failed to save owner",
        variant: "destructive",
      });
    }
  };

  const handleDelete = async (ownerId: string) => {
    if (!confirm("Are you sure you want to delete this owner? Steps assigned to this owner will be unassigned.")) return;

    try {
      const { error } = await supabase
        .from('onboarding_owners')
        .delete()
        .eq('id', ownerId);

      if (error) throw error;
      toast({ title: "Owner deleted successfully" });
      fetchOwners();
    } catch (error) {
      console.error('Error deleting owner:', error);
      toast({
        title: "Error",
        description: "Failed to delete owner",
        variant: "destructive",
      });
    }
  };

  if (loading) {
    return <div className="text-center py-8 text-muted-foreground">Loading...</div>;
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Owner Configuration</CardTitle>
        <Dialog open={dialogOpen} onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) resetForm();
        }}>
          <DialogTrigger asChild>
            <Button className="flex items-center gap-2">
              <Plus className="h-4 w-4" />
              Add Owner
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingOwner ? 'Edit Owner' : 'Add New Owner'}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Name *</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g., John Smith"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="role">Role/Title</Label>
                <Input
                  id="role"
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  placeholder="e.g., HR Manager"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="e.g., john@company.com"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="phone">Phone</Label>
                <Input
                  id="phone"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="e.g., +44 123 456 7890"
                />
              </div>

              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit">
                  {editingOwner ? 'Update' : 'Create'} Owner
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        {owners.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            No owners configured yet. Click "Add Owner" to create one.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead className="w-24">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {owners.map((owner) => (
                <TableRow key={owner.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">{owner.name}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    {owner.role ? (
                      <div className="flex items-center gap-2">
                        <Briefcase className="h-4 w-4 text-muted-foreground" />
                        <span>{owner.role}</span>
                      </div>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="space-y-1">
                      {owner.email && (
                        <div className="flex items-center gap-2 text-sm">
                          <Mail className="h-3 w-3 text-muted-foreground" />
                          <a href={`mailto:${owner.email}`} className="text-primary hover:underline">
                            {owner.email}
                          </a>
                        </div>
                      )}
                      {owner.phone && (
                        <div className="flex items-center gap-2 text-sm">
                          <Phone className="h-3 w-3 text-muted-foreground" />
                          <a href={`tel:${owner.phone}`} className="text-primary hover:underline">
                            {owner.phone}
                          </a>
                        </div>
                      )}
                      {!owner.email && !owner.phone && (
                        <span className="text-muted-foreground text-sm">No contact info</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openEditDialog(owner)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(owner.id)}
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
