import { useState, useMemo, useEffect, useRef, Fragment } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from "@/components/ui/accordion";
import { Trash2, ExternalLink, Plus, Check, X, ChevronDown, ChevronRight, Type, Link2, BarChart3, Calendar, User, Hash } from "lucide-react";
import { Slider } from "@/components/ui/slider";
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
  const [collapsedCats, setCollapsedCats] = useState<Set<string>>(new Set());
  const toggleCat = (c: string) =>
    setCollapsedCats((prev) => {
      const next = new Set(prev);
      next.has(c) ? next.delete(c) : next.add(c);
      return next;
    });

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

  // Group templates by category for the library accordion
  const groupedTemplates = useMemo(() => {
    const groups = new Map<string, HandoverTemplate[]>();
    for (const t of templates) {
      const cat = (t.category || "").trim() || UNCATEGORIZED;
      if (!groups.has(cat)) groups.set(cat, []);
      groups.get(cat)!.push(t);
    }
    return Array.from(groups.entries());
  }, [templates]);

  // Track which templates are already added to this client's tracker
  const usedTemplateIds = useMemo(() => {
    const s = new Set<string>();
    for (const t of tasks) if (t.template_id) s.add(t.template_id);
    return s;
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

  const clearAllMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("client_handover_tasks").delete().eq("client_name", clientName);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["client-handover-tasks", clientName] });
      setDraft(newDraft());
      toast.success("Handover tracker cleared");
    },
    onError: (e: any) => toast.error(e.message || "Failed to clear tracker"),
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

  const addTemplateAsTask = (t: HandoverTemplate) => {
    if (usedTemplateIds.has(t.id)) {
      toast.info(`"${t.name}" is already in this tracker.`);
      return;
    }
    createMutation.mutate({
      ...newDraft(),
      template_id: t.id,
      category: t.category || "",
      task_name: t.name,
      task_description: t.description || "",
      link: t.link || "",
    });
  };

  function LinkCell({
    value,
    onCommit,
    compact = false,
  }: {
    value: string | null;
    onCommit: (v: string) => void;
    compact?: boolean;
  }) {
    const [editing, setEditing] = useState(false);
    const initial = value ?? "";
    const [local, setLocal] = useState(initial);
    useEffect(() => { setLocal(initial); }, [initial]);

    if (!editing && value) {
      return (
        <a
          href={value}
          target="_blank"
          rel="noopener noreferrer"
          onDoubleClick={(e) => { e.preventDefault(); setEditing(true); }}
          onClick={(e) => e.stopPropagation()}
          className="inline-flex items-center gap-1 text-xs text-primary hover:text-primary/80 hover:underline"
          title={value}
        >
          <ExternalLink className="h-3.5 w-3.5" />
          {!compact && <span className="truncate max-w-[140px]">Link</span>}
        </a>
      );
    }

    if (!editing) {
      return (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
        >
          <ExternalLink className="h-3.5 w-3.5" /> Add link
        </button>
      );
    }

    return (
      <input
        type="text"
        value={local}
        autoFocus
        placeholder="https://…"
        onChange={(e) => setLocal(e.target.value)}
        onBlur={() => { setEditing(false); if (local !== initial) onCommit(local); }}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          if (e.key === "Escape") { setLocal(initial); setEditing(false); }
        }}
        className="w-full bg-background border border-input rounded px-2 py-1 text-xs outline-none focus:ring-2 focus:ring-ring"
      />
    );
  }

  // Progress slider — compact, inline, drag to update
  function ProgressSlider({
    value,
    onCommit,
  }: { value: number; onCommit: (v: number) => void }) {
    const [local, setLocal] = useState(value);
    useEffect(() => { setLocal(value); }, [value]);
    const pct = Math.max(0, Math.min(100, local || 0));
    const pctColor =
      pct >= 100 ? "text-success"
      : pct >= 50 ? "text-primary"
      : pct > 0 ? "text-warning"
      : "text-muted-foreground";
    return (
      <div className="inline-flex items-center gap-2 rounded-full border border-border bg-background px-2.5 py-1">
        <div className="w-20 sm:w-24">
          <Slider
            value={[pct]}
            min={0}
            max={100}
            step={5}
            onValueChange={([v]) => setLocal(v)}
            onValueCommit={([v]) => { if (v !== value) onCommit(v); }}
            className="[&_[role=slider]]:h-3.5 [&_[role=slider]]:w-3.5 [&_[role=slider]]:border-2 [&_[role=slider]]:border-primary [&_[role=slider]]:bg-background [&_[role=slider]]:ring-0"
          />
        </div>
        <span className={`text-xs font-semibold min-w-[2.5ch] text-right ${pctColor}`}>
          {pct}%
        </span>
      </div>
    );
  }

  function TargetDateChip({
    value, onCommit,
  }: { value: string | null; onCommit: (v: string) => void }) {
    const tone = value ? targetDateClasses(value) : "bg-muted text-muted-foreground";
    return (
      <label className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium cursor-text ${tone}`}>
        <span className="opacity-70">Due</span>
        <input
          type="date"
          value={value ?? ""}
          onChange={(e) => onCommit(e.target.value)}
          className="bg-transparent border-0 outline-none text-xs font-medium [color-scheme:light] dark:[color-scheme:dark]"
        />
      </label>
    );
  }

  // Airtable-style column template: row-# gutter + columns
  const GRID_COLS =
    "grid grid-cols-[44px_minmax(240px,2.4fr)_minmax(120px,1fr)_minmax(120px,1fr)_88px_180px_140px_36px]";

  // Deterministic category pill color (Airtable-like soft pastels)
  const CATEGORY_PALETTE = [
    "bg-rose-100 text-rose-800",
    "bg-amber-100 text-amber-800",
    "bg-emerald-100 text-emerald-800",
    "bg-sky-100 text-sky-800",
    "bg-violet-100 text-violet-800",
    "bg-pink-100 text-pink-800",
    "bg-teal-100 text-teal-800",
    "bg-orange-100 text-orange-800",
  ];
  const catColor = (cat: string) => {
    let h = 0;
    for (let i = 0; i < cat.length; i++) h = (h * 31 + cat.charCodeAt(i)) >>> 0;
    return CATEGORY_PALETTE[h % CATEGORY_PALETTE.length];
  };

  const renderTaskRow = (t: HandoverTask, rowNumber: number) => (
    <div
      key={t.id}
      className={`group ${GRID_COLS} items-stretch border-b border-border/60 bg-background hover:bg-muted/40 transition-colors`}
    >
      {/* Row number gutter */}
      <div className="border-r border-border/60 flex items-center justify-center text-[11px] text-muted-foreground/70 font-mono select-none">
        {rowNumber}
      </div>
      {/* Task name + description */}
      <div className="border-r border-border/60 px-1 py-0.5 min-w-0">
        <Cell
          value={t.task_name}
          onCommit={(v) => updateMutation.mutate({ id: t.id, patch: { task_name: v.trim() || t.task_name } })}
          className="font-medium text-sm text-foreground"
          multiline
        />
        {t.task_description !== null && t.task_description !== "" ? (
          <Cell
            value={t.task_description}
            placeholder="Add description…"
            onCommit={(v) => updateMutation.mutate({ id: t.id, patch: { task_description: v.trim() || null } })}
            className="text-xs text-muted-foreground"
            multiline
          />
        ) : (
          <Cell
            value=""
            placeholder="Add description…"
            onCommit={(v) => v.trim() && updateMutation.mutate({ id: t.id, patch: { task_description: v.trim() } })}
            className="text-xs text-muted-foreground opacity-0 group-hover:opacity-100 transition"
            multiline
          />
        )}
      </div>
      {/* From */}
      <div className="border-r border-border/60 flex items-center min-w-0">
        <Cell
          value={t.handed_over_by}
          placeholder="—"
          onCommit={(v) => updateMutation.mutate({ id: t.id, patch: { handed_over_by: v.trim() || null } })}
          className="text-sm"
        />
      </div>
      {/* To */}
      <div className="border-r border-border/60 flex items-center min-w-0">
        <Cell
          value={t.handed_over_to}
          placeholder="—"
          onCommit={(v) => updateMutation.mutate({ id: t.id, patch: { handed_over_to: v.trim() || null } })}
          className="text-sm"
        />
      </div>
      {/* Link */}
      <div className="border-r border-border/60 flex items-center justify-center px-2">
        <LinkCell
          value={t.link}
          onCommit={(v) => updateMutation.mutate({ id: t.id, patch: { link: v.trim() || null } })}
          compact
        />
      </div>
      {/* Progress */}
      <div className="border-r border-border/60 flex items-center justify-center px-2 py-1">
        <ProgressSlider
          value={t.progress}
          onCommit={(v) => updateMutation.mutate({ id: t.id, patch: { progress: v } })}
        />
      </div>
      {/* Due date */}
      <div className="border-r border-border/60 flex items-center justify-center px-2 py-1">
        <TargetDateChip
          value={t.target_date}
          onCommit={(v) => updateMutation.mutate({ id: t.id, patch: { target_date: v || null } })}
        />
      </div>
      {/* Delete */}
      <div className="flex items-center justify-center">
        <button
          onClick={() => { if (confirm("Delete this task?")) deleteMutation.mutate(t.id); }}
          className="opacity-0 group-hover:opacity-100 transition p-1 rounded hover:bg-destructive/10 hover:text-destructive"
          title="Delete"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );

  const ColumnHeader = () => (
    <div className={`${GRID_COLS} bg-muted/40 border-y border-border text-[11px] font-medium text-muted-foreground sticky top-0 z-10`}>
      <div className="border-r border-border/60" />
      <div className="px-2 py-2 border-r border-border/60 flex items-center gap-1.5">
        <Type className="h-3 w-3" /> Task
      </div>
      <div className="px-2 py-2 border-r border-border/60 flex items-center gap-1.5">
        <User className="h-3 w-3" /> From
      </div>
      <div className="px-2 py-2 border-r border-border/60 flex items-center gap-1.5">
        <User className="h-3 w-3" /> To
      </div>
      <div className="px-2 py-2 border-r border-border/60 flex items-center justify-center gap-1.5">
        <Link2 className="h-3 w-3" /> Link
      </div>
      <div className="px-2 py-2 border-r border-border/60 flex items-center justify-center gap-1.5">
        <BarChart3 className="h-3 w-3" /> Progress
      </div>
      <div className="px-2 py-2 border-r border-border/60 flex items-center justify-center gap-1.5">
        <Calendar className="h-3 w-3" /> Due
      </div>
      <div />
    </div>
  );

  const renderGroupHeader = (category: string, rows: HandoverTask[]) => {
    const collapsed = collapsedCats.has(category);
    const completed = rows.filter((r) => r.progress >= 100).length;
    return (
      <div
        className={`${GRID_COLS} bg-muted/20 border-b border-border/60 cursor-pointer hover:bg-muted/30`}
        onClick={() => toggleCat(category)}
      >
        <div className="border-r border-border/60 flex items-center justify-center">
          {collapsed ? <ChevronRight className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </div>
        <div className="col-span-7 flex items-center gap-3 px-3 py-2">
          <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            Category
          </span>
          <span className={`inline-flex items-center rounded-md px-2.5 py-0.5 text-xs font-medium ${catColor(category)}`}>
            {category}
          </span>
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <Hash className="h-3 w-3" /> {rows.length}
          </span>
          <span className="text-xs text-muted-foreground ml-auto">
            {completed}/{rows.length} complete
          </span>
        </div>
      </div>
    );
  };

  function InlineAddRow({
    defaultCategory,
    allowCategoryEdit = false,
  }: { defaultCategory: string; allowCategoryEdit?: boolean }) {
    const [open, setOpen] = useState(false);
    const [d, setD] = useState<DraftRow>(() =>
      ({ ...newDraft(defaultCategory === UNCATEGORIZED ? "" : defaultCategory) })
    );

    const reset = () => {
      setD({ ...newDraft(defaultCategory === UNCATEGORIZED ? "" : defaultCategory) });
      setOpen(false);
    };
    const save = () => {
      if (!d.task_name.trim()) return;
      createMutation.mutate(d, { onSuccess: () => reset() });
    };

    if (!open) {
      return (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={`${GRID_COLS} items-center border-b border-border/60 bg-background hover:bg-muted/30 text-left w-full`}
        >
          <div className="border-r border-border/60 flex items-center justify-center h-9">
            <Plus className="h-3.5 w-3.5 text-muted-foreground" />
          </div>
          <div className="col-span-7 px-3 py-2 text-xs text-muted-foreground">
            {allowCategoryEdit ? "Add a task (new category)…" : "Add a task…"}
          </div>
        </button>
      );
    }

    return (
      <div className={`${GRID_COLS} items-stretch border-b border-border/60 bg-primary/5`}>
        <div className="border-r border-border/60 flex items-center justify-center text-[11px] text-muted-foreground font-mono">
          <Plus className="h-3.5 w-3.5" />
        </div>
        {/* Task name + (optional) category + description */}
        <div className="border-r border-border/60 px-1 py-1 min-w-0">
          {allowCategoryEdit && (
            <input
              type="text"
              value={d.category}
              placeholder="Category"
              onChange={(e) => setD({ ...d, category: e.target.value })}
              className="w-full bg-transparent border-0 px-2 py-1 text-xs text-muted-foreground italic outline-none focus:bg-background focus:ring-2 focus:ring-ring focus:ring-inset"
            />
          )}
          <input
            type="text"
            autoFocus
            value={d.task_name}
            placeholder="Task name"
            onChange={(e) => setD({ ...d, task_name: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === "Enter") save();
              if (e.key === "Escape") reset();
            }}
            className="w-full bg-transparent border-0 px-2 py-1 text-sm font-medium outline-none focus:bg-background focus:ring-2 focus:ring-ring focus:ring-inset"
          />
          <input
            type="text"
            value={d.task_description}
            placeholder="Description (optional)"
            onChange={(e) => setD({ ...d, task_description: e.target.value })}
            onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") reset(); }}
            className="w-full bg-transparent border-0 px-2 py-1 text-xs text-muted-foreground outline-none focus:bg-background focus:ring-2 focus:ring-ring focus:ring-inset"
          />
        </div>
        {/* From */}
        <div className="border-r border-border/60 flex items-center min-w-0 px-1">
          <input
            type="text"
            value={d.handed_over_by}
            placeholder="From"
            onChange={(e) => setD({ ...d, handed_over_by: e.target.value })}
            onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") reset(); }}
            className="w-full bg-transparent border-0 px-2 py-1 text-sm outline-none focus:bg-background focus:ring-2 focus:ring-ring focus:ring-inset"
          />
        </div>
        {/* To */}
        <div className="border-r border-border/60 flex items-center min-w-0 px-1">
          <input
            type="text"
            value={d.handed_over_to}
            placeholder="To"
            onChange={(e) => setD({ ...d, handed_over_to: e.target.value })}
            onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") reset(); }}
            className="w-full bg-transparent border-0 px-2 py-1 text-sm outline-none focus:bg-background focus:ring-2 focus:ring-ring focus:ring-inset"
          />
        </div>
        {/* Link */}
        <div className="border-r border-border/60 flex items-center px-2">
          <input
            type="text"
            value={d.link}
            placeholder="https://…"
            onChange={(e) => setD({ ...d, link: e.target.value })}
            onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") reset(); }}
            className="w-full bg-transparent border-0 px-1 py-1 text-xs outline-none focus:bg-background focus:ring-2 focus:ring-ring focus:ring-inset"
          />
        </div>
        {/* Progress */}
        <div className="border-r border-border/60 flex items-center justify-center px-2 py-1">
          <ProgressSlider value={d.progress} onCommit={(v) => setD({ ...d, progress: v })} />
        </div>
        {/* Due */}
        <div className="border-r border-border/60 flex items-center justify-center px-2 py-1">
          <input
            type="date"
            value={d.target_date}
            onChange={(e) => setD({ ...d, target_date: e.target.value })}
            className="bg-transparent border-0 outline-none text-xs"
          />
        </div>
        {/* Save / cancel */}
        <div className="flex flex-col items-center justify-center gap-0.5 py-1">
          <button
            onClick={save}
            disabled={!d.task_name.trim() || createMutation.isPending}
            title="Save (Enter)"
            className="p-1 rounded hover:bg-success/15 text-success disabled:opacity-30"
          >
            <Check className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={reset}
            title="Cancel (Esc)"
            className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    );
  }



  // Summary stats
  const totalTasks = tasks.length;
  const completedTasks = tasks.filter((t) => t.progress >= 100).length;
  const overallProgress = totalTasks
    ? Math.round(tasks.reduce((s, t) => s + (t.progress || 0), 0) / totalTasks)
    : 0;

  return (
    <Card className="mt-4 sm:mt-6">
      <CardHeader className="px-4 sm:px-6 pt-4 pb-3 border-b">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <CardTitle className="text-lg sm:text-xl">Handover Tracker</CardTitle>
            {totalTasks > 0 && (
              <p className="text-xs text-muted-foreground mt-1">
                {completedTasks} of {totalTasks} tasks complete · {overallProgress}% overall
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {totalTasks > 0 && (
              <div className="hidden sm:flex items-center gap-2 min-w-[180px]">
                <Progress value={overallProgress} className="h-2 w-32" />
                <span className="text-xs font-semibold text-muted-foreground">{overallProgress}%</span>
              </div>
            )}
            {tasks.length > 0 && (
              <button
                onClick={() => {
                  if (confirm("Are you sure you want to clear all tasks from this handover tracker?")) {
                    clearAllMutation.mutate();
                  }
                }}
                disabled={clearAllMutation.isPending}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-destructive hover:bg-destructive/10 rounded-md px-2.5 py-1.5 transition disabled:opacity-50"
                title="Clear all tasks"
              >
                <X className="h-3.5 w-3.5" /> Clear
              </button>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-0">
        {/* Task Library */}
        {groupedTemplates.length > 0 && (
          <div className="bg-muted/20 px-4 sm:px-6 py-2 border-b">
            <Accordion type="single" collapsible className="w-full">
              <AccordionItem value="library" className="border-0">
                <AccordionTrigger className="py-2 hover:no-underline">
                  <span className="flex items-center gap-2 text-sm font-semibold">
                    Task Library
                    <span className="text-xs font-normal text-muted-foreground">
                      ({templates.length} tasks · {groupedTemplates.length} categories)
                    </span>
                  </span>
                </AccordionTrigger>
                <AccordionContent>
                  <div className="space-y-3 pb-2">
                    {groupedTemplates.map(([category, items]) => (
                      <div key={`lib-${category}`} className="rounded-lg border bg-background overflow-hidden">
                        <div className="px-3 py-2 bg-muted/40 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          {category}
                        </div>
                        <div className="divide-y divide-border">
                          {items.map((t) => {
                            const added = usedTemplateIds.has(t.id);
                            return (
                              <div
                                key={t.id}
                                className={`flex items-center justify-between gap-3 px-3 py-2 ${added ? "bg-success/5" : "hover:bg-muted/30"}`}
                              >
                                <div className="min-w-0 flex-1">
                                  <div className="text-sm font-medium truncate">{t.name}</div>
                                  {t.description && (
                                    <div className="text-xs text-muted-foreground line-clamp-2">{t.description}</div>
                                  )}
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                  {t.link && (
                                    <a
                                      href={t.link}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-muted-foreground hover:text-primary"
                                      onClick={(e) => e.stopPropagation()}
                                      title="Open link"
                                    >
                                      <ExternalLink className="h-3.5 w-3.5" />
                                    </a>
                                  )}
                                  {added ? (
                                    <span className="inline-flex items-center gap-1 text-xs text-success px-2 py-1">
                                      <Check className="h-3.5 w-3.5" /> Added
                                    </span>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => addTemplateAsTask(t)}
                                      className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:bg-primary/10 rounded px-2 py-1 transition"
                                    >
                                      <Plus className="h-3.5 w-3.5" /> Add
                                    </button>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </div>
        )}

        {/* Active tasks grouped by category — Airtable-style spreadsheet */}
        <div className="overflow-x-auto bg-background">
          {groupedTasks.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <p className="text-sm font-medium text-foreground">No handover tasks yet</p>
              <p className="text-xs text-muted-foreground mt-1">
                Add tasks from the Task Library above, or create a custom one below.
              </p>
            </div>
          ) : (
            <div className="min-w-[960px]">
              <ColumnHeader />
              {(() => {
                let rowCounter = 0;
                return groupedTasks.map(([category, rows]) => {
                  const collapsed = collapsedCats.has(category);
                  return (
                    <div key={`grp-${category}`}>
                      {renderGroupHeader(category, rows)}
                      {!collapsed && (
                        <>
                          {rows.map((r) => {
                            rowCounter += 1;
                            return renderTaskRow(r, rowCounter);
                          })}
                          {renderAddRow(category)}
                        </>
                      )}
                    </div>
                  );
                });
              })()}
            </div>
          )}
        </div>



        {/* Add custom task */}
        <div className="border-t border-border bg-muted/10 px-4 sm:px-6 py-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
            Add a custom task
          </div>
          <div className="grid grid-cols-1 md:grid-cols-12 gap-2 items-center">
            <input
              type="text"
              value={draft.category}
              placeholder="Category"
              onChange={(e) => setDraft({ ...draft, category: e.target.value })}
              className="md:col-span-3 bg-background border border-input rounded-md px-2.5 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
            <input
              type="text"
              value={draft.task_name}
              placeholder="Task name"
              onChange={(e) => setDraft({ ...draft, task_name: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === "Enter" && draft.task_name.trim()) {
                  createMutation.mutate(draft);
                }
              }}
              className="md:col-span-6 bg-background border border-input rounded-md px-2.5 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
            <button
              type="button"
              disabled={!draft.task_name.trim() || createMutation.isPending}
              onClick={() => createMutation.mutate(draft)}
              className="md:col-span-3 inline-flex items-center justify-center gap-1.5 text-sm font-medium bg-primary text-primary-foreground rounded-md px-3 py-1.5 hover:bg-primary/90 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Plus className="h-4 w-4" /> Add task
            </button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
