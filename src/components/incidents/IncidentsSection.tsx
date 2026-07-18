import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { format, parseISO } from "date-fns";
import {
  AlertTriangle, Plus, ArrowLeft, ShieldAlert, Users, Share2, Loader2,
  MapPin, Calendar, Clock, CheckCircle2, MessageSquarePlus, Trash2, UserPlus, ExternalLink,
} from "lucide-react";

// ---- Shared vocab -----------------------------------------------------------
const SEVERITIES = [
  { value: "low", label: "Low", cls: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  { value: "medium", label: "Medium", cls: "bg-amber-100 text-amber-700 border-amber-200" },
  { value: "high", label: "High", cls: "bg-orange-100 text-orange-700 border-orange-200" },
  { value: "critical", label: "Critical", cls: "bg-red-100 text-red-700 border-red-200" },
] as const;
const STATUSES = [
  { value: "open", label: "Open", cls: "bg-blue-100 text-blue-700 border-blue-200" },
  { value: "under_review", label: "Under review", cls: "bg-amber-100 text-amber-700 border-amber-200" },
  { value: "resolved", label: "Resolved", cls: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  { value: "closed", label: "Closed", cls: "bg-muted text-muted-foreground border-border" },
] as const;
const CATEGORIES = ["Fall", "Medication", "Safeguarding", "Complaint", "Injury", "Missed visit", "Behaviour", "Other"];

const sevMeta = (v: string) => SEVERITIES.find(s => s.value === v) ?? SEVERITIES[1];
const statusMeta = (v: string) => STATUSES.find(s => s.value === v) ?? STATUSES[0];

interface Incident {
  id: string;
  title: string;
  description: string;
  client_id: string | null;
  client_name: string | null;
  incident_date: string;
  incident_time: string | null;
  location: string | null;
  severity: string;
  category: string | null;
  status: string;
  immediate_actions: string | null;
  reported_by: string | null;
  shared_with_staff: boolean;
  created_at: string;
}
interface IncidentStatement {
  id: string;
  incident_id: string;
  user_id: string;
  statement: string | null;
  lessons: string | null;
  status: string;
  invited_at: string;
  submitted_at: string | null;
}
interface StaffProfile { user_id: string; display_name: string | null; email: string | null; }

export function IncidentsSection({ onViewProfile }: { onViewProfile?: (userId: string) => void }) {
  const { user } = useAuth();
  // HR manages incidents alongside admins (RLS allows both).
  const { canManageHR: isAdmin } = useUserRole();
  const { toast } = useToast();

  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [staff, setStaff] = useState<StaffProfile[]>([]);
  const [clients, setClients] = useState<{ id: string; name: string }[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  // Airtable-style inline editing: which list cell is being edited.
  const [editCell, setEditCell] = useState<{ id: string; field: string } | null>(null);

  // Inline patch from the list table — optimistic, then persist.
  const patchListIncident = async (id: string, patch: Partial<Incident>) => {
    setIncidents(prev => prev.map(i => i.id === id ? { ...i, ...patch } : i));
    setEditCell(null);
    const { error } = await (supabase as any)
      .from("incidents")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) {
      toast({ title: "Couldn't update", description: error.message, variant: "destructive" });
      loadIncidents();
    }
  };

  const loadIncidents = useCallback(async () => {
    setLoading(true);
    const { data } = await (supabase as any)
      .from("incidents")
      .select("*")
      .order("incident_date", { ascending: false })
      .order("created_at", { ascending: false });
    setIncidents((data as Incident[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => { loadIncidents(); }, [loadIncidents]);

  useEffect(() => {
    (async () => {
      const { data: p } = await supabase.from("profiles").select("user_id, display_name, email").order("display_name");
      setStaff((p as StaffProfile[]) || []);
      const { data: c } = await supabase.from("clients").select("id, name").order("name");
      setClients((c as { id: string; name: string }[]) || []);
    })();
  }, []);

  if (selectedId) {
    return (
      <IncidentDetail
        incidentId={selectedId}
        isAdmin={isAdmin}
        currentUserId={user?.id ?? null}
        staff={staff}
        clients={clients}
        onViewProfile={onViewProfile}
        onBack={() => { setSelectedId(null); loadIncidents(); }}
      />
    );
  }

  return (
    <div className="flex-1 overflow-auto p-4 md:p-6">
      <div className="max-w-5xl mx-auto space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-10 w-10 rounded-lg bg-red-500/10 flex items-center justify-center flex-shrink-0">
              <ShieldAlert className="h-5 w-5 text-red-500" />
            </div>
            <div className="min-w-0">
              <h1 className="text-2xl font-bold">Incidents</h1>
              <p className="text-muted-foreground text-sm">Log, investigate and share incidents impacting our clients.</p>
            </div>
          </div>
          {isAdmin && (
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4 mr-1" /> Log incident
            </Button>
          )}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading incidents…
          </div>
        ) : incidents.length === 0 ? (
          <Card>
            <CardContent className="py-14 text-center text-muted-foreground">
              <AlertTriangle className="h-8 w-8 mx-auto mb-3 opacity-40" />
              <p className="font-medium">No incidents logged</p>
              <p className="text-sm">{isAdmin ? "Log the first incident to start a record." : "Incidents shared with you will appear here."}</p>
            </CardContent>
          </Card>
        ) : (
          /* Airtable-style table — double-click text cells to edit, click pills to change */
          <div className="rounded-lg border overflow-x-auto bg-card">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-[11px] uppercase tracking-wide text-muted-foreground">
                  <th className="text-left font-medium px-3 py-2 min-w-[220px]">Title</th>
                  <th className="text-left font-medium px-3 py-2 min-w-[140px]">Client</th>
                  <th className="text-left font-medium px-3 py-2 w-[120px]">Date</th>
                  <th className="text-left font-medium px-3 py-2 w-[110px]">Severity</th>
                  <th className="text-left font-medium px-3 py-2 w-[130px]">Status</th>
                  <th className="text-left font-medium px-3 py-2 w-[130px]">Category</th>
                  <th className="w-[44px]" />
                </tr>
              </thead>
              <tbody>
                {incidents.map(inc => {
                  const sev = sevMeta(inc.severity);
                  const st = statusMeta(inc.status);
                  const editing = (field: string) => editCell?.id === inc.id && editCell?.field === field;
                  return (
                    <tr key={inc.id} className="border-b last:border-0 hover:bg-muted/30 align-top">
                      {/* Title */}
                      <td
                        className={cn("px-3 py-2 font-medium", isAdmin && "cursor-text")}
                        onDoubleClick={() => isAdmin && setEditCell({ id: inc.id, field: "title" })}
                        title={isAdmin ? "Double-click to edit" : undefined}
                      >
                        {editing("title") ? (
                          <Input
                            autoFocus
                            defaultValue={inc.title}
                            className="h-8"
                            onBlur={e => {
                              const v = e.target.value.trim();
                              if (v && v !== inc.title) patchListIncident(inc.id, { title: v });
                              else setEditCell(null);
                            }}
                            onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") setEditCell(null); }}
                          />
                        ) : (
                          <span className="line-clamp-2">{inc.title}</span>
                        )}
                      </td>
                      {/* Client */}
                      <td className="px-3 py-2">
                        {editing("client") ? (
                          <Select
                            defaultOpen
                            value={inc.client_id ?? "none"}
                            onValueChange={v => {
                              const c = clients.find(x => x.id === v);
                              patchListIncident(inc.id, { client_id: v === "none" ? null : v, client_name: c?.name ?? null });
                            }}
                            onOpenChange={o => { if (!o) setEditCell(null); }}
                          >
                            <SelectTrigger className="h-8"><SelectValue placeholder="Client" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">No specific client</SelectItem>
                              {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        ) : inc.client_name ? (
                          <span className={cn(isAdmin && "cursor-pointer")} onClick={() => isAdmin && setEditCell({ id: inc.id, field: "client" })}>
                            <a
                              href={`/public/schedule/${encodeURIComponent(inc.client_name.trim())}`}
                              target="_blank"
                              rel="noreferrer"
                              onClick={e => e.stopPropagation()}
                              className="text-primary hover:underline"
                              title={`Open ${inc.client_name}'s public page`}
                            >
                              {inc.client_name}
                            </a>
                          </span>
                        ) : (
                          <span
                            className={cn("text-muted-foreground/60", isAdmin && "cursor-pointer hover:text-foreground")}
                            onClick={() => isAdmin && setEditCell({ id: inc.id, field: "client" })}
                          >—</span>
                        )}
                      </td>
                      {/* Date */}
                      <td
                        className={cn("px-3 py-2 whitespace-nowrap text-muted-foreground", isAdmin && "cursor-text")}
                        onDoubleClick={() => isAdmin && setEditCell({ id: inc.id, field: "date" })}
                        title={isAdmin ? "Double-click to edit" : undefined}
                      >
                        {editing("date") ? (
                          <Input
                            autoFocus
                            type="date"
                            defaultValue={inc.incident_date}
                            className="h-8 w-[135px]"
                            onBlur={e => {
                              if (e.target.value && e.target.value !== inc.incident_date) patchListIncident(inc.id, { incident_date: e.target.value });
                              else setEditCell(null);
                            }}
                          />
                        ) : format(parseISO(inc.incident_date), "d MMM yyyy")}
                      </td>
                      {/* Severity */}
                      <td className="px-3 py-2">
                        {editing("severity") ? (
                          <Select
                            defaultOpen
                            value={inc.severity}
                            onValueChange={v => patchListIncident(inc.id, { severity: v })}
                            onOpenChange={o => { if (!o) setEditCell(null); }}
                          >
                            <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                            <SelectContent>{SEVERITIES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
                          </Select>
                        ) : (
                          <Badge
                            variant="outline"
                            className={cn("text-[10px]", sev.cls, isAdmin && "cursor-pointer")}
                            onClick={() => isAdmin && setEditCell({ id: inc.id, field: "severity" })}
                          >{sev.label}</Badge>
                        )}
                      </td>
                      {/* Status */}
                      <td className="px-3 py-2">
                        {editing("status") ? (
                          <Select
                            defaultOpen
                            value={inc.status}
                            onValueChange={v => patchListIncident(inc.id, { status: v })}
                            onOpenChange={o => { if (!o) setEditCell(null); }}
                          >
                            <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                            <SelectContent>{STATUSES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
                          </Select>
                        ) : (
                          <Badge
                            variant="outline"
                            className={cn("text-[10px]", st.cls, isAdmin && "cursor-pointer")}
                            onClick={() => isAdmin && setEditCell({ id: inc.id, field: "status" })}
                          >{st.label}</Badge>
                        )}
                      </td>
                      {/* Category */}
                      <td className="px-3 py-2">
                        {editing("category") ? (
                          <Select
                            defaultOpen
                            value={inc.category ?? "none"}
                            onValueChange={v => patchListIncident(inc.id, { category: v === "none" ? null : v })}
                            onOpenChange={o => { if (!o) setEditCell(null); }}
                          >
                            <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">Uncategorised</SelectItem>
                              {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        ) : (
                          <span
                            className={cn("text-muted-foreground", isAdmin && "cursor-pointer hover:text-foreground")}
                            onClick={() => isAdmin && setEditCell({ id: inc.id, field: "category" })}
                          >{inc.category || "—"}</span>
                        )}
                      </td>
                      {/* Open detail */}
                      <td className="px-2 py-2 text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-foreground"
                          onClick={() => setSelectedId(inc.id)}
                          title="Open incident"
                        >
                          <ExternalLink className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {isAdmin && (
              <p className="px-3 py-2 text-[11px] text-muted-foreground border-t bg-muted/20">
                Double-click title or date to edit · click a pill to change it · open a row for statements &amp; details.
              </p>
            )}
          </div>
        )}
      </div>

      {createOpen && (
        <CreateIncidentDialog
          clients={clients}
          reporterId={user?.id ?? null}
          onClose={() => setCreateOpen(false)}
          onCreated={(id) => { setCreateOpen(false); loadIncidents(); setSelectedId(id); }}
        />
      )}
    </div>
  );
}

// ---- Create dialog ----------------------------------------------------------
function CreateIncidentDialog({
  clients, reporterId, onClose, onCreated,
}: {
  clients: { id: string; name: string }[];
  reporterId: string | null;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    title: "", description: "", clientId: "none", incident_date: new Date().toISOString().slice(0, 10),
    incident_time: "", location: "", severity: "medium", category: "none", immediate_actions: "",
  });
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  const submit = async () => {
    if (!form.title.trim() || !form.description.trim()) {
      toast({ title: "Title and description are required", variant: "destructive" });
      return;
    }
    setSaving(true);
    const client = clients.find(c => c.id === form.clientId);
    const { data, error } = await (supabase as any).from("incidents").insert({
      title: form.title.trim(),
      description: form.description.trim(),
      client_id: client?.id ?? null,
      client_name: client?.name ?? null,
      incident_date: form.incident_date,
      incident_time: form.incident_time || null,
      location: form.location.trim() || null,
      severity: form.severity,
      category: form.category === "none" ? null : form.category,
      immediate_actions: form.immediate_actions.trim() || null,
      reported_by: reporterId,
    }).select("id").single();
    setSaving(false);
    if (error) { toast({ title: "Couldn't log incident", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Incident logged" });
    onCreated((data as { id: string }).id);
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[88vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Log an incident</DialogTitle></DialogHeader>
        <div className="space-y-3 py-1">
          <div className="space-y-1.5">
            <Label>Title *</Label>
            <Input value={form.title} onChange={e => set("title", e.target.value)} placeholder="Short summary of what happened" />
          </div>
          <div className="space-y-1.5">
            <Label>What happened? *</Label>
            <Textarea value={form.description} onChange={e => set("description", e.target.value)} rows={4} placeholder="Describe the incident in detail…" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Client</Label>
              <Select value={form.clientId} onValueChange={v => set("clientId", v)}>
                <SelectTrigger><SelectValue placeholder="Select client" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No specific client</SelectItem>
                  {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Select value={form.category} onValueChange={v => set("category", v)}>
                <SelectTrigger><SelectValue placeholder="Category" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Uncategorised</SelectItem>
                  {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label>Date</Label>
              <Input type="date" value={form.incident_date} onChange={e => set("incident_date", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Time</Label>
              <Input type="time" value={form.incident_time} onChange={e => set("incident_time", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Severity</Label>
              <Select value={form.severity} onValueChange={v => set("severity", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{SEVERITIES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Location</Label>
            <Input value={form.location} onChange={e => set("location", e.target.value)} placeholder="Where did it happen?" />
          </div>
          <div className="space-y-1.5">
            <Label>Immediate actions taken</Label>
            <Textarea value={form.immediate_actions} onChange={e => set("immediate_actions", e.target.value)} rows={2} placeholder="What was done straight away?" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={submit} disabled={saving}>{saving ? "Saving…" : "Log incident"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---- Detail view (admin: inline-editable, Airtable-style) --------------------
function LabeledField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1 min-w-0">
      <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">{label}</p>
      {children}
    </div>
  );
}

function IncidentDetail({
  incidentId, isAdmin, currentUserId, staff, clients, onViewProfile, onBack,
}: {
  incidentId: string;
  isAdmin: boolean;
  currentUserId: string | null;
  staff: StaffProfile[];
  clients: { id: string; name: string }[];
  onViewProfile?: (userId: string) => void;
  onBack: () => void;
}) {
  const { toast } = useToast();
  const [incident, setIncident] = useState<Incident | null>(null);
  const [statements, setStatements] = useState<IncidentStatement[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  // Inline add-participant
  const [addUser, setAddUser] = useState("");
  const [emailOnAdd, setEmailOnAdd] = useState(true);
  const [addBusy, setAddBusy] = useState(false);
  // Current user's own statement draft (staff self-service)
  const [myStatement, setMyStatement] = useState("");
  const [myLessons, setMyLessons] = useState("");
  const [savingMine, setSavingMine] = useState(false);

  const nameOf = (uid: string) => staff.find(s => s.user_id === uid)?.display_name || staff.find(s => s.user_id === uid)?.email || "Staff member";

  const load = useCallback(async () => {
    setLoading(true);
    const { data: inc } = await (supabase as any).from("incidents").select("*").eq("id", incidentId).maybeSingle();
    setIncident((inc as Incident) || null);
    const { data: st } = await (supabase as any).from("incident_statements").select("*").eq("incident_id", incidentId).order("invited_at", { ascending: true });
    const list = (st as IncidentStatement[]) || [];
    setStatements(list);
    const mine = list.find(s => s.user_id === currentUserId);
    setMyStatement(mine?.statement || "");
    setMyLessons(mine?.lessons || "");
    setLoading(false);
  }, [incidentId, currentUserId]);

  useEffect(() => { load(); }, [load]);

  const patchIncident = async (patch: Partial<Incident>) => {
    if (!incident) return;
    const next = { ...incident, ...patch };
    setIncident(next);
    setBusy(true);
    const { error } = await (supabase as any).from("incidents").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", incident.id);
    setBusy(false);
    if (error) { toast({ title: "Couldn't update", description: error.message, variant: "destructive" }); load(); }
  };

  // Admin: save (proxy-edit) any participant's statement + lessons.
  const saveRow = async (id: string, statement: string, lessons: string) => {
    const hasContent = !!(statement.trim() || lessons.trim());
    const patch = {
      statement: statement.trim() || null,
      lessons: lessons.trim() || null,
      status: hasContent ? "submitted" : "invited",
      submitted_at: hasContent ? new Date().toISOString() : null,
    };
    setStatements(prev => prev.map(s => s.id === id ? { ...s, ...patch } as IncidentStatement : s));
    const { error } = await (supabase as any).from("incident_statements").update(patch).eq("id", id);
    if (error) { toast({ title: "Couldn't save", description: error.message, variant: "destructive" }); load(); }
    else toast({ title: "Saved" });
  };

  const addParticipant = async () => {
    if (!addUser || !incident) return;
    setAddBusy(true);
    const { data, error } = await (supabase as any).from("incident_statements")
      .insert({ incident_id: incident.id, user_id: addUser, invited_by: currentUserId, status: "invited" })
      .select("*").single();
    setAddBusy(false);
    if (error) { toast({ title: "Couldn't add", description: error.message, variant: "destructive" }); return; }
    setStatements(prev => [...prev, data as IncidentStatement]);
    const s = staff.find(x => x.user_id === addUser);
    if (emailOnAdd && s?.email) {
      supabase.functions.invoke("send-incident-invite-email", {
        body: { recipientEmail: s.email, recipientName: s.display_name, incidentTitle: incident.title, incidentDate: incident.incident_date },
      }).catch(() => {});
    }
    toast({ title: emailOnAdd ? "Added & emailed" : "Added", description: emailOnAdd ? "They've been asked for a statement." : "You can fill in their response below." });
    setAddUser("");
  };

  const deleteRow = async (id: string) => {
    setStatements(prev => prev.filter(s => s.id !== id));
    await (supabase as any).from("incident_statements").delete().eq("id", id);
  };

  const myRow = statements.find(s => s.user_id === currentUserId);
  const saveMyStatement = async () => {
    if (!myRow) return;
    setSavingMine(true);
    const { error } = await (supabase as any).from("incident_statements").update({
      statement: myStatement.trim() || null, lessons: myLessons.trim() || null,
      status: "submitted", submitted_at: new Date().toISOString(),
    }).eq("id", myRow.id);
    setSavingMine(false);
    if (error) { toast({ title: "Couldn't submit", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Statement submitted" });
    load();
  };

  if (loading) {
    return <div className="flex-1 flex items-center justify-center py-16 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading…</div>;
  }
  if (!incident) {
    return (
      <div className="flex-1 p-6">
        <Button variant="ghost" size="sm" onClick={onBack}><ArrowLeft className="h-4 w-4 mr-1" /> Back</Button>
        <p className="text-muted-foreground mt-6 text-center">This incident isn't available.</p>
      </div>
    );
  }

  const sev = sevMeta(incident.severity);
  const st = statusMeta(incident.status);
  const available = staff.filter(s => !statements.some(x => x.user_id === s.user_id));

  return (
    <div className="flex-1 overflow-auto p-4 md:p-6">
      <div className="max-w-4xl mx-auto space-y-4">
        <Button variant="ghost" size="sm" onClick={onBack} className="-ml-2"><ArrowLeft className="h-4 w-4 mr-1" /> All incidents</Button>

        {/* ---- Incident record ---- */}
        <Card>
          <CardContent className="p-5 space-y-4">
            {isAdmin ? (
              <>
                <Input
                  key={`title-${incident.id}`}
                  defaultValue={incident.title}
                  onBlur={e => { const v = e.target.value.trim(); if (v && v !== incident.title) patchIncident({ title: v }); }}
                  className="text-lg font-bold h-auto py-1.5 border-transparent hover:border-input focus:border-input px-2 -mx-2"
                  placeholder="Incident title"
                />
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <LabeledField label="Date">
                    <Input type="date" className="h-9" defaultValue={incident.incident_date} key={`date-${incident.id}`}
                      onChange={e => e.target.value && patchIncident({ incident_date: e.target.value })} />
                  </LabeledField>
                  <LabeledField label="Time">
                    <Input type="time" className="h-9" defaultValue={incident.incident_time || ""} key={`time-${incident.id}`}
                      onChange={e => patchIncident({ incident_time: e.target.value || null })} />
                  </LabeledField>
                  <LabeledField label="Severity">
                    <Select value={incident.severity} onValueChange={v => patchIncident({ severity: v })}>
                      <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                      <SelectContent>{SEVERITIES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
                    </Select>
                  </LabeledField>
                  <LabeledField label="Status">
                    <Select value={incident.status} onValueChange={v => patchIncident({ status: v })}>
                      <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                      <SelectContent>{STATUSES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
                    </Select>
                  </LabeledField>
                  <LabeledField label="Category">
                    <Select value={incident.category ?? "none"} onValueChange={v => patchIncident({ category: v === "none" ? null : v })}>
                      <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Uncategorised</SelectItem>
                        {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </LabeledField>
                  <LabeledField label="Client">
                    <Select value={incident.client_id ?? "none"} onValueChange={v => {
                      const c = clients.find(x => x.id === v);
                      patchIncident({ client_id: v === "none" ? null : v, client_name: c?.name ?? null });
                    }}>
                      <SelectTrigger className="h-9"><SelectValue placeholder="Select client" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No specific client</SelectItem>
                        {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </LabeledField>
                  <LabeledField label="Location">
                    <Input className="h-9" defaultValue={incident.location || ""} key={`loc-${incident.id}`}
                      onBlur={e => patchIncident({ location: e.target.value.trim() || null })} placeholder="Where?" />
                  </LabeledField>
                </div>
                <LabeledField label="What happened">
                  <Textarea defaultValue={incident.description} key={`desc-${incident.id}`} rows={4}
                    onBlur={e => { const v = e.target.value.trim(); if (v && v !== incident.description) patchIncident({ description: v }); }} />
                </LabeledField>
                <LabeledField label="Immediate actions taken">
                  <Textarea defaultValue={incident.immediate_actions || ""} key={`act-${incident.id}`} rows={2}
                    onBlur={e => patchIncident({ immediate_actions: e.target.value.trim() || null })} placeholder="What was done straight away?" />
                </LabeledField>
                <div className="flex items-center justify-between rounded-lg border bg-muted/20 p-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <Share2 className="h-4 w-4 text-primary flex-shrink-0" />
                    <div>
                      <p className="text-sm font-medium">Share with all staff</p>
                      <p className="text-xs text-muted-foreground">When on, every staff member can read this incident and its statements.</p>
                    </div>
                  </div>
                  <Switch checked={incident.shared_with_staff} onCheckedChange={c => patchIncident({ shared_with_staff: c })} disabled={busy} />
                </div>
              </>
            ) : (
              <>
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <h1 className="text-xl font-bold">{incident.title}</h1>
                    <div className="flex items-center gap-3 mt-1.5 text-sm text-muted-foreground flex-wrap">
                      <span className="flex items-center gap-1"><Calendar className="h-3.5 w-3.5" /> {format(parseISO(incident.incident_date), "d MMM yyyy")}</span>
                      {incident.incident_time && <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> {incident.incident_time}</span>}
                      {incident.client_name && (
                        <a href={`/public/schedule/${encodeURIComponent(incident.client_name.trim())}`} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-primary hover:underline">
                          <Users className="h-3.5 w-3.5" /> {incident.client_name} <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                      {incident.location && <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" /> {incident.location}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className={cn(sev.cls)}>{sev.label}</Badge>
                    <Badge variant="outline" className={cn(st.cls)}>{st.label}</Badge>
                  </div>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">What happened</p>
                  <p className="text-sm whitespace-pre-wrap">{incident.description}</p>
                </div>
                {incident.category && <div><span className="text-xs text-muted-foreground">Category: </span><span className="text-sm font-medium">{incident.category}</span></div>}
                {incident.immediate_actions && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Immediate actions taken</p>
                    <p className="text-sm whitespace-pre-wrap">{incident.immediate_actions}</p>
                  </div>
                )}
                {incident.shared_with_staff && <p className="text-xs text-primary flex items-center gap-1"><Share2 className="h-3 w-3" /> Shared with the team for awareness and lessons learned.</p>}
              </>
            )}
          </CardContent>
        </Card>

        {/* ---- Staff self-service statement (non-admin only) ---- */}
        {!isAdmin && myRow && (
          <Card className="border-primary/30">
            <CardContent className="p-5 space-y-3">
              <div className="flex items-center gap-2">
                <MessageSquarePlus className="h-4 w-4 text-primary" />
                <p className="font-semibold">Your statement</p>
                {myRow.status === "submitted"
                  ? <Badge variant="outline" className="text-[10px] border-emerald-300 text-emerald-600">Submitted</Badge>
                  : <Badge variant="outline" className="text-[10px] border-amber-300 text-amber-600">Awaiting your response</Badge>}
              </div>
              <div className="space-y-1.5">
                <Label>Your account of what happened</Label>
                <Textarea value={myStatement} onChange={e => setMyStatement(e.target.value)} rows={4} placeholder="Describe what you saw / did…" />
              </div>
              <div className="space-y-1.5">
                <Label>Lessons learned / what could prevent it</Label>
                <Textarea value={myLessons} onChange={e => setMyLessons(e.target.value)} rows={3} placeholder="What would you do differently, or what should change?" />
              </div>
              <div className="flex justify-end">
                <Button size="sm" onClick={saveMyStatement} disabled={savingMine || (!myStatement.trim() && !myLessons.trim())}>
                  {savingMine ? "Submitting…" : myRow.status === "submitted" ? "Update statement" : "Submit statement"}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ---- Involved parties ---- */}
        <Card>
          <CardContent className="p-5 space-y-3">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-muted-foreground" />
              <p className="font-semibold">Involved parties &amp; statements</p>
              <Badge variant="outline" className="text-[10px]">{statements.filter(s => s.status === "submitted").length}/{statements.length}</Badge>
            </div>

            {statements.length === 0 && !isAdmin && <p className="text-sm text-muted-foreground italic">No statements yet.</p>}

            {isAdmin ? (
              <div className="space-y-3">
                {statements.map(s => (
                  <AdminStatementRow
                    key={s.id}
                    row={s}
                    name={nameOf(s.user_id)}
                    isMine={s.user_id === currentUserId}
                    onViewProfile={onViewProfile ? () => onViewProfile(s.user_id) : undefined}
                    onSaveRow={saveRow}
                    onDelete={() => deleteRow(s.id)}
                  />
                ))}

                {/* Inline add */}
                <div className="rounded-lg border border-dashed bg-muted/10 p-3 flex flex-col sm:flex-row sm:items-center gap-2">
                  <Select value={addUser} onValueChange={setAddUser}>
                    <SelectTrigger className="h-9 flex-1"><SelectValue placeholder="Add a staff member…" /></SelectTrigger>
                    <SelectContent>
                      {available.length === 0
                        ? <div className="px-2 py-1.5 text-sm text-muted-foreground">Everyone is already added</div>
                        : available.map(s => <SelectItem key={s.user_id} value={s.user_id}>{s.display_name || s.email}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <label className="flex items-center gap-2 text-sm cursor-pointer whitespace-nowrap">
                    <Checkbox checked={emailOnAdd} onCheckedChange={c => setEmailOnAdd(c === true)} /> Email them
                  </label>
                  <Button size="sm" onClick={addParticipant} disabled={!addUser || addBusy}>
                    <UserPlus className="h-4 w-4 mr-1" /> {addBusy ? "Adding…" : "Add"}
                  </Button>
                </div>
                <p className="text-[11px] text-muted-foreground">Add anyone involved — you can type their account and lessons in for them, or email them to fill it in themselves.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {statements.map(s => {
                  const submitted = s.status === "submitted";
                  return (
                    <div key={s.id} className="rounded-lg border p-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium">{nameOf(s.user_id)}</span>
                        {submitted
                          ? <Badge variant="outline" className="text-[10px] border-emerald-300 text-emerald-600 flex items-center gap-1"><CheckCircle2 className="h-3 w-3" /> Submitted</Badge>
                          : <Badge variant="outline" className="text-[10px] border-amber-300 text-amber-600">Invited</Badge>}
                      </div>
                      {submitted && (s.statement || s.lessons) ? (
                        <div className="mt-2 space-y-2 text-sm">
                          {s.statement && <div><span className="text-xs text-muted-foreground">Statement: </span><span className="whitespace-pre-wrap">{s.statement}</span></div>}
                          {s.lessons && <div><span className="text-xs text-muted-foreground">Lessons: </span><span className="whitespace-pre-wrap">{s.lessons}</span></div>}
                        </div>
                      ) : <p className="text-xs text-muted-foreground mt-1 italic">Awaiting their response.</p>}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ---- Editable statement row (admin proxy) ----
function AdminStatementRow({ row, name, isMine, onViewProfile, onSaveRow, onDelete }: {
  row: IncidentStatement;
  name: string;
  isMine: boolean;
  onViewProfile?: () => void;
  onSaveRow: (id: string, statement: string, lessons: string) => void;
  onDelete: () => void;
}) {
  const [statement, setStatement] = useState(row.statement || "");
  const [lessons, setLessons] = useState(row.lessons || "");
  useEffect(() => { setStatement(row.statement || ""); setLessons(row.lessons || ""); }, [row.id]);
  const dirty = statement !== (row.statement || "") || lessons !== (row.lessons || "");
  const submitted = row.status === "submitted";
  return (
    <div className="rounded-lg border p-3 space-y-2">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          {onViewProfile ? (
            <button type="button" onClick={onViewProfile} className="text-sm font-medium text-primary hover:underline inline-flex items-center gap-1" title="Open staff profile">
              {name} <ExternalLink className="h-3 w-3" />
            </button>
          ) : <span className="text-sm font-medium">{name}</span>}
          {isMine && <Badge variant="outline" className="text-[10px]">You</Badge>}
          {submitted
            ? <Badge variant="outline" className="text-[10px] border-emerald-300 text-emerald-600 flex items-center gap-1"><CheckCircle2 className="h-3 w-3" /> Submitted</Badge>
            : <Badge variant="outline" className="text-[10px] border-amber-300 text-amber-600">Awaiting response</Badge>}
        </div>
        <div className="flex items-center gap-1">
          {dirty && <Button size="sm" className="h-7" onClick={() => onSaveRow(row.id, statement, lessons)}>Save</Button>}
          <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={onDelete}><Trash2 className="h-4 w-4" /></Button>
        </div>
      </div>
      <Textarea value={statement} onChange={e => setStatement(e.target.value)} rows={2} placeholder="Their account of what happened (you can fill this in for them)…" />
      <Textarea value={lessons} onChange={e => setLessons(e.target.value)} rows={2} placeholder="Lessons learned / what could prevent it…" />
    </div>
  );
}
