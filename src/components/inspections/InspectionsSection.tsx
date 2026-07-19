import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { format, parseISO } from "date-fns";
import { ClipboardCheck, Plus, ArrowLeft, Loader2, Trash2, ExternalLink, Paperclip, Upload } from "lucide-react";

// ---- Vocab ------------------------------------------------------------------
const BODIES = ["CQC", "Local Authority", "Home Office", "Ofsted", "Other"];
const OUTCOMES = [
  { value: "Outstanding", cls: "bg-violet-600 text-white border-violet-600" },
  { value: "Good", cls: "bg-green-600 text-white border-green-600" },
  { value: "Requires improvement", cls: "bg-amber-500 text-white border-amber-500" },
  { value: "Inadequate", cls: "bg-red-600 text-white border-red-600" },
  { value: "Pass", cls: "bg-green-600 text-white border-green-600" },
  { value: "Fail", cls: "bg-red-600 text-white border-red-600" },
  { value: "Pending", cls: "bg-muted text-muted-foreground border-border" },
];
const outcomeMeta = (v: string | null) => OUTCOMES.find(o => o.value === v) ?? { value: v || "—", cls: "bg-muted text-muted-foreground border-border" };

interface EvidenceFile { path: string; name: string; size: number; type: string; uploaded_at: string; }

interface Inspection {
  id: string;
  inspection_date: string | null;
  body: string | null;
  inspection_type: string | null;
  outcome: string | null;
  client_name: string | null;
  evidence_files: EvidenceFile[] | null;
  inspector_feedback: string | null;
  lessons_learned: string | null;
  notes: string | null;
  created_at: string;
}

const EVIDENCE_BUCKET = "inspection-evidence";
const prettySize = (b: number) =>
  b < 1024 ? `${b} B` : b < 1024 * 1024 ? `${(b / 1024).toFixed(0)} KB` : `${(b / 1024 / 1024).toFixed(1)} MB`;

