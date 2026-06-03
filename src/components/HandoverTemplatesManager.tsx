import { Fragment, useMemo, useState } from "react";
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
  category: string | null;
  sort_order: number | null;
}

const UNCATEGORIZED = "Uncategorized";
const empty = { name: "", description: "", link: "", category: "" };

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

  const grouped = useMemo(() => {
    const map = new Map<string, Template[]>();
    for (const t of templates) {
      const cat = (t.category || "").trim() || UNCATEGORIZED;
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(t);
    }
    return Array.from(map.entries());
  }, [templates]);

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        name: form.name.trim(),
        description: form.description.trim() || null,
        link: form.link.trim() || null,
        category: form.category.trim() || null,
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
    setForm({
      name: t.name,
      description: t.description || "",
      link: t.link || "",
      category: t.category || "",
    });
    setOpen(true);
  };

  const cellCls = "px-2 py-2 align-top border-r border-border";

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
      <CardContent className="p-0 sm:p-0">
        {isLoading ? (
          <div className="text-sm text-muted-foreground py-6 px-4">Loading…</div>
        ) : templates.length === 0 ? (
          <div className="text-sm text-muted-foreground py-6 text-center">No templates yet.</div>
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
                {grouped.map(([category, rows]) => (
                  <Fragment key={`grp-${category}`}>
                    <tr className="bg-muted/30 border-t border-border">
                      <td colSpan={4} className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        {category}
                      </td>
                    </tr>
                    {rows.map((t) => (
                      <tr key={t.id} className="border-t border-border hover:bg-muted/20">
                        <td className={`${cellCls} font-medium`}>{t.name}</td>
                        <td className={`${cellCls} text-muted-foreground`}>{t.description || "—"}</td>
                        <td className={cellCls}>
                          {t.link ? (
                            <a
                              href={t.link}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-primary inline-flex items-center gap-1 hover:underline break-all"
                            >
                              <ExternalLink className="h-3 w-3 shrink-0" />
                              <span className="truncate max-w-[200px]">{t.link}</span>
                            </a>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-1 py-1 text-right whitespace-nowrap">
                          <Button variant="ghost" size="icon" onClick={() => openEdit(t)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              if (confirm(`Delete template "${t.name}"?`)) remove.mutate(t.id);
                            }}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
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
              <Label>Category</Label>
              <Input
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                placeholder="e.g. Rota & Scheduling"
              />
            </div>
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
