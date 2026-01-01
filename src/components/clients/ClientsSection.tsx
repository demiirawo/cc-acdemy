import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Pencil, Trash2, ExternalLink, Copy, Check, Plus, Building2, Search, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface Client {
  id: string;
  name: string;
  status: string | null;
  notes: string | null;
  key_contact_name: string | null;
  key_contact_email: string | null;
  key_contact_phone: string | null;
  created_at: string;
}

export function ClientsSection() {
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    status: "active",
    notes: "",
    key_contact_name: "",
    key_contact_email: "",
    key_contact_phone: "",
  });

  // Fetch clients
  const { data: clients = [], isLoading } = useQuery({
    queryKey: ["clients"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("id, name, status, notes, key_contact_name, key_contact_email, key_contact_phone, created_at")
        .order("name", { ascending: true });

      if (error) throw error;
      return data as Client[];
    },
  });

  // Create client mutation
  const createMutation = useMutation({
    mutationFn: async () => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error("Not authenticated");

      const { error } = await supabase.from("clients").insert({
        name: formData.name,
        status: formData.status,
        notes: formData.notes || null,
        key_contact_name: formData.key_contact_name || null,
        key_contact_email: formData.key_contact_email || null,
        key_contact_phone: formData.key_contact_phone || null,
        created_by: userData.user.id,
      });

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Client created successfully");
      setCreateDialogOpen(false);
      resetForm();
      queryClient.invalidateQueries({ queryKey: ["clients"] });
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to create client");
    },
  });

  // Update client mutation
  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!selectedClient) throw new Error("No client selected");

      const { error } = await supabase
        .from("clients")
        .update({
          name: formData.name,
          status: formData.status,
          notes: formData.notes || null,
          key_contact_name: formData.key_contact_name || null,
          key_contact_email: formData.key_contact_email || null,
          key_contact_phone: formData.key_contact_phone || null,
        })
        .eq("id", selectedClient.id);

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Client updated successfully");
      setEditDialogOpen(false);
      setSelectedClient(null);
      resetForm();
      queryClient.invalidateQueries({ queryKey: ["clients"] });
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to update client");
    },
  });

  // Delete client mutation
  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!selectedClient) throw new Error("No client selected");

      const { error } = await supabase
        .from("clients")
        .delete()
        .eq("id", selectedClient.id);

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Client deleted successfully");
      setDeleteDialogOpen(false);
      setSelectedClient(null);
      queryClient.invalidateQueries({ queryKey: ["clients"] });
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to delete client");
    },
  });

  const resetForm = () => {
    setFormData({
      name: "",
      status: "active",
      notes: "",
      key_contact_name: "",
      key_contact_email: "",
      key_contact_phone: "",
    });
  };

  const handleEdit = (client: Client) => {
    setSelectedClient(client);
    setFormData({
      name: client.name,
      status: client.status || "active",
      notes: client.notes || "",
      key_contact_name: client.key_contact_name || "",
      key_contact_email: client.key_contact_email || "",
      key_contact_phone: client.key_contact_phone || "",
    });
    setEditDialogOpen(true);
  };

  const handleDelete = (client: Client) => {
    setSelectedClient(client);
    setDeleteDialogOpen(true);
  };

  const getPublicScheduleUrl = (clientName: string) => {
    const encodedName = encodeURIComponent(clientName);
    return `${window.location.origin}/public/schedule/${encodedName}`;
  };

  const copyPublicLink = async (clientName: string, clientId: string) => {
    const url = getPublicScheduleUrl(clientName);
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(clientId);
      toast.success("Public link copied to clipboard");
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      toast.error("Failed to copy link");
    }
  };

  const openPublicSchedule = (clientName: string) => {
    const url = getPublicScheduleUrl(clientName);
    window.open(url, "_blank");
  };

  const filteredClients = clients.filter((client) =>
    client.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getStatusBadgeVariant = (status: string | null) => {
    switch (status) {
      case "active":
        return "default";
      case "inactive":
        return "secondary";
      case "pending":
        return "outline";
      default:
        return "secondary";
    }
  };

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Building2 className="h-8 w-8 text-primary" />
            <div>
              <h1 className="text-2xl font-bold">Clients</h1>
              <p className="text-sm text-muted-foreground">
                Manage your clients and access their public schedules
              </p>
            </div>
          </div>
          <Button onClick={() => setCreateDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Add Client
          </Button>
        </div>

        <Card>
          <CardHeader className="pb-4">
            <div className="flex items-center gap-4">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search clients..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Badge variant="secondary">{filteredClients.length} clients</Badge>
            </div>
          </CardHeader>
          <CardContent>
            {filteredClients.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                {searchQuery ? "No clients found matching your search" : "No clients yet. Add your first client to get started."}
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Key Contact</TableHead>
                    <TableHead>Public Schedule</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredClients.map((client) => (
                    <TableRow key={client.id}>
                      <TableCell className="font-medium">{client.name}</TableCell>
                      <TableCell>
                        <Badge variant={getStatusBadgeVariant(client.status)}>
                          {client.status || "unknown"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {client.key_contact_name ? (
                          <div className="text-sm">
                            <div>{client.key_contact_name}</div>
                            {client.key_contact_email && (
                              <div className="text-muted-foreground">{client.key_contact_email}</div>
                            )}
                          </div>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => copyPublicLink(client.name, client.id)}
                            title="Copy public link"
                          >
                            {copiedId === client.id ? (
                              <Check className="h-4 w-4 text-green-600" />
                            ) : (
                              <Copy className="h-4 w-4" />
                            )}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openPublicSchedule(client.name)}
                            title="Open public schedule"
                          >
                            <ExternalLink className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEdit(client)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDelete(client)}
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
      </div>

      {/* Create Client Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add New Client</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Client Name *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Enter client name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              <Select
                value={formData.status}
                onValueChange={(value) => setFormData({ ...formData, status: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="key_contact_name">Key Contact Name</Label>
              <Input
                id="key_contact_name"
                value={formData.key_contact_name}
                onChange={(e) => setFormData({ ...formData, key_contact_name: e.target.value })}
                placeholder="Contact name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="key_contact_email">Key Contact Email</Label>
              <Input
                id="key_contact_email"
                type="email"
                value={formData.key_contact_email}
                onChange={(e) => setFormData({ ...formData, key_contact_email: e.target.value })}
                placeholder="contact@example.com"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="key_contact_phone">Key Contact Phone</Label>
              <Input
                id="key_contact_phone"
                value={formData.key_contact_phone}
                onChange={(e) => setFormData({ ...formData, key_contact_phone: e.target.value })}
                placeholder="+44 123 456 7890"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder="Additional notes..."
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => createMutation.mutate()}
              disabled={!formData.name.trim() || createMutation.isPending}
            >
              {createMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : null}
              Create Client
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Client Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Client</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-name">Client Name *</Label>
              <Input
                id="edit-name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Enter client name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-status">Status</Label>
              <Select
                value={formData.status}
                onValueChange={(value) => setFormData({ ...formData, status: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-key_contact_name">Key Contact Name</Label>
              <Input
                id="edit-key_contact_name"
                value={formData.key_contact_name}
                onChange={(e) => setFormData({ ...formData, key_contact_name: e.target.value })}
                placeholder="Contact name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-key_contact_email">Key Contact Email</Label>
              <Input
                id="edit-key_contact_email"
                type="email"
                value={formData.key_contact_email}
                onChange={(e) => setFormData({ ...formData, key_contact_email: e.target.value })}
                placeholder="contact@example.com"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-key_contact_phone">Key Contact Phone</Label>
              <Input
                id="edit-key_contact_phone"
                value={formData.key_contact_phone}
                onChange={(e) => setFormData({ ...formData, key_contact_phone: e.target.value })}
                placeholder="+44 123 456 7890"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-notes">Notes</Label>
              <Textarea
                id="edit-notes"
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder="Additional notes..."
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => updateMutation.mutate()}
              disabled={!formData.name.trim() || updateMutation.isPending}
            >
              {updateMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : null}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Client</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{selectedClient?.name}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteMutation.mutate()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : null}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
