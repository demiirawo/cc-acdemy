import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Save, Building2, User, Globe, FileText, CreditCard, ExternalLink, Copy } from "lucide-react";
import { toast } from "sonner";
import { useUserRole } from "@/hooks/useUserRole";

interface Client {
  id: string;
  name: string;
  mrr: number | null;
  status: string | null;
  software: string | null;
  recurring_day: number | null;
  contract_start_date: string | null;
  contract_end_date: string | null;
  key_contact_name: string | null;
  key_contact_email: string | null;
  key_contact_phone: string | null;
  company_address: string | null;
  website_address: string | null;
  software_used: string | null;
  software_login_details: string | null;
  billing_contact_name: string | null;
  billing_contact_email: string | null;
  billing_contact_phone: string | null;
  notes: string | null;
  source: string | null;
}

interface ClientDetailsManagerProps {
  selectedClientId: string | null;
  onClientSelect: (clientId: string | null) => void;
}

const STATUS_OPTIONS = [
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
  { value: 'prospect', label: 'Prospect' },
  { value: 'churned', label: 'Churned' },
];

export function ClientDetailsManager({ selectedClientId, onClientSelect }: ClientDetailsManagerProps) {
  const { isAdmin } = useUserRole();
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState<Partial<Client>>({});
  const [hasChanges, setHasChanges] = useState(false);

  // Fetch all clients for dropdown
  const { data: clients = [] } = useQuery({
    queryKey: ["clients-list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("id, name")
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  // Fetch selected client details
  const { data: client, isLoading } = useQuery({
    queryKey: ["client-details", selectedClientId],
    queryFn: async () => {
      if (!selectedClientId) return null;
      const { data, error } = await supabase
        .from("clients")
        .select("*")
        .eq("id", selectedClientId)
        .maybeSingle();
      if (error) throw error;
      return data as Client | null;
    },
    enabled: !!selectedClientId,
  });

  // Update form when client data loads
  useEffect(() => {
    if (client) {
      setFormData(client);
      setHasChanges(false);
    }
  }, [client]);

  const updateMutation = useMutation({
    mutationFn: async (data: Partial<Client>) => {
      if (!selectedClientId) throw new Error("No client selected");
      const { error } = await supabase
        .from("clients")
        .update({
          ...data,
          mrr: data.mrr ? parseFloat(data.mrr.toString()) : null,
          recurring_day: data.recurring_day ? parseInt(data.recurring_day.toString()) : null,
        })
        .eq("id", selectedClientId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Client details saved successfully");
      queryClient.invalidateQueries({ queryKey: ["client-details", selectedClientId] });
      queryClient.invalidateQueries({ queryKey: ["clients"] });
      setHasChanges(false);
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to save client details");
    },
  });

  const handleFieldChange = (field: keyof Client, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    setHasChanges(true);
  };

  const handleSave = () => {
    updateMutation.mutate(formData);
  };

  const getPublicScheduleLink = (clientName: string) => {
    return `${window.location.origin}/client-schedule/${encodeURIComponent(clientName)}`;
  };

  const copyScheduleLink = () => {
    if (formData.name) {
      navigator.clipboard.writeText(getPublicScheduleLink(formData.name));
      toast.success("Schedule link copied to clipboard");
    }
  };

  if (!selectedClientId) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="text-center py-12">
            <Building2 className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-medium mb-2">Select a Client</h3>
            <p className="text-muted-foreground mb-4">
              Choose a client to view and edit their details
            </p>
            <Select value="" onValueChange={onClientSelect}>
              <SelectTrigger className="w-64 mx-auto">
                <SelectValue placeholder="Select a client..." />
              </SelectTrigger>
              <SelectContent>
                {clients.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="animate-pulse space-y-4">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-10 bg-muted rounded" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Client Selector & Quick Actions */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <Select value={selectedClientId || ""} onValueChange={onClientSelect}>
                <SelectTrigger className="w-64">
                  <SelectValue placeholder="Select a client..." />
                </SelectTrigger>
                <SelectContent>
                  {clients.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {formData.status && (
                <Badge variant={formData.status === 'active' ? 'default' : 'secondary'}>
                  {formData.status}
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={copyScheduleLink}>
                <Copy className="h-4 w-4 mr-2" />
                Copy Schedule Link
              </Button>
              <Button 
                variant="outline" 
                onClick={() => {
                  if (formData.name) {
                    window.open(getPublicScheduleLink(formData.name), '_blank');
                  }
                }}
              >
                <ExternalLink className="h-4 w-4 mr-2" />
                View Schedule
              </Button>
              {isAdmin && hasChanges && (
                <Button onClick={handleSave} disabled={updateMutation.isPending}>
                  <Save className="h-4 w-4 mr-2" />
                  Save Changes
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Detail Tabs */}
      <Tabs defaultValue="general" className="w-full">
        <TabsList className="grid w-full grid-cols-4 mb-4">
          <TabsTrigger value="general" className="flex items-center gap-2">
            <Building2 className="h-4 w-4" />
            General
          </TabsTrigger>
          <TabsTrigger value="contacts" className="flex items-center gap-2">
            <User className="h-4 w-4" />
            Contacts
          </TabsTrigger>
          <TabsTrigger value="billing" className="flex items-center gap-2">
            <CreditCard className="h-4 w-4" />
            Billing
          </TabsTrigger>
          <TabsTrigger value="technical" className="flex items-center gap-2">
            <Globe className="h-4 w-4" />
            Technical
          </TabsTrigger>
        </TabsList>

        <TabsContent value="general">
          <Card>
            <CardHeader>
              <CardTitle>General Information</CardTitle>
              <CardDescription>Basic client details and contract information</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Client Name</Label>
                  <Input
                    value={formData.name || ""}
                    onChange={(e) => handleFieldChange("name", e.target.value)}
                    disabled={!isAdmin}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Status</Label>
                  <Select 
                    value={formData.status || "active"} 
                    onValueChange={(value) => handleFieldChange("status", value)}
                    disabled={!isAdmin}
                  >
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
                <div className="space-y-2">
                  <Label>Source</Label>
                  <Input
                    value={formData.source || ""}
                    onChange={(e) => handleFieldChange("source", e.target.value)}
                    placeholder="How did they find us?"
                    disabled={!isAdmin}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Monthly Revenue (MRR)</Label>
                  <Input
                    type="number"
                    value={formData.mrr || ""}
                    onChange={(e) => handleFieldChange("mrr", e.target.value)}
                    placeholder="0"
                    disabled={!isAdmin}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Contract Start Date</Label>
                  <Input
                    type="date"
                    value={formData.contract_start_date || ""}
                    onChange={(e) => handleFieldChange("contract_start_date", e.target.value)}
                    disabled={!isAdmin}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Contract End Date</Label>
                  <Input
                    type="date"
                    value={formData.contract_end_date || ""}
                    onChange={(e) => handleFieldChange("contract_end_date", e.target.value)}
                    disabled={!isAdmin}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Recurring Payment Day</Label>
                  <Input
                    type="number"
                    min="1"
                    max="31"
                    value={formData.recurring_day || ""}
                    onChange={(e) => handleFieldChange("recurring_day", e.target.value)}
                    placeholder="Day of month"
                    disabled={!isAdmin}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Company Address</Label>
                <Textarea
                  value={formData.company_address || ""}
                  onChange={(e) => handleFieldChange("company_address", e.target.value)}
                  placeholder="Full company address"
                  disabled={!isAdmin}
                />
              </div>
              <div className="space-y-2">
                <Label>Notes</Label>
                <Textarea
                  value={formData.notes || ""}
                  onChange={(e) => handleFieldChange("notes", e.target.value)}
                  placeholder="Additional notes about this client"
                  disabled={!isAdmin}
                  rows={4}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="contacts">
          <Card>
            <CardHeader>
              <CardTitle>Contact Information</CardTitle>
              <CardDescription>Key contacts and communication details</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <h4 className="font-medium mb-4">Key Contact</h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>Name</Label>
                    <Input
                      value={formData.key_contact_name || ""}
                      onChange={(e) => handleFieldChange("key_contact_name", e.target.value)}
                      disabled={!isAdmin}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Email</Label>
                    <Input
                      type="email"
                      value={formData.key_contact_email || ""}
                      onChange={(e) => handleFieldChange("key_contact_email", e.target.value)}
                      disabled={!isAdmin}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Phone</Label>
                    <Input
                      value={formData.key_contact_phone || ""}
                      onChange={(e) => handleFieldChange("key_contact_phone", e.target.value)}
                      disabled={!isAdmin}
                    />
                  </div>
                </div>
              </div>
              <div>
                <h4 className="font-medium mb-4">Billing Contact</h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>Name</Label>
                    <Input
                      value={formData.billing_contact_name || ""}
                      onChange={(e) => handleFieldChange("billing_contact_name", e.target.value)}
                      disabled={!isAdmin}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Email</Label>
                    <Input
                      type="email"
                      value={formData.billing_contact_email || ""}
                      onChange={(e) => handleFieldChange("billing_contact_email", e.target.value)}
                      disabled={!isAdmin}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Phone</Label>
                    <Input
                      value={formData.billing_contact_phone || ""}
                      onChange={(e) => handleFieldChange("billing_contact_phone", e.target.value)}
                      disabled={!isAdmin}
                    />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="billing">
          <Card>
            <CardHeader>
              <CardTitle>Billing Information</CardTitle>
              <CardDescription>Payment and billing details</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Monthly Revenue (MRR)</Label>
                  <Input
                    type="number"
                    value={formData.mrr || ""}
                    onChange={(e) => handleFieldChange("mrr", e.target.value)}
                    placeholder="0"
                    disabled={!isAdmin}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Recurring Payment Day</Label>
                  <Input
                    type="number"
                    min="1"
                    max="31"
                    value={formData.recurring_day || ""}
                    onChange={(e) => handleFieldChange("recurring_day", e.target.value)}
                    placeholder="Day of month"
                    disabled={!isAdmin}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="technical">
          <Card>
            <CardHeader>
              <CardTitle>Technical Information</CardTitle>
              <CardDescription>Software and technical details</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Website</Label>
                  <Input
                    value={formData.website_address || ""}
                    onChange={(e) => handleFieldChange("website_address", e.target.value)}
                    placeholder="https://example.com"
                    disabled={!isAdmin}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Software</Label>
                  <Input
                    value={formData.software || ""}
                    onChange={(e) => handleFieldChange("software", e.target.value)}
                    placeholder="Software name"
                    disabled={!isAdmin}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Software Used</Label>
                <Input
                  value={formData.software_used || ""}
                  onChange={(e) => handleFieldChange("software_used", e.target.value)}
                  placeholder="List of software used"
                  disabled={!isAdmin}
                />
              </div>
              <div className="space-y-2">
                <Label>Software Login Details</Label>
                <Textarea
                  value={formData.software_login_details || ""}
                  onChange={(e) => handleFieldChange("software_login_details", e.target.value)}
                  placeholder="Login credentials and access details"
                  disabled={!isAdmin}
                  rows={4}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}