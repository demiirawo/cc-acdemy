import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, ExternalLink, Trash2 } from "lucide-react";
import { format } from "date-fns";
import type { RecruitmentAttempt, RecruitmentTest } from "./types";

interface Props {
  testId: string;
  onBack: () => void;
  onOpen: (attemptId: string) => void;
}

export function ResultsDashboard({ testId, onBack, onOpen }: Props) {
  const [test, setTest] = useState<RecruitmentTest | null>(null);
  const [attempts, setAttempts] = useState<RecruitmentAttempt[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const { toast } = useToast();

  const load = async () => {
    setLoading(true);
    const [{ data: t, error: testError }, { data: a, error: attemptsError }] = await Promise.all([
      supabase.from("recruitment_tests").select("*").eq("id", testId).maybeSingle(),
      supabase
        .from("recruitment_attempts")
        .select("*")
        .eq("test_id", testId)
        .order("total_score", { ascending: false }),
    ]);

    if (testError || attemptsError) {
      toast({
        title: "Could not load results",
        description: testError?.message || attemptsError?.message,
        variant: "destructive",
      });
    }

    setTest((t as RecruitmentTest) || null);
    setAttempts((a as RecruitmentAttempt[]) || []);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, [testId]);

  const pct = (a: RecruitmentAttempt) =>
    a.max_score > 0 ? Math.round((Number(a.total_score) / Number(a.max_score)) * 100) : 0;

  const deleteAllEntries = async () => {
    setDeleting(true);
    const { error } = await supabase.from("recruitment_attempts").delete().eq("test_id", testId);

    if (error) {
      toast({ title: "Delete failed", description: error.message, variant: "destructive" });
      setDeleting(false);
      return;
    }

    setAttempts([]);
    setConfirmDeleteOpen(false);
    setDeleting(false);
    toast({ title: "All entries deleted" });
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-3">
        <Button variant="ghost" onClick={onBack}><ArrowLeft className="h-4 w-4 mr-2" />Back</Button>
        {test && <h1 className="text-xl font-bold text-center flex-1">{test.title} — Results</h1>}
        <Button
          variant="outline"
          onClick={() => setConfirmDeleteOpen(true)}
          disabled={loading || deleting || attempts.length === 0}
        >
          <Trash2 className="h-4 w-4 mr-2" />Delete all
        </Button>
      </div>

      {loading ? (
        <p className="text-muted-foreground">Loading...</p>
      ) : attempts.length === 0 ? (
        <Card className="p-12 text-center text-muted-foreground">No candidate submissions yet.</Card>
      ) : (
        <Card className="overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr className="text-left">
                <th className="px-4 py-3">Rank</th>
                <th className="px-4 py-3">Candidate</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Score</th>
                <th className="px-4 py-3">Integrity</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Submitted</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {attempts.map((a, i) => {
                const score = pct(a);
                const passed = test && score >= test.pass_threshold;
                return (
                  <tr key={a.id} className="border-t hover:bg-muted/30 cursor-pointer" onClick={() => onOpen(a.id)}>
                    <td className="px-4 py-3 font-semibold">{i + 1}</td>
                    <td className="px-4 py-3 font-medium">{a.candidate_name}</td>
                    <td className="px-4 py-3 text-muted-foreground">{a.email}</td>
                    <td className="px-4 py-3">
                      <Badge variant={passed ? "default" : "secondary"}>{score}%</Badge>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={a.integrity_score >= 80 ? "outline" : "destructive"}>
                        {a.integrity_score}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant="outline">{a.status}</Badge>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {a.submitted_at ? format(new Date(a.submitted_at), "d MMM yyyy HH:mm") : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <Button size="sm" variant="ghost"><ExternalLink className="h-3.5 w-3.5" /></Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}

      <AlertDialog open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete all entries?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove all candidate results for this test, including submitted and in-progress attempts.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={deleteAllEntries} disabled={deleting}>
              {deleting ? "Deleting..." : "Delete all"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
