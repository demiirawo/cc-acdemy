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
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Edit, Trash2, FileText, Link, CheckSquare, User, GripVertical } from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragOverEvent,
  DragStartEvent,
  DragOverlay,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

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
  stage: string;
  created_at: string;
  owner?: OnboardingOwner | null;
}

const DEFAULT_STAGES = [
  "Getting Started",
  "Company Policies",
  "Training",
  "Systems & Tools",
  "Final Checks"
];

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
  const [activeId, setActiveId] = useState<string | null>(null);
  const [expandedStages, setExpandedStages] = useState<string[]>(DEFAULT_STAGES);
  const { user } = useAuth();
  const { toast } = useToast();

  // Form state
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [stepType, setStepType] = useState("task");
  const [targetPageId, setTargetPageId] = useState<string>("");
  const [externalUrl, setExternalUrl] = useState("");
  const [ownerId, setOwnerId] = useState<string>("");
  const [stage, setStage] = useState<string>("Getting Started");

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
        .order('stage', { ascending: true })
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
    setStage("Getting Started");
    setEditingStep(null);
  };

  const openAddDialogForStage = (stageName: string) => {
    resetForm();
    setStage(stageName);
    setDialogOpen(true);
  };

  const openEditDialog = (step: OnboardingStep) => {
    setEditingStep(step);
    setTitle(step.title);
    setDescription(step.description || "");
    setStepType(step.step_type);
    setTargetPageId(step.target_page_id || "");
    setExternalUrl(step.external_url || "");
    setOwnerId(step.owner_id || "");
    setStage(step.stage || "Getting Started");
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
        stage,
      };

      if (editingStep) {
        const { error } = await supabase
          .from('onboarding_steps')
          .update(stepData)
          .eq('id', editingStep.id);

        if (error) throw error;
        toast({ title: "Step updated successfully" });
      } else {
        // Get max sort order for this specific stage
        const stageSteps = steps.filter(s => s.stage === stage);
        const maxOrder = stageSteps.length > 0 
          ? Math.max(...stageSteps.map(s => s.sort_order)) 
          : 0;
        
        const { error } = await supabase
          .from('onboarding_steps')
          .insert({ 
            ...stepData, 
            sort_order: maxOrder + 1,
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
      case 'acknowledgement':
        return <CheckSquare className="h-4 w-4" />;
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
      case 'acknowledgement':
        return 'Acknowledgement';
      default:
        return 'Task';
    }
  };

  // Group steps by stage
  const stepsByStage = DEFAULT_STAGES.reduce((acc, stageName) => {
    acc[stageName] = steps.filter(s => s.stage === stageName).sort((a, b) => a.sort_order - b.sort_order);
    return acc;
  }, {} as Record<string, OnboardingStep[]>);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragOver = (event: DragOverEvent) => {
    const { active, over } = event;
    if (!over) return;

    const activeStep = steps.find(s => s.id === active.id);
    const overStep = steps.find(s => s.id === over.id);

    if (!activeStep) return;

    // If dropping on another step, update the stage if different
    if (overStep && activeStep.stage !== overStep.stage) {
      setSteps(prevSteps => 
        prevSteps.map(s => 
          s.id === activeStep.id ? { ...s, stage: overStep.stage } : s
        )
      );
    }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);

    if (!over || active.id === over.id) return;

    const activeStep = steps.find(s => s.id === active.id);
    const overStep = steps.find(s => s.id === over.id);

    if (!activeStep || !overStep) return;

    const targetStage = overStep.stage;
    const stageSteps = steps.filter(s => s.stage === targetStage || s.id === active.id);
    
    // Get indices within the stage
    const oldIndex = stageSteps.findIndex(s => s.id === active.id);
    const newIndex = stageSteps.findIndex(s => s.id === over.id);

    if (oldIndex === -1 || newIndex === -1) return;

    // Update local state
    const updatedStageSteps = arrayMove(stageSteps, oldIndex, newIndex);
    
    // Build new steps array
    const newSteps = steps.map(step => {
      if (step.id === active.id) {
        return { ...step, stage: targetStage };
      }
      return step;
    });

    // Update sort orders for the affected stage
    const finalSteps = newSteps.map(step => {
      const indexInStage = updatedStageSteps.findIndex(s => s.id === step.id);
      if (indexInStage !== -1 && step.stage === targetStage) {
        return { ...step, sort_order: indexInStage + 1 };
      }
      return step;
    });

    setSteps(finalSteps);

    // Update database
    try {
      const stageStepsToUpdate = finalSteps.filter(s => s.stage === targetStage);
      
      for (const step of stageStepsToUpdate) {
        await supabase
          .from('onboarding_steps')
          .update({ 
            sort_order: step.sort_order,
            stage: step.stage 
          })
          .eq('id', step.id);
      }

      // Also update the moved step's stage if it changed
      if (activeStep.stage !== targetStage) {
        await supabase
          .from('onboarding_steps')
          .update({ stage: targetStage })
          .eq('id', String(active.id));
      }

      toast({ title: "Order updated successfully" });
    } catch (error) {
      console.error('Error updating order:', error);
      toast({
        title: "Error",
        description: "Failed to update order",
        variant: "destructive",
      });
      fetchSteps();
    }
  };

  const activeStep = activeId ? steps.find(s => s.id === activeId) : null;

  if (loading) {
    return <div className="text-center py-8 text-muted-foreground">Loading...</div>;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Onboarding Steps Configuration</CardTitle>
      </CardHeader>
      <CardContent>
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
        >
          <Accordion 
            type="multiple" 
            value={expandedStages}
            onValueChange={setExpandedStages}
            className="space-y-4"
          >
            {DEFAULT_STAGES.map((stageName) => {
              const stageSteps = stepsByStage[stageName] || [];
              return (
                <AccordionItem 
                  key={stageName} 
                  value={stageName}
                  className="border rounded-lg px-4"
                >
                  <AccordionTrigger className="hover:no-underline">
                    <div className="flex items-center gap-3">
                      <span className="font-semibold">{stageName}</span>
                      <span className="text-sm text-muted-foreground">
                        ({stageSteps.length} step{stageSteps.length !== 1 ? 's' : ''})
                      </span>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="space-y-2 pb-4">
                      <SortableContext 
                        items={stageSteps.map(s => s.id)} 
                        strategy={verticalListSortingStrategy}
                      >
                        {stageSteps.length === 0 ? (
                          <div className="text-center py-4 text-muted-foreground text-sm">
                            No steps in this stage yet
                          </div>
                        ) : (
                          stageSteps.map((step, index) => (
                            <SortableStepCard
                              key={step.id}
                              step={step}
                              index={index}
                              onEdit={openEditDialog}
                              onDelete={handleDelete}
                              getStepTypeIcon={getStepTypeIcon}
                              getStepTypeLabel={getStepTypeLabel}
                            />
                          ))
                        )}
                      </SortableContext>
                      
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full mt-2"
                        onClick={() => openAddDialogForStage(stageName)}
                      >
                        <Plus className="h-4 w-4 mr-2" />
                        Add Step to {stageName}
                      </Button>
                    </div>
                  </AccordionContent>
                </AccordionItem>
              );
            })}
          </Accordion>

          <DragOverlay>
            {activeStep ? (
              <div className="bg-card border rounded-lg p-3 shadow-lg opacity-90">
                <div className="font-medium">{activeStep.title}</div>
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>

        {/* Add/Edit Dialog */}
        <Dialog open={dialogOpen} onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) resetForm();
        }}>
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
                <Label htmlFor="stage">Stage</Label>
                <Select value={stage} onValueChange={setStage}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DEFAULT_STAGES.map((s) => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="stepType">Step Type</Label>
                <Select value={stepType} onValueChange={setStepType}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="task">General Task</SelectItem>
                    <SelectItem value="acknowledgement">Acknowledgement (information to acknowledge)</SelectItem>
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
      </CardContent>
    </Card>
  );
}

