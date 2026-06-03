import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { ClipboardList, Plus, Trash2, Pencil, ExternalLink, Search, Calendar as CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

interface HandoverTemplate {
  id: string;
  name: string;
  description: string | null;
  link: string | null;
}

interface HandoverTask {
  id: string;
  client_name: string;
  template_id: string | null;
  task_name: string;
  task_description: string | null;
  link: string | null;
  handed_over_by: string | null;
  handed_over_to: string | null;
  progress: number;
  target_date: string | null;
  sort_order: number | null;
  created_at: string;
}

interface Props {
  clientName: string;
}

const emptyForm = {
  task_name: "",
  task_description: "",
  link: "",
  handed_over_by: "",
  handed_over_to: "",
  progress: 0,
  target_date: "",
  template_id: null as string | null,
};

export function ClientHandoverTracker({ clientName }: Props) {
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [templateSearch, setTemplateSearch] = useState("");
  const [templatePopoverOpen, setTemplatePopoverOpen] = useState(false);

  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ["client-handover-tasks", clientName],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_handover_tasks")
        .select("*")
        .eq("client_name", clientName)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data || []) as HandoverTask[];
    },
  });

  const { data: templates = [] } = useQuery({
    queryKey: ["handover-task-templates"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("handover_task_templates")
        .select("*")
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true });
      if (error) throw error;
      return (data || []) as HandoverTemplate[];
    },
  });

  const filteredTemplates = useMemo(() => {
    const q = templateSearch.trim().toLowerCase();
    if (!q) return templates;
    return templates.filter(t =>
      t.name.toLowerCase().includes(q) ||
      (t.description || "").toLowerCase().includes(q)
    );
  }, [templates, templateSearch]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        client_name: clientName,
        template_id: form.template_id,
        task_name: form.task_name.trim(),
        task_description: form.task_description.trim() || null,
        link: form.link.trim() || null,
        handed_over_by: form.handed_over_by.trim() || null,
        handed_over_to: form.handed_over_to.trim() || null,
        progress: Math.max(0, Math.min(100, Number(form.progress) || 0)),
        target_date: form.target_date || null,
      };
      if (editingId) {
        const { error } = await supabase
          .from("client_handover_tasks")
          .update(payload)
          .eq("id", editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("client_handover_tasks")
          .insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["client-handover-tasks", clientName] });
      setDialogOpen(false);
      setForm(emptyForm);
      setEditingId(null);
      toast.success(editingId ? "Task updated" : "Task added");
    },
    onError: (e: any) => toast.error(e.message || "Failed to save task"),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("client_handover_tasks").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["client-handover-tasks", clientName] });
      toast.success("Task removed");
    },
    onError: (e: any) => toast.error(e.message || "Failed to delete"),
  });

  const updateProgressMutation = useMutation({
    mutationFn: async ({ id, progress }: { id: string; progress: number }) => {
      const { error } = await supabase
        .from("client_handover_tasks")
        .update({ progress })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["client-handover-tasks", clientName] });
    },
  });

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const openEdit = (t: HandoverTask) => {
    setEditingId(t.id);
    setForm({
      task_name: t.task_name,
      task_description: t.task_description || "",
      link: t.link || "",
      handed_over_by: t.handed_over_by || "",
      handed_over_to: t.handed_over_to || "",
      progress: t.progress,
      target_date: t.target_date || "",
      template_id: t.template_id,
    });
    setDialogOpen(true);
  };

  const applyTemplate = (t: HandoverTemplate) => {
    setForm(prev => ({
      ...prev,
      template_id: t.id,
      task_name: t.name,
      task_description: t.description || "",
      link: t.link || "",
    }));
    setTemplatePopoverOpen(false);
    setTemplateSearch("");
  };

  return (
    <Card className="mt-4 sm:mt-6">
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
          <ClipboardList className="h-5 w-5 text-primary" />
          Handover Tracker
        </CardTitle>
        <Button size="sm" onClick={openCreate}>
          <Plus className="h-4 w-4 mr-1" /> Add Task
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="text-sm text-muted-foreground py-4">Loading…</div>
        ) : tasks.length === 0 ? (
          <div className="text-sm text-muted-foreground py-6 text-center">
            No handover tasks yet. Click "Add Task" to get started.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs uppercase text-muted-foreground border-b">
                <tr>
                  <th className="text-left py-2 px-2">Task</th>
                  <th className="text-left py-2 px-2 hidden md:table-cell">Description</th>
                  <th className="text-left py-2 px-2">Link</th>
                  <th className="text-left py-2 px-2 hidden lg:table-cell">From</th>
                  <th className="text-left py-2 px-2 hidden lg:table-cell">To</th>
                  <th className="text-left py-2 px-2 min-w-[140px]">Progress</th>
                  <th className="text-left py-2 px-2 hidden md:table-cell">Target</th>
                  <th className="text-right py-2 px-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {tasks.map((t) => (
                  <tr key={t.id} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="py-2 px-2 font-medium">{t.task_name}</td>
                    <td className="py-2 px-2 hidden md:table-cell text-muted-foreground max-w-xs truncate" title={t.task_description || ""}>
                      {t.task_description || "—"}
                    </td>
                    <td className="py-2 px-2">
                      {t.link ? (
                        <a href={t.link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
                          <ExternalLink className="h-3.5 w-3.5" /> Open
                        </a>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="py-2 px-2 hidden lg:table-cell">{t.handed_over_by || "—"}</td>
                    <td className="py-2 px-2 hidden lg:table-cell">{t.handed_over_to || "—"}</td>
                    <td className="py-2 px-2">
                      <div className="flex items-center gap-2">
                        <Progress value={t.progress} className="h-2 flex-1" />
                        <input
                          type="number"
                          min={0}
                          max={100}
                          value={t.progress}
                          onChange={(e) => {
                            const v = Math.max(0, Math.min(100, Number(e.target.value) || 0));
                            updateProgressMutation.mutate({ id: t.id, progress: v });
                          }}
                          className="w-14 h-7 text-xs border rounded px-1 bg-background"
                        />
                        <span className="text-xs text-muted-foreground">%</span>
                      </div>
                    </td>
                    <td className="py-2 px-2 hidden md:table-cell">
                      {t.target_date ? format(new Date(t.target_date), "dd MMM yyyy") : "—"}
                    </td>
                    <td className="py-2 px-2 text-right">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(t)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => {
                        if (confirm("Delete this handover task?")) deleteMutation.mutate(t.id);
                      }}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Handover Task" : "Add Handover Task"}</DialogTitle>
            <DialogDescription>
              Pick from predefined tasks or enter a custom one.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            {!editingId && (
              <div>
                <Label className="text-xs">Quick add from template</Label>
                <Popover open={templatePopoverOpen} onOpenChange={setTemplatePopoverOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-start" type="button">
                      <Search className="h-4 w-4 mr-2" />
                      Search predefined tasks…
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[420px] p-0" align="start">
                    <div className="p-2 border-b">
                      <Input
                        autoFocus
                        placeholder="Search tasks…"
                        value={templateSearch}
                        onChange={(e) => setTemplateSearch(e.target.value)}
                      />
                    </div>
                    <div className="max-h-64 overflow-auto">
                      {filteredTemplates.length === 0 ? (
                        <div className="text-sm text-muted-foreground p-4 text-center">
                          No templates found. Admins can add them in Settings.
                        </div>
                      ) : filteredTemplates.map(t => (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => applyTemplate(t)}
                          className="w-full text-left px-3 py-2 hover:bg-muted border-b last:border-0"
                        >
                          <div className="font-medium text-sm">{t.name}</div>
                          {t.description && (
                            <div className="text-xs text-muted-foreground line-clamp-2">{t.description}</div>
                          )}
                        </button>
                      ))}
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
            )}

            <div>
              <Label>Task Name *</Label>
              <Input
                value={form.task_name}
                onChange={(e) => setForm({ ...form, task_name: e.target.value })}
                placeholder="e.g. Transfer email account"
              />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea
                rows={2}
                value={form.task_description}
                onChange={(e) => setForm({ ...form, task_description: e.target.value })}
              />
            </div>
            <div>
              <Label>Link</Label>
              <Input
                value={form.link}
                onChange={(e) => setForm({ ...form, link: e.target.value })}
                placeholder="https://…"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Handed Over By</Label>
                <Input
                  value={form.handed_over_by}
                  onChange={(e) => setForm({ ...form, handed_over_by: e.target.value })}
                />
              </div>
              <div>
                <Label>Handed Over To</Label>
                <Input
                  value={form.handed_over_to}
                  onChange={(e) => setForm({ ...form, handed_over_to: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Progress %</Label>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={form.progress}
                  onChange={(e) => setForm({ ...form, progress: Number(e.target.value) || 0 })}
                />
              </div>
              <div>
                <Label>Target Date</Label>
                <Input
                  type="date"
                  value={form.target_date}
                  onChange={(e) => setForm({ ...form, target_date: e.target.value })}
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button
              onClick={() => saveMutation.mutate()}
              disabled={!form.task_name.trim() || saveMutation.isPending}
            >
              {editingId ? "Save Changes" : "Add Task"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
