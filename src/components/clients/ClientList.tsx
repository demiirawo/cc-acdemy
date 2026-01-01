import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Search, ExternalLink, Building2, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useUserRole } from "@/hooks/useUserRole";
import { useAuth } from "@/hooks/useAuth";

interface Client {
  id: string;
  name: string;
  mrr: number | null;
  status: string | null;
  key_contact_name: string | null;
  key_contact_email: string | null;
  website_address: string | null;
  created_at: string;
}

interface ClientListProps {
  onClientSelect: (clientId: string) => void;
}

const STATUS_OPTIONS = [
  { value: 'active', label: 'Active', color: 'bg-green-500' },
  { value: 'inactive', label: 'Inactive', color: 'bg-gray-500' },
  { value: 'prospect', label: 'Prospect', color: 'bg-blue-500' },
  { value: 'churned', label: 'Churned', color: 'bg-red-500' },
];

export function ClientList({ onClientSelect }: ClientListProps) {
  const { isAdmin } = useUserRole();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    mrr: "",
    status: "active",
    key_contact_name: "",
    key_contact_email: "",
    website_address: "",
  });

  const { data: clients = [], isLoading } = useQuery({
    queryKey: ["clients"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("id, name, mrr, status, key_contact_name, key_contact_email, website_address, created_at")
        .order("name");
      if (error) throw error;
      return data as Client[];
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const { error } = await supabase.from("clients").insert({
        name: data.name,
        mrr: data.mrr ? parseFloat(data.mrr) : null,
        status: data.status,
        key_contact_name: data.key_contact_name || null,
        key_contact_email: data.key_contact_email || null,
        website_address: data.website_address || null,
        created_by: user?.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Client created successfully");
      queryClient.invalidateQueries({ queryKey: ["clients"] });
      resetForm();
      setDialogOpen(false);
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to create client");
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: typeof formData & { id: string }) => {
      const { error } = await supabase.from("clients").update({
        name: data.name,
        mrr: data.mrr ? parseFloat(data.mrr) : null,
        status: data.status,
        key_contact_name: data.key_contact_name || null,
        key_contact_email: data.key_contact_email || null,
        website_address: data.website_address || null,
      }).eq("id", data.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Client updated successfully");
      queryClient.invalidateQueries({ queryKey: ["clients"] });
      resetForm();
      setDialogOpen(false);
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to update client");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("clients").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Client deleted successfully");
      queryClient.invalidateQueries({ queryKey: ["clients"] });
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to delete client");
    },
  });

  const resetForm = () => {
    setFormData({
      name: "",
      mrr: "",
      status: "active",
      key_contact_name: "",
      key_contact_email: "",
      website_address: "",
    });
    setEditingClient(null);
  };

  const handleEdit = (client: Client) => {
    setEditingClient(client);
    setFormData({
      name: client.name,
      mrr: client.mrr?.toString() || "",
      status: client.status || "active",
      key_contact_name: client.key_contact_name || "",
      key_contact_email: client.key_contact_email || "",
      website_address: client.website_address || "",
    });
    setDialogOpen(true);
  };

  const handleSubmit = () => {
    if (!formData.name.trim()) {
      toast.error("Client name is required");
      return;
    }
    if (editingClient) {
      updateMutation.mutate({ ...formData, id: editingClient.id });
    } else {
      createMutation.mutate(formData);
    }
  };

  const getStatusBadge = (status: string | null) => {
    const statusOption = STATUS_OPTIONS.find(s => s.value === status) || STATUS_OPTIONS[0];
    return (
      <Badge className={`${statusOption.color} text-white`}>
        {statusOption.label}
      </Badge>
    );
  };

  const getPublicScheduleLink = (clientName: string) => {
    return `/client-schedule/${encodeURIComponent(clientName)}`;
  };

  const filteredClients = clients.filter(client =>
    client.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    client.key_contact_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    client.key_contact_email?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const totalMRR = clients.reduce((sum, client) => sum + (client.mrr || 0), 0);

  if (isLoading) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="animate-pulse space-y-4">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-12 bg-muted rounded" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-primary" />
              <div>
                <p className="text-sm text-muted-foreground">Total Clients</p>
                <p className="text-2xl font-bold">{clients.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div>
              <p className="text-sm text-muted-foreground">Active Clients</p>
              <p className="text-2xl font-bold">
                {clients.filter(c => c.status === 'active').length}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div>
              <p className="text-sm text-muted-foreground">Total MRR</p>
              <p className="text-2xl font-bold">£{totalMRR.toLocaleString()}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <CardTitle>Clients</CardTitle>
            <div className="flex items-center gap-2">
              <div className="relative flex-1 sm:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search clients..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
              {isAdmin && (
                <Button onClick={() => { resetForm(); setDialogOpen(true); }}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Client
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>MRR</TableHead>
                  <TableHead>Key Contact</TableHead>
                  <TableHead>Schedule Link</TableHead>
                  {isAdmin && <TableHead className="text-right">Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredClients.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                      No clients found
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredClients.map((client) => (
                    <TableRow 
                      key={client.id} 
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => onClientSelect(client.id)}
                    >
                      <TableCell className="font-medium">{client.name}</TableCell>
                      <TableCell>{getStatusBadge(client.status)}</TableCell>
                      <TableCell>
                        {client.mrr ? `£${client.mrr.toLocaleString()}` : '-'}
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="font-medium">{client.key_contact_name || '-'}</p>
                          {client.key_contact_email && (
                            <p className="text-sm text-muted-foreground">{client.key_contact_email}</p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            const link = `${window.location.origin}${getPublicScheduleLink(client.name)}`;
                            navigator.clipboard.writeText(link);
                            toast.success("Schedule link copied to clipboard");
                          }}
                        >
                          <ExternalLink className="h-4 w-4 mr-1" />
                          Copy Link
                        </Button>
                      </TableCell>
                      {isAdmin && (
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleEdit(client);
                              }}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (confirm("Are you sure you want to delete this client?")) {
                                  deleteMutation.mutate(client.id);
                                }
                              }}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingClient ? "Edit Client" : "Add New Client"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Client Name *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Enter client name"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="mrr">Monthly Revenue (£)</Label>
                <Input
                  id="mrr"
                  type="number"
                  value={formData.mrr}
                  onChange={(e) => setFormData({ ...formData, mrr: e.target.value })}
                  placeholder="0"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="status">Status</Label>
                <Select value={formData.status} onValueChange={(value) => setFormData({ ...formData, status: value })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUS_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="key_contact_name">Key Contact Name</Label>
              <Input
                id="key_contact_name"
                value={formData.key_contact_name}
                onChange={(e) => setFormData({ ...formData, key_contact_name: e.target.value })}
                placeholder="John Smith"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="key_contact_email">Key Contact Email</Label>
              <Input
                id="key_contact_email"
                type="email"
                value={formData.key_contact_email}
                onChange={(e) => setFormData({ ...formData, key_contact_email: e.target.value })}
                placeholder="john@example.com"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="website_address">Website</Label>
              <Input
                id="website_address"
                value={formData.website_address}
                onChange={(e) => setFormData({ ...formData, website_address: e.target.value })}
                placeholder="https://example.com"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setDialogOpen(false); resetForm(); }}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={createMutation.isPending || updateMutation.isPending}>
              {editingClient ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}