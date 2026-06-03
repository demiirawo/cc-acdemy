import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ClipboardList, Plus, Trash2, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";

interface Template {
  id: string;
  name: string;
  description: string | null;
  link: string | null;
  category: string | null;
  sort_order: number | null;
}

const UNCATEGORIZED = "Uncategorized";

// Spreadsheet-style cell (text/textarea). Saves on blur/Enter.
function Cell({
  value, onCommit, placeholder, className = "", multiline,
}: {
  value: string | null;
  onCommit: (v: string) => void;
  placeholder?: string;
  className?: string;
  multiline?: boolean;
}) {
  const initial = value ?? "";
  const [local, setLocal] = useState(initial);
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
      type="text"
      value={local}
      placeholder={placeholder}
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

function LinkCell({ value, onCommit }: { value: string | null; onCommit: (v: string) => void }) {
  const [editing, setEditing] = useState(false);
  const initial = value ?? "";
  const [local, setLocal] = useState(initial);
  useEffect(() => { setLocal(initial); }, [initial]);

  if (!editing && value) {
    return (
      <div
        className="flex items-center h-full px-2 cursor-pointer"
        onDoubleClick={() => setEditing(true)}
      >
        <a
          href={value}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary hover:text-primary/80 inline-flex items-center gap-1 text-xs hover:underline"
          onClick={(e) => e.stopPropagation()}
        >
          <ExternalLink className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate max-w-[200px]">{value}</span>
        </a>
      </div>
    );
  }

  return (
    <input
      type="text"
      value={local}
      autoFocus={editing}
      placeholder="https://… (double-click to edit)"
      onChange={(e) => setLocal(e.target.value)}
      onBlur={() => {
        setEditing(false);
        if (local !== initial) onCommit(local);
      }}
      onDoubleClick={() => setEditing(true)}
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

export function HandoverTemplatesManager() {
  const qc = useQueryClient();
  const { user } = useAuth();
  // Tracks the category for which a blank inline draft row is shown
  const [openDraftCategory, setOpenDraftCategory] = useState<string | null>(null);
  // Force-remount key per category so a freshly-committed draft is cleared
  const [draftNonce, setDraftNonce] = useState(0);

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

  const grouped = useMemo(() => {
    const map = new Map<string, Template[]>();
    for (const t of templates) {
      const cat = (t.category || "").trim() || UNCATEGORIZED;
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(t);
    }
    return Array.from(map.entries());
  }, [templates]);

  const createMutation = useMutation({
    mutationFn: async (payload: {
      name: string; description: string | null; link: string | null; category: string | null;
    }) => {
      const { error } = await supabase
        .from("handover_task_templates")
        .insert({ ...payload, created_by: user?.id });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["handover-task-templates"] });
      setOpenDraftCategory(null);
      setDraftNonce((n) => n + 1);
      toast.success("Template added");
    },
    onError: (e: any) => toast.error(e.message || "Add failed"),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<Template> }) => {
      const { error } = await supabase.from("handover_task_templates").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["handover-task-templates"] }),
    onError: (e: any) => toast.error(e.message || "Update failed"),
  });

  const removeMutation = useMutation({
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

  const addBlankRow = (category: string) => {
    // Create an empty template in the chosen category, then auto-focus it inline
    createMutation.mutate({
      name: "New task",
      description: null,
      link: null,
      category: category === UNCATEGORIZED ? null : category,
    });
  };

  const cellTop = "border-r border-border last:border-r-0 align-top";

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="flex items-center gap-2">
            <ClipboardList className="h-5 w-5" /> Handover Task Templates
          </CardTitle>
          <CardDescription>
            Predefined tasks shown in the client handover tracker on the public link. Double-click any cell to edit.
          </CardDescription>
        </div>
        <Button
          size="sm"
          onClick={() => addBlankRow(UNCATEGORIZED)}
          disabled={createMutation.isPending}
        >
          <Plus className="h-4 w-4 mr-1" /> Add Template
        </Button>
      </CardHeader>
      <CardContent className="p-0 sm:p-0">
        {isLoading ? (
          <div className="text-sm text-muted-foreground py-6 px-4">Loading…</div>
        ) : (
          <div className="overflow-x-auto border-t border-b">
            <table className="w-full text-sm border-collapse">
              <colgroup>
                <col style={{ width: "22%" }} />
                <col style={{ width: "44%" }} />
                <col style={{ width: "24%" }} />
                <col style={{ width: "10%" }} />
              </colgroup>
              <thead>
                <tr className="bg-muted/50 text-xs uppercase text-muted-foreground">
                  <th className="text-left font-medium px-2 py-2 border-r border-border">Task</th>
                  <th className="text-left font-medium px-2 py-2 border-r border-border">Description</th>
                  <th className="text-left font-medium px-2 py-2 border-r border-border">Link</th>
                  <th className="px-2 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {grouped.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-3 py-8 text-center text-sm text-muted-foreground">
                      No templates yet. Click "Add Template" to create one.
                    </td>
                  </tr>
                )}
                {grouped.map(([category, rows]) => (
                  <Fragment key={`grp-${category}-${draftNonce}`}>
                    <tr className="bg-muted/30 border-t border-border">
                      <td colSpan={4} className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        <Cell
                          value={category === UNCATEGORIZED ? "" : category}
                          placeholder={UNCATEGORIZED}
                          className="!px-0 !py-0 !text-xs !font-semibold uppercase tracking-wide text-muted-foreground"
                          onCommit={(v) => {
                            const newCat = v.trim() || null;
                            // Rename category across all rows in this group
                            rows.forEach((r) =>
                              updateMutation.mutate({ id: r.id, patch: { category: newCat } })
                            );
                          }}
                        />
                      </td>
                    </tr>
                    {rows.map((t) => (
                      <tr key={t.id} className="border-t border-border hover:bg-muted/20 group">
                        <td className={cellTop}>
                          <Cell
                            value={t.name}
                            placeholder="Task name"
                            className="font-medium"
                            multiline
                            onCommit={(v) =>
                              updateMutation.mutate({ id: t.id, patch: { name: v.trim() || t.name } })
                            }
                          />
                        </td>
                        <td className={cellTop}>
                          <Cell
                            value={t.description}
                            placeholder="—"
                            multiline
                            onCommit={(v) =>
                              updateMutation.mutate({ id: t.id, patch: { description: v.trim() || null } })
                            }
                          />
                        </td>
                        <td className={cellTop}>
                          <LinkCell
                            value={t.link}
                            onCommit={(v) =>
                              updateMutation.mutate({ id: t.id, patch: { link: v.trim() || null } })
                            }
                          />
                        </td>
                        <td className="px-1 py-1 text-right whitespace-nowrap">
                          <button
                            onClick={() => {
                              if (confirm(`Delete template "${t.name}"?`)) removeMutation.mutate(t.id);
                            }}
                            className="opacity-0 group-hover:opacity-100 transition p-1 hover:text-destructive"
                            title="Delete"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                    {/* "+ Add task" footer row per category */}
                    <tr className="border-t border-border">
                      <td
                        colSpan={4}
                        className="px-3 py-2 text-muted-foreground hover:bg-muted/40 cursor-pointer"
                        onClick={() => addBlankRow(category)}
                      >
                        <span className="inline-flex items-center gap-2 text-sm">
                          <Plus className="h-4 w-4" /> Add task to {category}
                        </span>
                      </td>
                    </tr>
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
