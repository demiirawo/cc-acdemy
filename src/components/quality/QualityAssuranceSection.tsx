import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { format, parseISO, addDays } from "date-fns";
import { Loader2, PhoneCall, AlertTriangle, Plus, ExternalLink } from "lucide-react";
import {
  ANSWERED_LABELS, ETIQUETTE_LABELS, NOISE_LABELS, OUTCOME_LABELS, CALLED_BACK_LABELS,
  CHECK_DUE_AFTER_DAYS, SCOPE_AHEAD_DAYS, MONITORING_SHIFT_TYPE, OUTCOME_HINTS,
  ETIQUETTE_GUIDE_URL, ETIQUETTE_GUIDE_TITLE,
  suggestOutcome, worthRaising, orderByOverdue, daysSince, isDue, needsExplaining,
  isMonitoringShift, runsBetween, describeWindow,
  assignmentKey, nextDueDate,
  type Answered, type CalledBack, type Etiquette, type Noise, type Outcome, type QaCheck, type DueRow,
} from "@/lib/qualityAssurance";

/**
 * Quality assurance — spot checks on the people covering monitoring shifts.
 *
 * Written to be picked up by whoever holds the job this month, with no briefing.
 * Everything somebody needs to know is on the page at the moment they need it:
 * who to ring and when they are on shift, what to say, what to listen for, and
 * what to do with what they heard. If any of that has to be explained out loud,
 * it belongs here instead.
 */
