import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { format, parseISO, differenceInCalendarDays } from "date-fns";
import { Rocket, Target, Sparkles, Flag, CalendarDays, AlertCircle, Loader2, CheckCircle2, Presentation, Megaphone } from "lucide-react";

const STATUS = {
  not_started: { label: "Not started", cls: "bg-muted text-muted-foreground border-border" },
  in_progress: { label: "In progress", cls: "bg-blue-100 text-blue-700 border-blue-200" },
  blocked: { label: "Blocked", cls: "bg-red-100 text-red-700 border-red-200" },
  done: { label: "Resolved", cls: "bg-emerald-100 text-emerald-700 border-emerald-200" },
} as Record<string, { label: string; cls: string }>;
const PRIO = {
  high: { label: "High", cls: "bg-red-100 text-red-700 border-red-200" },
  medium: { label: "Medium", cls: "bg-amber-100 text-amber-700 border-amber-200" },
  low: { label: "Low", cls: "bg-slate-100 text-slate-600 border-slate-200" },
} as Record<string, { label: string; cls: string }>;
const RANK_TILE: Record<string, string> = {
  S: "bg-gradient-to-br from-amber-300 via-yellow-400 to-amber-500 text-amber-950",
  A: "bg-gradient-to-br from-emerald-300 to-green-500 text-emerald-950",
  B: "bg-gradient-to-br from-sky-300 to-blue-500 text-sky-950",
  C: "bg-gradient-to-br from-violet-300 to-purple-500 text-violet-950",
  D: "bg-gradient-to-br from-slate-300 to-slate-500 text-slate-900",
};

interface MeetingData {
  vision: string;
  objectives: { title: string; target_date: string | null; is_done: boolean }[];
  updates: { title: string; body: string | null; category: string | null }[];
  actions: { title: string; detail: string | null; owner_name: string | null; due_date: string | null; status: string; priority: string; on_agenda: boolean }[];
  spotlights: { name: string; note: string | null; rank: string | null; years: number | null; photo: string | null }[];
}

