import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { format, parseISO, differenceInCalendarDays } from "date-fns";
import {
  Presentation, Target, ListChecks, Sparkles, Rocket, Plus, Trash2, Pencil,
  ChevronLeft, ChevronRight, X, CalendarDays, AlertCircle, Loader2, Check,
} from "lucide-react";
import { PerformanceRankBadge, RANK_ORDER, RANK_STYLES, tenureYears, type Rank } from "../hr/PerformanceRankBadge";

const ACTION_STATUS = [
  { value: "not_started", label: "Not started", cls: "bg-muted text-muted-foreground border-border" },
  { value: "in_progress", label: "In progress", cls: "bg-blue-100 text-blue-700 border-blue-200" },
  { value: "blocked", label: "Blocked", cls: "bg-red-100 text-red-700 border-red-200" },
  { value: "done", label: "Done", cls: "bg-emerald-100 text-emerald-700 border-emerald-200" },
];
const PRIORITIES = [
  { value: "high", label: "High", cls: "bg-red-100 text-red-700 border-red-200" },
  { value: "medium", label: "Medium", cls: "bg-amber-100 text-amber-700 border-amber-200" },
  { value: "low", label: "Low", cls: "bg-slate-100 text-slate-600 border-slate-200" },
];
const statusMeta = (v: string) => ACTION_STATUS.find(s => s.value === v) ?? ACTION_STATUS[0];
const prioMeta = (v: string) => PRIORITIES.find(p => p.value === v) ?? PRIORITIES[1];

interface MeetingAction {
  id: string; title: string; detail: string | null; owner_user_id: string | null;
  owner_name: string | null; due_date: string | null; status: string; priority: string; sort_order: number;
}
interface AgendaItem { id: string; title: string; is_done: boolean; sort_order: number; }
interface Spotlight { id: string; user_id: string; note: string | null; }
interface StaffProfile { user_id: string; display_name: string | null; email: string | null; }
interface TopPerformer { user_id: string; rank: Rank; years: number | null; }

const SECTIONS = [
  { key: "vision", title: "Our Vision", icon: Rocket },
  { key: "agenda", title: "Agenda", icon: ListChecks },
  { key: "actions", title: "Key Actions We're Tracking", icon: Target },
  { key: "spotlight", title: "Staff Spotlight", icon: Sparkles },
] as const;