export function QualityAssuranceSection() {
  const { user } = useAuth();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [checks, setChecks] = useState<QaCheck[]>([]);
  // One entry per line to be checked — a person on one client's shift — so a
  // client is never shown next to another client's hours.
  const [lines, setLines] = useState<Array<{ userId: string; name: string; client: string; windows: string[] }>>([]);

  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [forStaff, setForStaff] = useState("");
  const [client, setClient] = useState("");
  const [answered, setAnswered] = useState<Answered>("answered");
  const [calledBack, setCalledBack] = useState<CalledBack>("not_applicable");
  const [professional, setProfessional] = useState<Etiquette>("followed");
  const [noise, setNoise] = useState<Noise>("none");
  const [notes, setNotes] = useState("");
  const [outcome, setOutcome] = useState<Outcome | "">("");
  const [outcomeTouched, setOutcomeTouched] = useState(false);

  const [raising, setRaising] = useState<QaCheck | null>(null);
  const [raiseReason, setRaiseReason] = useState("");
  const [raiseSeverity, setRaiseSeverity] = useState("minor");
  const [raiseSaving, setRaiseSaving] = useState(false);


  const load = async () => {
    setLoading(true);
    const [{ data: qa }, { data: profiles }, { data: hr }, { data: patterns }] = await Promise.all([
      supabase.from("qa_checks").select("*").order("checked_at", { ascending: false }).limit(200),
      supabase.from("profiles").select("user_id, display_name, email").order("display_name"),
      // Somebody whose last day has passed is not on any shift to be checked on.
      supabase.from("hr_profiles").select("user_id, employment_end_date"),
      supabase.from("recurring_shift_patterns")
        .select("user_id, client_name, shift_type, is_overtime, start_time, end_time, start_date, end_date, days_of_week"),
    ]);

    setChecks((qa ?? []) as QaCheck[]);
    const nameFor = (id: string) => {
      const p = (profiles ?? []).find((x) => x.user_id === id);
      return p?.display_name || p?.email || "Unknown";
    };

    const todayIso = format(new Date(), "yyyy-MM-dd");
    const gone = new Set((hr ?? [])
      .filter((h) => h.employment_end_date && h.employment_end_date < todayIso)
      .map((h) => h.user_id));

    // In scope: on a monitoring shift — out-of-hours cover rather than the
    // ordinary desk day — at some point in the next four weeks.
    const from = new Date();
    const to = addDays(from, SCOPE_AHEAD_DAYS);
    // Keyed by person AND client: the hours are a property of the client's
    // shift, not of the person, so they are collected per pair.
    const byLine = new Map<string, { userId: string; client: string; windows: Set<string> }>();
    for (const p of patterns ?? []) {
      if (!isMonitoringShift(p.shift_type, p.is_overtime)) continue;
      if (gone.has(p.user_id)) continue;
      if (!runsBetween(p, from, to)) continue;
      const clientName = (p.client_name ?? "").trim() || "No client set";
      const key = assignmentKey(p.user_id, clientName);
      if (!byLine.has(key)) byLine.set(key, { userId: p.user_id, client: clientName, windows: new Set() });
      const w = describeWindow(p.start_time, p.end_time);
      if (w) byLine.get(key)!.windows.add(w);
    }

    setLines([...byLine.values()].map((v) => ({
      userId: v.userId,
      name: nameFor(v.userId),
      client: v.client,
      windows: [...v.windows].sort(),
    })));
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const nameOf = (userId: string) =>
    lines.find((l) => l.userId === userId)?.name ?? "Unknown";

  /** The clients one person covers — what the dialog offers once they are picked. */
  const clientsFor = (userId: string) =>
    lines.filter((l) => l.userId === userId).map((l) => l.client);

  /** The hours for one line, so the dialog can show when to ring. */
  const windowsFor = (userId: string, clientName: string) =>
    lines.find((l) => l.userId === userId && l.client === clientName)?.windows ?? [];

  const due: DueRow[] = useMemo(() => orderByOverdue(lines.map((l) => {
    // checks arrive newest first, so the first match is the last check — and it
    // must match the client too, or one line's check would clear the other.
    const last = checks.find((c) => c.staff_user_id === l.userId && (c.client_name ?? "") === l.client) ?? null;
    return {
      userId: l.userId, name: l.name, client: l.client, windows: l.windows,
      lastCheckedAt: last?.checked_at ?? null,
      lastOutcome: (last?.outcome as Outcome) ?? null,
      daysSince: daysSince(last?.checked_at ?? null),
      nextDueAt: nextDueDate(last?.checked_at ?? null),
    };
  })), [lines, checks]);

  const thisMonth = useMemo(() => {
    const from = format(new Date(new Date().getFullYear(), new Date().getMonth(), 1), "yyyy-MM-dd");
    return checks.filter((c) => c.checked_at >= from);
  }, [checks]);

  const noAnswerRate = thisMonth.length
    ? Math.round((thisMonth.filter((c) => c.answered !== "answered").length / thisMonth.length) * 100)
    : null;

  const reachable = answered === "answered";
  // Questions 3 and 4 are about a conversation. If there was no conversation
  // there is nothing to judge, so they are not asked and not recorded.
  const etiquette: Etiquette = reachable ? professional : "not_applicable";
  const effectiveCallback: CalledBack = reachable ? "not_applicable" : calledBack;

  const suggested = suggestOutcome(answered, effectiveCallback, etiquette, reachable ? noise : "not_applicable");
  // Everything a check must have before it is worth keeping.
  const missing: string[] = [];
  if (!forStaff) missing.push("who you rang");
  if (!client) missing.push("which client's line");
  if (!outcome) missing.push("a rating");
  if (needsExplaining(outcome) && !notes.trim()) missing.push("a note saying what was wrong");

  const resetForm = () => {
    setForStaff(""); setClient(""); setAnswered("answered"); setCalledBack("not_applicable");
    setProfessional("followed"); setNoise("none"); setNotes(""); setOutcome(""); setOutcomeTouched(false);
  };

  const save = async () => {
    if (missing.length > 0) {
      return toast({ title: `Still needs ${missing.join(", ")}`, variant: "destructive" });
    }
    setSaving(true);
    const { error } = await supabase.from("qa_checks").insert({
      staff_user_id: forStaff,
      client_name: client || null,
      checked_by: user?.id ?? null,
      answered,
      called_back: effectiveCallback,
      etiquette,
      background_noise: reachable ? noise : "not_applicable",
      notes: notes.trim() || null,
      outcome: outcome as Outcome,
    });
    setSaving(false);
    if (error) return toast({ title: "Could not save the check", description: error.message, variant: "destructive" });
    toast({
      title: "Check recorded",
      description: outcome === "requires_improvement" || outcome === "inadequate"
        ? "Use Raise on the row below to put it on their record."
        : "Nothing further to do.",
    });
    setOpen(false); resetForm(); load();
  };

  const raise = async () => {
    if (!raising || !raiseReason.trim()) return;
    setRaiseSaving(true);
    const { data, error } = await (supabase as any).from("staff_warnings").insert({
      user_id: raising.staff_user_id,
      kind: "development",
      category: "quality_assurance",
      reason: raiseReason.trim(),
      severity: raiseSeverity,
      issued_by: user?.id ?? null,
    }).select("id").single();
    if (error) {
      setRaiseSaving(false);
      return toast({ title: "Could not raise it", description: error.message, variant: "destructive" });
    }
    await supabase.from("qa_checks").update({ raised_warning_id: data.id }).eq("id", raising.id);
    setRaiseSaving(false); setRaising(null); setRaiseReason("");
    toast({ title: "Raised on their record", description: `${nameOf(raising.staff_user_id)} will see it under Feedback and has to acknowledge it.` });
    load();
  };



  const outcomeBadge = (o: Outcome) => (
    <Badge variant="outline" className={cn("whitespace-nowrap text-[10px]",
      o === "outstanding" && "border-primary/40 bg-primary/5 text-primary",
      o === "good" && "border-emerald-300 text-emerald-600",
      o === "requires_improvement" && "border-amber-300 text-amber-600",
      o === "inadequate" && "border-destructive/40 text-destructive")}>
      {OUTCOME_LABELS[o]}
    </Badge>
  );

  if (loading) {
    return <div className="flex items-center gap-2 py-16 text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" /> Loading quality assurance…
    </div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-2xl">
          <h2 className="text-xl font-bold">Quality Assurance</h2>
          <p className="text-sm text-muted-foreground">
            Once a fortnight, ring each client&rsquo;s monitoring line and record what happened. You do
            not need to have done this before — everything you need is on this page.
          </p>
        </div>
        <Button onClick={() => { resetForm(); setOpen(true); }}>
          <Plus className="mr-1.5 h-4 w-4" /> Record a check
        </Button>
      </div>

      {/* The whole briefing, on the page rather than in somebody's head. */}
      <Card className="border-primary/20 bg-primary/[0.03]">
        <CardContent className="p-5">
          <h3 className="text-sm font-semibold">How to do a check</h3>
          <ol className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { n: 1, t: "Pick a line that is due", d: "The list below shows when each was last checked and when it falls due again. Anything never checked is at the top." },
              { n: 2, t: "Ring during that client's hours", d: "The window is on the row. Ringing outside it proves nothing — they are not on duty for that client." },
              { n: 3, t: "Be an ordinary caller", d: "Do not announce that it is a check. You are listening for what a client or a carer would get." },
              { n: 4, t: "Record it straight away", d: "While you can still remember the detail. The form asks only what you just heard." },
            ].map((s) => (
              <li key={s.n} className="flex gap-2.5">
                <span className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">{s.n}</span>
                <div>
                  <p className="text-sm font-medium leading-tight">{s.t}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{s.d}</p>
                </div>
              </li>
            ))}
          </ol>
          <p className="mt-4 rounded-md bg-background/60 p-3 text-xs text-muted-foreground">
            <span className="font-medium text-foreground">What to say when they pick up:</span>{" "}
            &ldquo;Hi, it&rsquo;s [your name] from Care Cuddle — is now a good time? I&rsquo;m just checking in
            on the monitoring shift.&rdquo; Then let them talk. You are listening for the things on the
            form, not testing them with questions.
          </p>
          {/* The form is a summary of the guide. Whoever is doing the checks
              should be able to reach the thing they are checking against. */}
          <p className="mt-2 text-xs text-muted-foreground">
            Every point on the form comes from the{" "}
            <a href={ETIQUETTE_GUIDE_URL} target="_blank" rel="noreferrer"
               className="font-medium text-primary underline underline-offset-2">
              {ETIQUETTE_GUIDE_TITLE} <ExternalLink className="inline h-3 w-3 align-[-1px]" />
            </a>{" "}
            — the same standard the admins were given. Read it before your first check.
          </p>
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card><CardContent className="p-4">
          <p className="text-2xl font-bold">{thisMonth.length}</p>
          <p className="text-xs text-muted-foreground">Checks this month</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className={cn("text-2xl font-bold", due.filter(d => isDue(d.daysSince)).length > 0 && "text-amber-600")}>
            {due.filter((d) => isDue(d.daysSince)).length}
          </p>
          <p className="text-xs text-muted-foreground">Due now — not checked in {CHECK_DUE_AFTER_DAYS} days</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className={cn("text-2xl font-bold", (noAnswerRate ?? 0) > 0 && "text-destructive")}>
            {noAnswerRate === null ? "—" : `${noAnswerRate}%`}
          </p>
          <p className="text-xs text-muted-foreground">Went unanswered this month</p>
        </CardContent></Card>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="border-b px-4 py-3">
            <h3 className="text-sm font-semibold">Who to ring</h3>
            <p className="text-xs text-muted-foreground">
              One row per client line: everyone rostered on a <span className="font-medium">{MONITORING_SHIFT_TYPE}</span>{" "}
              shift in the next {SCOPE_AHEAD_DAYS} days, taken from the schedule. Somebody covering two
              clients is checked on each separately. Longest since a check first.
            </p>
          </div>
          {due.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">
              Nobody is rostered on a {MONITORING_SHIFT_TYPE} shift in the next four weeks, so there is
              nothing to check.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Staff</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>When they are on</TableHead>
                  <TableHead>Last completed</TableHead>
                  <TableHead>Next due</TableHead>
                  <TableHead className="text-right">Check</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {due.map((d) => (
                    <TableRow key={`${d.userId}|${d.client}`} className={cn(isDue(d.daysSince) && "bg-amber-500/5")}>
                      <TableCell className="font-medium">{d.name}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{d.client}</TableCell>
                      <TableCell className="whitespace-nowrap text-sm tabular-nums">{d.windows.join(", ")}</TableCell>
                      <TableCell className="whitespace-nowrap text-sm">
                        {d.lastCheckedAt ? (
                          <>
                            {format(parseISO(d.lastCheckedAt), "d MMM yyyy")}
                            <span className="ml-1.5 text-xs text-muted-foreground">
                              {d.daysSince === 0 ? "today" : `${d.daysSince}d ago`}
                            </span>
                          </>
                        ) : <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      {/* Never checked is not a date in the future — it is due
                          now, and saying so is more use than a made-up one. */}
                      <TableCell className="whitespace-nowrap text-sm">
                        {d.nextDueAt === null ? (
                          <span className="font-medium text-amber-600">Now — never checked</span>
                        ) : isDue(d.daysSince) ? (
                          <span className="font-medium text-amber-600">
                            {format(d.nextDueAt, "d MMM yyyy")}
                            <span className="ml-1.5 text-xs font-normal">
                              overdue by {(d.daysSince ?? 0) - CHECK_DUE_AFTER_DAYS}d
                            </span>
                          </span>
                        ) : (
                          <>
                            {format(d.nextDueAt, "d MMM yyyy")}
                            <span className="ml-1.5 text-xs text-muted-foreground">
                              in {CHECK_DUE_AFTER_DAYS - (d.daysSince ?? 0)}d
                            </span>
                          </>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant="outline" onClick={() => {
                          resetForm(); setForStaff(d.userId); setClient(d.client); setOpen(true);
                        }}>
                          <PhoneCall className="mr-1.5 h-3.5 w-3.5" /> Record
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <div className="border-b px-4 py-3"><h3 className="text-sm font-semibold">Recent checks</h3></div>
          {checks.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">No checks recorded yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>When</TableHead><TableHead>Staff</TableHead><TableHead>Client</TableHead>
                  <TableHead>Picked up</TableHead><TableHead>Professional</TableHead><TableHead>Heard clearly</TableHead>
                  <TableHead>Outcome</TableHead><TableHead className="text-right">On record</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {checks.slice(0, 50).map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="whitespace-nowrap text-sm">{format(parseISO(c.checked_at), "d MMM, HH:mm")}</TableCell>
                      <TableCell className="font-medium">{nameOf(c.staff_user_id)}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{c.client_name ?? "—"}</TableCell>
                      {/* A missed call that was returned is a different result
                          from one that was not, so the row says which. */}
                      <TableCell className={cn("text-sm", c.answered !== "answered" && "font-medium text-destructive")}>
                        {ANSWERED_LABELS[c.answered]}
                        {c.answered !== "answered" && c.called_back !== "not_applicable" && (
                          <span className={cn("block text-xs font-normal",
                            c.called_back === "yes" ? "text-muted-foreground" : "text-destructive")}>
                            {CALLED_BACK_LABELS[c.called_back]}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm">{ETIQUETTE_LABELS[c.etiquette]}</TableCell>
                      <TableCell className="text-sm">{NOISE_LABELS[c.background_noise]}</TableCell>
                      <TableCell>{outcomeBadge(c.outcome)}</TableCell>
                      <TableCell className="text-right">
                        {c.raised_warning_id ? <span className="text-xs text-muted-foreground">Raised</span>
                          : worthRaising(c) ? (
                            <Button size="sm" variant="ghost" className="text-amber-600"
                              onClick={() => { setRaising(c); setRaiseReason(c.notes ?? ""); }}>
                              <AlertTriangle className="mr-1.5 h-3.5 w-3.5" /> Raise
                            </Button>
                          ) : <span className="text-xs text-muted-foreground">—</span>}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Record a check — the form is the instructions. */}
      <Dialog open={open} onOpenChange={(o) => { if (!o && !saving) setOpen(false); }}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Record a check</DialogTitle>
            <DialogDescription>Answer only what you heard. Leave anything that did not come up blank.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-1">
            <div className="grid gap-1.5">
              <Label>Who did you ring?</Label>
              <Select value={forStaff} onValueChange={(v) => {
                setForStaff(v); setClient(clientsFor(v)[0] ?? "");
              }}>
                <SelectTrigger><SelectValue placeholder="Select a staff member" /></SelectTrigger>
                <SelectContent>
                  {[...new Map(lines.map((l) => [l.userId, l.name])).entries()]
                    .sort((a, b) => a[1].localeCompare(b[1]))
                    .map(([userId, name]) => (
                      <SelectItem key={userId} value={userId}>{name}</SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            {/* The client picks the hours, so it cannot be free text. Typing a
                client here used to leave the check attached to a line the
                person does not actually cover. */}
            <div className="grid gap-1.5">
              <Label>Which client&rsquo;s shift</Label>
              <Select value={client} onValueChange={setClient} disabled={!forStaff}>
                <SelectTrigger>
                  <SelectValue placeholder={forStaff ? "Select the client" : "Pick who you rang first"} />
                </SelectTrigger>
                <SelectContent>
                  {clientsFor(forStaff).map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {forStaff && client && (
                <p className="text-xs text-muted-foreground">
                  On this line {windowsFor(forStaff, client).length > 0
                    ? <>at <span className="font-medium tabular-nums text-foreground">{windowsFor(forStaff, client).join(", ")}</span> — ring inside those hours.</>
                    : "— no hours are set on the rota for it."}
                </p>
              )}
            </div>

            <div className="grid gap-1.5">
              <Label>Did they pick up?</Label>
              <Select value={answered} onValueChange={(v) => setAnswered(v as Answered)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(ANSWERED_LABELS) as Answered[]).map((k) => (
                    <SelectItem key={k} value={k}>{ANSWERED_LABELS[k]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Q2 — only asked when there was something to call back from. */}
            {!reachable && (
              <div className="grid gap-1.5">
                <Label>Did they call you back?</Label>
                <Select value={calledBack} onValueChange={(v) => setCalledBack(v as CalledBack)}>
                  <SelectTrigger><SelectValue placeholder="Choose one" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="yes">Yes — they rang back</SelectItem>
                    <SelectItem value="no">No — never heard from them</SelectItem>
                    <SelectItem value="not_applicable">Too soon to say</SelectItem>
                  </SelectContent>
                </Select>
                <p className="rounded-md bg-destructive/10 p-2.5 text-xs text-destructive">
                  Being reachable is the whole job of the shift. A call that was returned quickly is a
                  lapse; one never returned is what the shift exists to prevent. Note below what you
                  tried and at what time.
                </p>
              </div>
            )}

            {reachable && (
              <>
                {/* Q3 — the whole guide in one question. Seven tick-boxes were
                    an audit; nobody who was half of the conversation can answer
                    an audit honestly afterwards. This they can. */}
                <div className="grid gap-1.5">
                  <Label>Did they answer in a professional manner?</Label>
                  <Select value={professional} onValueChange={(v) => setProfessional(v as Etiquette)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="followed">
                        <span className="font-medium">Yes</span>
                        <span className="block text-xs text-muted-foreground">Named themselves and Care Cuddle, checked who you were, calm and clear.</span>
                      </SelectItem>
                      <SelectItem value="partly">
                        <span className="font-medium">Mostly — something was off</span>
                        <span className="block text-xs text-muted-foreground">Say what in the notes, so it can be repeated back to them.</span>
                      </SelectItem>
                      <SelectItem value="not_followed">
                        <span className="font-medium">No</span>
                        <span className="block text-xs text-muted-foreground">A client would have noticed.</span>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    What good sounds like is set out in the{" "}
                    <a href={ETIQUETTE_GUIDE_URL} target="_blank" rel="noreferrer"
                       className="text-primary underline underline-offset-2">{ETIQUETTE_GUIDE_TITLE}</a>.
                  </p>
                </div>

                <div className="grid gap-1.5">
                  <Label>Could you hear them clearly?</Label>
                  <Select value={noise} onValueChange={(v) => setNoise(v as Noise)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Quiet — no background at all</SelectItem>
                      <SelectItem value="some">Some noise, but the call worked</SelectItem>
                      <SelectItem value="disruptive">Disruptive — hard to hear, or others audible</SelectItem>
                      <SelectItem value="driving">Sounded like they were driving</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}

            <div className="grid gap-1.5">
              <Label htmlFor="qa-notes">
                {needsExplaining(outcome)
                  ? <>What was wrong <span className="text-destructive">*</span></>
                  : "Anything else worth noting"}
              </Label>
              <Textarea id="qa-notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)}
                placeholder="What you heard, in enough detail that it could be repeated back to them" />
            </div>

            <div className="grid gap-1.5">
              <Label>Rating <span className="text-destructive">*</span></Label>
              <Select value={outcome} onValueChange={(v) => { setOutcome(v as Outcome); setOutcomeTouched(true); }}>
                <SelectTrigger><SelectValue placeholder="Choose a rating" /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(OUTCOME_LABELS) as Outcome[]).map((k) => (
                    <SelectItem key={k} value={k}>
                      <span className="font-medium">{OUTCOME_LABELS[k]}</span>
                      <span className="block text-xs text-muted-foreground">{OUTCOME_HINTS[k]}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {/* Suggested rather than pre-filled: a rating that arrives already
                  chosen is one nobody has to think about before saving. */}
              <p className="text-xs text-muted-foreground">
                {outcome
                  ? OUTCOME_HINTS[outcome as Outcome]
                  : `From your answers this looks like ${OUTCOME_LABELS[suggested]} — but you have to choose it.`}
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>Cancel</Button>
            <Button onClick={save} disabled={saving || missing.length > 0}>
              {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />} Save check
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!raising} onOpenChange={(o) => { if (!o && !raiseSaving) setRaising(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Raise this on {raising ? nameOf(raising.staff_user_id) : ""}&rsquo;s record</DialogTitle>
            <DialogDescription>
              It goes onto their HR profile as feedback. They are emailed it and have to acknowledge
              it, the same as any other feedback — you do not need to speak to them separately.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div className="grid gap-1.5">
              <Label>How serious</Label>
              <Select value={raiseSeverity} onValueChange={setRaiseSeverity}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="minor">A word — first time, minor</SelectItem>
                  <SelectItem value="moderate">Needs to change</SelectItem>
                  <SelectItem value="major">Serious or repeated</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="qa-raise">What to tell them</Label>
              <Textarea id="qa-raise" rows={4} value={raiseReason} onChange={(e) => setRaiseReason(e.target.value)}
                placeholder="The date, what happened, and what should happen instead" />
              <p className="text-xs text-muted-foreground">
                Write it as you would say it to them — factual, specific, no adjectives.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRaising(null)} disabled={raiseSaving}>Cancel</Button>
            <Button onClick={raise} disabled={raiseSaving || !raiseReason.trim()}>
              {raiseSaving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />} Raise it
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
