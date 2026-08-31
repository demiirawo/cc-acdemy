import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { format, parseISO } from "date-fns";
import { Loader2, PhoneCall, AlertTriangle, Plus } from "lucide-react";
import {
  ANSWERED_LABELS, ETIQUETTE_LABELS, NOISE_LABELS, OUTCOME_LABELS,
  CHECK_DUE_AFTER_DAYS, suggestOutcome, worthRaising, orderByOverdue, daysSince, isDue,
  type Answered, type Etiquette, type Noise, type Outcome, type QaCheck, type DueRow,
} from "@/lib/qualityAssurance";

/**
 * Quality assurance — spot checks on the people covering monitoring shifts.
 *
 * The page answers two questions and no others: who should I ring today, and
 * what did the last few checks find. Anything that turns up goes onto the
 * person's HR record as feedback, which is the existing route for telling
 * somebody something and having them acknowledge it — there is no need for a
 * second one.
 */
export function QualityAssuranceSection() {
  const { user } = useAuth();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [checks, setChecks] = useState<QaCheck[]>([]);
  const [staff, setStaff] = useState<Array<{ userId: string; name: string; clients: string[] }>>([]);

  // Record-a-check dialog
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [forStaff, setForStaff] = useState("");
  const [client, setClient] = useState("");
  const [answered, setAnswered] = useState<Answered>("answered");
  const [rings, setRings] = useState("");
  const [etiquette, setEtiquette] = useState<Etiquette>("followed");
  const [noise, setNoise] = useState<Noise>("none");
  const [notes, setNotes] = useState("");
  const [outcome, setOutcome] = useState<Outcome>("pass");
  const [outcomeTouched, setOutcomeTouched] = useState(false);

  // Raise-a-finding dialog
  const [raising, setRaising] = useState<QaCheck | null>(null);
  const [raiseReason, setRaiseReason] = useState("");
  const [raiseSeverity, setRaiseSeverity] = useState("minor");
  const [raiseSaving, setRaiseSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    const [{ data: qa }, { data: profiles }, { data: patterns }] = await Promise.all([
      supabase.from("qa_checks").select("*").order("checked_at", { ascending: false }).limit(200),
      supabase.from("profiles").select("user_id, display_name, email"),
      supabase.from("recurring_shift_patterns").select("user_id, client_name, end_date, is_overtime"),
    ]);

    setChecks((qa ?? []) as QaCheck[]);

    // Anyone on a live shift pattern is in scope. The bench is not a client, so
    // somebody rostered only there has nobody to be reachable for.
    const today = format(new Date(), "yyyy-MM-dd");
    const byUser = new Map<string, Set<string>>();
    for (const p of patterns ?? []) {
      const name = (p.client_name ?? "").trim();
      if (!name || name.toLowerCase() === "care cuddle") continue;
      if (p.end_date && p.end_date < today) continue;
      if (!byUser.has(p.user_id)) byUser.set(p.user_id, new Set());
      byUser.get(p.user_id)!.add(name);
    }

    setStaff(
      [...byUser.entries()].map(([userId, clients]) => {
        const p = (profiles ?? []).find((x) => x.user_id === userId);
        return {
          userId,
          name: p?.display_name || p?.email || "Unknown",
          clients: [...clients].sort(),
        };
      })
    );
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const nameOf = (userId: string) => staff.find((s) => s.userId === userId)?.name ?? "Unknown";

  const due: DueRow[] = useMemo(() => {
    const rows = staff.map((s) => {
      const last = checks.find((c) => c.staff_user_id === s.userId) ?? null;
      return {
        userId: s.userId,
        name: s.name,
        clients: s.clients,
        lastCheckedAt: last?.checked_at ?? null,
        lastOutcome: (last?.outcome as Outcome) ?? null,
        daysSince: daysSince(last?.checked_at ?? null),
      };
    });
    return orderByOverdue(rows);
  }, [staff, checks]);

  const thisMonth = useMemo(() => {
    const from = format(new Date(new Date().getFullYear(), new Date().getMonth(), 1), "yyyy-MM-dd");
    return checks.filter((c) => c.checked_at >= from);
  }, [checks]);

  const noAnswerRate = thisMonth.length
    ? Math.round((thisMonth.filter((c) => c.answered !== "answered").length / thisMonth.length) * 100)
    : null;

  const resetForm = () => {
    setForStaff(""); setClient(""); setAnswered("answered"); setRings("");
    setEtiquette("followed"); setNoise("none"); setNotes("");
    setOutcome("pass"); setOutcomeTouched(false);
  };

  // The outcome follows the answers until somebody overrides it, then it stops
  // moving under them.
  useEffect(() => {
    if (!outcomeTouched) setOutcome(suggestOutcome(answered, etiquette, noise));
  }, [answered, etiquette, noise, outcomeTouched]);

  // Nothing was heard, so nothing can be judged about how the call went.
  const reachable = answered === "answered";
  useEffect(() => {
    if (!reachable) { setEtiquette("not_applicable"); setNoise("not_applicable"); }
    else {
      setEtiquette((e) => (e === "not_applicable" ? "followed" : e));
      setNoise((n) => (n === "not_applicable" ? "none" : n));
    }
  }, [reachable]);

  const save = async () => {
    if (!forStaff) return toast({ title: "Pick who was checked", variant: "destructive" });
    setSaving(true);
    const { error } = await supabase.from("qa_checks").insert({
      staff_user_id: forStaff,
      client_name: client || null,
      checked_by: user?.id ?? null,
      answered,
      rings_to_answer: rings ? Number(rings) : null,
      etiquette,
      background_noise: noise,
      notes: notes.trim() || null,
      outcome,
    });
    setSaving(false);
    if (error) return toast({ title: "Could not save the check", description: error.message, variant: "destructive" });
    toast({
      title: "Check recorded",
      description: outcome === "pass" ? undefined : "Raise it on their record if it needs saying to them.",
    });
    setOpen(false);
    resetForm();
    load();
  };

  const raise = async () => {
    if (!raising || !raiseReason.trim()) return;
    setRaiseSaving(true);
    // Goes onto the HR record as ordinary feedback, so it reaches them by the
    // route they already know and has to be acknowledged like anything else.
    // staff_warnings is not in the generated types, so it is reached the same
    // way the Feedback Log reaches it.
    const { data, error } = await (supabase as any).from("staff_warnings").insert({
      user_id: raising.staff_user_id,
      kind: raiseSeverity === "praise" ? "praise" : "development",
      category: "quality_assurance",
      reason: raiseReason.trim(),
      severity: raiseSeverity === "praise" ? "minor" : raiseSeverity,
      issued_by: user?.id ?? null,
    }).select("id").single();

    if (error) {
      setRaiseSaving(false);
      return toast({ title: "Could not raise it", description: error.message, variant: "destructive" });
    }

    await supabase.from("qa_checks").update({ raised_warning_id: data.id }).eq("id", raising.id);
    setRaiseSaving(false);
    setRaising(null);
    setRaiseReason("");
    toast({ title: "Raised on their record", description: `${nameOf(raising.staff_user_id)} will see it under Feedback.` });
    load();
  };

  const outcomeBadge = (o: Outcome) => (
    <Badge
      variant="outline"
      className={cn(
        "text-[10px]",
        o === "pass" && "border-emerald-300 text-emerald-600",
        o === "concerns" && "border-amber-300 text-amber-600",
        o === "fail" && "border-destructive/40 text-destructive",
      )}
    >
      {OUTCOME_LABELS[o]}
    </Badge>
  );

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-16 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading quality assurance…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold">Quality Assurance</h2>
          <p className="text-sm text-muted-foreground">
            Spot checks on the people covering monitoring shifts — whether they answered, how the
            call was handled, and whether the line was clean.
          </p>
        </div>
        <Button onClick={() => { resetForm(); setOpen(true); }}>
          <Plus className="mr-1.5 h-4 w-4" /> Record a check
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card><CardContent className="p-4">
          <p className="text-2xl font-bold">{thisMonth.length}</p>
          <p className="text-xs text-muted-foreground">Checks this month</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className={cn("text-2xl font-bold", due.filter(d => isDue(d.daysSince)).length > 0 && "text-amber-600")}>
            {due.filter((d) => isDue(d.daysSince)).length}
          </p>
          <p className="text-xs text-muted-foreground">Due a check (over {CHECK_DUE_AFTER_DAYS} days)</p>
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
            <h3 className="text-sm font-semibold">Who to ring next</h3>
            <p className="text-xs text-muted-foreground">
              Longest since a check first. Anyone never checked is at the top.
            </p>
          </div>
          {due.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">
              Nobody is on a live shift pattern, so there is nothing to check.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Staff</TableHead>
                    <TableHead>Clients</TableHead>
                    <TableHead>Last checked</TableHead>
                    <TableHead>Last outcome</TableHead>
                    <TableHead className="text-right">Check</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {due.map((d) => (
                    <TableRow key={d.userId} className={cn(isDue(d.daysSince) && "bg-amber-500/5")}>
                      <TableCell className="font-medium">{d.name}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{d.clients.join(", ")}</TableCell>
                      <TableCell className="text-sm">
                        {d.lastCheckedAt ? (
                          <>
                            {format(parseISO(d.lastCheckedAt), "d MMM")}
                            <span className={cn("ml-1.5 text-xs", isDue(d.daysSince) ? "text-amber-600 font-medium" : "text-muted-foreground")}>
                              {d.daysSince === 0 ? "today" : `${d.daysSince}d ago`}
                            </span>
                          </>
                        ) : (
                          <span className="text-amber-600 font-medium">Never checked</span>
                        )}
                      </TableCell>
                      <TableCell>{d.lastOutcome ? outcomeBadge(d.lastOutcome) : <span className="text-muted-foreground">—</span>}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            resetForm();
                            setForStaff(d.userId);
                            setClient(d.clients[0] ?? "");
                            setOpen(true);
                          }}
                        >
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
          <div className="border-b px-4 py-3">
            <h3 className="text-sm font-semibold">Recent checks</h3>
          </div>
          {checks.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">
              No checks recorded yet.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>When</TableHead>
                    <TableHead>Staff</TableHead>
                    <TableHead>Client</TableHead>
                    <TableHead>Answered</TableHead>
                    <TableHead>Etiquette</TableHead>
                    <TableHead>Line</TableHead>
                    <TableHead>Outcome</TableHead>
                    <TableHead className="text-right">On record</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {checks.slice(0, 50).map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="whitespace-nowrap text-sm">
                        {format(parseISO(c.checked_at), "d MMM, HH:mm")}
                      </TableCell>
                      <TableCell className="font-medium">{nameOf(c.staff_user_id)}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{c.client_name ?? "—"}</TableCell>
                      <TableCell className={cn("text-sm", c.answered !== "answered" && "text-destructive font-medium")}>
                        {ANSWERED_LABELS[c.answered]}
                        {c.rings_to_answer ? <span className="text-muted-foreground"> · {c.rings_to_answer} rings</span> : null}
                      </TableCell>
                      <TableCell className="text-sm">{ETIQUETTE_LABELS[c.etiquette]}</TableCell>
                      <TableCell className="text-sm">{NOISE_LABELS[c.background_noise]}</TableCell>
                      <TableCell>{outcomeBadge(c.outcome)}</TableCell>
                      <TableCell className="text-right">
                        {c.raised_warning_id ? (
                          <span className="text-xs text-muted-foreground">Raised</span>
                        ) : worthRaising(c) ? (
                          <Button size="sm" variant="ghost" className="text-amber-600" onClick={() => { setRaising(c); setRaiseReason(c.notes ?? ""); }}>
                            <AlertTriangle className="mr-1.5 h-3.5 w-3.5" /> Raise
                          </Button>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Record a check */}
      <Dialog open={open} onOpenChange={(o) => { if (!o && !saving) setOpen(false); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Record a check</DialogTitle>
            <DialogDescription>What happened when you rang them on shift.</DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-1">
            <div className="grid gap-1.5">
              <Label>Who was checked</Label>
              <Select value={forStaff} onValueChange={(v) => {
                setForStaff(v);
                setClient(staff.find((s) => s.userId === v)?.clients[0] ?? "");
              }}>
                <SelectTrigger><SelectValue placeholder="Select a staff member" /></SelectTrigger>
                <SelectContent>
                  {staff.map((s) => <SelectItem key={s.userId} value={s.userId}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="qa-client">Client shift</Label>
              <Input id="qa-client" value={client} onChange={(e) => setClient(e.target.value)} placeholder="e.g. Lorablooms Care Services" />
            </div>

            <div className="grid gap-1.5">
              <Label>Did they answer?</Label>
              <Select value={answered} onValueChange={(v) => setAnswered(v as Answered)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(ANSWERED_LABELS) as Answered[]).map((k) => (
                    <SelectItem key={k} value={k}>{ANSWERED_LABELS[k]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {reachable && (
              <>
                <div className="grid gap-1.5">
                  <Label htmlFor="qa-rings">Rings before answering <span className="text-muted-foreground">(optional)</span></Label>
                  <Input id="qa-rings" type="number" min={1} value={rings} onChange={(e) => setRings(e.target.value)} placeholder="3 or fewer is the standard" />
                </div>

                <div className="grid gap-1.5">
                  <Label>Call etiquette</Label>
                  <Select value={etiquette} onValueChange={(v) => setEtiquette(v as Etiquette)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(["followed", "partly", "not_followed"] as Etiquette[]).map((k) => (
                        <SelectItem key={k} value={k}>{ETIQUETTE_LABELS[k]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Named themselves and the company, verified who they were speaking to, gave a
                    specific callback time rather than &ldquo;shortly&rdquo;.
                  </p>
                </div>

                <div className="grid gap-1.5">
                  <Label>Background noise</Label>
                  <Select value={noise} onValueChange={(v) => setNoise(v as Noise)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(["none", "some", "disruptive"] as Noise[]).map((k) => (
                        <SelectItem key={k} value={k}>{NOISE_LABELS[k]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}

            <div className="grid gap-1.5">
              <Label htmlFor="qa-notes">Notes</Label>
              <Textarea id="qa-notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)}
                placeholder="What you heard, in enough detail to repeat back to them" />
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
              {!outcomeTouched && (
                <p className="text-xs text-muted-foreground">Suggested from the answers above — change it if you disagree.</p>
              )}
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

      {/* Raise it on their record */}
      <Dialog open={!!raising} onOpenChange={(o) => { if (!o && !raiseSaving) setRaising(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Raise this on {raising ? nameOf(raising.staff_user_id) : ""}&rsquo;s record</DialogTitle>
            <DialogDescription>
              It goes onto their HR profile as feedback, which they are emailed and have to
              acknowledge — the same route as any other feedback.
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
                placeholder="Specific and factual — the date, what happened, and what should happen instead" />
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
