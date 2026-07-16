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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { format, parseISO, differenceInCalendarDays } from "date-fns";
import {
  Presentation, Target, Sparkles, Rocket, Plus, Trash2, Pencil,
  ChevronLeft, ChevronRight, X, CalendarDays, AlertCircle, Loader2, Check, Flag,
} from "lucide-react";
import { PerformanceRankBadge, RANK_ORDER, tenureYears, type Rank } from "../hr/PerformanceRankBadge";

const ACTION_STATUS = [
  { value: "not_started", label: "Not started", cls: "bg-muted text-muted-foreground border-border" },
  { value: "in_progress", label: "In progress", cls: "bg-blue-100 text-blue-700 border-blue-200" },
  { value: "blocked", label: "Blocked", cls: "bg-red-100 text-red-700 border-red-200" },
  { value: "done", label: "Resolved", cls: "bg-emerald-100 text-emerald-700 border-emerald-200" },
];
// Displayed as "severity" — how pressing the item is.
const PRIORITIES = [
  { value: "high", label: "High", cls: "bg-red-100 text-red-700 border-red-200" },
  { value: "medium", label: "Medium", cls: "bg-amber-100 text-amber-700 border-amber-200" },
  { value: "low", label: "Low", cls: "bg-slate-100 text-slate-600 border-slate-200" },
];
const statusMeta = (v: string) => ACTION_STATUS.find(s => s.value === v) ?? ACTION_STATUS[0];
const prioMeta = (v: string) => PRIORITIES.find(p => p.value === v) ?? PRIORITIES[1];

interface MeetingItem {
  id: string; title: string; detail: string | null; owner_user_id: string | null;
  owner_name: string | null; due_date: string | null; status: string; priority: string;
  on_agenda: boolean; sort_order: number;
}
interface Spotlight { id: string; user_id: string; note: string | null; }
interface StaffProfile { user_id: string; display_name: string | null; email: string | null; }
type PerfInfo = { rank: Rank | null; years: number | null };

