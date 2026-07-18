import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { cn } from "@/lib/utils";
import { format, parseISO, addMonths, differenceInCalendarDays } from "date-fns";
import { trainingItemUpToDate } from "@/lib/trainingStatus";
import { RANK_STYLES, RANK_ORDER, type Rank } from "@/components/hr/PerformanceRankBadge";
import {
  ArrowLeft, ClipboardList, Loader2, Plus, CheckCircle2, AlertTriangle, GraduationCap,
  Award, ShieldAlert, Users, ExternalLink, Star, CalendarClock, Trash2, MessageSquare,
} from "lucide-react";

// ---- Types ------------------------------------------------------------------
interface StaffRow { user_id: string; display_name: string | null; email: string | null; }
interface HrRow { user_id: string; performance_rating: string | null; start_date: string | null; }
interface Supervision {
  id: string;
  user_id: string;
  supervisor_id: string | null;
  supervision_date: string;
  status: string; // 'draft' | 'completed'
  manager_feedback: string | null;
  client_feedback: string | null;
  training_notes: string | null;
  knowledge_notes: string | null;
  knowledge_score: number | null;
  incidents_notes: string | null;
  rating_notes: string | null;
  wellbeing_notes: string | null;
  development_notes: string | null;
  action_points: string | null;
  additional_notes: string | null;
  next_due_date: string | null;
  staff_acknowledged: boolean;
  acknowledged_at: string | null;
  created_at: string;
  updated_at: string;
}

const SUPERVISION_INTERVAL_MONTHS = 3;

// The editable discussion fields, in display order.
const SECTIONS: { key: keyof Supervision; label: string; hint: string; rows?: number }[] = [
  { key: "manager_feedback", label: "Manager feedback", hint: "Strengths, concerns and overall performance since the last supervision.", rows: 4 },
  { key: "client_feedback", label: "Client feedback", hint: "What clients have said — positive or negative — about this person's work.", rows: 3 },
  { key: "training_notes", label: "Training progress", hint: "Discuss the training summary below — what's outstanding and a plan to close gaps.", rows: 3 },
  { key: "knowledge_notes", label: "Care knowledge, CQC & policy", hint: "Their understanding of the care sector, CQC compliance, and policy & procedure.", rows: 3 },
  { key: "incidents_notes", label: "Incidents & lessons learned", hint: "Review the linked incidents below — reflections and what's changed since.", rows: 3 },
  { key: "rating_notes", label: "Rating & how to improve", hint: "Where they sit today and the concrete steps to reach the next rating.", rows: 3 },
  { key: "wellbeing_notes", label: "Wellbeing & support", hint: "Workload, capacity, any support they need from us.", rows: 3 },
  { key: "development_notes", label: "Development & goals", hint: "Career aspirations and development they'd like to work towards.", rows: 3 },
  { key: "action_points", label: "Agreed action points", hint: "What both sides will do before the next supervision.", rows: 3 },
  { key: "additional_notes", label: "Anything else", hint: "Any other points raised during the supervision.", rows: 2 },
];

// ---- Helpers ----------------------------------------------------------------
function nextDueFrom(s: Supervision | null): Date | null {
  if (!s) return null;
  if (s.next_due_date) return parseISO(s.next_due_date);
  return addMonths(parseISO(s.supervision_date), SUPERVISION_INTERVAL_MONTHS);
}
type DueTone = "overdue" | "soon" | "ok" | "never";
function dueMeta(last: Supervision | null): { tone: DueTone; label: string; due: Date | null } {
  if (!last) return { tone: "never", label: "Never had one", due: null };
  const due = nextDueFrom(last);
  if (!due) return { tone: "ok", label: "Up to date", due: null };
  const days = differenceInCalendarDays(due, new Date());
  if (days < 0) return { tone: "overdue", label: `${Math.abs(days)}d overdue`, due };
  if (days <= 30) return { tone: "soon", label: `Due in ${days}d`, due };
  return { tone: "ok", label: `Due ${format(due, "d MMM")}`, due };
}
const DUE_CLS: Record<DueTone, string> = {
  overdue: "border-red-300 text-red-600 bg-red-500/5",
  soon: "border-amber-300 text-amber-600 bg-amber-500/5",
  ok: "border-emerald-300 text-emerald-600 bg-emerald-500/5",
  never: "border-muted-foreground/30 text-muted-foreground bg-muted/30",
};

