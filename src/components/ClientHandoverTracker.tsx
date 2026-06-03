import { useState, useMemo, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Trash2, ExternalLink, Search, Plus } from "lucide-react";
import { toast } from "sonner";

interface HandoverTemplate {
  id: string;
  name: string;
  description: string | null;
  link: string | null;
  category: string | null;
}

interface HandoverTask {
  id: string;
  client_name: string;
  template_id: string | null;
  category: string | null;
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

type DraftRow = {
  key: string;
  category: string;
  task_name: string;
  task_description: string;
  link: string;
  handed_over_by: string;
  handed_over_to: string;
  progress: number;
  target_date: string;
  template_id: string | null;
};

const newDraft = (category = ""): DraftRow => ({
  key: `draft-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  category,
  task_name: "",
  task_description: "",
  link: "",
  handed_over_by: "",
  handed_over_to: "",
  progress: 0,
  target_date: "",
  template_id: null,
});

const UNCATEGORIZED = "Uncategorized";

// Spreadsheet-style cell (text/date/number/textarea). Saves on blur/Enter.
function Cell({
  value, onCommit, type = "text", placeholder, className = "", min, max, multiline,
}: {
  value: string | number | null;
  onCommit: (v: string) => void;
  type?: "text" | "number" | "date";
  placeholder?: string;
  className?: string;
  min?: number;
  max?: number;
  multiline?: boolean;
}) {
  const initial = value === null || value === undefined ? "" : String(value);
  const [local, setLocal] = useState<string>(initial);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { setLocal(initial); }, [initial]);
  useEffect(() => {
    if (multiline && textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = textareaRef.current.scrollHeight + "px";
    }
  }, [local, multiline]);
  if (multiline) {
    return (
      <textarea
        ref={textareaRef}
        value={local}
        placeholder={placeholder}
        rows={1}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={() => { if (local !== initial) onCommit(local); }}
        onKeyDown={(e) => {
          if (e.key === "Escape") { setLocal(initial); (e.target as HTMLTextAreaElement).blur(); }
        }}
        className={`w-full bg-transparent border-0 px-2 py-1.5 text-sm outline-none focus:bg-background focus:ring-2 focus:ring-ring focus:ring-inset resize-none min-h-[36px] ${className}`}
      />
    );
  }
  return (
    <input
      type={type}
      value={local}
      placeholder={placeholder}
      min={min}
      max={max}
      onChange={(e) => setLocal(e.target.value)}
      onBlur={() => { if (local !== initial) onCommit(local); }}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        if (e.key === "Escape") { setLocal(initial); (e.target as HTMLInputElement).blur(); }
      }}
      className={`w-full h-full bg-transparent border-0 px-2 py-1.5 text-sm outline-none focus:bg-background focus:ring-2 focus:ring-ring focus:ring-inset ${className}`}
    />
  );
}

export function ClientHandoverTracker({ clientName }: Props) {
  const qc = useQueryClient();
  const [draft, setDraft] = useState<DraftRow>(newDraft());
  const [templateSearch, setTemplateSearch] = useState("");
  const [templatePopoverOpen, setTemplatePopoverOpen] = useState(false);

  const { data: tasks = [] } = useQuery({
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
      t.name.toLowerCase().includes(q) || (t.description || "").toLowerCase().includes(q)
    );
  }, [templates, templateSearch]);

  // Group tasks by category, preserving first-seen order
  const groupedTasks = useMemo(() => {
    const groups = new Map<string, HandoverTask[]>();
    for (const t of tasks) {
      const cat = (t.category || "").trim() || UNCATEGORIZED;
      if (!groups.has(cat)) groups.set(cat, []);
      groups.get(cat)!.push(t);
    }
    return Array.from(groups.entries());
  }, [tasks]);

  const createMutation = useMutation({
    mutationFn: async (d: DraftRow) => {
      const payload = {
        client_name: clientName,
        template_id: d.template_id,
        category: d.category.trim() || null,
        task_name: d.task_name.trim() || "Untitled task",
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
      setDraft(newDraft());
    },
    onError: (e: any) => toast.error(e.message || "Failed to add row"),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<HandoverTask> }) => {
      const { error } = await supabase.from("client_handover_tasks").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["client-handover-tasks", clientName] }),
    onError: (e: any) => toast.error(e.message || "Update failed"),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("client_handover_tasks").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["client-handover-tasks", clientName] }),
  });

  const draftHasContent = (d: DraftRow) =>
    !!(d.task_name.trim() || d.task_description.trim() || d.link.trim() ||
       d.handed_over_by.trim() || d.handed_over_to.trim() || d.category.trim() ||
       d.target_date || d.progress > 0 || d.template_id);

  const commitDraftIfFilled = (next: DraftRow) => {
    setDraft(next);
    if (draftHasContent(next) && next.task_name.trim()) {
      createMutation.mutate(next);
    }
  };

  function targetDateClasses(targetDate: string | null) {
    if (!targetDate) return "";
    const days = Math.ceil((new Date(targetDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    if (days > 14) return "bg-success/10 text-success";
    if (days >= 5) return "bg-warning/10 text-warning";
    return "bg-destructive/10 text-destructive";
  }

  const applyTemplateToDraft = (t: HandoverTemplate) => {
    const next: DraftRow = {
      ...draft,
      template_id: t.id,
      category: draft.category || t.category || "",
      task_name: t.name,
      task_description: t.description || "",
      link: t.link || "",
    };
    setTemplatePopoverOpen(false);
    setTemplateSearch("");
    commitDraftIfFilled(next);
  };

  const cellClasses = "border-r border-border last:border-r-0 align-middle";
  const cellClassesTop = "border-r border-border last:border-r-0 align-top";

  function LinkCell({
    value,
    onCommit,
  }: {
    value: string | null;
    onCommit: (v: string) => void;
  }) {
    const [editing, setEditing] = useState(false);
    const initial = value ?? "";
    const [local, setLocal] = useState(initial);
    useEffect(() => { setLocal(initial); }, [initial]);

    if (!editing && value) {
      return (
        <div
          className="flex items-center justify-center h-full px-2 cursor-pointer"
          onDoubleClick={() => setEditing(true)}
        >
          <a
            href={value}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:text-primary/80"
            onClick={(e) => e.stopPropagation()}
          >
            <ExternalLink className="h-4 w-4" />
          </a>
        </div>
      );
    }

    return (
      <input
        type="text"
        value={local}
        autoFocus={editing}
        placeholder="https://…"
        onChange={(e) => setLocal(e.target.value)}
        onBlur={() => {
          setEditing(false);
          if (local !== initial) onCommit(local);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          if (e.key === "Escape") {
            setLocal(initial);
            setEditing(false);
          }
        }}
        className="w-full h-full bg-transparent border-0 px-2 py-1.5 text-sm outline-none focus:bg-background focus:ring-2 focus:ring-ring focus:ring-inset"
      />
    );
  }

  const renderTaskRow = (t: HandoverTask) => (
    <tr key={t.id} className="border-t border-border hover:bg-muted/20 group">
      <td className={cellClassesTop}>
        <Cell
          value={t.category}
          placeholder="—"
          onCommit={(v) => updateMutation.mutate({ id: t.id, patch: { category: v.trim() || null } })}
        />
      </td>
      <td className={cellClassesTop}>
        <Cell
          value={t.task_name}
          onCommit={(v) => updateMutation.mutate({ id: t.id, patch: { task_name: v.trim() || t.task_name } })}
          className="font-medium"
          multiline
        />
      </td>
      <td className={cellClassesTop}>
        <Cell
          value={t.task_description}
          placeholder="—"
          onCommit={(v) => updateMutation.mutate({ id: t.id, patch: { task_description: v.trim() || null } })}
          multiline
        />
      </td>
      <td className={cellClasses}>
        <LinkCell
          value={t.link}
          onCommit={(v) => updateMutation.mutate({ id: t.id, patch: { link: v.trim() || null } })}
        />
      </td>
      <td className={cellClasses}>
        <Cell
          value={t.handed_over_by}
          placeholder="—"
          onCommit={(v) => updateMutation.mutate({ id: t.id, patch: { handed_over_by: v.trim() || null } })}
        />
      </td>
      <td className={cellClasses}>
        <Cell
          value={t.handed_over_to}
          placeholder="—"
          onCommit={(v) => updateMutation.mutate({ id: t.id, patch: { handed_over_to: v.trim() || null } })}
        />
      </td>
      <td className={cellClasses}>
        <div className="flex items-center gap-2 px-2">
          <Progress value={t.progress} className="h-2 flex-1" />
          <input
            type="number"
            min={0}
            max={100}
            value={t.progress}
            onChange={(e) => {
              const v = Math.max(0, Math.min(100, Number(e.target.value) || 0));
              updateMutation.mutate({ id: t.id, patch: { progress: v } });
            }}
            className="w-12 h-6 text-xs bg-transparent border border-transparent hover:border-input rounded px-1 outline-none focus:border-ring focus:bg-background"
          />
          <span className="text-xs text-muted-foreground">%</span>
        </div>
      </td>
      <td className={`${cellClasses} ${targetDateClasses(t.target_date)}`}>
        <Cell
          value={t.target_date}
          type="date"
          onCommit={(v) => updateMutation.mutate({ id: t.id, patch: { target_date: v || null } })}
        />
      </td>
      <td className="px-1 text-right">
        <button
          onClick={() => { if (confirm("Delete this task?")) deleteMutation.mutate(t.id); }}
          className="opacity-0 group-hover:opacity-100 transition p-1 hover:text-destructive"
          title="Delete"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </td>
    </tr>
  );

  return (
    <Card className="mt-4 sm:mt-6">
      <CardHeader className="pb-2 px-3 sm:px-6">
        <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
          Handover Tracker
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0 sm:p-0">
        <div className="overflow-x-auto border-t border-b">
          <table className="w-full text-sm border-collapse">
            <colgroup>
              <col style={{ width: "12%" }} />
              <col style={{ width: "16%" }} />
              <col style={{ width: "20%" }} />
              <col style={{ width: "8%" }} />
              <col style={{ width: "9%" }} />
              <col style={{ width: "9%" }} />
              <col style={{ width: "13%" }} />
              <col style={{ width: "9%" }} />
              <col style={{ width: "4%" }} />
            </colgroup>
            <thead>
              <tr className="bg-muted/50 text-xs uppercase text-muted-foreground">
                <th className="text-left font-medium px-2 py-2 border-r border-border">Category</th>
                <th className="text-left font-medium px-2 py-2 border-r border-border">Task</th>
                <th className="text-left font-medium px-2 py-2 border-r border-border">Description</th>
                <th className="text-left font-medium px-2 py-2 border-r border-border">Link</th>
                <th className="text-left font-medium px-2 py-2 border-r border-border">From</th>
                <th className="text-left font-medium px-2 py-2 border-r border-border">To</th>
                <th className="text-left font-medium px-2 py-2 border-r border-border">Progress</th>
                <th className="text-left font-medium px-2 py-2 border-r border-border">Target</th>
                <th className="px-2 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {groupedTasks.map(([category, rows]) => (
                <>
                  <tr key={`hdr-${category}`} className="bg-muted/30 border-t border-border">
                    <td colSpan={9} className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {category}
                    </td>
                  </tr>
                  {rows.map(renderTaskRow)}
                </>
              ))}

              {/* Inline draft / "new row" — Airtable style */}
              <tr key={draft.key} className="border-t-2 border-border bg-background/50">
                <td className={cellClassesTop}>
                  <Cell
                    value={draft.category}
                    placeholder="Category"
                    onCommit={(v) => commitDraftIfFilled({ ...draft, category: v })}
                  />
                </td>
                <td className={cellClassesTop}>
                  <div className="flex items-stretch">
                    <Cell
                      value={draft.task_name}
                      placeholder="Type a task name…"
                      onCommit={(v) => commitDraftIfFilled({ ...draft, task_name: v })}
                      className="font-medium"
                      multiline
                    />
                    <Popover open={templatePopoverOpen} onOpenChange={setTemplatePopoverOpen}>
                      <PopoverTrigger asChild>
                        <button
                          type="button"
                          className="px-2 text-muted-foreground hover:text-primary shrink-0"
                          title="Use predefined task"
                        >
                          <Search className="h-3.5 w-3.5" />
                        </button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[340px] p-0" align="start">
                        <div className="p-2 border-b">
                          <Input
                            autoFocus
                            placeholder="Search predefined tasks…"
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
                              onClick={() => applyTemplateToDraft(t)}
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
                <td className={cellClassesTop}>
                  <Cell
                    value={draft.task_description}
                    placeholder="—"
                    onCommit={(v) => commitDraftIfFilled({ ...draft, task_description: v })}
                    multiline
                  />
                </td>
                <td className={cellClasses}>
                  <LinkCell
                    value={draft.link}
                    onCommit={(v) => commitDraftIfFilled({ ...draft, link: v })}
                  />
                </td>
                <td className={cellClasses}>
                  <Cell
                    value={draft.handed_over_by}
                    placeholder="—"
                    onCommit={(v) => commitDraftIfFilled({ ...draft, handed_over_by: v })}
                  />
                </td>
                <td className={cellClasses}>
                  <Cell
                    value={draft.handed_over_to}
                    placeholder="—"
                    onCommit={(v) => commitDraftIfFilled({ ...draft, handed_over_to: v })}
                  />
                </td>
                <td className={cellClasses}>
                  <div className="flex items-center gap-2 px-2">
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={draft.progress}
                      onChange={(e) => setDraft({ ...draft, progress: Number(e.target.value) || 0 })}
                      onBlur={(e) => commitDraftIfFilled({ ...draft, progress: Math.max(0, Math.min(100, Number(e.target.value) || 0)) })}
                      className="w-14 h-6 text-xs bg-transparent border border-transparent hover:border-input rounded px-1 outline-none focus:border-ring focus:bg-background"
                    />
                    <span className="text-xs text-muted-foreground">%</span>
                  </div>
                </td>
                <td className={cellClasses}>
                  <Cell
                    value={draft.target_date}
                    type="date"
                    onCommit={(v) => commitDraftIfFilled({ ...draft, target_date: v })}
                  />
                </td>
                <td className="px-1"></td>
              </tr>

              {/* "+" footer row to manually queue another draft row (Airtable style) */}
              <tr className="border-t border-border">
                <td
                  colSpan={9}
                  className="px-3 py-2 text-muted-foreground hover:bg-muted/40 cursor-pointer"
                  onClick={() => {
                    if (draft.task_name.trim()) {
                      createMutation.mutate(draft);
                    } else {
                      setDraft(newDraft());
                    }
                  }}
                >
                  <span className="inline-flex items-center gap-2 text-sm">
                    <Plus className="h-4 w-4" /> Add row
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
