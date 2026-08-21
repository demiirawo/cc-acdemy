import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { format, parseISO } from "date-fns";
import { Plus, Loader2, Trash2, ThumbsUp, Lightbulb, AlertTriangle, Pencil } from "lucide-react";
import { FEEDBACK_KINDS, FEEDBACK_KIND_ORDER, asFeedbackKind, type FeedbackKind } from "@/lib/feedbackKinds";

// Kept in sync with the staff profile's Feedback tab (same staff_warnings table).
const CATEGORIES = ["Communication", "Attention to Detail", "Professionalism", "Learning"];
const SEVERITIES = [
  { value: "minor", label: "Minor" },
  { value: "major", label: "Major" },
  { value: "final", label: "Final" },
];

interface FeedbackRow {
  id: string;
  user_id: string;
  kind: string; // FeedbackKind
  category: string | null;
  reason: string;
  severity: string;
  issued_at: string;
  client_id: string | null;
  /** Set when the staff member has confirmed they've read it. */
  acknowledged_at: string | null;
  /** Optional — they are asked to acknowledge, not to reply. */
  acknowledgement_comment: string | null;
}
interface StaffRow { user_id: string; display_name: string | null; email: string | null; }
interface ClientRow { id: string; name: string; }

const FEEDBACK_COLS = "id, user_id, kind, category, reason, severity, issued_at, client_id, acknowledged_at, acknowledgement_comment";
const NO_CLIENT = "none";