const SECTIONS = [
  { key: "vision", title: "Our Vision", icon: Rocket },
  { key: "items", title: "Agenda & Tracked Items", icon: Target },
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

  const [items, setItems] = useState<MeetingItem[]>([]);
  const [spotlights, setSpotlights] = useState<Spotlight[]>([]);
  const [staff, setStaff] = useState<StaffProfile[]>([]);
  const [perf, setPerf] = useState<Record<string, PerfInfo>>({});

  const [present, setPresent] = useState(false);
  const [sectionIdx, setSectionIdx] = useState(0);

  const [itemDialog, setItemDialog] = useState(false);
  const [spotlightDialog, setSpotlightDialog] = useState(false);
  const [showResolved, setShowResolved] = useState(false);

  const nameOf = (uid: string | null) =>
    (uid && (staff.find(s => s.user_id === uid)?.display_name || staff.find(s => s.user_id === uid)?.email)) || "Unknown";

  const load = useCallback(async () => {
    setLoading(true);
    const [settingsRes, itemRes, spotRes, staffRes, hrRes] = await Promise.all([
      (supabase as any).from("meeting_settings").select("vision, mission").eq("id", true).maybeSingle(),
      (supabase as any).from("meeting_actions").select("*").order("sort_order", { ascending: true }).order("created_at", { ascending: true }),
      (supabase as any).from("meeting_spotlights").select("*").order("created_at", { ascending: false }),
      supabase.from("profiles").select("user_id, display_name, email").order("display_name"),
      supabase.from("hr_profiles").select("user_id, performance_rating, start_date, created_at"),
    ]);
    setVision(settingsRes.data?.vision || "");
    setMission(settingsRes.data?.mission || "");
    setItems((itemRes.data as MeetingItem[]) || []);
    setSpotlights((spotRes.data as Spotlight[]) || []);
    setStaff((staffRes.data as StaffProfile[]) || []);

    const pmap: Record<string, PerfInfo> = {};
    (hrRes.data || []).forEach((h: any) => {
      pmap[h.user_id] = {
        rank: (h.performance_rating && RANK_ORDER.includes(h.performance_rating) ? h.performance_rating : null) as Rank | null,
        years: tenureYears(h.start_date || h.created_at),
      };
    });
    setPerf(pmap);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

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

  const cycleStatus = async (a: MeetingItem) => {
    const idx = ACTION_STATUS.findIndex(s => s.value === a.status);
    const next = ACTION_STATUS[(idx + 1) % ACTION_STATUS.length].value;
    setItems(prev => prev.map(x => x.id === a.id ? { ...x, status: next } : x));
    await (supabase as any).from("meeting_actions").update({ status: next }).eq("id", a.id);
  };
  const toggleAgenda = async (a: MeetingItem) => {
    setItems(prev => prev.map(x => x.id === a.id ? { ...x, on_agenda: !x.on_agenda } : x));
    await (supabase as any).from("meeting_actions").update({ on_agenda: !a.on_agenda }).eq("id", a.id);
  };
  const deleteItem = async (id: string) => {
    setItems(prev => prev.filter(a => a.id !== id));
    await (supabase as any).from("meeting_actions").delete().eq("id", id);
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

  const groups = useMemo(() => ({
    agenda: items.filter(a => a.on_agenda && a.status !== "done"),
    ongoing: items.filter(a => !a.on_agenda && a.status !== "done"),
    resolved: items.filter(a => a.status === "done"),
  }), [items]);
  const stats = useMemo(() => ({
    overdue: items.filter(a => a.status !== "done" && a.due_date && differenceInCalendarDays(parseISO(a.due_date), new Date()) < 0).length,
    open: items.filter(a => a.status !== "done").length,
    resolved: items.filter(a => a.status === "done").length,
  }), [items]);

  // ---- Item row ----
  const ItemRow = (a: MeetingItem, big: boolean) => {
    const overdue = a.status !== "done" && a.due_date && differenceInCalendarDays(parseISO(a.due_date), new Date()) < 0;
    const st = statusMeta(a.status); const pr = prioMeta(a.priority);
    return (
      <div key={a.id} className={cn("rounded-lg border bg-card p-3 flex items-start gap-3", a.status === "done" && "opacity-70")}>
        {!present && (
          <button
            type="button"
            onClick={() => toggleAgenda(a)}
            title={a.on_agenda ? "On the next agenda — click to remove" : "Flag for the next meeting's agenda"}
            className={cn("mt-0.5 flex-shrink-0 rounded-md p-1 transition", a.on_agenda ? "text-amber-500" : "text-muted-foreground/40 hover:text-muted-foreground")}
          >
            <Flag className={cn("h-4 w-4", a.on_agenda && "fill-amber-500")} />
          </button>
        )}
        <div className="min-w-0 flex-1">
          <p className={cn("font-medium", big ? "text-lg" : "text-sm", a.status === "done" && "line-through")}>{a.title}</p>
          {a.detail && <p className={cn("text-muted-foreground", big ? "text-base" : "text-xs")}>{a.detail}</p>}
          <div className="flex items-center gap-2 mt-1.5 flex-wrap text-xs">
            <Badge variant="outline" className={cn("text-[10px]", pr.cls)}>{pr.label}</Badge>
            <span className="text-muted-foreground">{a.owner_name || (a.owner_user_id ? nameOf(a.owner_user_id) : "Unassigned")}</span>
            {a.due_date && (
              <span className={cn("inline-flex items-center gap-1", overdue ? "text-red-600 font-medium" : "text-muted-foreground")}>
                {overdue && <AlertCircle className="h-3 w-3" />}
                {format(parseISO(a.due_date), "d MMM yyyy")}
              </span>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={() => !present && cycleStatus(a)}
          className={cn("rounded-full border px-2.5 py-0.5 text-[11px] font-medium whitespace-nowrap", st.cls, !present && "cursor-pointer hover:opacity-80")}
          title={present ? undefined : "Click to advance status"}
        >
          {st.label}
        </button>
        {!present && (
          <Button variant="ghost" size="icon" className="h-7 w-7 flex-shrink-0 text-muted-foreground hover:text-destructive" onClick={() => deleteItem(a.id)}>
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </div>
    );
  };

  // ---- Section renderers ----
  const renderVision = (big: boolean) => (
    <div className="space-y-6">
      {editingVision ? (
        <div className="space-y-3">
          <div className="space-y-1.5"><Label>Vision</Label><Textarea value={visionDraft} onChange={e => setVisionDraft(e.target.value)} rows={3} placeholder="Where are we going as a company?" /></div>
          <div className="space-y-1.5"><Label>Mission</Label><Textarea value={missionDraft} onChange={e => setMissionDraft(e.target.value)} rows={3} placeholder="How we get there / what we do every day" /></div>
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

  const renderItems = (big: boolean) => (
    <div className="space-y-5">
      <div className="flex items-center gap-2 flex-wrap">
        <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">{groups.agenda.length} on agenda</Badge>
        <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">{stats.open} open</Badge>
        {stats.overdue > 0 && <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">{stats.overdue} overdue</Badge>}
        {!present && <Button size="sm" className="ml-auto" onClick={() => setItemDialog(true)}><Plus className="h-4 w-4 mr-1" /> Add item</Button>}
      </div>

      {/* On the agenda for the next meeting */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Flag className="h-4 w-4 text-amber-500 fill-amber-500" />
          <p className={cn("font-semibold", big ? "text-xl" : "text-sm")}>On the agenda</p>
          <span className="text-xs text-muted-foreground">this meeting</span>
        </div>
        {groups.agenda.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">Nothing flagged for the agenda{!present && " — flag any item below with the flag icon"}.</p>
        ) : (
          <div className="space-y-2 rounded-xl border border-amber-300/50 bg-amber-50/40 dark:bg-amber-500/5 p-2">
            {groups.agenda.map(a => ItemRow(a, big))}
          </div>
        )}
      </div>

      {/* Ongoing tracked items */}
      {groups.ongoing.length > 0 && (
        <div className="space-y-2">
          <p className={cn("font-semibold text-muted-foreground", big ? "text-lg" : "text-sm")}>Ongoing &amp; tracked</p>
          <div className="space-y-2">{groups.ongoing.map(a => ItemRow(a, big))}</div>
        </div>
      )}

      {/* Resolved (collapsed) */}
      {groups.resolved.length > 0 && !present && (
        <div className="space-y-2">
          <button type="button" onClick={() => setShowResolved(v => !v)} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
            <Check className="h-3.5 w-3.5" /> {showResolved ? "Hide" : "Show"} {groups.resolved.length} resolved
          </button>
          {showResolved && <div className="space-y-2">{groups.resolved.map(a => ItemRow(a, big))}</div>}
        </div>
      )}

      {items.length === 0 && groups.agenda.length === 0 && (
        <p className="text-muted-foreground italic">No items yet. Add the first thing you're tracking.</p>
      )}
    </div>
  );

  const renderSpotlight = (big: boolean) => (
    <div className="space-y-3">
      {!present && (
        <div className="flex">
          <Button size="sm" variant="outline" className="ml-auto" onClick={() => setSpotlightDialog(true)}><Plus className="h-4 w-4 mr-1" /> Add shout-out</Button>
        </div>
      )}
      {spotlights.length === 0 ? (
        <p className="text-muted-foreground italic">No shout-outs yet — recognise someone great.</p>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {spotlights.map(s => {
            const p = perf[s.user_id];
            return (
              <div key={s.id} className="rounded-xl border bg-gradient-to-br from-amber-50 to-transparent dark:from-amber-500/10 p-3 flex items-start gap-3">
                {p ? <PerformanceRankBadge rank={p.rank} years={p.years} size={big ? "md" : "sm"} /> : <Sparkles className="h-4 w-4 text-amber-500 mt-0.5 flex-shrink-0" />}
                <div className="min-w-0 flex-1">
                  <p className={cn("font-semibold", big ? "text-lg" : "text-sm")}>{nameOf(s.user_id)}</p>
                  {s.note && <p className={cn("text-muted-foreground", big ? "text-base" : "text-sm")}>{s.note}</p>}
                </div>
                {!present && (
                  <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-destructive flex-shrink-0" onClick={() => deleteSpotlight(s.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  const renderBody = (key: string, big: boolean) =>
    key === "vision" ? renderVision(big) : key === "items" ? renderItems(big) : renderSpotlight(big);

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
          <Button variant="outline" onClick={() => setSectionIdx(i => Math.max(0, i - 1))} disabled={sectionIdx === 0}><ChevronLeft className="h-4 w-4 mr-1" /> Previous</Button>
          <span className="text-xs text-muted-foreground">Use ← → arrow keys</span>
          <Button onClick={() => setSectionIdx(i => Math.min(SECTIONS.length - 1, i + 1))} disabled={sectionIdx === SECTIONS.length - 1}>Next <ChevronRight className="h-4 w-4 ml-1" /></Button>
        </div>
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

      {itemDialog && <ItemDialog staff={staff} order={items.length} onClose={() => setItemDialog(false)} onAdded={(a) => { setItems(prev => [...prev, a]); setItemDialog(false); }} />}
      {spotlightDialog && <SpotlightDialog staff={staff} existing={new Set(spotlights.map(s => s.user_id))} onClose={() => setSpotlightDialog(false)} onAdd={addSpotlight} />}
    </div>
  );
}

// ---- Add item dialog ----
function ItemDialog({ staff, order, onClose, onAdded }: {
  staff: StaffProfile[]; order: number; onClose: () => void; onAdded: (a: MeetingItem) => void;
}) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ title: "", detail: "", owner: "none", due_date: "", priority: "medium", status: "not_started", on_agenda: true });

  const submit = async () => {
    if (!form.title.trim()) { toast({ title: "Title is required", variant: "destructive" }); return; }
    setSaving(true);
    const owner = staff.find(s => s.user_id === form.owner);
    const { data, error } = await (supabase as any).from("meeting_actions").insert({
      title: form.title.trim(), detail: form.detail.trim() || null,
      owner_user_id: owner?.user_id ?? null, owner_name: owner?.display_name ?? owner?.email ?? null,
      due_date: form.due_date || null, priority: form.priority, status: form.status, on_agenda: form.on_agenda, sort_order: order,
    }).select("*").single();
    setSaving(false);
    if (error) { toast({ title: "Couldn't add item", description: error.message, variant: "destructive" }); return; }
    onAdded(data as MeetingItem);
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md max-h-[88vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Add an item</DialogTitle></DialogHeader>
        <div className="space-y-3 py-1">
          <div className="space-y-1.5"><Label>Item *</Label><Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="What are we discussing / tracking?" /></div>
          <div className="space-y-1.5"><Label>Detail</Label><Textarea value={form.detail} onChange={e => setForm(f => ({ ...f, detail: e.target.value }))} rows={2} placeholder="Optional context" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Owner</Label>
              <Select value={form.owner} onValueChange={v => setForm(f => ({ ...f, owner: v }))}>
                <SelectTrigger><SelectValue placeholder="Owner" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Unassigned</SelectItem>
                  {staff.map(s => <SelectItem key={s.user_id} value={s.user_id}>{s.display_name || s.email}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label>Delivery date</Label><Input type="date" value={form.due_date} onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Severity</Label>
              <Select value={form.priority} onValueChange={v => setForm(f => ({ ...f, priority: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{PRIORITIES.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{ACTION_STATUS.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <label className="flex items-center gap-2.5 rounded-lg border bg-muted/20 p-3 cursor-pointer">
            <Checkbox checked={form.on_agenda} onCheckedChange={(c) => setForm(f => ({ ...f, on_agenda: c === true }))} />
            <span className="text-sm">Flag for the next meeting's agenda</span>
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={submit} disabled={saving}>{saving ? "Adding…" : "Add item"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---- Add shout-out dialog ----
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
