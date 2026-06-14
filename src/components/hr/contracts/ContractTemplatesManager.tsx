import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { RichTextEditor } from "@/components/ui/RichTextEditor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { FileText, Plus, Pencil, Archive, Loader2 } from "lucide-react";
import { formatDateTime } from "./contractStatus";

interface ContractTemplate {
  id: string;
  name: string;
  description: string | null;
  body_html: string;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
}

const DEFAULT_BODY = `<h1 style="text-align:center">Contract of Employment</h1>
<p>This Contract of Employment is made between <strong>Care Cuddle Academy</strong> ("the Employer") and the employee named below.</p>
<h2>1. Position</h2>
<p>You are employed in the role of …</p>
<h2>2. Commencement &amp; Hours</h2>
<p>Your employment begins on … and your normal working hours are …</p>
<h2>3. Remuneration</h2>
<p>You will be paid … per …</p>
<h2>4. Holiday Entitlement</h2>
<p>You are entitled to … days of paid holiday per year.</p>
<h2>5. Notice Period</h2>
<p>Either party may terminate this contract by giving … weeks' written notice.</p>
<p>&nbsp;</p>
<p>By signing below, you confirm that you have read, understood and agree to the terms of this contract.</p>`;

export function ContractTemplatesManager() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [templates, setTemplates] = useState<ContractTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [editorOpen, setEditorOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [archiveTarget, setArchiveTarget] = useState<ContractTemplate | null>(null);

  const [editing, setEditing] = useState<ContractTemplate | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [body, setBody] = useState("");

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("contract_templates")
      .select("*")
      .eq("is_archived", false)
      .order("updated_at", { ascending: false });
    if (error) {
      toast({ title: "Could not load templates", description: error.message, variant: "destructive" });
    } else {
      setTemplates(data ?? []);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const openNew = () => {
    setEditing(null);
    setName("");
    setDescription("");
    setBody(DEFAULT_BODY);
    setEditorOpen(true);
  };

  const openEdit = (t: ContractTemplate) => {
    setEditing(t);
    setName(t.name);
    setDescription(t.description ?? "");
    setBody(t.body_html);
    setEditorOpen(true);
  };

  const save = async () => {
    if (!name.trim()) {
      toast({ title: "Name required", description: "Give the template a name.", variant: "destructive" });
      return;
    }
    setSaving(true);
    const payload = {
      name: name.trim(),
      description: description.trim() || null,
      body_html: body,
    };
    let error;
    if (editing) {
      ({ error } = await supabase.from("contract_templates").update(payload).eq("id", editing.id));
    } else {
      ({ error } = await supabase
        .from("contract_templates")
        .insert({ ...payload, created_by: user?.id ?? null }));
    }
    setSaving(false);
    if (error) {
      toast({ title: "Save failed", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: editing ? "Template updated" : "Template created" });
    setEditorOpen(false);
    load();
  };

  const archive = async () => {
    if (!archiveTarget) return;
    const { error } = await supabase
      .from("contract_templates")
      .update({ is_archived: true })
      .eq("id", archiveTarget.id);
    if (error) {
      toast({ title: "Archive failed", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Template archived" });
      load();
    }
    setArchiveTarget(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Contract Templates</h2>
          <p className="text-sm text-muted-foreground">
            Author reusable contracts of employment with the rich text editor.
          </p>
        </div>
        <Button onClick={openNew}>
          <Plus className="mr-1.5 h-4 w-4" /> New Template
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 py-12 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading templates…
        </div>
      ) : templates.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <FileText className="h-10 w-10 text-muted-foreground" />
            <div>
              <p className="font-medium">No templates yet</p>
              <p className="text-sm text-muted-foreground">
                Create your first contract template to start sending contracts.
              </p>
            </div>
            <Button onClick={openNew}>
              <Plus className="mr-1.5 h-4 w-4" /> New Template
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {templates.map((t) => (
            <Card key={t.id} className="flex flex-col">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-start justify-between gap-2 text-base">
                  <span className="flex items-center gap-2">
                    <FileText className="h-4 w-4 shrink-0 text-primary" />
                    {t.name}
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-1 flex-col justify-between gap-3">
                <p className="line-clamp-2 text-sm text-muted-foreground">
                  {t.description || "No description"}
                </p>
                <div className="flex items-center justify-between">
                  <Badge variant="secondary" className="text-xs font-normal">
                    Updated {formatDateTime(t.updated_at)}
                  </Badge>
                  <div className="flex gap-1">
                    <Button size="sm" variant="ghost" onClick={() => openEdit(t)} title="Edit">
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setArchiveTarget(t)}
                      title="Archive"
                    >
                      <Archive className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Editor dialog */}
      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Template" : "New Template"}</DialogTitle>
            <DialogDescription>
              Design the contract content. This becomes the starting point each time you send a
              contract.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="tpl-name">Template name</Label>
                <Input
                  id="tpl-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Full-time Carer Contract"
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="tpl-desc">Description (optional)</Label>
                <Input
                  id="tpl-desc"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Short note for admins"
                />
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label>Contract content</Label>
              <RichTextEditor value={body} onChange={setBody} minHeight={380} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditorOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              {editing ? "Save changes" : "Create template"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!archiveTarget} onOpenChange={(o) => !o && setArchiveTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive this template?</AlertDialogTitle>
            <AlertDialogDescription>
              "{archiveTarget?.name}" will be hidden from the template list. Contracts already sent
              are unaffected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={archive}>Archive</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
