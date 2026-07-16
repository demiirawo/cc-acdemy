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
  MapPin, Calendar, Clock, CheckCircle2, MessageSquarePlus, Trash2, UserPlus,
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

export function IncidentsSection() {
  const { user } = useAuth();
  const { isAdmin } = useUserRole();

  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [staff, setStaff] = useState<StaffProfile[]>([]);
  const [clients, setClients] = useState<{ id: string; name: string }[]>([]);
  const [createOpen, setCreateOpen] = useState(false);

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
          <div className="space-y-2">
            {incidents.map(inc => {
              const sev = sevMeta(inc.severity);
              const st = statusMeta(inc.status);
              return (
                <button
                  key={inc.id}
                  onClick={() => setSelectedId(inc.id)}
                  className="w-full text-left rounded-lg border bg-card hover:bg-muted/40 transition-colors p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold truncate">{inc.title}</span>
                        <Badge variant="outline" className={cn("text-[10px]", sev.cls)}>{sev.label}</Badge>
                        <Badge variant="outline" className={cn("text-[10px]", st.cls)}>{st.label}</Badge>
                        {inc.shared_with_staff && (
                          <Badge variant="outline" className="text-[10px] border-primary/40 text-primary flex items-center gap-1">
                            <Share2 className="h-3 w-3" /> Shared
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{inc.description}</p>
                      <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground flex-wrap">
                        {inc.client_name && <span className="flex items-center gap-1"><Users className="h-3 w-3" /> {inc.client_name}</span>}
                        <span className="flex items-center gap-1"><Calendar className="h-3 w-3" /> {format(parseISO(inc.incident_date), "d MMM yyyy")}</span>
                        {inc.category && <span>· {inc.category}</span>}
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
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

// ---- Detail view ------------------------------------------------------------
function IncidentDetail({
  incidentId, isAdmin, currentUserId, staff, onBack,
}: {
  incidentId: string;
  isAdmin: boolean;
  currentUserId: string | null;
  staff: StaffProfile[];
  onBack: () => void;
}) {
  const { toast } = useToast();
  const [incident, setIncident] = useState<Incident | null>(null);
  const [statements, setStatements] = useState<IncidentStatement[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  // Current user's own statement draft
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
    setBusy(true);
    setIncident({ ...incident, ...patch });
    const { error } = await (supabase as any).from("incidents").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", incident.id);
    setBusy(false);
    if (error) { toast({ title: "Couldn't update", description: error.message, variant: "destructive" }); load(); }
  };

  const myRow = statements.find(s => s.user_id === currentUserId);
  const saveMyStatement = async () => {
    if (!myRow) return;
    setSavingMine(true);
    const { error } = await (supabase as any).from("incident_statements").update({
      statement: myStatement.trim() || null,
      lessons: myLessons.trim() || null,
      status: "submitted",
      submitted_at: new Date().toISOString(),
    }).eq("id", myRow.id);
    setSavingMine(false);
    if (error) { toast({ title: "Couldn't submit", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Statement submitted", description: "Thank you — your manager can now see it." });
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

  return (
    <div className="flex-1 overflow-auto p-4 md:p-6">
      <div className="max-w-4xl mx-auto space-y-4">
        <Button variant="ghost" size="sm" onClick={onBack} className="-ml-2"><ArrowLeft className="h-4 w-4 mr-1" /> All incidents</Button>

        {/* Header */}
        <Card>
          <CardContent className="p-5 space-y-4">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="min-w-0">
                <h1 className="text-xl font-bold">{incident.title}</h1>
                <div className="flex items-center gap-3 mt-1.5 text-sm text-muted-foreground flex-wrap">
                  <span className="flex items-center gap-1"><Calendar className="h-3.5 w-3.5" /> {format(parseISO(incident.incident_date), "d MMM yyyy")}</span>
                  {incident.incident_time && <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> {incident.incident_time}</span>}
                  {incident.client_name && <span className="flex items-center gap-1"><Users className="h-3.5 w-3.5" /> {incident.client_name}</span>}
                  {incident.location && <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" /> {incident.location}</span>}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className={cn(sev.cls)}>{sev.label}</Badge>
                {isAdmin ? (
                  <Select value={incident.status} onValueChange={v => patchIncident({ status: v })}>
                    <SelectTrigger className="h-8 w-[150px]"><SelectValue /></SelectTrigger>
                    <SelectContent>{STATUSES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
                  </Select>
                ) : (
                  <Badge variant="outline" className={cn(st.cls)}>{st.label}</Badge>
                )}
              </div>
            </div>

            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">What happened</p>
              <p className="text-sm whitespace-pre-wrap">{incident.description}</p>
            </div>
            {incident.category && (
              <div><span className="text-xs text-muted-foreground">Category: </span><span className="text-sm font-medium">{incident.category}</span></div>
            )}
            {incident.immediate_actions && (
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Immediate actions taken</p>
                <p className="text-sm whitespace-pre-wrap">{incident.immediate_actions}</p>
              </div>
            )}

            {/* Share control (admin) */}
            {isAdmin && (
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
            )}
            {!isAdmin && incident.shared_with_staff && (
              <p className="text-xs text-primary flex items-center gap-1"><Share2 className="h-3 w-3" /> Shared with the team for awareness and lessons learned.</p>
            )}
          </CardContent>
        </Card>

        {/* My statement (if I've been invited) */}
        {myRow && (
          <Card className="border-primary/30">
            <CardContent className="p-5 space-y-3">
              <div className="flex items-center gap-2">
                <MessageSquarePlus className="h-4 w-4 text-primary" />
                <p className="font-semibold">Your statement</p>
                {myRow.status === "submitted"
                  ? <Badge variant="outline" className="text-[10px] border-emerald-300 text-emerald-600">Submitted</Badge>
                  : <Badge variant="outline" className="text-[10px] border-amber-300 text-amber-600">Awaiting your response</Badge>}
              </div>
              <p className="text-xs text-muted-foreground">You've been asked to give an account of this incident and any lessons learned. You can update it at any time.</p>
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

        {/* Statements register */}
        <Card>
          <CardContent className="p-5 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-muted-foreground" />
                <p className="font-semibold">Statements &amp; lessons</p>
                <Badge variant="outline" className="text-[10px]">{statements.filter(s => s.status === "submitted").length}/{statements.length}</Badge>
              </div>
              {isAdmin && (
                <Button size="sm" variant="outline" onClick={() => setInviteOpen(true)}>
                  <UserPlus className="h-4 w-4 mr-1" /> Invite staff
                </Button>
              )}
            </div>

            {statements.length === 0 ? (
              <p className="text-sm text-muted-foreground italic">
                {isAdmin ? "No one invited yet. Invite staff to give a statement and share lessons." : "No statements yet."}
              </p>
            ) : (
              <div className="space-y-2">
                {statements.map(s => {
                  const submitted = s.status === "submitted";
                  const isMine = s.user_id === currentUserId;
                  return (
                    <div key={s.id} className="rounded-lg border p-3">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">{nameOf(s.user_id)}</span>
                          {isMine && <Badge variant="outline" className="text-[10px]">You</Badge>}
                          {submitted
                            ? <Badge variant="outline" className="text-[10px] border-emerald-300 text-emerald-600 flex items-center gap-1"><CheckCircle2 className="h-3 w-3" /> Submitted</Badge>
                            : <Badge variant="outline" className="text-[10px] border-amber-300 text-amber-600">Invited</Badge>}
                        </div>
                        {isAdmin && (
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive"
                            onClick={async () => {
                              await (supabase as any).from("incident_statements").delete().eq("id", s.id);
                              load();
                            }}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                      {submitted && (s.statement || s.lessons) ? (
                        <div className="mt-2 space-y-2 text-sm">
                          {s.statement && <div><span className="text-xs text-muted-foreground">Statement: </span><span className="whitespace-pre-wrap">{s.statement}</span></div>}
                          {s.lessons && <div><span className="text-xs text-muted-foreground">Lessons: </span><span className="whitespace-pre-wrap">{s.lessons}</span></div>}
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground mt-1 italic">Awaiting their response.</p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {inviteOpen && (
        <InviteStaffDialog
          incident={incident}
          staff={staff}
          alreadyInvited={new Set(statements.map(s => s.user_id))}
          inviterId={currentUserId}
          onClose={() => setInviteOpen(false)}
          onInvited={() => { setInviteOpen(false); load(); }}
        />
      )}
    </div>
  );
}

// ---- Invite dialog ----------------------------------------------------------
function InviteStaffDialog({
  incident, staff, alreadyInvited, inviterId, onClose, onInvited,
}: {
  incident: Incident;
  staff: StaffProfile[];
  alreadyInvited: Set<string>;
  inviterId: string | null;
  onClose: () => void;
  onInvited: () => void;
}) {
  const { toast } = useToast();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState("");

  const available = staff.filter(s =>
    !alreadyInvited.has(s.user_id) &&
    (s.display_name || s.email || "").toLowerCase().includes(query.toLowerCase())
  );
  const toggle = (uid: string) => setSelected(prev => {
    const n = new Set(prev); n.has(uid) ? n.delete(uid) : n.add(uid); return n;
  });

  const invite = async () => {
    if (selected.size === 0) return;
    setSaving(true);
    const rows = [...selected].map(uid => ({ incident_id: incident.id, user_id: uid, invited_by: inviterId, status: "invited" }));
    const { error } = await (supabase as any).from("incident_statements").insert(rows);
    setSaving(false);
    if (error) { toast({ title: "Couldn't invite", description: error.message, variant: "destructive" }); return; }
    // Fire-and-forget emails.
    [...selected].forEach(uid => {
      const s = staff.find(x => x.user_id === uid);
      if (s?.email) {
        supabase.functions.invoke("send-incident-invite-email", {
          body: { recipientEmail: s.email, recipientName: s.display_name, incidentTitle: incident.title, incidentDate: incident.incident_date },
        }).catch(() => {});
      }
    });
    toast({ title: `Invited ${selected.size} staff member${selected.size === 1 ? "" : "s"}`, description: "They've been emailed to provide a statement." });
    onInvited();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader><DialogTitle>Invite staff for a statement</DialogTitle></DialogHeader>
        <Input placeholder="Search staff…" value={query} onChange={e => setQuery(e.target.value)} className="mb-2" />
        <div className="flex-1 overflow-y-auto space-y-1 min-h-0">
          {available.length === 0 ? (
            <p className="text-sm text-muted-foreground italic py-6 text-center">No staff to invite.</p>
          ) : available.map(s => (
            <label key={s.user_id} className="flex items-center gap-3 rounded-md p-2 hover:bg-muted/50 cursor-pointer">
              <Checkbox checked={selected.has(s.user_id)} onCheckedChange={() => toggle(s.user_id)} />
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{s.display_name || s.email}</p>
                {s.display_name && s.email && <p className="text-xs text-muted-foreground truncate">{s.email}</p>}
              </div>
            </label>
          ))}
        </div>
        <DialogFooter className="mt-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={invite} disabled={saving || selected.size === 0}>
            {saving ? "Inviting…" : `Invite${selected.size ? ` (${selected.size})` : ""} & email`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