const UPDATE_CAT: Record<string, { label: string; cls: string }> = {
  policy: { label: "Policy", cls: "bg-blue-100 text-blue-700 border-blue-200" },
  cqc: { label: "CQC", cls: "bg-purple-100 text-purple-700 border-purple-200" },
  training: { label: "Training", cls: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  compliance: { label: "Compliance", cls: "bg-amber-100 text-amber-700 border-amber-200" },
  general: { label: "General", cls: "bg-slate-100 text-slate-600 border-slate-200" },
};

const Label = ({ children }: { children: React.ReactNode }) => (
  <p className="text-xs uppercase tracking-widest text-primary/70 font-semibold">{children}</p>
);

function Avatar({ photo, name, rank }: { photo: string | null; name: string; rank: string | null }) {
  const [err, setErr] = useState(false);
  const initials = name.split(/\s+/).map(w => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase() || "?";
  return (
    <div className="relative flex-shrink-0">
      <div className="rounded-full bg-gradient-to-tr from-amber-400 via-pink-500 to-purple-600 p-[3px] shadow-md">
        <div className="rounded-full bg-background p-[3px]">
          {photo && !err
            ? <img src={photo} alt={name} onError={() => setErr(true)} className="h-16 w-16 rounded-full object-cover" />
            : <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center font-bold text-muted-foreground text-lg">{initials}</div>}
        </div>
      </div>
      {rank && <span className={cn("absolute -bottom-1 -right-1 flex items-center justify-center rounded-full border-2 border-background font-extrabold h-6 w-6 text-xs shadow", RANK_TILE[rank])}>{rank}</span>}
    </div>
  );
}

export function PublicStaffMeeting() {
  const [params] = useSearchParams();
  const token = params.get("token") || "";
  const [data, setData] = useState<MeetingData | null>(null);
  const [status, setStatus] = useState<"loading" | "ok" | "error">("loading");

  useEffect(() => {
    (async () => {
      if (!token) { setStatus("error"); return; }
      const { data: res, error } = await supabase.functions.invoke("public-staff-meeting", { body: { token } });
      if (error || !res || (res as any).error) { setStatus("error"); return; }
      setData(res as MeetingData);
      setStatus("ok");
    })();
  }, [token]);

  if (status === "loading") {
    return <div className="min-h-screen flex items-center justify-center text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading…</div>;
  }
  if (status === "error" || !data) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center text-center p-6">
        <Presentation className="h-10 w-10 text-muted-foreground/40 mb-3" />
        <h1 className="text-xl font-semibold">Meeting link unavailable</h1>
        <p className="text-muted-foreground mt-1">This link is invalid or has been turned off.</p>
      </div>
    );
  }

  const agenda = data.actions.filter(a => a.on_agenda && a.status !== "done");
  const ongoing = data.actions.filter(a => !a.on_agenda && a.status !== "done");

  const ItemRow = (a: MeetingData["actions"][number], i: number) => {
    const overdue = a.status !== "done" && a.due_date && differenceInCalendarDays(parseISO(a.due_date), new Date()) < 0;
    const st = STATUS[a.status] || STATUS.not_started; const pr = PRIO[a.priority] || PRIO.medium;
    return (
      <div key={i} className="rounded-lg border bg-card p-3 flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-medium text-sm">{a.title}</p>
          {a.detail && <p className="text-xs text-muted-foreground">{a.detail}</p>}
          <div className="flex items-center gap-2 mt-1.5 flex-wrap text-xs">
            <span className={cn("rounded-full border px-2 py-0.5 text-[10px]", pr.cls)}>{pr.label}</span>
            <span className="text-muted-foreground">{a.owner_name || "Unassigned"}</span>
            {a.due_date && (
              <span className={cn("inline-flex items-center gap-1", overdue ? "text-red-600 font-medium" : "text-muted-foreground")}>
                {overdue && <AlertCircle className="h-3 w-3" />}{format(parseISO(a.due_date), "d MMM yyyy")}
              </span>
            )}
          </div>
        </div>
        <span className={cn("rounded-full border px-2.5 py-0.5 text-[11px] font-medium whitespace-nowrap", st.cls)}>{st.label}</span>
      </div>
    );
  };

  const Section = ({ icon: Icon, title, children }: { icon: any; title: string; children: React.ReactNode }) => (
    <div className="rounded-2xl border bg-card p-5 md:p-6 space-y-4">
      <div className="flex items-center gap-2"><Icon className="h-5 w-5 text-primary" /><h2 className="text-lg font-semibold">{title}</h2></div>
      {children}
    </div>
  );

  return (
    <div className="min-h-screen bg-muted/20">
      <div className="max-w-3xl mx-auto px-4 py-8 md:py-12 space-y-4">
        <div className="flex items-center gap-3 mb-2">
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0"><Presentation className="h-5 w-5 text-primary" /></div>
          <div>
            <h1 className="text-2xl font-bold">Care Cuddle · Staff Meeting</h1>
            <p className="text-muted-foreground text-sm flex items-center gap-1.5"><CalendarDays className="h-3.5 w-3.5" /> {format(new Date(), "EEEE d MMMM yyyy")}</p>
          </div>
        </div>

        {/* Vision */}
        <Section icon={Rocket} title="Our Vision">
          <blockquote className="text-2xl md:text-3xl font-semibold leading-tight">
            {data.vision ? `“${data.vision}”` : <span className="text-muted-foreground italic font-normal text-lg">No vision set.</span>}
          </blockquote>
          {data.objectives.length > 0 && (
            <div className="space-y-2">
              <Label>Time-bound objectives</Label>
              {data.objectives.map((o, i) => {
                const overdue = !o.is_done && o.target_date && differenceInCalendarDays(parseISO(o.target_date), new Date()) < 0;
                return (
                  <div key={i} className={cn("flex items-center gap-3 rounded-lg border p-3", o.is_done && "bg-muted/30")}>
                    {o.is_done ? <CheckCircle2 className="h-4 w-4 text-emerald-500 flex-shrink-0" /> : <span className="h-4 w-4 rounded-full border-2 border-muted-foreground/40 flex-shrink-0" />}
                    <span className={cn("flex-1 text-sm", o.is_done && "line-through text-muted-foreground")}>{o.title}</span>
                    {o.target_date && (
                      <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] whitespace-nowrap", overdue ? "border-red-300 text-red-600" : "border-primary/30 text-primary")}>
                        <CalendarDays className="h-3 w-3" /> by {format(parseISO(o.target_date), "d MMM yyyy")}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </Section>

        {/* Updates */}
        {data.updates.length > 0 && (
          <Section icon={Megaphone} title="Updates">
            <div className="space-y-3">
              {data.updates.map((u, i) => {
                const c = u.category ? UPDATE_CAT[u.category] : null;
                return (
                  <div key={i} className="rounded-xl border bg-card p-4">
                    <div className="flex items-center gap-2 flex-wrap">
                      {c && <span className={cn("rounded-full border px-2 py-0.5 text-[10px]", c.cls)}>{c.label}</span>}
                      <p className="font-semibold text-base">{u.title}</p>
                    </div>
                    {u.body && <p className="text-muted-foreground mt-1.5 whitespace-pre-wrap text-sm">{u.body}</p>}
                  </div>
                );
              })}
            </div>
          </Section>
        )}

        {/* Agenda & tracked items */}
        <Section icon={Target} title="Agenda">
          <div className="space-y-2">
            <div className="flex items-center gap-2"><Flag className="h-4 w-4 text-amber-500 fill-amber-500" /><Label>On the agenda</Label></div>
            {agenda.length === 0 ? <p className="text-sm text-muted-foreground italic">Nothing flagged for the agenda.</p> : (
              <div className="space-y-2 rounded-xl border border-amber-300/50 bg-amber-50/40 dark:bg-amber-500/5 p-2">{agenda.map(ItemRow)}</div>
            )}
          </div>
          {ongoing.length > 0 && (
            <div className="space-y-2">
              <Label>Ongoing &amp; tracked</Label>
              <div className="space-y-2">{ongoing.map(ItemRow)}</div>
            </div>
          )}
        </Section>

        {/* Spotlight */}
        <Section icon={Sparkles} title="Staff Spotlight">
          {data.spotlights.length === 0 ? <p className="text-muted-foreground italic">No shout-outs yet.</p> : (
            <div className="grid gap-4 sm:grid-cols-2">
              {data.spotlights.map((s, i) => (
                <div key={i} className="rounded-2xl border bg-gradient-to-br from-amber-50 via-background to-transparent dark:from-amber-500/10 shadow-sm p-5 flex items-center gap-5">
                  <Avatar photo={s.photo} name={s.name} rank={s.rank} />
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-lg leading-tight">{s.name}</p>
                    {s.rank && <p className="text-xs text-muted-foreground mt-0.5">{s.rank} Rank{s.years != null ? ` · ${s.years} yr${s.years === 1 ? "" : "s"}` : ""}</p>}
                    {s.note && <p className="text-muted-foreground mt-2 text-sm">{s.note}</p>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Section>

        <p className="text-center text-xs text-muted-foreground pt-2">Care Cuddle Academy · shared meeting view</p>
      </div>
    </div>
  );
}
