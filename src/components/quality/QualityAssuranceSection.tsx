import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { format, parseISO, addDays } from "date-fns";
import { Loader2, PhoneCall, AlertTriangle, Plus } from "lucide-react";
import {
  ANSWERED_LABELS, ETIQUETTE_LABELS, NOISE_LABELS, OUTCOME_LABELS, ETIQUETTE_POINTS,
  CHECK_DUE_AFTER_DAYS, SCOPE_AHEAD_DAYS, OFFICE_DAY_START, OFFICE_DAY_END,
  suggestOutcome, worthRaising, orderByOverdue, daysSince, isDue,
  isMonitoringShift, monitoringClients, runsBetween, describeWindow, etiquetteFromChecklist,
  type Answered, type Noise, type Outcome, type QaCheck, type DueRow, type EtiquettePoint,
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
  const [staff, setStaff] = useState<Array<{ userId: string; name: string; clients: string[]; windows: string[] }>>([]);

  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [forStaff, setForStaff] = useState("");
  const [client, setClient] = useState("");
  const [answered, setAnswered] = useState<Answered>("answered");
  const [ticks, setTicks] = useState<Partial<Record<EtiquettePoint, boolean>>>({});
  const [noise, setNoise] = useState<Noise>("none");
  const [notes, setNotes] = useState("");
  const [outcome, setOutcome] = useState<Outcome>("pass");
  const [outcomeTouched, setOutcomeTouched] = useState(false);

  const [raising, setRaising] = useState<QaCheck | null>(null);
  const [raiseReason, setRaiseReason] = useState("");
  const [raiseSeverity, setRaiseSeverity] = useState("minor");
  const [raiseSaving, setRaiseSaving] = useState(false);


  const load = async () => {
    setLoading(true);
    const [{ data: qa }, { data: profiles }, { data: patterns }] = await Promise.all([
      supabase.from("qa_checks").select("*").order("checked_at", { ascending: false }).limit(200),
      supabase.from("profiles").select("user_id, display_name, email").order("display_name"),
      supabase.from("recurring_shift_patterns")
        .select("user_id, client_name, start_time, end_time, start_date, end_date, days_of_week, is_overtime"),
    ]);

    setChecks((qa ?? []) as QaCheck[]);
    const nameFor = (id: string) => {
      const p = (profiles ?? []).find((x) => x.user_id === id);
      return p?.display_name || p?.email || "Unknown";
    };

    // In scope: on a monitoring shift — out-of-hours cover rather than the
    // ordinary desk day — at some point in the next four weeks.
    const from = new Date();
    const to = addDays(from, SCOPE_AHEAD_DAYS);
    // Which clients are watched out of hours at all — a monitoring client's
    // middle shift counts, an ordinary client's late finish does not.
    const monitored = monitoringClients(patterns ?? []);
    const byUser = new Map<string, { clients: Set<string>; windows: Set<string> }>();
    for (const p of patterns ?? []) {
      const clientName = (p.client_name ?? "").trim();
      if (!clientName || clientName.toLowerCase() === "care cuddle") continue;
      if (!isMonitoringShift(p.start_time, p.end_time, clientName, monitored)) continue;
      if (!runsBetween(p, from, to)) continue;
      if (!byUser.has(p.user_id)) byUser.set(p.user_id, { clients: new Set(), windows: new Set() });
      byUser.get(p.user_id)!.clients.add(clientName);
      byUser.get(p.user_id)!.windows.add(describeWindow(p.start_time, p.end_time));
    }

    setStaff([...byUser.entries()].map(([userId, v]) => ({
      userId,
      name: nameFor(userId),
      clients: [...v.clients].sort(),
      windows: [...v.windows].sort(),
    })));
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const nameOf = (userId: string) =>
    staff.find((s) => s.userId === userId)?.name ?? "Unknown";

  const due: DueRow[] = useMemo(() => orderByOverdue(staff.map((s) => {
    const last = checks.find((c) => c.staff_user_id === s.userId) ?? null;
    return {
      userId: s.userId, name: s.name, clients: s.clients, windows: s.windows,
      lastCheckedAt: last?.checked_at ?? null,
      lastOutcome: (last?.outcome as Outcome) ?? null,
      daysSince: daysSince(last?.checked_at ?? null),
    };
  })), [staff, checks]);

  const thisMonth = useMemo(() => {
    const from = format(new Date(new Date().getFullYear(), new Date().getMonth(), 1), "yyyy-MM-dd");
    return checks.filter((c) => c.checked_at >= from);
  }, [checks]);

  const noAnswerRate = thisMonth.length
    ? Math.round((thisMonth.filter((c) => c.answered !== "answered").length / thisMonth.length) * 100)
    : null;

  const reachable = answered === "answered";
  const etiquette = reachable ? etiquetteFromChecklist(ticks) : "not_applicable";

  useEffect(() => {
    if (!outcomeTouched) setOutcome(suggestOutcome(answered, etiquette, reachable ? noise : "not_applicable"));
  }, [answered, etiquette, noise, reachable, outcomeTouched]);

  const resetForm = () => {
    setForStaff(""); setClient(""); setAnswered("answered"); setTicks({});
    setNoise("none"); setNotes(""); setOutcome("pass"); setOutcomeTouched(false);
  };

  const save = async () => {
    if (!forStaff) return toast({ title: "Pick who you rang", variant: "destructive" });
    setSaving(true);
    const { error } = await supabase.from("qa_checks").insert({
      staff_user_id: forStaff,
      client_name: client || null,
      checked_by: user?.id ?? null,
      answered,
      etiquette,
      background_noise: reachable ? noise : "not_applicable",
      notes: notes.trim() || null,
      outcome,
      ...(reachable ? Object.fromEntries(ETIQUETTE_POINTS.map(p => [p.key, ticks[p.key] ?? null])) : {}),
    });
    setSaving(false);
    if (error) return toast({ title: "Could not save the check", description: error.message, variant: "destructive" });
    toast({
      title: "Check recorded",
      description: outcome === "pass"
        ? "Nothing further to do."
        : "Use Raise on the row below to put it on their record.",
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
    <Badge variant="outline" className={cn("text-[10px]",
      o === "pass" && "border-emerald-300 text-emerald-600",
      o === "concerns" && "border-amber-300 text-amber-600",
      o === "fail" && "border-destructive/40 text-destructive")}>
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
            Once a month, ring each person covering an out-of-hours monitoring shift and record what
            happened. You do not need to have done this before — everything you need is on this page.
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
              { n: 1, t: "Pick someone who is due", d: "The list below is ordered by who has gone longest without one. Anyone never checked is at the top." },
              { n: 2, t: "Ring them during their shift", d: "Their monitoring window is shown next to their name. Ringing outside it proves nothing — they are not on duty." },
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
            on the monitoring shift.&rdquo; Then let them talk. You are listening for the five things in the
            form, not testing them with questions.
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
              People on an out-of-hours monitoring shift in the next {SCOPE_AHEAD_DAYS} days — anything
              starting before {OFFICE_DAY_START} or running past {OFFICE_DAY_END}. Longest since a check first.
            </p>
          </div>
          {due.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">
              Nobody is on a monitoring shift in the next four weeks, so there is nothing to check.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Staff</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>When they are on</TableHead>
                  <TableHead>Last checked</TableHead>
                  <TableHead className="text-right">Check</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {due.map((d) => (
                    <TableRow key={d.userId} className={cn(isDue(d.daysSince) && "bg-amber-500/5")}>
                      <TableCell className="font-medium">{d.name}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{d.clients.join(", ")}</TableCell>
                      <TableCell className="whitespace-nowrap text-sm tabular-nums">{d.windows.join(", ")}</TableCell>
                      <TableCell className="text-sm">
                        {d.lastCheckedAt ? (
                          <>
                            {format(parseISO(d.lastCheckedAt), "d MMM")}
                            <span className={cn("ml-1.5 text-xs", isDue(d.daysSince) ? "font-medium text-amber-600" : "text-muted-foreground")}>
                              {d.daysSince === 0 ? "today" : `${d.daysSince}d ago`}
                            </span>
                          </>
                        ) : <span className="font-medium text-amber-600">Never checked</span>}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant="outline" onClick={() => {
                          resetForm(); setForStaff(d.userId); setClient(d.clients[0] ?? ""); setOpen(true);
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
                  <TableHead>Answered</TableHead><TableHead>Etiquette</TableHead><TableHead>Line</TableHead>
                  <TableHead>Outcome</TableHead><TableHead className="text-right">On record</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {checks.slice(0, 50).map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="whitespace-nowrap text-sm">{format(parseISO(c.checked_at), "d MMM, HH:mm")}</TableCell>
                      <TableCell className="font-medium">{nameOf(c.staff_user_id)}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{c.client_name ?? "—"}</TableCell>
                      <TableCell className={cn("text-sm", c.answered !== "answered" && "font-medium text-destructive")}>
                        {ANSWERED_LABELS[c.answered]}
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
                setForStaff(v); setClient(staff.find((s) => s.userId === v)?.clients[0] ?? "");
              }}>
                <SelectTrigger><SelectValue placeholder="Select a staff member" /></SelectTrigger>
                <SelectContent>
                  {staff.map((s) => (
                    <SelectItem key={s.userId} value={s.userId}>{s.name} · {s.windows.join(", ")}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="qa-client">Which client&rsquo;s shift</Label>
              <Input id="qa-client" value={client} onChange={(e) => setClient(e.target.value)} />
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
              {!reachable && (
                <p className="rounded-md bg-destructive/10 p-2.5 text-xs text-destructive">
                  Not picking up during a monitoring shift is a fail on its own — being reachable is the
                  whole job of it. Note below what you tried and at what time, then raise it.
                </p>
              )}
            </div>

            {reachable && (
              <>
                <div className="grid gap-2">
                  <Label>What did you hear? Tick what they did</Label>
                  <p className="-mt-1 text-xs text-muted-foreground">
                    Leave a box blank if it never came up. Blanks are not counted against anyone.
                  </p>
                  <div className="space-y-2.5 rounded-md border p-3">
                    {ETIQUETTE_POINTS.map((p) => (
                      <label key={p.key} className="flex cursor-pointer items-start gap-2.5">
                        <Checkbox
                          checked={ticks[p.key] === true}
                          onCheckedChange={(v) => setTicks((t) => ({ ...t, [p.key]: v === true ? true : false }))}
                          className="mt-0.5"
                        />
                        <span>
                          <span className="text-sm font-medium">{p.label}</span>
                          <span className="block text-xs text-muted-foreground">{p.hint}</span>
                        </span>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="grid gap-1.5">
                  <Label>Could you hear them clearly?</Label>
                  <Select value={noise} onValueChange={(v) => setNoise(v as Noise)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Quiet — no background at all</SelectItem>
                      <SelectItem value="some">Some noise, but the call worked</SelectItem>
                      <SelectItem value="disruptive">Disruptive — hard to hear, or others audible</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}

            <div className="grid gap-1.5">
              <Label htmlFor="qa-notes">Anything worth noting</Label>
              <Textarea id="qa-notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)}
                placeholder="What you heard, in enough detail that it could be repeated back to them" />
            </div>

            <div className="grid gap-1.5">
              <Label>Outcome</Label>
              <Select value={outcome} onValueChange={(v) => { setOutcome(v as Outcome); setOutcomeTouched(true); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(OUTCOME_LABELS) as Outcome[]).map((k) => (
                    <SelectItem key={k} value={k}>{OUTCOME_LABELS[k]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {outcomeTouched
                  ? "You have set this yourself."
                  : "Worked out from your answers above — change it if you disagree."}
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>Cancel</Button>
            <Button onClick={save} disabled={saving || !forStaff}>
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