export function InspectionsSection() {
  const { user } = useAuth();
  const { canManageHR } = useUserRole();
  const { toast } = useToast();

  const [rows, setRows] = useState<Inspection[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editCell, setEditCell] = useState<{ id: string; field: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await (supabase as any)
      .from("inspections")
      .select("*")
      .order("inspection_date", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false });
    setRows((data as Inspection[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const patch = async (id: string, p: Partial<Inspection>) => {
    setRows(prev => prev.map(r => r.id === id ? { ...r, ...p } : r));
    setEditCell(null);
    const { error } = await (supabase as any).from("inspections").update({ ...p, updated_at: new Date().toISOString() }).eq("id", id);
    if (error) { toast({ title: "Couldn't update", description: error.message, variant: "destructive" }); load(); }
  };

  const addInspection = async () => {
    const { data, error } = await (supabase as any)
      .from("inspections")
      .insert({ body: "CQC", outcome: "Pending", created_by: user?.id ?? null })
      .select("*").single();
    if (error) { toast({ title: "Couldn't add", description: error.message, variant: "destructive" }); return; }
    setRows(prev => [data as Inspection, ...prev]);
    setSelectedId((data as Inspection).id);
  };

  const remove = async (id: string) => {
    setRows(prev => prev.filter(r => r.id !== id));
    const { error } = await (supabase as any).from("inspections").delete().eq("id", id);
    if (error) { toast({ title: "Couldn't delete", description: error.message, variant: "destructive" }); load(); }
    else toast({ title: "Inspection deleted" });
  };

  if (selectedId) {
    return (
      <InspectionDetail
        id={selectedId}
        canEdit={canManageHR}
        onBack={() => { setSelectedId(null); load(); }}
      />
    );
  }

  return (
    <div className="flex-1 overflow-auto p-4 md:p-6">
      <div className="max-w-5xl mx-auto space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
              <ClipboardCheck className="h-5 w-5 text-primary" />
            </div>
            <div className="min-w-0">
              <h1 className="text-2xl font-bold">Inspection Outcomes</h1>
              <p className="text-muted-foreground text-sm">Inspections we've had with CQC, local authorities, the Home Office and others.</p>
            </div>
          </div>
          {canManageHR && (
            <Button onClick={addInspection}><Plus className="h-4 w-4 mr-1" /> Add inspection</Button>
          )}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading…
          </div>
        ) : rows.length === 0 ? (
          <Card><CardContent className="py-14 text-center text-muted-foreground">
            <ClipboardCheck className="h-8 w-8 mx-auto mb-3 opacity-40" />
            <p className="font-medium">No inspections yet</p>
            <p className="text-sm">{canManageHR ? "Add the first inspection outcome." : "Inspection outcomes will appear here."}</p>
          </CardContent></Card>
        ) : (
          /* Airtable-style table */
          <div className="rounded-lg border overflow-x-auto bg-card">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-[11px] uppercase tracking-wide text-muted-foreground">
                  <th className="text-left font-medium px-3 py-2 w-[130px]">Month / Year</th>
                  <th className="text-left font-medium px-3 py-2 w-[150px]">Body</th>
                  <th className="text-left font-medium px-3 py-2 min-w-[220px]">Inspection Type</th>
                  <th className="text-left font-medium px-3 py-2 w-[190px]">Outcome</th>
                  <th className="text-left font-medium px-3 py-2 min-w-[160px]">Client</th>
                  <th className="w-[70px]" />
                </tr>
              </thead>
              <tbody>
                {rows.map(r => {
                  const oc = outcomeMeta(r.outcome);
                  const editing = (f: string) => editCell?.id === r.id && editCell?.field === f;
                  return (
                    <tr key={r.id} className="border-b last:border-0 hover:bg-muted/30 align-top">
                      {/* Month / Year */}
                      <td
                        className={cn("px-3 py-2 whitespace-nowrap", canManageHR && "cursor-text")}
                        onDoubleClick={() => canManageHR && setEditCell({ id: r.id, field: "date" })}
                        title={canManageHR ? "Double-click to edit" : undefined}
                      >
                        {editing("date") ? (
                          <Input
                            autoFocus type="date" className="h-8 w-[135px]"
                            defaultValue={r.inspection_date ?? ""}
                            onBlur={e => patch(r.id, { inspection_date: e.target.value || null })}
                          />
                        ) : r.inspection_date ? format(parseISO(r.inspection_date), "MMM yyyy") : <span className="text-muted-foreground/60">—</span>}
                      </td>
                      {/* Body */}
                      <td className="px-3 py-2">
                        {editing("body") ? (
                          <Select defaultOpen value={r.body ?? "Other"} onValueChange={v => patch(r.id, { body: v })} onOpenChange={o => { if (!o) setEditCell(null); }}>
                            <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                            <SelectContent>{BODIES.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}</SelectContent>
                          </Select>
                        ) : (
                          <Badge
                            variant="outline"
                            className={cn("text-[11px] bg-orange-100 text-orange-700 border-orange-200 font-normal", canManageHR && "cursor-pointer")}
                            onClick={() => canManageHR && setEditCell({ id: r.id, field: "body" })}
                          >{r.body || "—"}</Badge>
                        )}
                      </td>
                      {/* Type */}
                      <td
                        className={cn("px-3 py-2", canManageHR && "cursor-text")}
                        onDoubleClick={() => canManageHR && setEditCell({ id: r.id, field: "type" })}
                        title={canManageHR ? "Double-click to edit" : undefined}
                      >
                        {editing("type") ? (
                          <Input
                            autoFocus className="h-8" defaultValue={r.inspection_type ?? ""}
                            onBlur={e => patch(r.id, { inspection_type: e.target.value.trim() || null })}
                            onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") setEditCell(null); }}
                          />
                        ) : <span className="line-clamp-2">{r.inspection_type || <span className="text-muted-foreground/60">—</span>}</span>}
                      </td>
                      {/* Outcome */}
                      <td className="px-3 py-2">
                        {editing("outcome") ? (
                          <Select defaultOpen value={r.outcome ?? "Pending"} onValueChange={v => patch(r.id, { outcome: v })} onOpenChange={o => { if (!o) setEditCell(null); }}>
                            <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                            <SelectContent>{OUTCOMES.map(o => <SelectItem key={o.value} value={o.value}>{o.value}</SelectItem>)}</SelectContent>
                          </Select>
                        ) : (
                          <Badge
                            variant="outline"
                            className={cn("text-[11px] rounded-full px-3 py-0.5 uppercase", oc.cls, canManageHR && "cursor-pointer")}
                            onClick={() => canManageHR && setEditCell({ id: r.id, field: "outcome" })}
                          >{oc.value}</Badge>
                        )}
                      </td>
                      {/* Client */}
                      <td
                        className={cn("px-3 py-2 text-muted-foreground", canManageHR && "cursor-text")}
                        onDoubleClick={() => canManageHR && setEditCell({ id: r.id, field: "client" })}
                        title={canManageHR ? "Double-click to edit" : undefined}
                      >
                        {editing("client") ? (
                          <Input
                            autoFocus className="h-8" defaultValue={r.client_name ?? ""}
                            onBlur={e => patch(r.id, { client_name: e.target.value.trim() || null })}
                            onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") setEditCell(null); }}
                          />
                        ) : (r.client_name || "—")}
                      </td>
                      {/* Actions */}
                      <td className="px-2 py-2">
                        <div className="flex items-center justify-end gap-0.5">
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground" onClick={() => setSelectedId(r.id)} title="Open inspection">
                            <ExternalLink className="h-4 w-4" />
                          </Button>
                          {canManageHR && (
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" title="Delete inspection">
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Delete this inspection?</AlertDialogTitle>
                                  <AlertDialogDescription>This inspection record will be permanently removed. This can't be undone.</AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => remove(r.id)}>Delete</AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {canManageHR && (
              <p className="px-3 py-2 text-[11px] text-muted-foreground border-t bg-muted/20">
                Double-click a cell to edit · click a pill to change it · open a row for the full inspection.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ---- Detail -----------------------------------------------------------------
function LabeledField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1 min-w-0">
      <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">{label}</p>
      {children}
    </div>
  );
}

// File attachments for an inspection's supporting evidence (private storage bucket).
function EvidenceFiles({ inspectionId, files, canEdit, onChange }: {
  inspectionId: string;
  files: EvidenceFile[];
  canEdit: boolean;
  onChange?: (files: EvidenceFile[]) => void;
}) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const upload = async (fileList: FileList | null) => {
    if (!fileList || !fileList.length) return;
    setBusy(true);
    const added: EvidenceFile[] = [];
    for (const file of Array.from(fileList)) {
      const safe = file.name.replace(/[^\w.\-]+/g, "_");
      const path = `${inspectionId}/${Date.now()}-${safe}`;
      const { error } = await supabase.storage.from(EVIDENCE_BUCKET).upload(path, file, { upsert: false });
      if (error) { toast({ title: `Couldn't upload ${file.name}`, description: error.message, variant: "destructive" }); continue; }
      added.push({ path, name: file.name, size: file.size, type: file.type, uploaded_at: new Date().toISOString() });
    }
    setBusy(false);
    if (inputRef.current) inputRef.current.value = "";
    if (added.length) onChange?.([...files, ...added]);
  };

  const open = async (f: EvidenceFile) => {
    const { data, error } = await supabase.storage.from(EVIDENCE_BUCKET).createSignedUrl(f.path, 3600);
    if (error || !data?.signedUrl) { toast({ title: "Couldn't open file", description: error?.message, variant: "destructive" }); return; }
    window.open(data.signedUrl, "_blank", "noopener");
  };

  const remove = async (f: EvidenceFile) => {
    await supabase.storage.from(EVIDENCE_BUCKET).remove([f.path]);
    onChange?.(files.filter(x => x.path !== f.path));
  };

  return (
    <div className="space-y-2">
      {files.length > 0 ? (
        <ul className="space-y-1.5">
          {files.map(f => (
            <li key={f.path} className="flex items-center gap-2 rounded-md border bg-muted/20 px-3 py-2 text-sm">
              <Paperclip className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              <button type="button" className="truncate text-left hover:underline flex-1 min-w-0" onClick={() => open(f)} title={f.name}>{f.name}</button>
              <span className="text-[11px] text-muted-foreground flex-shrink-0">{prettySize(f.size)}</span>
              {canEdit && (
                <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-destructive flex-shrink-0" onClick={() => remove(f)} title="Remove file">
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              )}
            </li>
          ))}
        </ul>
      ) : !canEdit ? <p className="text-sm text-muted-foreground/60">—</p> : null}
      {canEdit && (
        <>
          <input ref={inputRef} type="file" multiple className="hidden" onChange={e => upload(e.target.files)} />
          <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => inputRef.current?.click()}>
            {busy ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Upload className="h-4 w-4 mr-1.5" />}
            {busy ? "Uploading…" : "Attach files"}
          </Button>
        </>
      )}
    </div>
  );
}

function InspectionDetail({ id, canEdit, onBack }: { id: string; canEdit: boolean; onBack: () => void }) {
  const { toast } = useToast();
  const [row, setRow] = useState<Inspection | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await (supabase as any).from("inspections").select("*").eq("id", id).maybeSingle();
    setRow((data as Inspection) || null);
    setLoading(false);
  }, [id]);
  useEffect(() => { load(); }, [load]);

  const patch = async (p: Partial<Inspection>) => {
    if (!row) return;
    setRow({ ...row, ...p });
    const { error } = await (supabase as any).from("inspections").update({ ...p, updated_at: new Date().toISOString() }).eq("id", row.id);
    if (error) { toast({ title: "Couldn't save", description: error.message, variant: "destructive" }); load(); }
  };

  if (loading) return <div className="flex-1 flex items-center justify-center py-16 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading…</div>;
  if (!row) return (
    <div className="flex-1 p-6">
      <Button variant="ghost" size="sm" onClick={onBack}><ArrowLeft className="h-4 w-4 mr-1" /> Back</Button>
      <p className="text-muted-foreground mt-6 text-center">This inspection isn't available.</p>
    </div>
  );

  const oc = outcomeMeta(row.outcome);
  const ro = (v: string | null) => v || <span className="text-muted-foreground/60">—</span>;

  return (
    <div className="flex-1 overflow-auto p-4 md:p-6">
      <div className="max-w-3xl mx-auto space-y-4">
        <Button variant="ghost" size="sm" onClick={onBack} className="-ml-2"><ArrowLeft className="h-4 w-4 mr-1" /> All inspections</Button>

        <Card>
          <CardContent className="p-5 space-y-4">
            {canEdit ? (
              <>
                <Input
                  key={`type-${row.id}`}
                  defaultValue={row.inspection_type ?? ""}
                  onBlur={e => patch({ inspection_type: e.target.value.trim() || null })}
                  className="text-lg font-bold h-auto py-1.5 border-transparent hover:border-input focus:border-input px-2 -mx-2"
                  placeholder="Inspection type (e.g. CQC Inspection - Personal Care)"
                />
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <LabeledField label="Month / Year">
                    <Input type="date" className="h-9" defaultValue={row.inspection_date ?? ""} key={`d-${row.id}`}
                      onChange={e => patch({ inspection_date: e.target.value || null })} />
                  </LabeledField>
                  <LabeledField label="Body">
                    <Select value={row.body ?? "Other"} onValueChange={v => patch({ body: v })}>
                      <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                      <SelectContent>{BODIES.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}</SelectContent>
                    </Select>
                  </LabeledField>
                  <LabeledField label="Outcome">
                    <Select value={row.outcome ?? "Pending"} onValueChange={v => patch({ outcome: v })}>
                      <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                      <SelectContent>{OUTCOMES.map(o => <SelectItem key={o.value} value={o.value}>{o.value}</SelectItem>)}</SelectContent>
                    </Select>
                  </LabeledField>
                  <LabeledField label="Client">
                    <Input className="h-9" defaultValue={row.client_name ?? ""} key={`c-${row.id}`}
                      onBlur={e => patch({ client_name: e.target.value.trim() || null })} placeholder="Optional" />
                  </LabeledField>
                </div>
                <LabeledField label="Supporting evidence">
                  <EvidenceFiles inspectionId={row.id} files={row.evidence_files ?? []} canEdit
                    onChange={fs => patch({ evidence_files: fs })} />
                </LabeledField>
                <LabeledField label="Inspector feedback">
                  <Textarea rows={4} defaultValue={row.inspector_feedback ?? ""} key={`if-${row.id}`}
                    onBlur={e => patch({ inspector_feedback: e.target.value.trim() || null })} placeholder="What the inspector said" />
                </LabeledField>
                <LabeledField label="Lessons learned">
                  <Textarea rows={4} defaultValue={row.lessons_learned ?? ""} key={`ll-${row.id}`}
                    onBlur={e => patch({ lessons_learned: e.target.value.trim() || null })} placeholder="What we took from it / actions" />
                </LabeledField>
                <LabeledField label="Notes">
                  <Textarea rows={2} defaultValue={row.notes ?? ""} key={`nt-${row.id}`}
                    onBlur={e => patch({ notes: e.target.value.trim() || null })} placeholder="Anything else" />
                </LabeledField>
              </>
            ) : (
              <>
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div>
                    <h1 className="text-xl font-bold">{row.inspection_type || "Inspection"}</h1>
                    <div className="flex items-center gap-2 mt-1.5 text-sm text-muted-foreground flex-wrap">
                      {row.inspection_date && <span>{format(parseISO(row.inspection_date), "MMMM yyyy")}</span>}
                      {row.body && <Badge variant="outline" className="text-[10px] bg-orange-100 text-orange-700 border-orange-200 font-normal">{row.body}</Badge>}
                      {row.client_name && <span>· {row.client_name}</span>}
                    </div>
                  </div>
                  <Badge variant="outline" className={cn("text-[11px] rounded-full px-3 py-0.5 uppercase", oc.cls)}>{oc.value}</Badge>
                </div>
                {(row.evidence_files?.length ?? 0) > 0 && <div><p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Supporting evidence</p><EvidenceFiles inspectionId={row.id} files={row.evidence_files ?? []} canEdit={false} /></div>}
                {row.inspector_feedback && <div><p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Inspector feedback</p><p className="text-sm whitespace-pre-wrap">{ro(row.inspector_feedback)}</p></div>}
                {row.lessons_learned && <div><p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Lessons learned</p><p className="text-sm whitespace-pre-wrap">{ro(row.lessons_learned)}</p></div>}
                {row.notes && <div><p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Notes</p><p className="text-sm whitespace-pre-wrap">{ro(row.notes)}</p></div>}
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
