import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Plus, Edit, Trash2, GraduationCap, RotateCw, Loader2 } from "lucide-react";

export interface TrainingItem {
  id: string;
  name: string;
  description: string | null;
  refresh_frequency_months: number | null;
  sort_order: number;
  is_active: boolean;
  category: string | null;
}

/** Available training categories (parts). Order defines matrix grouping. */
export const TRAINING_CATEGORIES = ["Part A", "Part B"] as const;

/** Human label for a refresh frequency in months. */
export function refreshLabel(months: number | null): string {
  if (months == null) return "Never expires";
  if (months === 12) return "Yearly (12 months)";
  if (months === 24) return "Every 2 years";
  if (months === 36) return "Every 3 years";
  if (months % 12 === 0) return `Every ${months / 12} years`;
  return `Every ${months} month${months === 1 ? "" : "s"}`;
}

export function TrainingItemsManager() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [items, setItems] = useState<TrainingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<TrainingItem | null>(null);
  const [saving, setSaving] = useState(false);

  // Form state
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [neverExpires, setNeverExpires] = useState(false);
  const [frequencyMonths, setFrequencyMonths] = useState<string>("12");
  const [category, setCategory] = useState<string>(TRAINING_CATEGORIES[0]);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("training_items")
      .select("id, name, description, refresh_frequency_months, sort_order, is_active, category")
      .order("category", { ascending: true })
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true });
    if (error) {
      toast({ title: "Could not load training items", description: error.message, variant: "destructive" });
    } else {
      setItems((data ?? []) as TrainingItem[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const resetForm = () => {
    setName("");
    setDescription("");
    setNeverExpires(false);
    setFrequencyMonths("12");
    setCategory(TRAINING_CATEGORIES[0]);
    setEditing(null);
  };

  const openAdd = () => {
    resetForm();
    setDialogOpen(true);
  };

  const openEdit = (item: TrainingItem) => {
    setEditing(item);
    setName(item.name);
    setDescription(item.description || "");
    setNeverExpires(item.refresh_frequency_months == null);
    setFrequencyMonths(item.refresh_frequency_months != null ? String(item.refresh_frequency_months) : "12");
    setCategory(item.category || TRAINING_CATEGORIES[0]);
    setDialogOpen(true);
  };

  const save = async () => {
    if (!name.trim()) {
      toast({ title: "Name is required", variant: "destructive" });
      return;
    }
    const months = neverExpires ? null : parseInt(frequencyMonths, 10);
    if (!neverExpires && (!Number.isFinite(months as number) || (months as number) <= 0)) {
      toast({ title: "Enter a valid refresh frequency in months", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        const { error } = await supabase
          .from("training_items")
          .update({
            name: name.trim(),
            description: description.trim() || null,
            refresh_frequency_months: months,
            category,
          })
          .eq("id", editing.id);
        if (error) throw error;
        toast({ title: "Training item updated" });
      } else {
        const maxOrder = items.length > 0 ? Math.max(...items.map(i => i.sort_order)) : 0;
        const { error } = await supabase.from("training_items").insert({
          name: name.trim(),
          description: description.trim() || null,
          refresh_frequency_months: months,
          category,
          sort_order: maxOrder + 1,
          created_by: user?.id ?? null,
        });
        if (error) throw error;
        toast({ title: "Training item added" });
      }
      setDialogOpen(false);
      resetForm();
      load();
    } catch (e: any) {
      toast({ title: "Could not save", description: e.message ?? String(e), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (item: TrainingItem) => {
    const { error } = await supabase
      .from("training_items")
      .update({ is_active: !item.is_active })
      .eq("id", item.id);
    if (error) {
      toast({ title: "Could not update", description: error.message, variant: "destructive" });
    } else {
      load();
    }
  };

  const remove = async (item: TrainingItem) => {
    if (!confirm(`Delete "${item.name}"? This also removes all staff records for it.`)) return;
    const { error } = await supabase.from("training_items").delete().eq("id", item.id);
    if (error) {
      toast({ title: "Could not delete", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Training item deleted" });
      load();
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold">Training Items</h3>
          <p className="text-sm text-muted-foreground">
            Configure the courses and certifications shown on the training matrix, and how often each must be refreshed.
          </p>
        </div>
        <Button onClick={openAdd}>
          <Plus className="h-4 w-4 mr-1.5" /> Add Item
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 py-12 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <GraduationCap className="h-10 w-10 text-muted-foreground" />
            <p className="font-medium">No training items yet</p>
            <p className="text-sm text-muted-foreground">Add your first item to start tracking staff training.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {items.map(item => (
            <Card key={item.id} className={item.is_active ? "" : "opacity-60"}>
              <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium">{item.name}</p>
                    {item.category && <Badge variant="outline">{item.category}</Badge>}
                    {!item.is_active && <Badge variant="secondary">Inactive</Badge>}
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-0.5">
                    <RotateCw className="h-3 w-3" />
                    {refreshLabel(item.refresh_frequency_months)}
                  </div>
                  {item.description && (
                    <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{item.description}</p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1.5 mr-1">
                    <Switch checked={item.is_active} onCheckedChange={() => toggleActive(item)} />
                    <span className="text-xs text-muted-foreground hidden sm:inline">Active</span>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => openEdit(item)}>
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-destructive hover:text-destructive"
                    onClick={() => remove(item)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={(o) => { setDialogOpen(o); if (!o) resetForm(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Training Item" : "Add Training Item"}</DialogTitle>
            <DialogDescription>
              These appear as rows on the training matrix in HR → Training.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-1.5">
              <Label htmlFor="ti-category">Category / Part</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger id="ti-category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TRAINING_CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">Groups this training on the matrix.</p>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="ti-name">Name *</Label>
              <Input
                id="ti-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Safeguarding Adults, Manual Handling"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="ti-desc">Description</Label>
              <Textarea
                id="ti-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional notes about this training"
                rows={2}
              />
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <Label htmlFor="ti-never" className="cursor-pointer">Never expires</Label>
                <p className="text-xs text-muted-foreground">One-off training that doesn't need refreshing.</p>
              </div>
              <Switch id="ti-never" checked={neverExpires} onCheckedChange={setNeverExpires} />
            </div>
            {!neverExpires && (
              <div className="grid gap-1.5">
                <Label htmlFor="ti-freq">Refresh frequency (months)</Label>
                <Input
                  id="ti-freq"
                  type="number"
                  min={1}
                  value={frequencyMonths}
                  onChange={(e) => setFrequencyMonths(e.target.value)}
                  placeholder="e.g. 12 for annual"
                />
                <p className="text-xs text-muted-foreground">
                  Common values: 12 (yearly), 24 (2 years), 36 (3 years).
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>Cancel</Button>
            <Button onClick={save} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
              {editing ? "Save changes" : "Add item"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
