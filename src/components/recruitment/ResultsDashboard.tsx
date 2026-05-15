import { useEffect, useMemo, useState } from "react";
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
import { ArrowLeft, ExternalLink, RefreshCw, Trash2 } from "lucide-react";
import { format } from "date-fns";
import type { RecruitmentAttempt, RecruitmentTest } from "./types";

interface Props {
  testId: string;
  onBack: () => void;
  onOpen: (attemptId: string) => void;
}

const ABANDON_AFTER_MS = 30 * 60 * 1000; // 30 min

export function ResultsDashboard({ testId, onBack, onOpen }: Props) {
  const [test, setTest] = useState<RecruitmentTest | null>(null);
  const [attempts, setAttempts] = useState<RecruitmentAttempt[]>([]);
  const [questionMaxScore, setQuestionMaxScore] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const { toast } = useToast();

  const load = async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    const [
      { data: t, error: testError },
      { data: a, error: attemptsError },
      { data: qs },
    ] = await Promise.all([
      supabase.from("recruitment_tests").select("*").eq("id", testId).maybeSingle(),
      supabase
        .from("recruitment_attempts")
        .select("*")
        .eq("test_id", testId)
        .order("total_score", { ascending: false })
        .order("created_at", { ascending: false }),
      supabase.from("recruitment_questions").select("weight").eq("test_id", testId),
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
    setQuestionMaxScore(
      (qs ?? []).reduce((s: number, q: any) => s + Number(q.weight ?? 0), 0),
    );
    setLoading(false);
    setRefreshing(false);
  };

  useEffect(() => {
    load();
    const id = window.setInterval(() => load(true), 30000);
    return () => clearInterval(id);
  }, [testId]);

  const effectiveMax = (a: RecruitmentAttempt) =>
    Number(a.max_score) > 0 ? Number(a.max_score) : questionMaxScore;

  const pct = (a: RecruitmentAttempt) => {
    const max = effectiveMax(a);
    return max > 0 ? Math.round((Number(a.total_score) / max) * 100) : 0;
  };

  const statusOf = (a: RecruitmentAttempt): {
    label: string;
    variant: "default" | "secondary" | "outline" | "destructive";
  } => {
    if (a.status === "submitted") return { label: "Submitted", variant: "default" };
    if (a.status === "abandoned") return { label: "Abandoned", variant: "destructive" };
    // In progress: stale = abandoned
    const startedAt = new Date(a.started_at).getTime();
    if (Date.now() - startedAt > ABANDON_AFTER_MS) {
      return { label: "Abandoned", variant: "destructive" };
    }
    return { label: "In progress", variant: "secondary" };
  };

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

  const sortedRows = useMemo(() => attempts, [attempts]);

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-3">
        <Button variant="ghost" onClick={onBack}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>
        {test && <h1 className="text-xl font-bold text-center flex-1">{test.title} — Results</h1>}
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => load(true)} disabled={refreshing || loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button
            variant="outline"
            onClick={() => setConfirmDeleteOpen(true)}
            disabled={loading || deleting || attempts.length === 0}
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Delete all
          </Button>
        </div>
      </div>

      {loading ? (
        <p className="text-muted-foreground">Loading...</p>
      ) : sortedRows.length === 0 ? (
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
              {sortedRows.map((a, i) => {
                const score = pct(a);
                const passed = test && a.status === "submitted" && score >= test.pass_threshold;
                const st = statusOf(a);
                const max = effectiveMax(a);
                return (
                  <tr
                    key={a.id}
                    className="border-t hover:bg-muted/30 cursor-pointer"
                    onClick={() => onOpen(a.id)}
                  >
                    <td className="px-4 py-3 font-semibold">{i + 1}</td>
                    <td className="px-4 py-3 font-medium">{a.candidate_name}</td>
                    <td className="px-4 py-3 text-muted-foreground">{a.email}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Badge variant={passed ? "default" : "secondary"}>{score}%</Badge>
                        <span className="text-xs text-muted-foreground">
                          {Number(a.total_score)}/{max || "—"}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={a.integrity_score >= 80 ? "outline" : "destructive"}>
                        {a.integrity_score}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={st.variant}>{st.label}</Badge>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {a.submitted_at ? (
                        format(new Date(a.submitted_at), "d MMM yyyy HH:mm")
                      ) : a.started_at ? (
                        <span className="italic">Started {format(new Date(a.started_at), "d MMM yyyy HH:mm")}</span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpen(a.id);
                        }}
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </Button>
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
              This will permanently remove all candidate results for this test, including
              submitted and in-progress attempts.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                void deleteAllEntries();
              }}
              disabled={deleting}
            >
              {deleting ? "Deleting..." : "Delete all"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