// Sortable card component for steps
interface SortableStepCardProps {
  step: OnboardingStep;
  index: number;
  onEdit: (step: OnboardingStep) => void;
  onDelete: (id: string) => void;
  getStepTypeIcon: (type: string) => React.ReactNode;
  getStepTypeLabel: (type: string) => string;
}

function SortableStepCard({ 
  step, 
  index,
  onEdit, 
  onDelete, 
  getStepTypeIcon, 
  getStepTypeLabel 
}: SortableStepCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: step.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div 
      ref={setNodeRef} 
      style={style}
      className="flex items-center gap-3 p-3 bg-background border rounded-lg hover:bg-muted/50 transition-colors"
    >
      <button
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing p-1 hover:bg-muted rounded flex-shrink-0"
      >
        <GripVertical className="h-4 w-4 text-muted-foreground" />
      </button>
      
      <span className="text-sm text-muted-foreground w-6 flex-shrink-0">{index + 1}.</span>
      
      <div className="flex-1 min-w-0">
        <div className="font-medium truncate">{step.title}</div>
        {step.description && (
          <div className="text-sm text-muted-foreground line-clamp-1">{step.description}</div>
        )}
      </div>
      
      <div className="flex items-center gap-2 flex-shrink-0">
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          {getStepTypeIcon(step.step_type)}
          <span className="hidden sm:inline">{getStepTypeLabel(step.step_type)}</span>
        </div>
        
        {step.owner && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <User className="h-3 w-3" />
            <span className="hidden md:inline">{step.owner.name}</span>
          </div>
        )}
      </div>
      
      <div className="flex items-center gap-1 flex-shrink-0">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onEdit(step)}
        >
          <Edit className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onDelete(step.id)}
          className="text-destructive hover:text-destructive"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
