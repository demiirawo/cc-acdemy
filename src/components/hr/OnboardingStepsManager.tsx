import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Edit, Trash2, FileText, Link, CheckSquare, User } from "lucide-react";

interface OnboardingOwner {
  id: string;
  name: string;
  role: string | null;
  email: string | null;
  phone: string | null;
}

interface OnboardingStep {
  id: string;
  title: string;
  description: string | null;
  step_type: string;
  target_page_id: string | null;
  external_url: string | null;
  sort_order: number;
  owner_id: string | null;
  created_at: string;
  owner?: OnboardingOwner | null;
}

interface Page {
  id: string;
  title: string;
}

export function OnboardingStepsManager() {
  const [steps, setSteps] = useState<OnboardingStep[]>([]);
  const [pages, setPages] = useState<Page[]>([]);
  const [owners, setOwners] = useState<OnboardingOwner[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingStep, setEditingStep] = useState<OnboardingStep | null>(null);
  const { user } = useAuth();
  const { toast } = useToast();

  // Form state
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [stepType, setStepType] = useState("task");
  const [targetPageId, setTargetPageId] = useState<string>("");
  const [externalUrl, setExternalUrl] = useState("");
  const [ownerId, setOwnerId] = useState<string>("");

  useEffect(() => {
    fetchSteps();
    fetchPages();
    fetchOwners();
  }, []);

  const fetchSteps = async () => {
    try {
      const { data, error } = await supabase
        .from('onboarding_steps')
        .select(`
          *,
          owner:onboarding_owners(id, name, role, email, phone)
        `)
        .order('sort_order', { ascending: true });

      if (error) throw error;
      setSteps(data || []);
    } catch (error) {
      console.error('Error fetching steps:', error);
      toast({
        title: "Error",
        description: "Failed to load onboarding steps",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchPages = async () => {
    try {
      const { data, error } = await supabase
        .from('pages')
        .select('id, title')
        .is('deleted_at', null)
        .order('title');

      if (error) throw error;
      setPages(data || []);
    } catch (error) {
      console.error('Error fetching pages:', error);
    }
  };

  const fetchOwners = async () => {
    try {
      const { data, error } = await supabase
        .from('onboarding_owners')
        .select('id, name, role, email, phone')
        .order('name');

      if (error) throw error;
      setOwners(data || []);
    } catch (error) {
      console.error('Error fetching owners:', error);
    }
  };

  const resetForm = () => {
    setTitle("");
    setDescription("");
    setStepType("task");
    setTargetPageId("");
    setExternalUrl("");
    setOwnerId("");
    setEditingStep(null);
  };

  const openEditDialog = (step: OnboardingStep) => {
    setEditingStep(step);
    setTitle(step.title);
    setDescription(step.description || "");
    setStepType(step.step_type);
    setTargetPageId(step.target_page_id || "");
    setExternalUrl(step.external_url || "");
    setOwnerId(step.owner_id || "");
    setDialogOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!user) return;

    try {
      const stepData = {
        title,
        description: description || null,
        step_type: stepType,
        target_page_id: stepType === 'internal_page' ? targetPageId || null : null,
        external_url: stepType === 'external_link' ? externalUrl || null : null,
        owner_id: ownerId || null,
      };

      if (editingStep) {
        const { error } = await supabase
          .from('onboarding_steps')
          .update(stepData)
          .eq('id', editingStep.id);

        if (error) throw error;
        toast({ title: "Step updated successfully" });
      } else {
        // Fetch current max sort order from database to avoid race conditions
        const { data: existingSteps } = await supabase
          .from('onboarding_steps')
          .select('sort_order')
          .order('sort_order', { ascending: false })
          .limit(1);
        
        const maxOrder = existingSteps && existingSteps.length > 0 ? existingSteps[0].sort_order : 0;
        
        const { error } = await supabase
          .from('onboarding_steps')
          .insert({ 
            ...stepData, 
            sort_order: (maxOrder || 0) + 1,
            created_by: user.id,
          });

        if (error) throw error;
        toast({ title: "Step created successfully" });
      }

      setDialogOpen(false);
      resetForm();
      fetchSteps();
    } catch (error) {
      console.error('Error saving step:', error);
      toast({
        title: "Error",
        description: "Failed to save onboarding step",
        variant: "destructive",
      });
    }
  };

  const handleDelete = async (stepId: string) => {
    if (!confirm("Are you sure you want to delete this step?")) return;

    try {
      const { error } = await supabase
        .from('onboarding_steps')
        .delete()
        .eq('id', stepId);

      if (error) throw error;
      toast({ title: "Step deleted successfully" });
      fetchSteps();
    } catch (error) {
      console.error('Error deleting step:', error);
      toast({
        title: "Error",
        description: "Failed to delete step",
        variant: "destructive",
      });
    }
  };

  const getStepTypeIcon = (type: string) => {
    switch (type) {
      case 'internal_page':
        return <FileText className="h-4 w-4" />;
      case 'external_link':
        return <Link className="h-4 w-4" />;
      default:
        return <CheckSquare className="h-4 w-4" />;
    }
  };

  const getStepTypeLabel = (type: string) => {
    switch (type) {
      case 'internal_page':
        return 'Academy Page';
      case 'external_link':
        return 'External Link';
      default:
        return 'Task';
    }
  };

  if (loading) {
    return <div className="text-center py-8 text-muted-foreground">Loading...</div>;
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Onboarding Steps Configuration</CardTitle>
        <Dialog open={dialogOpen} onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) resetForm();
        }}>
          <DialogTrigger asChild>
            <Button className="flex items-center gap-2">
              <Plus className="h-4 w-4" />
              Add Step
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingStep ? 'Edit Step' : 'Add New Step'}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="title">Title *</Label>
                <Input
                  id="title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g., Read Health & Safety Policy"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description (supports clickable links)</Label>
                <Textarea
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Optional description. Include full URLs (https://...) to make them clickable."
                  rows={3}
                />
                <p className="text-xs text-muted-foreground">
                  URLs starting with http:// or https:// will be automatically converted to clickable links.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="stepType">Step Type</Label>
                <Select value={stepType} onValueChange={setStepType}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="task">General Task</SelectItem>
                    <SelectItem value="internal_page">Academy Page (requires acknowledgement)</SelectItem>
                    <SelectItem value="external_link">External Link</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {stepType === 'internal_page' && (
                <div className="space-y-2">
                  <Label htmlFor="targetPage">Select Academy Page</Label>
                  <Select value={targetPageId} onValueChange={setTargetPageId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a page..." />
                    </SelectTrigger>
                    <SelectContent>
                      {pages.map((page) => (
                        <SelectItem key={page.id} value={page.id}>
                          {page.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {stepType === 'external_link' && (
                <div className="space-y-2">
                  <Label htmlFor="externalUrl">External URL</Label>
                  <Input
                    id="externalUrl"
                    type="url"
                    value={externalUrl}
                    onChange={(e) => setExternalUrl(e.target.value)}
                    placeholder="https://example.com/training"
                  />
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="owner">Owner</Label>
                <Select value={ownerId || "none"} onValueChange={(value) => setOwnerId(value === "none" ? "" : value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select an owner..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No owner assigned</SelectItem>
                    {owners.map((owner) => (
                      <SelectItem key={owner.id} value={owner.id}>
                        {owner.name} {owner.role ? `(${owner.role})` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  The owner is responsible for this step. Staff will see their contact details.
                </p>
              </div>

              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit">
                  {editingStep ? 'Update' : 'Create'} Step
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        {steps.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            No onboarding steps configured yet. Click "Add Step" to create one.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">#</TableHead>
                <TableHead>Title</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Owner</TableHead>
                <TableHead className="w-24">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {steps.map((step, index) => (
                <TableRow key={step.id}>
                  <TableCell className="font-medium">{index + 1}</TableCell>
                  <TableCell>
                    <div>
                      <div className="font-medium">{step.title}</div>
                      {step.description && (
                        <div className="text-sm text-muted-foreground line-clamp-2">{step.description}</div>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {getStepTypeIcon(step.step_type)}
                      <span>{getStepTypeLabel(step.step_type)}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    {step.owner ? (
                      <div className="flex items-center gap-2">
                        <User className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <div className="font-medium">{step.owner.name}</div>
                          {step.owner.role && (
                            <div className="text-xs text-muted-foreground">{step.owner.role}</div>
                          )}
                        </div>
                      </div>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openEditDialog(step)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(step.id)}
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
