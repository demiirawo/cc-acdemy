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
import { Plus, Loader2, Trash2, ThumbsUp, AlertTriangle } from "lucide-react";

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
  kind: string; // 'praise' | 'warning'
  category: string | null;
  reason: string;
  severity: string;
  issued_at: string;
}
interface StaffRow { user_id: string; display_name: string | null; email: string | null; }

export function FeedbackLogSection() {
  const { user } = useAuth();
  const { canManageHR } = useUserRole();
  const { toast } = useToast();

  const [rows, setRows] = useState<FeedbackRow[]>([]);
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [loading, setLoading] = useState(true);

  // Add-feedback dialog
  const [open, setOpen] = useState(false);
  const [fbUser, setFbUser] = useState("");
  const [fbKind, setFbKind] = useState<"praise" | "warning">("warning");
  const [fbCategory, setFbCategory] = useState("none");
  const [fbSeverity, setFbSeverity] = useState("minor");
  const [fbReason, setFbReason] = useState("");
  const [saving, setSaving] = useState(false);

  const nameOf = (uid: string) => {
    const s = staff.find(x => x.user_id === uid);
    return s?.display_name || s?.email || "Staff member";
  };

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: fb }, { data: profs }] = await Promise.all([
      (supabase as any).from("staff_warnings").select("id, user_id, kind, category, reason, severity, issued_at").order("issued_at", { ascending: false }),
      supabase.from("profiles").select("user_id, display_name, email").order("display_name"),
    ]);
    setRows((fb as FeedbackRow[]) || []);
    setStaff((profs as StaffRow[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const resetForm = () => { setFbUser(""); setFbKind("warning"); setFbCategory("none"); setFbSeverity("minor"); setFbReason(""); };

  // Same insert + email as the staff profile's Feedback tab — so it appears there too.
  const addFeedback = async () => {
    if (!fbUser || !fbReason.trim()) return;
    setSaving(true);
    const isPraise = fbKind === "praise";
    const category = fbCategory === "none" ? null : fbCategory;
    const severity = isPraise ? "minor" : fbSeverity;
    const { data, error } = await (supabase as any)
      .from("staff_warnings")
      .insert({ user_id: fbUser, kind: fbKind, category, reason: fbReason.trim(), severity, issued_by: user?.id ?? null })
      .select("id, user_id, kind, category, reason, severity, issued_at")
      .single();
    setSaving(false);
    if (error) { toast({ title: "Couldn't add feedback", description: error.message, variant: "destructive" }); return; }
    setRows(prev => [data as FeedbackRow, ...prev]);
    const recipient = staff.find(s => s.user_id === fbUser);
    if (recipient?.email) {
      supabase.functions.invoke("send-feedback-email", {
        body: { recipientEmail: recipient.email, recipientName: recipient.display_name, kind: fbKind, category, reason: (data as FeedbackRow).reason, severity },
      }).catch(() => {});
    }
    toast({
      title: isPraise ? "Positive feedback added" : "Warning added",
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
    if (r.kind === "praise") return <Badge variant="outline" className="text-[10px] border-green-300 text-green-600">Positive</Badge>;
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
                  <th className="text-left font-medium px-3 py-2 w-[150px]">Area</th>
                  <th className="text-left font-medium px-3 py-2">Feedback</th>
                  <th className="text-left font-medium px-3 py-2 w-[110px]">Date</th>
                  <th className="w-[44px]" />
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.id} className="border-b last:border-0 hover:bg-muted/30 align-top">
                    <td className="px-3 py-2 font-medium">{nameOf(r.user_id)}</td>
                    <td className="px-3 py-2">{typeBadge(r)}</td>
                    <td className="px-3 py-2 text-muted-foreground">{r.category || "—"}</td>
                    <td className="px-3 py-2"><span className="whitespace-pre-wrap break-words">{r.reason}</span></td>
                    <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">{format(parseISO(r.issued_at), "d MMM yyyy")}</td>
                    <td className="px-2 py-2 text-right">
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

      {/* Add feedback dialog — mirrors the staff profile's Feedback composer */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Add feedback</DialogTitle></DialogHeader>
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
              <button type="button" onClick={() => setFbKind("praise")}
                className={cn("flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition", fbKind === "praise" ? "bg-green-600 text-white shadow-sm" : "text-muted-foreground hover:text-foreground")}>
                <ThumbsUp className="h-3.5 w-3.5" /> Positive
              </button>
              <button type="button" onClick={() => setFbKind("warning")}
                className={cn("flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition", fbKind === "warning" ? "bg-amber-500 text-white shadow-sm" : "text-muted-foreground hover:text-foreground")}>
                <AlertTriangle className="h-3.5 w-3.5" /> Warning
              </button>
            </div>

            <div className={cn("grid gap-2", fbKind === "praise" ? "grid-cols-1" : "grid-cols-2")}>
              <Select value={fbCategory} onValueChange={setFbCategory}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Area (optional)" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No specific area</SelectItem>
                  {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
              {fbKind === "warning" && (
                <Select value={fbSeverity} onValueChange={setFbSeverity}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>{SEVERITIES.map(s => <SelectItem key={s.value} value={s.value}>{s.label} warning</SelectItem>)}</SelectContent>
                </Select>
              )}
            </div>

            <Textarea value={fbReason} onChange={e => setFbReason(e.target.value)} rows={3}
              placeholder={fbKind === "praise" ? "What did they do well?" : "What did they fall short on?"} />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={addFeedback} disabled={saving || !fbUser || !fbReason.trim()} className={cn(fbKind === "praise" && "bg-green-600 hover:bg-green-700")}>
              {saving ? "Adding…" : fbKind === "praise" ? "Add positive feedback & email" : "Add warning & email"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
