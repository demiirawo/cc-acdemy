import { useState, useMemo, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { ClipboardList, Plus, Trash2, ExternalLink, Search, Check, X } from "lucide-react";
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

type Draft = {
  task_name: string;
  task_description: string;
  link: string;
  handed_over_by: string;
  handed_over_to: string;
  progress: number;
  target_date: string;
  template_id: string | null;
};

const emptyDraft: Draft = {
  task_name: "",
  task_description: "",
  link: "",
  handed_over_by: "",
  handed_over_to: "",
  progress: 0,
  target_date: "",
  template_id: null,
};

export function ClientHandoverTracker({ clientName }: Props) {
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [templateSearch, setTemplateSearch] = useState("");
  const [templatePopoverOpen, setTemplatePopoverOpen] = useState(false);
  const firstInputRef = useRef<HTMLInputElement | null>(null);

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

  useEffect(() => {
    if (adding) firstInputRef.current?.focus();
  }, [adding]);

  const createMutation = useMutation({
    mutationFn: async (d: Draft) => {
      const payload = {
        client_name: clientName,
        template_id: d.template_id,
        task_name: d.task_name.trim(),
        task_description: d.task_description.trim() || null,
        link: d.link.trim() || null,
        handed_over_by: d.handed_over_by.trim() || null,
        handed_over_to: d.handed_over_to.trim() || null,
        progress: Math.max(0, Math.min(100, Number(d.progress) || 0)),
        target_date: d.target_date || null,
      };
      const { error } = await supabase.from("client_handover_tasks").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["client-handover-tasks", clientName] });
      setDraft(emptyDraft);
      setAdding(false);
      toast.success("Task added");
    },
    onError: (e: any) => toast.error(e.message || "Failed to save"),
  });

  const updateFieldMutation = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<HandoverTask> }) => {
      const { error } = await supabase.from("client_handover_tasks").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["client-handover-tasks", clientName] });
    },
    onError: (e: any) => toast.error(e.message || "Update failed"),
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
  });

  const applyTemplate = (t: HandoverTemplate) => {
    setDraft(prev => ({
      ...prev,
      template_id: t.id,
      task_name: t.name,
      task_description: t.description || "",
      link: t.link || "",
    }));
    setTemplatePopoverOpen(false);
    setTemplateSearch("");
  };

  const saveDraft = () => {
    if (!draft.task_name.trim()) {
      toast.error("Task name is required");
      return;
    }
    createMutation.mutate(draft);
  };

  const cancelDraft = () => {
    setDraft(emptyDraft);
    setAdding(false);
  };

  // Inline editable cell helper (saves on blur / Enter)
  const EditableCell = ({
    value, onSave, type = "text", placeholder, className = "",
  }: {
    value: string | number | null;
    onSave: (v: string) => void;
    type?: "text" | "number" | "date";
    placeholder?: string;
    className?: string;
  }) => {
    const [local, setLocal] = useState<string>(value === null || value === undefined ? "" : String(value));
    useEffect(() => {
      setLocal(value === null || value === undefined ? "" : String(value));
    }, [value]);
    return (
      <input
        type={type}
        value={local}
        placeholder={placeholder}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={() => {
          if (local !== (value === null || value === undefined ? "" : String(value))) onSave(local);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          if (e.key === "Escape") {
            setLocal(value === null || value === undefined ? "" : String(value));
            (e.target as HTMLInputElement).blur();
          }
        }}
        className={`w-full bg-transparent border border-transparent hover:border-input focus:border-ring focus:bg-background rounded px-1.5 py-1 text-sm outline-none ${className}`}
      />
    );
  };

  return (
    <Card className="mt-4 sm:mt-6">
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
          <ClipboardList className="h-5 w-5 text-primary" />
          Handover Tracker
        </CardTitle>
        {!adding && (
          <Button size="sm" onClick={() => setAdding(true)}>
            <Plus className="h-4 w-4 mr-1" /> Add Task
          </Button>
        )}
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs uppercase text-muted-foreground border-b">
              <tr>
                <th className="text-left py-2 px-2 min-w-[160px]">Task</th>
                <th className="text-left py-2 px-2 min-w-[180px]">Description</th>
                <th className="text-left py-2 px-2 min-w-[140px]">Link</th>
                <th className="text-left py-2 px-2 min-w-[120px]">From</th>
                <th className="text-left py-2 px-2 min-w-[120px]">To</th>
                <th className="text-left py-2 px-2 min-w-[160px]">Progress</th>
                <th className="text-left py-2 px-2 min-w-[140px]">Target</th>
                <th className="py-2 px-2 w-8"></th>
              </tr>
            </thead>
            <tbody>
              {tasks.map((t) => (
                <tr key={t.id} className="border-b last:border-0 hover:bg-muted/30 align-top">
                  <td className="py-1 px-1">
                    <EditableCell
                      value={t.task_name}
                      onSave={(v) => updateFieldMutation.mutate({ id: t.id, patch: { task_name: v || t.task_name } })}
                      className="font-medium"
                    />
                  </td>
                  <td className="py-1 px-1">
                    <EditableCell
                      value={t.task_description}
                      placeholder="Add description…"
                      onSave={(v) => updateFieldMutation.mutate({ id: t.id, patch: { task_description: v || null } })}
                    />
                  </td>
                  <td className="py-1 px-1">
                    <div className="flex items-center gap-1">
                      <EditableCell
                        value={t.link}
                        placeholder="https://…"
                        onSave={(v) => updateFieldMutation.mutate({ id: t.id, patch: { link: v || null } })}
                      />
                      {t.link && (
                        <a href={t.link} target="_blank" rel="noopener noreferrer" className="text-primary shrink-0">
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      )}
                    </div>
                  </td>
                  <td className="py-1 px-1">
                    <EditableCell
                      value={t.handed_over_by}
                      placeholder="—"
                      onSave={(v) => updateFieldMutation.mutate({ id: t.id, patch: { handed_over_by: v || null } })}
                    />
                  </td>
                  <td className="py-1 px-1">
                    <EditableCell
                      value={t.handed_over_to}
                      placeholder="—"
                      onSave={(v) => updateFieldMutation.mutate({ id: t.id, patch: { handed_over_to: v || null } })}
                    />
                  </td>
                  <td className="py-1 px-1">
                    <div className="flex items-center gap-2 px-1">
                      <Progress value={t.progress} className="h-2 flex-1" />
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={t.progress}
                        onChange={(e) => {
                          const v = Math.max(0, Math.min(100, Number(e.target.value) || 0));
                          updateFieldMutation.mutate({ id: t.id, patch: { progress: v } });
                        }}
                        className="w-14 h-7 text-xs border rounded px-1 bg-background"
                      />
                      <span className="text-xs text-muted-foreground">%</span>
                    </div>
                  </td>
                  <td className="py-1 px-1">
                    <EditableCell
                      value={t.target_date}
                      type="date"
                      onSave={(v) => updateFieldMutation.mutate({ id: t.id, patch: { target_date: v || null } })}
                    />
                  </td>
                  <td className="py-1 px-1 text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => { if (confirm("Delete this task?")) deleteMutation.mutate(t.id); }}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </td>
                </tr>
              ))}

              {adding && (
                <tr className="bg-muted/30 align-top">
                  <td className="py-2 px-1">
                    <div className="space-y-1">
                      <Input
                        ref={firstInputRef}
                        value={draft.task_name}
                        onChange={(e) => setDraft({ ...draft, task_name: e.target.value })}
                        placeholder="Task name *"
                        className="h-8"
                      />
                      <Popover open={templatePopoverOpen} onOpenChange={setTemplatePopoverOpen}>
                        <PopoverTrigger asChild>
                          <button
                            type="button"
                            className="text-xs text-primary hover:underline inline-flex items-center gap-1"
                          >
                            <Search className="h-3 w-3" /> Use template
                          </button>
                        </PopoverTrigger>
                        <PopoverContent className="w-[360px] p-0" align="start">
                          <div className="p-2 border-b">
                            <Input
                              autoFocus
                              placeholder="Search templates…"
                              value={templateSearch}
                              onChange={(e) => setTemplateSearch(e.target.value)}
                              className="h-8"
                            />
                          </div>
                          <div className="max-h-64 overflow-auto">
                            {filteredTemplates.length === 0 ? (
                              <div className="text-sm text-muted-foreground p-4 text-center">
                                No templates found.
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
                  </td>
                  <td className="py-2 px-1">
                    <Input
                      value={draft.task_description}
                      onChange={(e) => setDraft({ ...draft, task_description: e.target.value })}
                      placeholder="Description"
                      className="h-8"
                    />
                  </td>
                  <td className="py-2 px-1">
                    <Input
                      value={draft.link}
                      onChange={(e) => setDraft({ ...draft, link: e.target.value })}
                      placeholder="https://…"
                      className="h-8"
                    />
                  </td>
                  <td className="py-2 px-1">
                    <Input
                      value={draft.handed_over_by}
                      onChange={(e) => setDraft({ ...draft, handed_over_by: e.target.value })}
                      placeholder="From"
                      className="h-8"
                    />
                  </td>
                  <td className="py-2 px-1">
                    <Input
                      value={draft.handed_over_to}
                      onChange={(e) => setDraft({ ...draft, handed_over_to: e.target.value })}
                      placeholder="To"
                      className="h-8"
                    />
                  </td>
                  <td className="py-2 px-1">
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        value={draft.progress}
                        onChange={(e) => setDraft({ ...draft, progress: Number(e.target.value) || 0 })}
                        className="h-8 w-20"
                      />
                      <span className="text-xs text-muted-foreground">%</span>
                    </div>
                  </td>
                  <td className="py-2 px-1">
                    <Input
                      type="date"
                      value={draft.target_date}
                      onChange={(e) => setDraft({ ...draft, target_date: e.target.value })}
                      className="h-8"
                    />
                  </td>
                  <td className="py-2 px-1">
                    <div className="flex flex-col gap-1">
                      <Button
                        size="icon"
                        variant="default"
                        className="h-7 w-7"
                        onClick={saveDraft}
                        disabled={createMutation.isPending || !draft.task_name.trim()}
                        title="Save"
                      >
                        <Check className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        onClick={cancelDraft}
                        title="Cancel"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              )}

              {!isLoading && tasks.length === 0 && !adding && (
                <tr>
                  <td colSpan={8} className="py-6 text-center text-sm text-muted-foreground">
                    No handover tasks yet. Click "Add Task" to add one inline.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {adding && (
          <div className="flex justify-end gap-2 mt-3">
            <Button variant="outline" size="sm" onClick={cancelDraft}>Cancel</Button>
            <Button size="sm" onClick={saveDraft} disabled={createMutation.isPending || !draft.task_name.trim()}>
              Add Task
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