export function FeedbackLogSection() {
  const { user } = useAuth();
  const { canManageHR } = useUserRole();
  const { toast } = useToast();

  const [rows, setRows] = useState<FeedbackRow[]>([]);
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [loading, setLoading] = useState(true);

  // Add/edit feedback dialog — editing reuses the same fields, keyed by editingId.
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [fbUser, setFbUser] = useState("");
  const [fbKind, setFbKind] = useState<FeedbackKind>("warning");
  const [fbCategory, setFbCategory] = useState("none");
  const [fbSeverity, setFbSeverity] = useState("minor");
  const [fbClient, setFbClient] = useState(NO_CLIENT);
  const [fbReason, setFbReason] = useState("");
  const [saving, setSaving] = useState(false);

  const nameOf = (uid: string) => {
    const s = staff.find(x => x.user_id === uid);
    return s?.display_name || s?.email || "Staff member";
  };
  const clientNameOf = (id: string | null) => (id ? clients.find(c => c.id === id)?.name ?? null : null);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: fb }, { data: profs }, { data: cls }] = await Promise.all([
      (supabase as any).from("staff_warnings").select(FEEDBACK_COLS).order("issued_at", { ascending: false }),
      supabase.from("profiles").select("user_id, display_name, email").order("display_name"),
      supabase.from("clients").select("id, name").order("name"),
    ]);
    setRows((fb as FeedbackRow[]) || []);
    setStaff((profs as StaffRow[]) || []);
    setClients((cls as ClientRow[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const resetForm = () => { setEditingId(null); setFbUser(""); setFbKind("warning"); setFbCategory("none"); setFbSeverity("minor"); setFbClient(NO_CLIENT); setFbReason(""); };

  const openEdit = (r: FeedbackRow) => {
    setEditingId(r.id);
    setFbUser(r.user_id);
    setFbKind(asFeedbackKind(r.kind));
    setFbCategory(r.category || "none");
    setFbSeverity(r.severity || "minor");
    setFbClient(r.client_id || NO_CLIENT);
    setFbReason(r.reason);
    setOpen(true);
  };

  // Edits update the same row the staff profile reads, so both stay in sync.
  // No email on edit — the staff member was already notified when it was raised.
  const saveEdit = async () => {
    if (!editingId || !fbUser || !fbReason.trim()) return;
    setSaving(true);
    const hasSeverity = FEEDBACK_KINDS[fbKind].hasSeverity;
    const { data, error } = await (supabase as any)
      .from("staff_warnings")
      .update({
        user_id: fbUser,
        kind: fbKind,
        category: fbCategory === "none" ? null : fbCategory,
        reason: fbReason.trim(),
        severity: hasSeverity ? fbSeverity : "minor",
        client_id: fbClient === NO_CLIENT ? null : fbClient,
      })
      .eq("id", editingId)
      .select(FEEDBACK_COLS)
      .single();
    setSaving(false);
    if (error) { toast({ title: "Couldn't save changes", description: error.message, variant: "destructive" }); return; }
    setRows(prev => prev.map(r => (r.id === editingId ? (data as FeedbackRow) : r)));
    toast({ title: "Feedback updated", description: "The staff member's profile shows the change too." });
    setOpen(false);
    resetForm();
  };

  // Same insert + email as the staff profile's Feedback tab — so it appears there too.
  const addFeedback = async () => {
    if (!fbUser || !fbReason.trim()) return;
    setSaving(true);
    const kindStyle = FEEDBACK_KINDS[fbKind];
    const category = fbCategory === "none" ? null : fbCategory;
    const severity = kindStyle.hasSeverity ? fbSeverity : "minor";
    const clientId = fbClient === NO_CLIENT ? null : fbClient;
    const { data, error } = await (supabase as any)
      .from("staff_warnings")
      .insert({ user_id: fbUser, kind: fbKind, category, reason: fbReason.trim(), severity, client_id: clientId, issued_by: user?.id ?? null })
      .select(FEEDBACK_COLS)
      .single();
    setSaving(false);
    if (error) { toast({ title: "Couldn't add feedback", description: error.message, variant: "destructive" }); return; }
    setRows(prev => [data as FeedbackRow, ...prev]);
    const recipient = staff.find(s => s.user_id === fbUser);
    if (recipient?.email) {
      supabase.functions.invoke("send-feedback-email", {
        body: { feedbackId: (data as FeedbackRow).id, recipientEmail: recipient.email, recipientName: recipient.display_name, kind: fbKind, category, reason: (data as FeedbackRow).reason, severity },
      }).catch(() => {});
    }
    toast({
      title: kindStyle.addedTitle,
      description: recipient?.email ? "The staff member has been emailed — it's on their profile too." : "Added to their profile. No email on file.",
    });
    setOpen(false);
    resetForm();
  };

  const remove = async (id: string) => {
    setRows(prev => prev.filter(r => r.id !== id));
    const { error } = await (supabase as any).from("staff_warnings").delete().eq("id", id);
    if (error) { toast({ title: "Couldn't delete", description: error.message, variant: "destructive" }); load(); }
    else toast({ title: "Feedback removed", description: "Removed from the log and the staff profile." });
  };

  const typeBadge = (r: FeedbackRow) => {
    const kind = asFeedbackKind(r.kind);
    if (kind !== "warning") {
      return <Badge variant="outline" className={cn("text-[10px]", FEEDBACK_KINDS[kind].badge)}>{FEEDBACK_KINDS[kind].short}</Badge>;
    }
    const sev = SEVERITIES.find(s => s.value === r.severity)?.label || "Minor";
    const danger = r.severity === "major" || r.severity === "final";
    return <Badge variant="outline" className={cn("text-[10px]", danger ? "border-red-300 text-red-600" : "border-amber-300 text-amber-600")}>{sev} warning</Badge>;
  };

  return (
    <div className="flex-1 overflow-auto p-4 md:p-6">
      <div className="max-w-7xl mx-auto space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold">Feedback Log</h1>
            <p className="text-muted-foreground text-sm">Every piece of feedback across the team. Kept in sync with each staff member's profile.</p>
          </div>
          {canManageHR && (
            <Button onClick={() => { resetForm(); setOpen(true); }}><Plus className="h-4 w-4 mr-1" /> Add feedback</Button>
          )}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading…</div>
        ) : rows.length === 0 ? (
          <Card><CardContent className="py-14 text-center text-muted-foreground">
            <ThumbsUp className="h-8 w-8 mx-auto mb-3 opacity-40" />
            <p className="font-medium">No feedback logged yet</p>
            <p className="text-sm">{canManageHR ? "Add the first piece of feedback — it'll show on the staff member's profile too." : "Feedback will appear here."}</p>
          </CardContent></Card>
        ) : (
          <div className="rounded-lg border overflow-x-auto bg-card">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-[11px] uppercase tracking-wide text-muted-foreground">
                  <th className="text-left font-medium px-3 py-2 w-[180px]">Staff</th>
                  <th className="text-left font-medium px-3 py-2 w-[130px]">Type</th>
                  <th className="text-left font-medium px-3 py-2 w-[160px]">From</th>
                  <th className="text-left font-medium px-3 py-2 w-[150px]">Area</th>
                  <th className="text-left font-medium px-3 py-2">Feedback</th>
                  <th className="text-left font-medium px-3 py-2 w-[110px]">Date</th>
                  <th className="text-left font-medium px-3 py-2 w-[150px]">Acknowledged</th>
                  <th className="w-[80px]" />
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.id} className="border-b last:border-0 hover:bg-muted/30 align-top">
                    <td className="px-3 py-2 font-medium">{nameOf(r.user_id)}</td>
                    <td className="px-3 py-2">{typeBadge(r)}</td>
                    <td className="px-3 py-2">
                      {clientNameOf(r.client_id)
                        ? <Badge variant="outline" className="text-[10px] border-blue-300 text-blue-600">{clientNameOf(r.client_id)}</Badge>
                        : <span className="text-muted-foreground text-xs">Internal</span>}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{r.category || "—"}</td>
                    <td className="px-3 py-2"><span className="whitespace-pre-wrap break-words">{r.reason}</span></td>
                    <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">{format(parseISO(r.issued_at), "d MMM yyyy")}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {r.acknowledged_at ? (
                        <div className="space-y-0.5">
                          <Badge variant="outline" className="text-[10px] border-green-300 text-green-600">
                            {format(parseISO(r.acknowledged_at), "d MMM yyyy")}
                          </Badge>
                          {r.acknowledgement_comment && (
                            <p className="text-[11px] text-muted-foreground italic whitespace-pre-wrap break-words max-w-[220px]">
                              “{r.acknowledgement_comment}”
                            </p>
                          )}
                        </div>
                      ) : (
                        <Badge variant="outline" className="text-[10px] border-amber-300 text-amber-600">Awaiting</Badge>
                      )}
                    </td>
                    <td className="px-2 py-2 text-right whitespace-nowrap">
                      {canManageHR && (
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground" title="Edit feedback" onClick={() => openEdit(r)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                      )}
                      {canManageHR && (
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" title="Delete feedback">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete this feedback?</AlertDialogTitle>
                              <AlertDialogDescription>It will be removed from the log and from {nameOf(r.user_id)}'s profile. This can't be undone.</AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => remove(r.id)}>Delete</AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add/edit feedback dialog — mirrors the staff profile's Feedback composer */}
      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetForm(); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editingId ? "Edit feedback" : "Add feedback"}</DialogTitle></DialogHeader>
          <div className="space-y-3 py-1">
            <div className="space-y-1.5">
              <Label>Staff member</Label>
              <Select value={fbUser} onValueChange={setFbUser}>
                <SelectTrigger><SelectValue placeholder="Select a staff member" /></SelectTrigger>
                <SelectContent>
                  {staff.map(s => <SelectItem key={s.user_id} value={s.user_id}>{s.display_name || s.email}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="inline-flex rounded-lg border bg-background p-0.5">
              {FEEDBACK_KIND_ORDER.map(k => {
                const st = FEEDBACK_KINDS[k];
                const Icon = k === "praise" ? ThumbsUp : k === "development" ? Lightbulb : AlertTriangle;
                return (
                  <button key={k} type="button" onClick={() => setFbKind(k)}
                    className={cn("flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition",
                      fbKind === k ? st.activeButton : "text-muted-foreground hover:text-foreground")}>
                    <Icon className="h-3.5 w-3.5" /> {st.short}
                  </button>
                );
              })}
            </div>

            <div className="space-y-1.5">
              <Label>Where did this come from?</Label>
              <Select value={fbClient} onValueChange={setFbClient}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_CLIENT}>Internal — raised by us</SelectItem>
                  {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className={cn("grid gap-2", FEEDBACK_KINDS[fbKind].hasSeverity ? "grid-cols-2" : "grid-cols-1")}>
              <Select value={fbCategory} onValueChange={setFbCategory}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Area (optional)" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No specific area</SelectItem>
                  {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
              {FEEDBACK_KINDS[fbKind].hasSeverity && (
                <Select value={fbSeverity} onValueChange={setFbSeverity}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>{SEVERITIES.map(s => <SelectItem key={s.value} value={s.value}>{s.label} warning</SelectItem>)}</SelectContent>
                </Select>
              )}
            </div>

            <Textarea value={fbReason} onChange={e => setFbReason(e.target.value)} rows={3}
              placeholder={FEEDBACK_KINDS[fbKind].placeholder("they")} />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button
              onClick={editingId ? saveEdit : addFeedback}
              disabled={saving || !fbUser || !fbReason.trim()}
              className={cn(fbKind === "praise" && "bg-green-600 hover:bg-green-700",
                fbKind === "development" && "bg-blue-600 hover:bg-blue-700")}
            >
              {editingId
                ? (saving ? "Saving…" : "Save changes")
                : (saving ? "Adding…" : FEEDBACK_KINDS[fbKind].cta)}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
