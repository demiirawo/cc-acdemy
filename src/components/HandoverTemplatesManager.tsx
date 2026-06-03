import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { ClipboardList, Plus, Pencil, Trash2, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";

interface Template {
  id: string;
  name: string;
  description: string | null;
  link: string | null;
  sort_order: number | null;
}

const empty = { name: "", description: "", link: "" };

export function HandoverTemplatesManager() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(empty);

  const { data: templates = [], isLoading } = useQuery({
    queryKey: ["handover-task-templates"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("handover_task_templates")
        .select("*")
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true });
      if (error) throw error;
      return (data || []) as Template[];
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        name: form.name.trim(),
        description: form.description.trim() || null,
        link: form.link.trim() || null,
      };
      if (editingId) {
        const { error } = await supabase.from("handover_task_templates").update(payload).eq("id", editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("handover_task_templates").insert({ ...payload, created_by: user?.id });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["handover-task-templates"] });
      setOpen(false); setForm(empty); setEditingId(null);
      toast.success(editingId ? "Template updated" : "Template added");
    },
    onError: (e: any) => toast.error(e.message || "Save failed"),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("handover_task_templates").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["handover-task-templates"] });
      toast.success("Template removed");
    },
    onError: (e: any) => toast.error(e.message || "Delete failed"),
  });

  const openCreate = () => { setEditingId(null); setForm(empty); setOpen(true); };
  const openEdit = (t: Template) => {
    setEditingId(t.id);
    setForm({ name: t.name, description: t.description || "", link: t.link || "" });
    setOpen(true);
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="flex items-center gap-2">
            <ClipboardList className="h-5 w-5" /> Handover Task Templates
          </CardTitle>
          <CardDescription>
            Predefined tasks shown in the client handover tracker on the public link.
          </CardDescription>
        </div>
        <Button size="sm" onClick={openCreate}><Plus className="h-4 w-4 mr-1" /> Add Template</Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="text-sm text-muted-foreground py-4">Loading…</div>
        ) : templates.length === 0 ? (
          <div className="text-sm text-muted-foreground py-6 text-center">No templates yet.</div>
        ) : (
          <div className="divide-y border rounded-md">
            {templates.map(t => (
              <div key={t.id} className="flex items-start justify-between gap-3 p-3">
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{t.name}</div>
                  {t.description && <div className="text-sm text-muted-foreground">{t.description}</div>}
                  {t.link && (
                    <a href={t.link} target="_blank" rel="noopener noreferrer" className="text-xs text-primary inline-flex items-center gap-1 mt-1 hover:underline">
                      <ExternalLink className="h-3 w-3" /> {t.link}
                    </a>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="icon" onClick={() => openEdit(t)}><Pencil className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" onClick={() => {
                    if (confirm(`Delete template "${t.name}"?`)) remove.mutate(t.id);
                  }}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Template" : "Add Template"}</DialogTitle>
            <DialogDescription>Define a reusable handover task.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Task Name *</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
            <div>
              <Label>Link</Label>
              <Input value={form.link} onChange={(e) => setForm({ ...form, link: e.target.value })} placeholder="https://…" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={() => save.mutate()} disabled={!form.name.trim() || save.isPending}>
              {editingId ? "Save Changes" : "Add Template"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