export function StaffMeetingsSection() {
  const { user } = useAuth();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [vision, setVision] = useState("");
  const [mission, setMission] = useState("");
  const [editingVision, setEditingVision] = useState(false);
  const [visionDraft, setVisionDraft] = useState("");
  const [missionDraft, setMissionDraft] = useState("");

  const [actions, setActions] = useState<MeetingAction[]>([]);
  const [agenda, setAgenda] = useState<AgendaItem[]>([]);
  const [spotlights, setSpotlights] = useState<Spotlight[]>([]);
  const [staff, setStaff] = useState<StaffProfile[]>([]);
  const [topPerformers, setTopPerformers] = useState<TopPerformer[]>([]);

  const [present, setPresent] = useState(false);
  const [sectionIdx, setSectionIdx] = useState(0);

  const [actionDialog, setActionDialog] = useState(false);
  const [spotlightDialog, setSpotlightDialog] = useState(false);
  const [newAgenda, setNewAgenda] = useState("");

  const nameOf = (uid: string | null) =>
    (uid && (staff.find(s => s.user_id === uid)?.display_name || staff.find(s => s.user_id === uid)?.email)) || "Unknown";

  const load = useCallback(async () => {
    setLoading(true);
    const [settingsRes, actRes, agRes, spotRes, staffRes] = await Promise.all([
      (supabase as any).from("meeting_settings").select("vision, mission").eq("id", true).maybeSingle(),
      (supabase as any).from("meeting_actions").select("*").order("sort_order", { ascending: true }).order("created_at", { ascending: true }),
      (supabase as any).from("meeting_agenda").select("*").order("sort_order", { ascending: true }).order("created_at", { ascending: true }),
      (supabase as any).from("meeting_spotlights").select("*").order("created_at", { ascending: false }),
      supabase.from("profiles").select("user_id, display_name, email").order("display_name"),
    ]);
    setVision(settingsRes.data?.vision || "");
    setMission(settingsRes.data?.mission || "");
    setActions((actRes.data as MeetingAction[]) || []);
    setAgenda((agRes.data as AgendaItem[]) || []);
    setSpotlights((spotRes.data as Spotlight[]) || []);
    setStaff((staffRes.data as StaffProfile[]) || []);

    // Auto top performers from performance ratings (S & A).
    const today = new Date().toISOString().slice(0, 10);
    const { data: hr } = await supabase
      .from("hr_profiles")
      .select("user_id, performance_rating, start_date, created_at, employment_end_date, base_salary")
      .in("performance_rating", ["S", "A"]);
    const tops = (hr || [])
      .filter((h: any) => (h.base_salary ?? 0) > 0 && (!h.employment_end_date || h.employment_end_date >= today))
      .map((h: any) => ({ user_id: h.user_id, rank: h.performance_rating as Rank, years: tenureYears(h.start_date || h.created_at) }))
      .sort((a, b) => RANK_ORDER.indexOf(a.rank) - RANK_ORDER.indexOf(b.rank));
    setTopPerformers(tops);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Arrow-key navigation while presenting.
  useEffect(() => {
    if (!present) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") setSectionIdx(i => Math.min(SECTIONS.length - 1, i + 1));
      else if (e.key === "ArrowLeft") setSectionIdx(i => Math.max(0, i - 1));
      else if (e.key === "Escape") setPresent(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [present]);

  const saveVision = async () => {
    setVision(visionDraft); setMission(missionDraft); setEditingVision(false);
    const { error } = await (supabase as any).from("meeting_settings")
      .update({ vision: visionDraft.trim() || null, mission: missionDraft.trim() || null, updated_by: user?.id, updated_at: new Date().toISOString() })
      .eq("id", true);
    if (error) toast({ title: "Couldn't save vision", description: error.message, variant: "destructive" });
  };

  const cycleStatus = async (a: MeetingAction) => {
    const idx = ACTION_STATUS.findIndex(s => s.value === a.status);
    const next = ACTION_STATUS[(idx + 1) % ACTION_STATUS.length].value;
    setActions(prev => prev.map(x => x.id === a.id ? { ...x, status: next } : x));
    await (supabase as any).from("meeting_actions").update({ status: next }).eq("id", a.id);
  };

  const deleteAction = async (id: string) => {
    setActions(prev => prev.filter(a => a.id !== id));
    await (supabase as any).from("meeting_actions").delete().eq("id", id);
  };

  const toggleAgenda = async (item: AgendaItem) => {
    setAgenda(prev => prev.map(a => a.id === item.id ? { ...a, is_done: !a.is_done } : a));
    await (supabase as any).from("meeting_agenda").update({ is_done: !item.is_done }).eq("id", item.id);
  };
  const addAgenda = async () => {
    if (!newAgenda.trim()) return;
    const { data } = await (supabase as any).from("meeting_agenda")
      .insert({ title: newAgenda.trim(), sort_order: agenda.length }).select("*").single();
    if (data) setAgenda(prev => [...prev, data as AgendaItem]);
    setNewAgenda("");
  };
  const deleteAgenda = async (id: string) => {
    setAgenda(prev => prev.filter(a => a.id !== id));
    await (supabase as any).from("meeting_agenda").delete().eq("id", id);
  };

  const addSpotlight = async (userId: string, note: string) => {
    const { data } = await (supabase as any).from("meeting_spotlights")
      .insert({ user_id: userId, note: note.trim() || null }).select("*").single();
    if (data) setSpotlights(prev => [data as Spotlight, ...prev]);
    setSpotlightDialog(false);
  };
  const deleteSpotlight = async (id: string) => {
    setSpotlights(prev => prev.filter(s => s.id !== id));
    await (supabase as any).from("meeting_spotlights").delete().eq("id", id);
  };

  const agendaDone = agenda.filter(a => a.is_done).length;
  const actionStats = useMemo(() => ({
    overdue: actions.filter(a => a.status !== "done" && a.due_date && differenceInCalendarDays(parseISO(a.due_date), new Date()) < 0).length,
    inProgress: actions.filter(a => a.status === "in_progress").length,
    done: actions.filter(a => a.status === "done").length,
  }), [actions]);

  // ---- Section renderers ----
  const renderVision = (big: boolean) => (
    <div className="space-y-6">
      {editingVision ? (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Vision</Label>
            <Textarea value={visionDraft} onChange={e => setVisionDraft(e.target.value)} rows={3} placeholder="Where are we going as a company?" />
          </div>
          <div className="space-y-1.5">
            <Label>Mission</Label>
            <Textarea value={missionDraft} onChange={e => setMissionDraft(e.target.value)} rows={3} placeholder="How we get there / what we do every day" />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setEditingVision(false)}>Cancel</Button>
            <Button size="sm" onClick={saveVision}>Save</Button>
          </div>
        </div>
      ) : (
        <>
          <blockquote className={cn("font-semibold text-foreground leading-tight", big ? "text-3xl md:text-5xl" : "text-2xl")}>
            {vision ? `“${vision}”` : <span className="text-muted-foreground font-normal italic text-xl">Add your company vision…</span>}
          </blockquote>
          {mission && (
            <div>
              <p className={cn("uppercase tracking-widest text-primary/70 font-semibold mb-1", big ? "text-sm" : "text-xs")}>Our mission</p>
              <p className={cn("text-muted-foreground", big ? "text-xl md:text-2xl" : "text-base")}>{mission}</p>
            </div>
          )}
          {!present && (
            <Button variant="outline" size="sm" onClick={() => { setVisionDraft(vision); setMissionDraft(mission); setEditingVision(true); }}>
              <Pencil className="h-4 w-4 mr-1" /> Edit vision &amp; mission
            </Button>
          )}
        </>
      )}
    </div>
  );

  const renderAgenda = (big: boolean) => (
    <div className="space-y-4">
      {agenda.length > 0 && (
        <div className="flex items-center gap-3">
          <Progress value={agenda.length ? (agendaDone / agenda.length) * 100 : 0} className="h-2 flex-1" />
          <span className="text-sm text-muted-foreground tabular-nums">{agendaDone}/{agenda.length}</span>
        </div>
      )}
      <div className="space-y-2">
        {agenda.length === 0 && <p className="text-muted-foreground italic">No agenda items yet.</p>}
        {agenda.map((item, i) => (
          <div key={item.id} className={cn("flex items-center gap-3 rounded-lg border p-3", item.is_done && "bg-muted/30")}>
            <Checkbox checked={item.is_done} onCheckedChange={() => toggleAgenda(item)} />
            <span className={cn("flex-1", big ? "text-xl" : "text-sm", item.is_done && "line-through text-muted-foreground")}>
              <span className="text-muted-foreground mr-2 tabular-nums">{i + 1}.</span>{item.title}
            </span>
            {!present && (
              <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => deleteAgenda(item.id)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        ))}
      </div>
      {!present && (
        <div className="flex gap-2">
          <Input value={newAgenda} onChange={e => setNewAgenda(e.target.value)} placeholder="Add an agenda item…" onKeyDown={e => e.key === "Enter" && addAgenda()} />
          <Button onClick={addAgenda} disabled={!newAgenda.trim()}><Plus className="h-4 w-4" /></Button>
        </div>
      )}
    </div>
  );

  const renderActions = (big: boolean) => (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">{actionStats.inProgress} in progress</Badge>
        {actionStats.overdue > 0 && <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">{actionStats.overdue} overdue</Badge>}
        <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">{actionStats.done} done</Badge>
        {!present && (
          <Button size="sm" className="ml-auto" onClick={() => setActionDialog(true)}><Plus className="h-4 w-4 mr-1" /> Add action</Button>
        )}
      </div>
      {actions.length === 0 ? (
        <p className="text-muted-foreground italic">No actions being tracked yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="text-left font-medium px-4 py-2">Action</th>
                <th className="text-left font-medium px-4 py-2">Owner</th>
                <th className="text-left font-medium px-4 py-2">Due</th>
                <th className="text-left font-medium px-4 py-2">Priority</th>
                <th className="text-left font-medium px-4 py-2">Status</th>
                {!present && <th className="px-2 py-2"></th>}
              </tr>
            </thead>
            <tbody>
              {actions.map(a => {
                const overdue = a.status !== "done" && a.due_date && differenceInCalendarDays(parseISO(a.due_date), new Date()) < 0;
                const st = statusMeta(a.status); const pr = prioMeta(a.priority);
                return (
                  <tr key={a.id} className={cn("border-t", big && "text-base")}>
                    <td className="px-4 py-2.5">
                      <div className="font-medium">{a.title}</div>
                      {a.detail && <div className="text-xs text-muted-foreground">{a.detail}</div>}
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap">{a.owner_name || (a.owner_user_id ? nameOf(a.owner_user_id) : "—")}</td>
                    <td className={cn("px-4 py-2.5 whitespace-nowrap", overdue && "text-red-600 font-medium")}>
                      {a.due_date ? (
                        <span className="inline-flex items-center gap-1">
                          {overdue && <AlertCircle className="h-3.5 w-3.5" />}
                          {format(parseISO(a.due_date), "d MMM yyyy")}
                        </span>
                      ) : "—"}
                    </td>
                    <td className="px-4 py-2.5"><Badge variant="outline" className={cn("text-[10px]", pr.cls)}>{pr.label}</Badge></td>
                    <td className="px-4 py-2.5">
                      <button
                        type="button"
                        onClick={() => !present && cycleStatus(a)}
                        className={cn("rounded-full border px-2.5 py-0.5 text-[11px] font-medium", st.cls, !present && "cursor-pointer hover:opacity-80")}
                        title={present ? undefined : "Click to advance status"}
                      >
                        {st.label}
                      </button>
                    </td>
                    {!present && (
                      <td className="px-2 py-2.5">
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => deleteAction(a.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );

  const renderSpotlight = (big: boolean) => (
    <div className="space-y-5">
      {topPerformers.length > 0 && (
        <div>
          <p className="text-xs uppercase tracking-widest text-primary/70 font-semibold mb-2">Top rated this cycle</p>
          <div className="flex flex-wrap gap-3">
            {topPerformers.map(t => (
              <div key={t.user_id} className={cn("flex items-center gap-3 rounded-xl border bg-card p-3", big && "p-4")}>
                <PerformanceRankBadge rank={t.rank} years={t.years} size={big ? "md" : "sm"} />
                <div className="min-w-0">
                  <p className={cn("font-semibold truncate", big ? "text-lg" : "text-sm")}>{nameOf(t.user_id)}</p>
                  <p className="text-xs text-muted-foreground">{RANK_STYLES[t.rank].label}{t.years != null ? ` · ${t.years} yr${t.years === 1 ? "" : "s"}` : ""}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs uppercase tracking-widest text-primary/70 font-semibold">Shout-outs</p>
          {!present && <Button size="sm" variant="outline" onClick={() => setSpotlightDialog(true)}><Plus className="h-4 w-4 mr-1" /> Add shout-out</Button>}
        </div>
        {spotlights.length === 0 ? (
          <p className="text-muted-foreground italic">No shout-outs yet — recognise someone great.</p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {spotlights.map(s => (
              <div key={s.id} className="rounded-xl border bg-gradient-to-br from-amber-50 to-transparent dark:from-amber-500/10 p-3 flex items-start gap-3">
                <Sparkles className="h-4 w-4 text-amber-500 mt-0.5 flex-shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className={cn("font-semibold", big ? "text-lg" : "text-sm")}>{nameOf(s.user_id)}</p>
                  {s.note && <p className={cn("text-muted-foreground", big ? "text-base" : "text-sm")}>{s.note}</p>}
                </div>
                {!present && (
                  <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-destructive" onClick={() => deleteSpotlight(s.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  const renderBody = (key: string, big: boolean) =>
    key === "vision" ? renderVision(big) :
    key === "agenda" ? renderAgenda(big) :
    key === "actions" ? renderActions(big) :
    renderSpotlight(big);

  if (loading) {
    return <div className="flex-1 flex items-center justify-center py-16 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading meeting…</div>;
  }

  // ---- Present mode ----
  if (present) {
    const sec = SECTIONS[sectionIdx];
    const Icon = sec.icon;
    return (
      <div className="flex-1 flex flex-col bg-background">
        <div className="flex items-center justify-between px-6 py-3 border-b">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Presentation className="h-4 w-4" />
            <span className="text-sm font-medium">Presenting · {sectionIdx + 1} / {SECTIONS.length}</span>
          </div>
          <div className="flex items-center gap-1.5">
            {SECTIONS.map((s, i) => (
              <button key={s.key} onClick={() => setSectionIdx(i)} className={cn("h-2 rounded-full transition-all", i === sectionIdx ? "w-6 bg-primary" : "w-2 bg-muted-foreground/30")} />
            ))}
          </div>
          <Button variant="ghost" size="sm" onClick={() => setPresent(false)}><X className="h-4 w-4 mr-1" /> Exit</Button>
        </div>
        <div className="flex-1 overflow-auto">
          <div className="max-w-5xl mx-auto px-8 py-10 md:py-16">
            <div className="flex items-center gap-3 mb-8">
              <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center"><Icon className="h-6 w-6 text-primary" /></div>
              <h1 className="text-3xl md:text-4xl font-bold">{sec.title}</h1>
            </div>
            {renderBody(sec.key, true)}
          </div>
        </div>
        <div className="flex items-center justify-between px-6 py-3 border-t">
          <Button variant="outline" onClick={() => setSectionIdx(i => Math.max(0, i - 1))} disabled={sectionIdx === 0}>
            <ChevronLeft className="h-4 w-4 mr-1" /> Previous
          </Button>
          <span className="text-xs text-muted-foreground">Use ← → arrow keys</span>
          <Button onClick={() => setSectionIdx(i => Math.min(SECTIONS.length - 1, i + 1))} disabled={sectionIdx === SECTIONS.length - 1}>
            Next <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
        {actionDialog && <ActionDialog staff={staff} order={actions.length} onClose={() => setActionDialog(false)} onAdded={(a) => { setActions(prev => [...prev, a]); setActionDialog(false); }} />}
      </div>
    );
  }

  // ---- Edit / overview mode ----
  return (
    <div className="flex-1 overflow-auto p-4 md:p-6">
      <div className="max-w-5xl mx-auto space-y-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0"><Presentation className="h-5 w-5 text-primary" /></div>
            <div>
              <h1 className="text-2xl font-bold">Staff Meeting</h1>
              <p className="text-muted-foreground text-sm flex items-center gap-1.5"><CalendarDays className="h-3.5 w-3.5" /> {format(new Date(), "EEEE d MMMM yyyy")}</p>
            </div>
          </div>
          <Button onClick={() => { setSectionIdx(0); setPresent(true); }}><Presentation className="h-4 w-4 mr-1.5" /> Present</Button>
        </div>

        {SECTIONS.map(sec => {
          const Icon = sec.icon;
          return (
            <Card key={sec.key}>
              <CardContent className="p-5 space-y-4">
                <div className="flex items-center gap-2">
                  <Icon className="h-5 w-5 text-primary" />
                  <h2 className="text-lg font-semibold">{sec.title}</h2>
                </div>
                {renderBody(sec.key, false)}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {actionDialog && <ActionDialog staff={staff} order={actions.length} onClose={() => setActionDialog(false)} onAdded={(a) => { setActions(prev => [...prev, a]); setActionDialog(false); }} />}
      {spotlightDialog && <SpotlightDialog staff={staff} existing={new Set(spotlights.map(s => s.user_id))} onClose={() => setSpotlightDialog(false)} onAdd={addSpotlight} />}
    </div>
  );
}

// ---- Add action dialog ----
function ActionDialog({ staff, order, onClose, onAdded }: {
  staff: StaffProfile[]; order: number; onClose: () => void; onAdded: (a: MeetingAction) => void;
}) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ title: "", detail: "", owner: "none", due_date: "", priority: "medium", status: "not_started" });
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  const submit = async () => {
    if (!form.title.trim()) { toast({ title: "Title is required", variant: "destructive" }); return; }
    setSaving(true);
    const owner = staff.find(s => s.user_id === form.owner);
    const { data, error } = await (supabase as any).from("meeting_actions").insert({
      title: form.title.trim(), detail: form.detail.trim() || null,
      owner_user_id: owner?.user_id ?? null, owner_name: owner?.display_name ?? owner?.email ?? null,
      due_date: form.due_date || null, priority: form.priority, status: form.status, sort_order: order,
    }).select("*").single();
    setSaving(false);
    if (error) { toast({ title: "Couldn't add action", description: error.message, variant: "destructive" }); return; }
    onAdded(data as MeetingAction);
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md max-h-[88vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Add a key action</DialogTitle></DialogHeader>
        <div className="space-y-3 py-1">
          <div className="space-y-1.5"><Label>Action *</Label><Input value={form.title} onChange={e => set("title", e.target.value)} placeholder="What needs to happen?" /></div>
          <div className="space-y-1.5"><Label>Detail</Label><Textarea value={form.detail} onChange={e => set("detail", e.target.value)} rows={2} placeholder="Optional context" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Owner</Label>
              <Select value={form.owner} onValueChange={v => set("owner", v)}>
                <SelectTrigger><SelectValue placeholder="Owner" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Unassigned</SelectItem>
                  {staff.map(s => <SelectItem key={s.user_id} value={s.user_id}>{s.display_name || s.email}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label>Delivery date</Label><Input type="date" value={form.due_date} onChange={e => set("due_date", e.target.value)} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Priority</Label>
              <Select value={form.priority} onValueChange={v => set("priority", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{PRIORITIES.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={form.status} onValueChange={v => set("status", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{ACTION_STATUS.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={submit} disabled={saving}>{saving ? "Adding…" : "Add action"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---- Add spotlight dialog ----
function SpotlightDialog({ staff, existing, onClose, onAdd }: {
  staff: StaffProfile[]; existing: Set<string>; onClose: () => void; onAdd: (userId: string, note: string) => void;
}) {
  const [userId, setUserId] = useState("");
  const [note, setNote] = useState("");
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Add a shout-out</DialogTitle></DialogHeader>
        <div className="space-y-3 py-1">
          <div className="space-y-1.5">
            <Label>Staff member</Label>
            <Select value={userId} onValueChange={setUserId}>
              <SelectTrigger><SelectValue placeholder="Choose staff" /></SelectTrigger>
              <SelectContent>
                {staff.map(s => <SelectItem key={s.user_id} value={s.user_id}>{s.display_name || s.email}{existing.has(s.user_id) ? " ✓" : ""}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5"><Label>What did they do well?</Label><Textarea value={note} onChange={e => setNote(e.target.value)} rows={3} placeholder="Recognise their contribution…" /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => userId && onAdd(userId, note)} disabled={!userId}><Check className="h-4 w-4 mr-1" /> Add shout-out</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