const SEV_TONE: Record<string, string> = {
  low: "border-border text-muted-foreground",
  medium: "border-amber-300 text-amber-600",
  high: "border-red-300 text-red-600",
  critical: "border-red-400 text-red-700",
};

// ---- Root -------------------------------------------------------------------
export function SupervisionsSection({ onViewProfile }: { onViewProfile?: (userId: string) => void }) {
  const { toast } = useToast();
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [hr, setHr] = useState<Record<string, HrRow>>({});
  const [latest, setLatest] = useState<Record<string, Supervision>>({});
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);

  const loadOverview = useCallback(async () => {
    setLoading(true);
    const [{ data: profiles }, { data: hrRows }, { data: sups }] = await Promise.all([
      supabase.from("profiles").select("user_id, display_name, email").order("display_name"),
      supabase.from("hr_profiles").select("user_id, performance_rating, start_date"),
      (supabase as any).from("supervisions").select("*").order("supervision_date", { ascending: false }),
    ]);
    setStaff((profiles as StaffRow[]) || []);
    const hrMap: Record<string, HrRow> = {};
    ((hrRows as HrRow[]) || []).forEach(h => { hrMap[h.user_id] = h; });
    setHr(hrMap);
    // Latest COMPLETED supervision per user drives the due cadence.
    const latestMap: Record<string, Supervision> = {};
    ((sups as Supervision[]) || []).forEach(s => {
      if (s.status !== "completed") return;
      if (!latestMap[s.user_id] || s.supervision_date > latestMap[s.user_id].supervision_date) latestMap[s.user_id] = s;
    });
    setLatest(latestMap);
    setLoading(false);
  }, []);

  useEffect(() => { loadOverview(); }, [loadOverview]);

  if (selected) {
    return (
      <SupervisionDetail
        userId={selected}
        staff={staff}
        hr={hr[selected] || null}
        onBack={() => { setSelected(null); loadOverview(); }}
        onViewProfile={onViewProfile}
      />
    );
  }

  // Overview: staff ranked by urgency.
  const rows = staff.map(s => ({ staff: s, last: latest[s.user_id] || null, meta: dueMeta(latest[s.user_id] || null) }));
  const order: Record<DueTone, number> = { overdue: 0, never: 1, soon: 2, ok: 3 };
  rows.sort((a, b) => order[a.meta.tone] - order[b.meta.tone] || (a.staff.display_name || "").localeCompare(b.staff.display_name || ""));
  const overdue = rows.filter(r => r.meta.tone === "overdue" || r.meta.tone === "never").length;
  const soon = rows.filter(r => r.meta.tone === "soon").length;

  return (
    <div className="flex-1 overflow-auto p-4 md:p-6">
      <div className="max-w-7xl mx-auto space-y-4">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-primary/10 p-2.5"><ClipboardList className="h-5 w-5 text-primary" /></div>
          <div>
            <h1 className="text-xl font-bold">Supervisions</h1>
            <p className="text-sm text-muted-foreground">Every staff member has a supervision every {SUPERVISION_INTERVAL_MONTHS} months. Pick someone to record theirs.</p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <Card><CardContent className="p-4"><p className="text-2xl font-bold tabular-nums">{staff.length}</p><p className="text-xs text-muted-foreground">Staff</p></CardContent></Card>
          <Card><CardContent className="p-4"><p className={cn("text-2xl font-bold tabular-nums", overdue > 0 && "text-red-600")}>{overdue}</p><p className="text-xs text-muted-foreground">Overdue / never</p></CardContent></Card>
          <Card><CardContent className="p-4"><p className={cn("text-2xl font-bold tabular-nums", soon > 0 && "text-amber-600")}>{soon}</p><p className="text-xs text-muted-foreground">Due within 30 days</p></CardContent></Card>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading…</div>
        ) : (
          <div className="rounded-lg border overflow-x-auto bg-card">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-[11px] uppercase tracking-wide text-muted-foreground">
                  <th className="text-left font-medium px-3 py-2">Staff</th>
                  <th className="text-left font-medium px-3 py-2 w-[120px]">Rating</th>
                  <th className="text-left font-medium px-3 py-2 w-[180px]">Last supervision</th>
                  <th className="text-left font-medium px-3 py-2 w-[160px]">Next due</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ staff: s, last, meta }) => {
                  const rating = (hr[s.user_id]?.performance_rating && RANK_ORDER.includes(hr[s.user_id]!.performance_rating as Rank)) ? hr[s.user_id]!.performance_rating as Rank : null;
                  return (
                    <tr
                      key={s.user_id}
                      onClick={() => setSelected(s.user_id)}
                      className="border-b last:border-0 hover:bg-muted/30 cursor-pointer"
                    >
                      <td className="px-3 py-2 font-medium">{s.display_name || s.email}</td>
                      <td className="px-3 py-2">
                        {rating ? <Badge variant="outline" className="text-[10px]">{RANK_STYLES[rating].emoji} {RANK_STYLES[rating].label}</Badge> : <span className="text-muted-foreground/60">—</span>}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">
                        {last ? format(parseISO(last.supervision_date), "d MMM yyyy") : "—"}
                      </td>
                      <td className="px-3 py-2">
                        <Badge variant="outline" className={cn("text-[11px]", DUE_CLS[meta.tone])}>{meta.label}</Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ---- Detail -----------------------------------------------------------------
interface LiveContext {
  warnings: { id: string; kind: string; category: string | null; reason: string; severity: string; issued_at: string }[];
  training: { total: number; upToDate: number; gaps: { name: string; category: string | null; reason: string }[] };
  incidents: { title: string; incident_date: string; severity: string; status: string; clientName: string | null; myStatementStatus: string }[];
  clients: string[];
}

function SupervisionDetail({ userId, staff, hr, onBack, onViewProfile }: {
  userId: string;
  staff: StaffRow[];
  hr: HrRow | null;
  onBack: () => void;
  onViewProfile?: (userId: string) => void;
}) {
  const { user } = useAuth();
  const { toast } = useToast();
  const person = staff.find(s => s.user_id === userId);
  const name = person?.display_name || person?.email || "Staff member";
  const rating = (hr?.performance_rating && RANK_ORDER.includes(hr.performance_rating as Rank)) ? hr.performance_rating as Rank : null;

  const [ctx, setCtx] = useState<LiveContext | null>(null);
  const [history, setHistory] = useState<Supervision[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // The supervision currently being edited (null until "new" or a history row is opened).
  const [draft, setDraft] = useState<Supervision | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [warnRes, itemsRes, recRes, incRes, assignRes, supRes] = await Promise.all([
      (supabase as any).from("staff_warnings").select("id, kind, category, reason, severity, issued_at").eq("user_id", userId).order("issued_at", { ascending: false }),
      supabase.from("training_items").select("id, name, refresh_frequency_months, category").eq("is_active", true).order("sort_order", { ascending: true }),
      supabase.from("training_records").select("training_item_id, completed_date").eq("user_id", userId),
      (supabase as any).from("incident_statements").select("status, incident:incidents(title, incident_date, severity, status, client_name)").eq("user_id", userId),
      (supabase as any).from("staff_client_assignments").select("client_name").eq("staff_user_id", userId),
      (supabase as any).from("supervisions").select("*").eq("user_id", userId).order("supervision_date", { ascending: false }),
    ]);

    const items = (itemsRes.data as any[]) || [];
    const recByItem = new Map<string, string>(((recRes.data as any[]) || []).map(r => [r.training_item_id, r.completed_date]));
    let upToDate = 0;
    const gaps: LiveContext["training"]["gaps"] = [];
    items.forEach(it => {
      const done = recByItem.get(it.id);
      const ok = trainingItemUpToDate(it.refresh_frequency_months, done);
      if (ok) upToDate++;
      else gaps.push({ name: it.name, category: it.category, reason: done ? "Expired" : "Not completed" });
    });

    const incidents = (((incRes.data as any[]) || [])
      .filter(r => r.incident)
      .map(r => ({
        title: r.incident.title,
        incident_date: r.incident.incident_date,
        severity: r.incident.severity,
        status: r.incident.status,
        clientName: r.incident.client_name,
        myStatementStatus: r.status,
      }))
      .sort((a, b) => (a.incident_date < b.incident_date ? 1 : -1)));

    setCtx({
      warnings: (warnRes.data as any[]) || [],
      training: { total: items.length, upToDate, gaps },
      incidents,
      clients: Array.from(new Set(((assignRes.data as any[]) || []).map(a => a.client_name).filter(Boolean))),
    });
    setHistory((supRes.data as Supervision[]) || []);
    setLoading(false);
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  const startNew = () => {
    const today = new Date().toISOString().slice(0, 10);
    setDraft({
      id: "", user_id: userId, supervisor_id: user?.id ?? null, supervision_date: today, status: "draft",
      manager_feedback: null, client_feedback: null, training_notes: null, knowledge_notes: null, knowledge_score: null,
      incidents_notes: null, rating_notes: null, wellbeing_notes: null, development_notes: null, action_points: null,
      additional_notes: null, next_due_date: null, staff_acknowledged: false, acknowledged_at: null,
      created_at: today, updated_at: today,
    });
  };

  const setField = (key: keyof Supervision, value: any) => setDraft(d => d ? { ...d, [key]: value } : d);

  const save = async (markCompleted: boolean) => {
    if (!draft) return;
    setSaving(true);
    const payload: any = {
      user_id: userId,
      supervisor_id: draft.supervisor_id ?? user?.id ?? null,
      supervision_date: draft.supervision_date,
      status: markCompleted ? "completed" : draft.status || "draft",
      manager_feedback: draft.manager_feedback, client_feedback: draft.client_feedback, training_notes: draft.training_notes,
      knowledge_notes: draft.knowledge_notes, knowledge_score: draft.knowledge_score, incidents_notes: draft.incidents_notes,
      rating_notes: draft.rating_notes, wellbeing_notes: draft.wellbeing_notes, development_notes: draft.development_notes,
      action_points: draft.action_points, additional_notes: draft.additional_notes,
      next_due_date: draft.next_due_date || format(addMonths(parseISO(draft.supervision_date), SUPERVISION_INTERVAL_MONTHS), "yyyy-MM-dd"),
    };
    let error;
    if (draft.id) {
      ({ error } = await (supabase as any).from("supervisions").update(payload).eq("id", draft.id));
    } else {
      ({ error } = await (supabase as any).from("supervisions").insert(payload));
    }
    setSaving(false);
    if (error) { toast({ title: "Couldn't save", description: error.message, variant: "destructive" }); return; }
    toast({ title: markCompleted ? "Supervision completed" : "Draft saved" });
    setDraft(null);
    load();
  };

  const deleteSup = async (id: string) => {
    await (supabase as any).from("supervisions").delete().eq("id", id);
    if (draft?.id === id) setDraft(null);
    load();
  };

  return (
    <div className="flex-1 overflow-auto p-4 md:p-6">
      <div className="max-w-7xl mx-auto space-y-4">
        <Button variant="ghost" size="sm" onClick={onBack} className="-ml-2"><ArrowLeft className="h-4 w-4 mr-1" /> All staff</Button>

        {/* Header */}
        <Card>
          <CardContent className="p-5 flex items-start justify-between gap-3 flex-wrap">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                {onViewProfile ? (
                  <button onClick={() => onViewProfile(userId)} className="text-lg font-bold text-primary hover:underline inline-flex items-center gap-1">
                    {name} <ExternalLink className="h-3.5 w-3.5" />
                  </button>
                ) : <h1 className="text-lg font-bold">{name}</h1>}
                {rating && <Badge variant="outline" className="text-[10px]">{RANK_STYLES[rating].emoji} {RANK_STYLES[rating].label}</Badge>}
              </div>
              {history[0] && (
                <p className="text-xs text-muted-foreground mt-1">
                  Last supervision {format(parseISO(history.find(h => h.status === "completed")?.supervision_date || history[0].supervision_date), "d MMM yyyy")}
                </p>
              )}
            </div>
            {!draft && <Button size="sm" onClick={startNew}><Plus className="h-4 w-4 mr-1" /> New supervision</Button>}
          </CardContent>
        </Card>

        {loading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading…</div>
        ) : (
          <>
            {/* Live context pulled from across the app */}
            {ctx && (
              <Accordion type="multiple" defaultValue={["training", "incidents", "feedback"]} className="space-y-2">
                <ContextCard value="rating" icon={<Award className="h-4 w-4 text-primary" />} title="Rating">
                  {rating ? (
                    <p className="text-sm">Currently <strong>{RANK_STYLES[rating].label}</strong>. A higher rating and longer tenure both mean a bigger monthly bonus; a D rating gets none. Use the rating section below to agree how to improve.</p>
                  ) : <p className="text-sm text-muted-foreground">Not yet rated.</p>}
                </ContextCard>

                <ContextCard value="feedback" icon={<MessageSquare className="h-4 w-4 text-primary" />} title="Manager feedback on record"
                  badge={ctx.warnings.length ? `${ctx.warnings.filter(w => w.kind === "praise").length} positive · ${ctx.warnings.filter(w => w.kind !== "praise").length} warnings` : "None"}>
                  {ctx.warnings.length === 0 ? <p className="text-sm text-muted-foreground italic">No feedback recorded yet.</p> : (
                    <div className="space-y-1.5">
                      {ctx.warnings.slice(0, 6).map(w => (
                        <div key={w.id} className="flex items-start gap-2 text-sm">
                          {w.kind === "praise" ? <Star className="h-3.5 w-3.5 mt-0.5 text-green-600 flex-shrink-0" /> : <AlertTriangle className="h-3.5 w-3.5 mt-0.5 text-amber-500 flex-shrink-0" />}
                          <span><span className="text-xs text-muted-foreground">{format(parseISO(w.issued_at), "d MMM")} · </span>{w.reason}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </ContextCard>

                <ContextCard value="training" icon={<GraduationCap className="h-4 w-4 text-primary" />} title="Training progress"
                  badge={ctx.training.total === 0 ? "No items" : ctx.training.gaps.length ? `${ctx.training.gaps.length} outstanding` : "All up to date"}
                  badgeTone={ctx.training.gaps.length ? "warning" : "ok"}>
                  {ctx.training.total === 0 ? <p className="text-sm text-muted-foreground italic">No training items configured.</p> : (
                    <>
                      <p className="text-sm mb-2">{ctx.training.upToDate}/{ctx.training.total} up to date.</p>
                      {ctx.training.gaps.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {ctx.training.gaps.map((g, i) => (
                            <Badge key={i} variant="outline" className="text-[10px] border-amber-300 text-amber-600">{g.name} · {g.reason}</Badge>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </ContextCard>

                <ContextCard value="incidents" icon={<ShieldAlert className="h-4 w-4 text-primary" />} title="Incidents linked"
                  badge={ctx.incidents.length ? `${ctx.incidents.length}` : "None"} badgeTone={ctx.incidents.length ? "warning" : "ok"}>
                  {ctx.incidents.length === 0 ? <p className="text-sm text-muted-foreground italic">Not linked to any incidents.</p> : (
                    <div className="space-y-1.5">
                      {ctx.incidents.map((inc, i) => (
                        <div key={i} className="flex items-center gap-2 text-sm flex-wrap">
                          <Badge variant="outline" className={cn("text-[10px] capitalize", SEV_TONE[inc.severity] || "")}>{inc.severity}</Badge>
                          <span className="font-medium">{inc.title}</span>
                          <span className="text-xs text-muted-foreground">{format(parseISO(inc.incident_date), "d MMM yyyy")}{inc.clientName ? ` · ${inc.clientName}` : ""}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </ContextCard>

                {ctx.clients.length > 0 && (
                  <ContextCard value="clients" icon={<Users className="h-4 w-4 text-primary" />} title="Clients they support" badge={`${ctx.clients.length}`}>
                    <div className="flex flex-wrap gap-1.5">
                      {ctx.clients.map((c, i) => <Badge key={i} variant="outline" className="text-[10px]">{c}</Badge>)}
                    </div>
                  </ContextCard>
                )}
              </Accordion>
            )}

            {/* Editor */}
            {draft ? (
              <Card className="border-primary/30">
                <CardContent className="p-5 space-y-4">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <p className="font-semibold">{draft.id ? "Edit supervision" : "New supervision"}</p>
                    <div className="flex items-center gap-2">
                      <Label className="text-xs text-muted-foreground">Date</Label>
                      <Input type="date" className="h-9 w-40" value={draft.supervision_date} onChange={e => setField("supervision_date", e.target.value)} />
                    </div>
                  </div>

                  {SECTIONS.map(sec => (
                    <div key={sec.key as string} className="space-y-1">
                      <Label className="text-sm font-medium">{sec.label}</Label>
                      <p className="text-[11px] text-muted-foreground">{sec.hint}</p>
                      <Textarea
                        rows={sec.rows || 3}
                        value={(draft[sec.key] as string) || ""}
                        onChange={e => setField(sec.key, e.target.value)}
                      />
                      {sec.key === "knowledge_notes" && (
                        <div className="flex items-center gap-2 pt-1">
                          <Label className="text-xs text-muted-foreground">Knowledge score</Label>
                          <Select value={draft.knowledge_score ? String(draft.knowledge_score) : "none"} onValueChange={v => setField("knowledge_score", v === "none" ? null : Number(v))}>
                            <SelectTrigger className="h-8 w-40"><SelectValue placeholder="Not scored" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">Not scored</SelectItem>
                              {[1, 2, 3, 4, 5].map(n => <SelectItem key={n} value={String(n)}>{n} / 5</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                    </div>
                  ))}

                  <div className="flex items-center justify-end gap-2 pt-1">
                    <Button variant="ghost" size="sm" onClick={() => setDraft(null)}>Cancel</Button>
                    <Button variant="outline" size="sm" onClick={() => save(false)} disabled={saving}>{saving ? "Saving…" : "Save draft"}</Button>
                    <Button size="sm" onClick={() => save(true)} disabled={saving}><CheckCircle2 className="h-4 w-4 mr-1" /> Mark completed</Button>
                  </div>
                </CardContent>
              </Card>
            ) : null}

            {/* History */}
            {history.length > 0 && (
              <Card>
                <CardContent className="p-5 space-y-2">
                  <p className="font-semibold">Supervision history</p>
                  {history.map(h => {
                    const due = nextDueFrom(h);
                    return (
                      <div key={h.id} className="flex items-center gap-3 rounded-lg border p-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium text-sm">{format(parseISO(h.supervision_date), "d MMM yyyy")}</span>
                            {h.status === "completed"
                              ? <Badge variant="outline" className="text-[10px] border-emerald-300 text-emerald-600">Completed</Badge>
                              : <Badge variant="outline" className="text-[10px] border-amber-300 text-amber-600">Draft</Badge>}
                            {h.knowledge_score && <Badge variant="outline" className="text-[10px]">Knowledge {h.knowledge_score}/5</Badge>}
                            {due && <span className="text-xs text-muted-foreground">next due {format(due, "d MMM yyyy")}</span>}
                          </div>
                          {h.action_points && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">Actions: {h.action_points}</p>}
                        </div>
                        <Button variant="outline" size="sm" onClick={() => setDraft(h)}>Open</Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => deleteSup(h.id)}><Trash2 className="h-4 w-4" /></Button>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function ContextCard({ value, icon, title, badge, badgeTone, children }: {
  value: string; icon: React.ReactNode; title: string; badge?: string; badgeTone?: "warning" | "ok"; children: React.ReactNode;
}) {
  return (
    <AccordionItem value={value} className="border rounded-lg bg-card px-4">
      <AccordionTrigger className="hover:no-underline py-3">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {icon}
          <span className="text-sm font-semibold">{title}</span>
          {badge && (
            <Badge variant="outline" className={cn("text-[10px] ml-1",
              badgeTone === "warning" ? "border-amber-300 text-amber-600" : badgeTone === "ok" ? "border-emerald-300 text-emerald-600" : "")}>
              {badge}
            </Badge>
          )}
        </div>
      </AccordionTrigger>
      <AccordionContent className="pb-3">{children}</AccordionContent>
    </AccordionItem>
  );
}
