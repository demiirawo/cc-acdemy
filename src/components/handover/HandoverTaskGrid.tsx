import { useState, useMemo, useEffect, useRef } from "react";
import { Trash2, ExternalLink, Plus, Check, X, ChevronDown, ChevronRight, Type, Link2, BarChart3, Calendar, User, Hash } from "lucide-react";
import { HandoverTaskComments } from "@/components/HandoverTaskComments";
import { Slider } from "@/components/ui/slider";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { useHandoverUsers } from "./useHandoverUsers";
import { newDraft, UNCATEGORIZED, type DraftRow, type HandoverTask } from "./handoverTasks";

// Airtable-style column template: row-# gutter + columns
const GRID_COLS =
  "grid grid-cols-[44px_minmax(240px,2.4fr)_minmax(120px,1fr)_minmax(120px,1fr)_88px_180px_140px_72px]";

// Searchable user picker — used for handed_over_by / handed_over_to
function UserPickerCell({
  value,
  onCommit,
  placeholder = "Select…",
  className = "",
}: {
  value: string | null;
  onCommit: (v: string) => void;
  placeholder?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const { data: allUsers = [] } = useHandoverUsers();
  // Handover work is being assigned here, so only people still employed are
  // offered. A name already saved on a row still shows as it was recorded.
  const users = useMemo(() => allUsers.filter((u) => u.employed), [allUsers]);
  const display = (value || "").trim();
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={`w-full h-full text-left bg-transparent border-0 px-2 py-1.5 text-sm outline-none hover:bg-background focus:bg-background focus:ring-2 focus:ring-ring focus:ring-inset truncate ${className}`}
        >
          {display || <span className="text-muted-foreground">{placeholder}</span>}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0" align="start">
        <Command>
          <CommandInput placeholder="Search staff…" />
          <CommandList>
            <CommandEmpty>No staff found.</CommandEmpty>
            {display && (
              <CommandGroup>
                <CommandItem
                  value="__clear__"
                  onSelect={() => { onCommit(""); setOpen(false); }}
                >
                  <X className="h-3.5 w-3.5 mr-2" />
                  Clear
                </CommandItem>
              </CommandGroup>
            )}
            <CommandGroup>
              {users.map((u) => (
                <CommandItem
                  key={u.id}
                  value={u.name}
                  onSelect={() => { onCommit(u.name); setOpen(false); }}
                >
                  <Check className={`h-3.5 w-3.5 mr-2 ${display === u.name ? "opacity-100" : "opacity-0"}`} />
                  {u.name}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

// Progress slider — compact, inline, drag to update (module-scope so it
// keeps a stable identity across parent re-renders and doesn't remount).
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

// Inline add row — module-scope so opening it and typing isn't wiped out
// when the parent re-renders (e.g. after a progress mutation refetch).
function InlineAddRow({
  defaultCategory,
  allowCategoryEdit = false,
  defaultFrom = "",
  defaultTo = "",
  onCreate,
  isPending,
}: {
  defaultCategory: string;
  allowCategoryEdit?: boolean;
  defaultFrom?: string;
  defaultTo?: string;
  onCreate: (d: DraftRow, onDone: () => void) => void;
  isPending: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [d, setD] = useState<DraftRow>(() => ({
    ...newDraft(defaultCategory === UNCATEGORIZED ? "" : defaultCategory),
    handed_over_by: defaultFrom,
    handed_over_to: defaultTo,
  }));
  const rowRef = useRef<HTMLDivElement>(null);
  const dRef = useRef(d);
  useEffect(() => { dRef.current = d; }, [d]);

  const reset = () => {
    setD({
      ...newDraft(defaultCategory === UNCATEGORIZED ? "" : defaultCategory),
      handed_over_by: defaultFrom,
      handed_over_to: defaultTo,
    });
    setOpen(false);
  };

  const save = () => {
    const cur = dRef.current;
    if (!cur.task_name.trim()) { reset(); return; }
    onCreate(cur, reset);
  };

  // Save when clicking/tapping outside the row
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      // Ignore clicks inside Radix popovers / dropdowns / dialogs that render
      // in a portal outside this row (e.g. the user picker).
      if (target?.closest('[data-radix-popper-content-wrapper],[role="dialog"],[role="listbox"],[cmdk-root]')) {
        return;
      }
      if (rowRef.current && !rowRef.current.contains(target as Node)) {
        save();
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);


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
          Add a task…
        </div>
      </button>
    );
  }

  return (
    <div ref={rowRef} className={`${GRID_COLS} items-stretch border-b border-border/60 bg-primary/5`}>
      <div className="border-r border-border/60 flex items-center justify-center text-[11px] text-muted-foreground font-mono">
        <Plus className="h-3.5 w-3.5" />
      </div>
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
      <div className="border-r border-border/60 flex items-center min-w-0 px-1">
        <UserPickerCell
          value={d.handed_over_by}
          placeholder="From"
          onCommit={(v) => setD({ ...d, handed_over_by: v })}
        />
      </div>
      <div className="border-r border-border/60 flex items-center min-w-0 px-1">
        <UserPickerCell
          value={d.handed_over_to}
          placeholder="To"
          onCommit={(v) => setD({ ...d, handed_over_to: v })}
        />
      </div>
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
      <div className="border-r border-border/60 flex items-center justify-center px-2 py-1">
        <ProgressSlider value={d.progress} onCommit={(v) => setD({ ...d, progress: v })} />
      </div>
      <div className="border-r border-border/60 flex items-center justify-center px-2 py-1">
        <input
          type="date"
          value={d.target_date}
          onChange={(e) => setD({ ...d, target_date: e.target.value })}
          className="bg-transparent border-0 outline-none text-xs"
        />
      </div>
      <div aria-hidden />

    </div>
  );
}


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

function TargetDateChip({
  value, onCommit,
}: { value: string | null; onCommit: (v: string) => void }) {
  return (
    <label className="flex w-full items-center justify-center gap-1.5 px-2 py-1 text-xs font-medium cursor-text">
      <span className="opacity-70">Due</span>
      <input
        type="date"
        value={value ?? ""}
        onChange={(e) => onCommit(e.target.value)}
        className="bg-transparent border-0 outline-none text-xs font-medium [color-scheme:light] dark:[color-scheme:dark] min-w-0"
      />
    </label>
  );
}

function targetDateClasses(targetDate: string | null, progress: number = 0) {
  if (progress >= 100) return "bg-success/10 text-success";
  if (!targetDate) return "";
  const days = Math.ceil((new Date(targetDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  if (days > 14) return "bg-success/10 text-success";
  if (days >= 5) return "bg-warning/10 text-warning";
  return "bg-destructive/10 text-destructive";
}

const targetDateCellTone = (value: string | null, progress: number = 0) =>
  value ? targetDateClasses(value, progress) : progress >= 100 ? "bg-success/10 text-success" : "";

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

interface Props {
  tasks: HandoverTask[];
  onUpdate: (id: string, patch: Partial<HandoverTask>) => void;
  onDelete: (id: string) => void;
  /** The To cell changed hands (a genuine change — same name, different case, is ignored). */
  onReassign: (task: HandoverTask, next: string) => void;
  /** Leave out and the grid has no add row — the history sections are edit-only. */
  onCreate?: (draft: DraftRow, onDone: () => void) => void;
  createPending?: boolean;
  defaultFrom?: string;
  defaultTo?: string;
}

/**
 * One checklist as an Airtable-style spreadsheet: rows grouped by category,
 * every cell editable in place, and an add row at the bottom.
 */
export function HandoverTaskGrid({
  tasks, onUpdate, onDelete, onReassign, onCreate, createPending = false, defaultFrom = "", defaultTo = "",
}: Props) {
  const [collapsedCats, setCollapsedCats] = useState<Set<string>>(new Set());
  const toggleCat = (c: string) =>
    setCollapsedCats((prev) => {
      const next = new Set(prev);
      if (next.has(c)) next.delete(c); else next.add(c);
      return next;
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
          onCommit={(v) => onUpdate(t.id, { task_name: v.trim() || t.task_name })}
          className="font-medium text-sm text-foreground"
          multiline
        />
        {t.task_description !== null && t.task_description !== "" ? (
          <Cell
            value={t.task_description}
            placeholder="Add description…"
            onCommit={(v) => onUpdate(t.id, { task_description: v.trim() || null })}
            className="text-xs text-muted-foreground"
            multiline
          />
        ) : (
          <Cell
            value=""
            placeholder="Add description…"
            onCommit={(v) => v.trim() && onUpdate(t.id, { task_description: v.trim() })}
            className="text-xs text-muted-foreground opacity-0 group-hover:opacity-100 transition"
            multiline
          />
        )}
      </div>
      {/* From */}
      <div className="border-r border-border/60 flex items-center min-w-0">
        <UserPickerCell
          value={t.handed_over_by}
          placeholder="—"
          onCommit={(v) => onUpdate(t.id, { handed_over_by: v.trim() || null })}
        />
      </div>
      {/* To */}
      <div className="border-r border-border/60 flex items-center min-w-0">
        <UserPickerCell
          value={t.handed_over_to}
          placeholder="—"
          onCommit={(v) => {
            const next = v.trim();
            const prev = (t.handed_over_to || "").trim();
            if (next.toLowerCase() === prev.toLowerCase()) return; // nothing changed
            onReassign(t, next);
          }}
        />
      </div>
      {/* Link */}
      <div className="border-r border-border/60 flex items-center justify-center px-2">
        <LinkCell
          value={t.link}
          onCommit={(v) => onUpdate(t.id, { link: v.trim() || null })}
          compact
        />
      </div>
      {/* Progress */}
      <div className="border-r border-border/60 flex items-center justify-center px-2 py-1">
        <ProgressSlider
          value={t.progress}
          onCommit={(v) => onUpdate(t.id, { progress: v })}
        />
      </div>
      {/* Due date */}
      <div className={`border-r border-border/60 flex items-center justify-center overflow-hidden ${targetDateCellTone(t.target_date, t.progress)}`}>
        <TargetDateChip
          value={t.target_date}
          onCommit={(v) => onUpdate(t.id, { target_date: v || null })}
        />
      </div>

      {/* Actions: comments + delete */}
      <div className="flex items-center justify-center gap-0.5">
        <HandoverTaskComments taskId={t.id} taskName={t.task_name} />
        <button
          onClick={() => { if (confirm("Delete this task?")) onDelete(t.id); }}
          className="opacity-0 group-hover:opacity-100 transition p-1 rounded hover:bg-destructive/10 hover:text-destructive"
          title="Delete"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
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

  return (
    <div className="overflow-x-auto bg-background">
      <div className="min-w-[960px]">
        <ColumnHeader />
        {groupedTasks.length === 0 ? (
          <div className="px-6 py-8 text-center border-b border-border/60">
            <p className="text-sm font-medium text-foreground">No handover tasks yet</p>
            <p className="text-xs text-muted-foreground mt-1">
              Add tasks from the Task Library above, or use the row below.
            </p>
          </div>
        ) : (
          (() => {
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
                    </>
                  )}
                </div>
              );
            });
          })()
        )}
        {/* Always-available row for creating a task in a new (or any) category */}
        {onCreate && (
          <InlineAddRow
            defaultCategory=""
            allowCategoryEdit
            defaultFrom={defaultFrom}
            defaultTo={defaultTo}
            onCreate={onCreate}
            isPending={createPending}
          />
        )}
      </div>
    </div>
  );
}
