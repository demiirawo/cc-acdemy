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
import { format, parseISO, differenceInCalendarDays, subMonths } from "date-fns";
import {
  Presentation, Target, Sparkles, Rocket, Plus, Trash2, Pencil,
  ChevronLeft, ChevronRight, X, CalendarDays, AlertCircle, Loader2, Check, Flag, Share2, Copy, Megaphone, ShieldAlert, Users,
} from "lucide-react";
import { RANK_ORDER, RANK_STYLES, tenureYears, type Rank } from "../hr/PerformanceRankBadge";

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
const EMPTY_ITEM = { title: "", detail: "", owner: "none", due_date: "", priority: "medium", status: "not_started", on_agenda: true };
const UPDATE_CATEGORIES = [
  { value: "policy", label: "Policy", cls: "bg-blue-100 text-blue-700 border-blue-200" },
  { value: "cqc", label: "CQC", cls: "bg-purple-100 text-purple-700 border-purple-200" },
  { value: "training", label: "Training", cls: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  { value: "compliance", label: "Compliance", cls: "bg-amber-100 text-amber-700 border-amber-200" },
  { value: "general", label: "General", cls: "bg-slate-100 text-slate-600 border-slate-200" },
];
const updCat = (v: string | null) => UPDATE_CATEGORIES.find(c => c.value === v);

interface MeetingItem {
  id: string; title: string; detail: string | null; owner_user_id: string | null;
  owner_name: string | null; due_date: string | null; status: string; priority: string;
  on_agenda: boolean; sort_order: number;
}
interface Objective { id: string; title: string; target_date: string | null; is_done: boolean; sort_order: number; }
interface Update { id: string; title: string; body: string | null; category: string | null; created_at: string; }
interface Spotlight { id: string; user_id: string; note: string | null; }
interface StaffProfile { user_id: string; display_name: string | null; email: string | null; }
interface Incident { id: string; title: string; description: string; client_name: string | null; incident_date: string; severity: string; category: string | null; status: string; on_meeting_agenda: boolean; }
type PerfInfo = { rank: Rank | null; years: number | null };

const INCIDENT_SEVERITY: Record<string, { label: string; cls: string }> = {
  low: { label: "Low", cls: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  medium: { label: "Medium", cls: "bg-amber-100 text-amber-700 border-amber-200" },
  high: { label: "High", cls: "bg-orange-100 text-orange-700 border-orange-200" },
  critical: { label: "Critical", cls: "bg-red-100 text-red-700 border-red-200" },
};

const SECTIONS = [
  { key: "vision", title: "Our Vision", icon: Rocket },
  { key: "team", title: "Our Team", icon: Users },
  { key: "updates", title: "Updates", icon: Megaphone },
  { key: "items", title: "Agenda", icon: Target },
  { key: "incidents", title: "Recent Incidents", icon: ShieldAlert },
  { key: "spotlight", title: "Staff Spotlight", icon: Sparkles },
] as const;
// The presentation walks the sections in reverse (spotlight → … → vision).
const PRESENT_ORDER = [...SECTIONS].reverse();

export function StaffMeetingsSection() {
  const { user } = useAuth();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [vision, setVision] = useState("");
  const [editingVision, setEditingVision] = useState(false);
  const [visionDraft, setVisionDraft] = useState("");

  const [objectives, setObjectives] = useState<Objective[]>([]);
  const [newObj, setNewObj] = useState({ title: "", target_date: "" });

  const [updates, setUpdates] = useState<Update[]>([]);
  const [updAdding, setUpdAdding] = useState(false);
  const [updForm, setUpdForm] = useState({ title: "", body: "", category: "general" });

  const [items, setItems] = useState<MeetingItem[]>([]);
  const [itemAdding, setItemAdding] = useState(false);
  const [itemForm, setItemForm] = useState({ ...EMPTY_ITEM });
  const [savingItem, setSavingItem] = useState(false);
  const [editCell, setEditCell] = useState<{ id: string; field: string } | null>(null);

  const [spotlights, setSpotlights] = useState<Spotlight[]>([]);
  const [staff, setStaff] = useState<StaffProfile[]>([]);
  const [teamIds, setTeamIds] = useState<Set<string>>(new Set());
  const [perf, setPerf] = useState<Record<string, PerfInfo>>({});
  const [photos, setPhotos] = useState<Record<string, string>>({});
  const [incidents, setIncidents] = useState<Incident[]>([]);

  const [present, setPresent] = useState(false);
  const [sectionIdx, setSectionIdx] = useState(0);
  const [showResolved, setShowResolved] = useState(false);

  const [publicToken, setPublicToken] = useState<string | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [savingShare, setSavingShare] = useState(false);
  const [copied, setCopied] = useState(false);

  // Inline shout-out composer
  const [spotAdding, setSpotAdding] = useState(false);
  const [spotUser, setSpotUser] = useState("");
  const [spotNote, setSpotNote] = useState("");

  const nameOf = (uid: string | null) =>
    (uid && (staff.find(s => s.user_id === uid)?.display_name || staff.find(s => s.user_id === uid)?.email)) || "Unknown";

  // Current team members (active staff), alphabetical.
  const team = useMemo(
    () => staff
      .filter(s => teamIds.has(s.user_id))
      .sort((a, b) => (a.display_name || a.email || "").localeCompare(b.display_name || b.email || "")),
    [staff, teamIds]
  );

  const load = useCallback(async () => {
    setLoading(true);
    const threeMonthsAgo = format(subMonths(new Date(), 3), "yyyy-MM-dd");
    const [settingsRes, objRes, itemRes, spotRes, updRes, staffRes, hrRes, docRes, incRes] = await Promise.all([
      (supabase as any).from("meeting_settings").select("vision, public_token").eq("id", true).maybeSingle(),
      (supabase as any).from("meeting_objectives").select("*").order("sort_order", { ascending: true }).order("created_at", { ascending: true }),
      (supabase as any).from("meeting_actions").select("*").order("sort_order", { ascending: true }).order("created_at", { ascending: true }),
      (supabase as any).from("meeting_spotlights").select("*").order("created_at", { ascending: false }),
      (supabase as any).from("meeting_updates").select("*").order("created_at", { ascending: false }),
      supabase.from("profiles").select("user_id, display_name, email").order("display_name"),
      supabase.from("hr_profiles").select("user_id, performance_rating, start_date, created_at, employment_end_date"),
      supabase.from("staff_onboarding_documents").select("user_id, photograph_path"),
      (supabase as any).from("incidents").select("id, title, description, client_name, incident_date, severity, category, status, on_meeting_agenda")
        .gte("incident_date", threeMonthsAgo).order("incident_date", { ascending: false }),
    ]);
    setVision(settingsRes.data?.vision || "");
    setPublicToken(settingsRes.data?.public_token || null);
    setObjectives((objRes.data as Objective[]) || []);
    setItems((itemRes.data as MeetingItem[]) || []);
    setSpotlights((spotRes.data as Spotlight[]) || []);
    setUpdates((updRes.data as Update[]) || []);
    setIncidents((incRes.data as Incident[]) || []);
    setStaff((staffRes.data as StaffProfile[]) || []);
    const pmap: Record<string, PerfInfo> = {};
    const today = format(new Date(), "yyyy-MM-dd");
    const activeIds = new Set<string>();
    (hrRes.data || []).forEach((h: any) => {
      pmap[h.user_id] = {
        rank: (h.performance_rating && RANK_ORDER.includes(h.performance_rating) ? h.performance_rating : null) as Rank | null,
        years: tenureYears(h.start_date || h.created_at),
      };
      // "Our Team" = current staff: has an HR profile and hasn't left.
      if (!h.employment_end_date || h.employment_end_date >= today) activeIds.add(h.user_id);
    });
    setPerf(pmap);
    setTeamIds(activeIds);

    // The onboarding-documents bucket is private, so use signed URLs. Only sign
    // browser-renderable images (skip HEIC/PDF, which fall back to initials).
    const photoDocs = (docRes.data || []).filter(
      (d: any) => d.photograph_path && /\.(jpe?g|png|webp|gif)$/i.test(d.photograph_path)
    );
    if (photoDocs.length) {
      const { data: signed } = await supabase.storage
        .from("onboarding-documents")
        .createSignedUrls(photoDocs.map((d: any) => d.photograph_path), 3600);
      const byPath: Record<string, string> = {};
      (signed || []).forEach((r: any) => { if (r?.signedUrl && !r.error) byPath[r.path] = r.signedUrl; });
      const photoMap: Record<string, string> = {};
      photoDocs.forEach((d: any) => { const url = byPath[d.photograph_path]; if (url) photoMap[d.user_id] = url; });
      setPhotos(photoMap);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!present) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") setSectionIdx(i => Math.min(PRESENT_ORDER.length - 1, i + 1));
      else if (e.key === "ArrowLeft") setSectionIdx(i => Math.max(0, i - 1));
      else if (e.key === "Escape") setPresent(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [present]);

  const saveVision = async () => {
    setVision(visionDraft); setEditingVision(false);
    const { error } = await (supabase as any).from("meeting_settings")
      .update({ vision: visionDraft.trim() || null, updated_by: user?.id, updated_at: new Date().toISOString() })
      .eq("id", true);
    if (error) toast({ title: "Couldn't save vision", description: error.message, variant: "destructive" });
  };

  // Objectives
  const addObjective = async () => {
    if (!newObj.title.trim()) return;
    const { data } = await (supabase as any).from("meeting_objectives")
      .insert({ title: newObj.title.trim(), target_date: newObj.target_date || null, sort_order: objectives.length })
      .select("*").single();
    if (data) setObjectives(prev => [...prev, data as Objective]);
    setNewObj({ title: "", target_date: "" });
  };
  const toggleObjective = async (o: Objective) => {
    setObjectives(prev => prev.map(x => x.id === o.id ? { ...x, is_done: !x.is_done } : x));
    await (supabase as any).from("meeting_objectives").update({ is_done: !o.is_done }).eq("id", o.id);
  };
  const deleteObjective = async (id: string) => {
    setObjectives(prev => prev.filter(o => o.id !== id));
    await (supabase as any).from("meeting_objectives").delete().eq("id", id);
  };

  // Items
  const addItemInline = async () => {
    if (!itemForm.title.trim()) return;
    setSavingItem(true);
    const isAll = itemForm.owner === "all";
    const owner = staff.find(s => s.user_id === itemForm.owner);
    const { data, error } = await (supabase as any).from("meeting_actions").insert({
      title: itemForm.title.trim(), detail: itemForm.detail.trim() || null,
      owner_user_id: isAll ? null : (owner?.user_id ?? null),
      owner_name: isAll ? "All Staff" : (owner?.display_name ?? owner?.email ?? null),
      due_date: itemForm.due_date || null, priority: itemForm.priority, status: itemForm.status,
      on_agenda: itemForm.on_agenda, sort_order: items.length,
    }).select("*").single();
    setSavingItem(false);
    if (error) { toast({ title: "Couldn't add item", description: error.message, variant: "destructive" }); return; }
    setItems(prev => [...prev, data as MeetingItem]);
    setItemForm({ ...EMPTY_ITEM, on_agenda: itemForm.on_agenda }); // keep composer open for rapid entry
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
  const toggleIncidentAgenda = async (inc: Incident) => {
    setIncidents(prev => prev.map(x => x.id === inc.id ? { ...x, on_meeting_agenda: !x.on_meeting_agenda } : x));
    await (supabase as any).from("incidents").update({ on_meeting_agenda: !inc.on_meeting_agenda }).eq("id", inc.id);
  };
  const updateItem = async (id: string, patch: Partial<MeetingItem>) => {
    setItems(prev => prev.map(x => x.id === id ? { ...x, ...patch } : x));
    setEditCell(null);
    await (supabase as any).from("meeting_actions").update(patch).eq("id", id);
  };

  const addUpdate = async () => {
    if (!updForm.title.trim()) return;
    const { data } = await (supabase as any).from("meeting_updates")
      .insert({ title: updForm.title.trim(), body: updForm.body.trim() || null, category: updForm.category })
      .select("*").single();
    if (data) setUpdates(prev => [data as Update, ...prev]);
    setUpdForm({ title: "", body: "", category: updForm.category });
  };
  const deleteUpdate = async (id: string) => {
    setUpdates(prev => prev.filter(u => u.id !== id));
    await (supabase as any).from("meeting_updates").delete().eq("id", id);
  };

  const addSpotlight = async () => {
    if (!spotUser) return;
    const { data } = await (supabase as any).from("meeting_spotlights")
      .insert({ user_id: spotUser, note: spotNote.trim() || null }).select("*").single();
    if (data) setSpotlights(prev => [data as Spotlight, ...prev]);
    setSpotUser(""); setSpotNote("");
  };

  const publicUrl = publicToken ? `${window.location.origin}/public/staff-meeting?token=${publicToken}` : "";
  const enableShare = async () => {
    setSavingShare(true);
    const token = (crypto as any).randomUUID();
    const { error } = await (supabase as any).from("meeting_settings").update({ public_token: token }).eq("id", true);
    setSavingShare(false);
    if (error) { toast({ title: "Couldn't create link", description: error.message, variant: "destructive" }); return; }
    setPublicToken(token);
  };
  const disableShare = async () => {
    setSavingShare(true);
    const { error } = await (supabase as any).from("meeting_settings").update({ public_token: null }).eq("id", true);
    setSavingShare(false);
    if (error) { toast({ title: "Couldn't disable link", description: error.message, variant: "destructive" }); return; }
    setPublicToken(null);
  };
  const copyLink = () => {
    navigator.clipboard?.writeText(publicUrl).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); });
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
  }), [items]);

  // ---- Item row ----
  const ItemRow = (a: MeetingItem, big: boolean) => {
    const overdue = a.status !== "done" && a.due_date && differenceInCalendarDays(parseISO(a.due_date), new Date()) < 0;
    const st = statusMeta(a.status); const pr = prioMeta(a.priority);
    return (
      <div key={a.id} className={cn("rounded-lg border bg-card p-3 flex items-start gap-3", a.status === "done" && "opacity-70")}>
        {!present && (
          <button type="button" onClick={() => toggleAgenda(a)}
            title={a.on_agenda ? "On the next agenda — click to remove" : "Flag for the next meeting's agenda"}
            className={cn("mt-0.5 flex-shrink-0 rounded-md p-1 transition", a.on_agenda ? "text-amber-500" : "text-muted-foreground/40 hover:text-muted-foreground")}>
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
        <button type="button" onClick={() => !present && cycleStatus(a)}
          className={cn("rounded-full border px-2.5 py-0.5 text-[11px] font-medium whitespace-nowrap", st.cls, !present && "cursor-pointer hover:opacity-80")}
          title={present ? undefined : "Click to advance status"}>
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

  // ---- Airtable-style editable table (double-click a cell to edit) ----
  const cellCls = "border-b border-r last:border-r-0 border-border/60 px-3 py-2 align-top";
  const isEditing = (id: string, f: string) => editCell?.id === id && editCell.field === f;
  const setOwner = (a: MeetingItem, v: string) => {
    if (v === "all") { updateItem(a.id, { owner_user_id: null, owner_name: "All Staff" }); return; }
    const o = staff.find(s => s.user_id === v);
    updateItem(a.id, { owner_user_id: v === "none" ? null : v, owner_name: v === "none" ? null : (o?.display_name || o?.email || null) });
  };
  const ownerValue = (a: MeetingItem) => a.owner_user_id ?? (a.owner_name === "All Staff" ? "all" : "none");

  const EditRow = (a: MeetingItem) => {
    const overdue = a.status !== "done" && a.due_date && differenceInCalendarDays(parseISO(a.due_date), new Date()) < 0;
    const st = statusMeta(a.status); const pr = prioMeta(a.priority);
    return (
      <tr key={a.id} className={cn("hover:bg-muted/30 transition-colors", a.status === "done" && "opacity-70")}>
        {/* agenda flag */}
        <td className="border-b border-border/60 px-2 py-2 text-center align-top">
          <button type="button" onClick={() => toggleAgenda(a)}
            title={a.on_agenda ? "On the next agenda — click to remove" : "Flag for the next agenda"}
            className={cn("rounded p-1 transition", a.on_agenda ? "text-amber-500" : "text-muted-foreground/40 hover:text-muted-foreground")}>
            <Flag className={cn("h-4 w-4 mx-auto", a.on_agenda && "fill-amber-500")} />
          </button>
        </td>
        {/* item title + detail */}
        <td className={cellCls}>
          {isEditing(a.id, "title") ? (
            <Input autoFocus defaultValue={a.title} className="h-8"
              onBlur={e => updateItem(a.id, { title: e.target.value.trim() || a.title })}
              onKeyDown={e => { if (e.key === "Enter") (e.currentTarget as HTMLInputElement).blur(); if (e.key === "Escape") setEditCell(null); }} />
          ) : (
            <p className={cn("font-medium cursor-text", a.status === "done" && "line-through")} onDoubleClick={() => setEditCell({ id: a.id, field: "title" })}>{a.title}</p>
          )}
          {isEditing(a.id, "detail") ? (
            <Textarea autoFocus defaultValue={a.detail || ""} rows={2} className="mt-1"
              onBlur={e => updateItem(a.id, { detail: e.target.value.trim() || null })}
              onKeyDown={e => { if (e.key === "Escape") setEditCell(null); }} />
          ) : (
            <p className="text-xs text-muted-foreground cursor-text mt-0.5" onDoubleClick={() => setEditCell({ id: a.id, field: "detail" })}>
              {a.detail || <span className="italic opacity-50">add detail…</span>}
            </p>
          )}
        </td>
        {/* owner */}
        <td className={cn(cellCls, "cursor-pointer")} onDoubleClick={() => setEditCell({ id: a.id, field: "owner" })}>
          {isEditing(a.id, "owner") ? (
            <Select defaultOpen defaultValue={ownerValue(a)} onValueChange={v => setOwner(a, v)} onOpenChange={o => { if (!o) setEditCell(null); }}>
              <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Unassigned</SelectItem>
                <SelectItem value="all">All Staff</SelectItem>
                {staff.map(s => <SelectItem key={s.user_id} value={s.user_id}>{s.display_name || s.email}</SelectItem>)}
              </SelectContent>
            </Select>
          ) : <span className="text-sm">{a.owner_name || (a.owner_user_id ? nameOf(a.owner_user_id) : <span className="text-muted-foreground">—</span>)}</span>}
        </td>
        {/* due */}
        <td className={cn(cellCls, "cursor-pointer whitespace-nowrap")} onDoubleClick={() => setEditCell({ id: a.id, field: "due_date" })}>
          {isEditing(a.id, "due_date") ? (
            <Input type="date" autoFocus className="h-8" defaultValue={a.due_date || ""} onBlur={e => updateItem(a.id, { due_date: e.target.value || null })} />
          ) : a.due_date ? (
            <span className={cn("inline-flex items-center gap-1 text-sm", overdue && "text-red-600 font-medium")}>{overdue && <AlertCircle className="h-3 w-3" />}{format(parseISO(a.due_date), "d MMM yyyy")}</span>
          ) : <span className="text-muted-foreground">—</span>}
        </td>
        {/* severity */}
        <td className={cn(cellCls, "cursor-pointer")} onDoubleClick={() => setEditCell({ id: a.id, field: "priority" })}>
          {isEditing(a.id, "priority") ? (
            <Select defaultOpen defaultValue={a.priority} onValueChange={v => updateItem(a.id, { priority: v })} onOpenChange={o => { if (!o) setEditCell(null); }}>
              <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
              <SelectContent>{PRIORITIES.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}</SelectContent>
            </Select>
          ) : <Badge variant="outline" className={cn("text-[10px]", pr.cls)}>{pr.label}</Badge>}
        </td>
        {/* status */}
        <td className={cn(cellCls, "cursor-pointer")} onDoubleClick={() => setEditCell({ id: a.id, field: "status" })}>
          {isEditing(a.id, "status") ? (
            <Select defaultOpen defaultValue={a.status} onValueChange={v => updateItem(a.id, { status: v })} onOpenChange={o => { if (!o) setEditCell(null); }}>
              <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
              <SelectContent>{ACTION_STATUS.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
            </Select>
          ) : <span className={cn("rounded-full border px-2.5 py-0.5 text-[11px] font-medium whitespace-nowrap", st.cls)}>{st.label}</span>}
        </td>
        {/* delete */}
        <td className="border-b border-border/60 px-2 py-2 text-center align-top">
          <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => deleteItem(a.id)}><Trash2 className="h-4 w-4" /></Button>
        </td>
      </tr>
    );
  };

  const ItemsTable = (rows: MeetingItem[]) => (
    <div className="overflow-x-auto rounded-lg border border-border/60">
      <table className="w-full text-sm border-collapse">
        <thead className="bg-muted/50 text-[11px] uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="w-9 border-b border-r border-border/60 px-2 py-2"><Flag className="h-3 w-3 mx-auto" /></th>
            <th className="text-left font-medium border-b border-r border-border/60 px-3 py-2">Item</th>
            <th className="text-left font-medium border-b border-r border-border/60 px-3 py-2 w-40">Owner</th>
            <th className="text-left font-medium border-b border-r border-border/60 px-3 py-2 w-32">Due</th>
            <th className="text-left font-medium border-b border-r border-border/60 px-3 py-2 w-24">Severity</th>
            <th className="text-left font-medium border-b border-r border-border/60 px-3 py-2 w-28">Status</th>
            <th className="w-9 border-b border-border/60 px-2 py-2"></th>
          </tr>
        </thead>
        <tbody>{rows.map(EditRow)}</tbody>
      </table>
    </div>
  );

  // A group body: read-only cards while presenting, editable table otherwise.
  const groupBody = (rows: MeetingItem[], big: boolean) =>
    present ? <div className="space-y-2">{rows.map(a => ItemRow(a, big))}</div> : ItemsTable(rows);

  // ---- Section renderers ----
  const renderVision = (big: boolean) => (
    <div className="space-y-6">
      {editingVision ? (
        <div className="space-y-3">
          <div className="space-y-1.5"><Label>Vision</Label><Textarea value={visionDraft} onChange={e => setVisionDraft(e.target.value)} rows={3} placeholder="Where are we going as a company?" /></div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setEditingVision(false)}>Cancel</Button>
            <Button size="sm" onClick={saveVision}>Save</Button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <blockquote className={cn("font-semibold text-foreground leading-tight", big ? "text-3xl md:text-5xl" : "text-2xl")}>
            {vision ? `“${vision}”` : <span className="text-muted-foreground font-normal italic text-xl">Add your company vision…</span>}
          </blockquote>
          {!present && (
            <Button variant="outline" size="sm" onClick={() => { setVisionDraft(vision); setEditingVision(true); }}>
              <Pencil className="h-4 w-4 mr-1" /> Edit vision
            </Button>
          )}
        </div>
      )}

      {/* Time-bound objectives */}
      <div className="space-y-2">
        {objectives.length === 0 && present && <p className="text-muted-foreground italic">No objectives set.</p>}
        <div className="space-y-2">
          {objectives.map(o => {
            const overdue = !o.is_done && o.target_date && differenceInCalendarDays(parseISO(o.target_date), new Date()) < 0;
            return (
              <div key={o.id} className={cn("flex items-center gap-3 rounded-lg border p-3", o.is_done && "bg-muted/30")}>
                <Checkbox checked={o.is_done} onCheckedChange={() => toggleObjective(o)} disabled={present} />
                <span className={cn("flex-1", big ? "text-xl" : "text-sm", o.is_done && "line-through text-muted-foreground")}>{o.title}</span>
                {o.target_date && (
                  <Badge variant="outline" className={cn("text-[10px] whitespace-nowrap", overdue ? "border-red-300 text-red-600" : "border-primary/30 text-primary")}>
                    <CalendarDays className="h-3 w-3 mr-1" /> by {format(parseISO(o.target_date), "d MMM yyyy")}
                  </Badge>
                )}
                {!present && (
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => deleteObjective(o.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            );
          })}
        </div>
        {!present && (
          <div className="flex flex-col sm:flex-row gap-2">
            <Input value={newObj.title} onChange={e => setNewObj(o => ({ ...o, title: e.target.value }))} placeholder="Add an objective…" onKeyDown={e => e.key === "Enter" && addObjective()} className="flex-1" />
            <div className="flex gap-2">
              <Input type="date" value={newObj.target_date} onChange={e => setNewObj(o => ({ ...o, target_date: e.target.value }))} className="w-[150px]" title="Target date" />
              <Button onClick={addObjective} disabled={!newObj.title.trim()}><Plus className="h-4 w-4" /></Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  const renderItems = (big: boolean) => (
    <div className="space-y-5">
      <div className="flex items-center gap-2 flex-wrap">
        <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">{groups.agenda.length} on agenda</Badge>
        <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">{stats.open} open</Badge>
        {stats.overdue > 0 && <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">{stats.overdue} overdue</Badge>}
        {!present && !itemAdding && <Button size="sm" className="ml-auto" onClick={() => setItemAdding(true)}><Plus className="h-4 w-4 mr-1" /> Add item</Button>}
      </div>

      {/* Inline composer */}
      {!present && itemAdding && (
        <div className="rounded-xl border bg-muted/20 p-3 space-y-2.5">
          <Input autoFocus value={itemForm.title} onChange={e => setItemForm(f => ({ ...f, title: e.target.value }))}
            placeholder="What are we discussing / tracking?" onKeyDown={e => { if (e.key === "Enter") addItemInline(); }} />
          <Textarea value={itemForm.detail} onChange={e => setItemForm(f => ({ ...f, detail: e.target.value }))} rows={2} placeholder="Detail (optional)" />
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <Select value={itemForm.owner} onValueChange={v => setItemForm(f => ({ ...f, owner: v }))}>
              <SelectTrigger className="h-9"><SelectValue placeholder="Owner" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Unassigned</SelectItem>
                <SelectItem value="all">All Staff</SelectItem>
                {staff.map(s => <SelectItem key={s.user_id} value={s.user_id}>{s.display_name || s.email}</SelectItem>)}
              </SelectContent>
            </Select>
            <Input type="date" className="h-9" value={itemForm.due_date} onChange={e => setItemForm(f => ({ ...f, due_date: e.target.value }))} title="Delivery date" />
            <Select value={itemForm.priority} onValueChange={v => setItemForm(f => ({ ...f, priority: v }))}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>{PRIORITIES.map(p => <SelectItem key={p.value} value={p.value}>{p.label} severity</SelectItem>)}</SelectContent>
            </Select>
            <Select value={itemForm.status} onValueChange={v => setItemForm(f => ({ ...f, status: v }))}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>{ACTION_STATUS.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <label className="flex items-center gap-2 cursor-pointer text-sm">
              <Checkbox checked={itemForm.on_agenda} onCheckedChange={c => setItemForm(f => ({ ...f, on_agenda: c === true }))} />
              Flag for the next agenda
            </label>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={() => { setItemAdding(false); setItemForm({ ...EMPTY_ITEM }); }}>Done</Button>
              <Button size="sm" onClick={addItemInline} disabled={savingItem || !itemForm.title.trim()}>
                <Plus className="h-4 w-4 mr-1" /> {savingItem ? "Adding…" : "Add"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* On the agenda for the next meeting */}
      <div className="space-y-2">
        <p className="text-xs uppercase tracking-widest text-primary/70 font-semibold">On the agenda</p>
        {groups.agenda.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">Nothing flagged for the agenda.</p>
        ) : groupBody(groups.agenda, big)}
      </div>

      {/* Ongoing tracked items */}
      {groups.ongoing.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-widest text-primary/70 font-semibold">Ongoing &amp; tracked</p>
          {groupBody(groups.ongoing, big)}
        </div>
      )}

      {/* Resolved (collapsed) */}
      {groups.resolved.length > 0 && !present && (
        <div className="space-y-2">
          <button type="button" onClick={() => setShowResolved(v => !v)} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
            <Check className="h-3.5 w-3.5" /> {showResolved ? "Hide" : "Show"} {groups.resolved.length} resolved
          </button>
          {showResolved && groupBody(groups.resolved, big)}
        </div>
      )}

      {items.length === 0 && !itemAdding && (
        <p className="text-muted-foreground italic">No items yet. Add the first thing you're tracking.</p>
      )}
    </div>
  );

  const renderSpotlight = (big: boolean) => (
    <div className="space-y-4">
      {!present && !spotAdding && (
        <div className="flex justify-end">
          <Button size="sm" variant="outline" onClick={() => setSpotAdding(true)}><Plus className="h-4 w-4 mr-1" /> Add shout-out</Button>
        </div>
      )}

      {!present && spotAdding && (
        <div className="rounded-xl border bg-muted/20 p-3 space-y-2.5">
          <Select value={spotUser} onValueChange={setSpotUser}>
            <SelectTrigger className="h-9"><SelectValue placeholder="Choose staff" /></SelectTrigger>
            <SelectContent>{staff.map(s => <SelectItem key={s.user_id} value={s.user_id}>{s.display_name || s.email}</SelectItem>)}</SelectContent>
          </Select>
          <Textarea value={spotNote} onChange={e => setSpotNote(e.target.value)} rows={2} placeholder="What did they do well?" />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => { setSpotAdding(false); setSpotUser(""); setSpotNote(""); }}>Done</Button>
            <Button size="sm" onClick={addSpotlight} disabled={!spotUser}><Plus className="h-4 w-4 mr-1" /> Add</Button>
          </div>
        </div>
      )}

      {spotlights.length === 0 ? (
        <p className="text-muted-foreground italic">No shout-outs yet — recognise someone great.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {spotlights.map(s => {
            const p = perf[s.user_id];
            return (
              <div key={s.id} className="relative rounded-2xl border bg-gradient-to-br from-amber-50 via-background to-transparent dark:from-amber-500/10 shadow-sm p-5 flex items-center gap-5">
                <SpotlightAvatar photo={photos[s.user_id]} name={nameOf(s.user_id)} rank={p?.rank ?? null} big={big} />
                <div className="min-w-0 flex-1">
                  <p className={cn("font-bold leading-tight", big ? "text-2xl md:text-3xl" : "text-lg")}>{nameOf(s.user_id)}</p>
                  {p?.rank && (
                    <p className={cn("text-muted-foreground mt-0.5", big ? "text-base" : "text-xs")}>
                      {RANK_STYLES[p.rank].label}{p.years != null ? ` · ${p.years} yr${p.years === 1 ? "" : "s"}` : ""}
                    </p>
                  )}
                  {s.note && <p className={cn("text-muted-foreground mt-2", big ? "text-xl" : "text-sm")}>{s.note}</p>}
                </div>
                {!present && (
                  <Button variant="ghost" size="icon" className="absolute top-2 right-2 h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => deleteSpotlight(s.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  const renderUpdates = (big: boolean) => (
    <div className="space-y-4">
      {!present && !updAdding && (
        <div className="flex justify-end">
          <Button size="sm" variant="outline" onClick={() => setUpdAdding(true)}><Plus className="h-4 w-4 mr-1" /> Add update</Button>
        </div>
      )}

      {!present && updAdding && (
        <div className="rounded-xl border bg-muted/20 p-3 space-y-2.5">
          <Input autoFocus value={updForm.title} onChange={e => setUpdForm(f => ({ ...f, title: e.target.value }))} placeholder="Update headline (e.g. New medication policy)" />
          <Textarea value={updForm.body} onChange={e => setUpdForm(f => ({ ...f, body: e.target.value }))} rows={3} placeholder="Details for the team…" />
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <Select value={updForm.category} onValueChange={v => setUpdForm(f => ({ ...f, category: v }))}>
              <SelectTrigger className="h-9 w-[160px]"><SelectValue /></SelectTrigger>
              <SelectContent>{UPDATE_CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
            </Select>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={() => { setUpdAdding(false); setUpdForm({ title: "", body: "", category: "general" }); }}>Done</Button>
              <Button size="sm" onClick={addUpdate} disabled={!updForm.title.trim()}><Plus className="h-4 w-4 mr-1" /> Post update</Button>
            </div>
          </div>
        </div>
      )}

      {updates.length === 0 ? (
        <p className="text-muted-foreground italic">No updates yet{!present && " — post one to share with the team"}.</p>
      ) : (
        <div className="space-y-3">
          {updates.map(u => {
            const c = updCat(u.category);
            return (
              <div key={u.id} className="rounded-xl border bg-card p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 flex-wrap min-w-0">
                    {c && <Badge variant="outline" className={cn("text-[10px]", c.cls)}>{c.label}</Badge>}
                    <p className={cn("font-semibold", big ? "text-xl" : "text-base")}>{u.title}</p>
                  </div>
                  {!present && (
                    <Button variant="ghost" size="icon" className="h-7 w-7 flex-shrink-0 text-muted-foreground hover:text-destructive" onClick={() => deleteUpdate(u.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
                {u.body && <p className={cn("text-muted-foreground mt-1.5 whitespace-pre-wrap", big ? "text-lg" : "text-sm")}>{u.body}</p>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  const renderIncidents = (big: boolean) => (
    <div className="space-y-2">
      {incidents.length === 0 ? (
        <p className="text-muted-foreground italic">No incidents logged in the last 3 months.</p>
      ) : (
        incidents.map(inc => (
          <div key={inc.id} className={cn("rounded-xl border bg-card p-3", inc.on_meeting_agenda && "border-amber-400/60 bg-amber-500/5")}>
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <button
                  type="button"
                  onClick={() => toggleIncidentAgenda(inc)}
                  title={inc.on_meeting_agenda ? "On the agenda — click to remove" : "Flag for the agenda"}
                  className={cn("flex-shrink-0 rounded-md p-1 transition", inc.on_meeting_agenda ? "text-amber-500" : "text-muted-foreground/40 hover:text-muted-foreground")}
                >
                  <Flag className={cn("h-4 w-4", inc.on_meeting_agenda && "fill-amber-500")} />
                </button>
                <p className={cn("font-semibold truncate", big ? "text-xl" : "text-base")}>{inc.title}</p>
                {inc.on_meeting_agenda && <Badge variant="outline" className="text-[10px] border-amber-300 text-amber-600 flex-shrink-0">On agenda</Badge>}
              </div>
              <span className="text-xs text-muted-foreground whitespace-nowrap flex-shrink-0">{format(parseISO(inc.incident_date), "d MMM yyyy")}</span>
            </div>
            <p className={cn("text-muted-foreground mt-1", big ? "text-base" : "text-sm")}>
              {inc.client_name ? <span className="font-medium text-foreground">{inc.client_name}: </span> : null}
              {inc.description}
            </p>
          </div>
        ))
      )}
    </div>
  );

  const renderTeam = (big: boolean) => (
    team.length === 0 ? (
      <p className="text-muted-foreground italic">No team members to show yet.</p>
    ) : (
      <div className={cn("grid gap-4", big ? "grid-cols-3 sm:grid-cols-4 md:grid-cols-6" : "grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8")}>
        {team.map(m => (
          <div key={m.user_id} className="flex flex-col items-center text-center gap-2">
            <TeamAvatar photo={photos[m.user_id]} name={nameOf(m.user_id)} big={big} />
            <p className={cn("font-medium leading-tight", big ? "text-sm md:text-base" : "text-xs")}>{m.display_name || m.email}</p>
          </div>
        ))}
      </div>
    )
  );

  const renderBody = (key: string, big: boolean) =>
    key === "vision" ? renderVision(big)
      : key === "team" ? renderTeam(big)
      : key === "updates" ? renderUpdates(big)
      : key === "items" ? renderItems(big)
      : key === "incidents" ? renderIncidents(big)
      : renderSpotlight(big);

  if (loading) {
    return <div className="flex-1 flex items-center justify-center py-16 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading meeting…</div>;
  }

  // ---- Present mode ----
  if (present) {
    const sec = PRESENT_ORDER[sectionIdx];
    const Icon = sec.icon;
    return (
      <div className="flex-1 flex flex-col bg-background">
        <div className="flex items-center justify-between px-6 py-3 border-b">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Presentation className="h-4 w-4" />
            <span className="text-sm font-medium">Presenting · {sectionIdx + 1} / {PRESENT_ORDER.length}</span>
          </div>
          <div className="flex items-center gap-1.5">
            {PRESENT_ORDER.map((s, i) => (
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
          <Button onClick={() => setSectionIdx(i => Math.min(PRESENT_ORDER.length - 1, i + 1))} disabled={sectionIdx === PRESENT_ORDER.length - 1}>Next <ChevronRight className="h-4 w-4 ml-1" /></Button>
        </div>
      </div>
    );
  }

  // ---- Edit / overview mode ----
  return (
    <div className="flex-1 overflow-auto p-4 md:p-6">
      <div className="max-w-7xl mx-auto space-y-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold">Staff Meeting</h1>
            <p className="text-muted-foreground text-sm">{format(new Date(), "EEEE d MMMM yyyy")}</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => setShareOpen(true)}>
              <Share2 className="h-4 w-4 mr-1.5" /> Share{publicToken ? " · on" : ""}
            </Button>
            <Button onClick={() => { setSectionIdx(0); setPresent(true); }}><Presentation className="h-4 w-4 mr-1.5" /> Present</Button>
          </div>
        </div>

        {SECTIONS.map(sec => (
          <Card key={sec.key}>
            <CardContent className="p-5 space-y-4">
              <h2 className="text-lg font-semibold">
                {sec.title}
                {sec.key === "team" && team.length > 0 && (
                  <span className="ml-2 text-sm font-normal text-muted-foreground">{team.length} {team.length === 1 ? "member" : "members"}</span>
                )}
              </h2>
              {renderBody(sec.key, false)}
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={shareOpen} onOpenChange={setShareOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Share this meeting</DialogTitle></DialogHeader>
          <div className="space-y-3 py-1">
            <p className="text-sm text-muted-foreground">
              Anyone with the link can view this meeting (vision, objectives, agenda &amp; tracked items and shout-outs) read-only — no login needed. Turn it off any time to revoke access.
            </p>
            {publicToken ? (
              <>
                <div className="flex gap-2">
                  <Input readOnly value={publicUrl} className="text-xs" onFocus={e => e.currentTarget.select()} />
                  <Button variant="outline" size="icon" onClick={copyLink} title="Copy link">
                    {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
                <div className="flex justify-between items-center">
                  <a href={publicUrl} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline">Open preview ↗</a>
                  <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={disableShare} disabled={savingShare}>Turn off link</Button>
                </div>
              </>
            ) : (
              <Button onClick={enableShare} disabled={savingShare}>
                <Share2 className="h-4 w-4 mr-1.5" /> {savingShare ? "Creating…" : "Create public link"}
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ---- Team member photo (Our Team grid) ----
function TeamAvatar({ photo, name, big }: { photo?: string; name: string; big: boolean }) {
  const [err, setErr] = useState(false);
  const initials = name.split(/\s+/).map(w => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase() || "?";
  const size = big ? "h-20 w-20 md:h-24 md:w-24" : "h-16 w-16 sm:h-20 sm:w-20";
  return photo && !err ? (
    <img src={photo} alt={name} onError={() => setErr(true)} className={cn("rounded-full object-cover ring-2 ring-border shadow-sm", size)} />
  ) : (
    <div className={cn("rounded-full bg-muted flex items-center justify-center font-bold text-muted-foreground ring-2 ring-border", size, big ? "text-2xl" : "text-xl")}>{initials}</div>
  );
}

// ---- Framed staff photo for the spotlight ----
function SpotlightAvatar({ photo, name, rank, big }: { photo?: string; name: string; rank: Rank | null; big: boolean }) {
  const [err, setErr] = useState(false);
  const initials = name.split(/\s+/).map(w => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase() || "?";
  const size = big ? "h-28 w-28 md:h-32 md:w-32" : "h-16 w-16";
  return (
    <div className="relative flex-shrink-0">
      <div className={cn("rounded-full bg-gradient-to-tr from-amber-400 via-pink-500 to-purple-600 p-[3px]", big ? "shadow-xl shadow-amber-500/25" : "shadow-md")}>
        <div className="rounded-full bg-background p-[3px]">
          {photo && !err ? (
            <img src={photo} alt={name} onError={() => setErr(true)} className={cn("rounded-full object-cover", size)} />
          ) : (
            <div className={cn("rounded-full bg-muted flex items-center justify-center font-bold text-muted-foreground", size, big ? "text-4xl" : "text-lg")}>{initials}</div>
          )}
        </div>
      </div>
      {rank && (
        <span className={cn("absolute -bottom-1 -right-1 flex items-center justify-center rounded-full border-2 border-background font-extrabold shadow", RANK_STYLES[rank].tile, big ? "h-10 w-10 text-lg" : "h-6 w-6 text-xs")}>
          {rank}
        </span>
      )}
    </div>
  );
}

