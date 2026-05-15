import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, ExternalLink } from "lucide-react";
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

  useEffect(() => {
    (async () => {
      const [{ data: t }, { data: a }] = await Promise.all([
        supabase.from("recruitment_tests").select("*").eq("id", testId).maybeSingle(),
        supabase
          .from("recruitment_attempts")
          .select("*")
          .eq("test_id", testId)
          .order("total_score", { ascending: false }),
      ]);
      setTest((t as RecruitmentTest) || null);
      setAttempts((a as RecruitmentAttempt[]) || []);
      setLoading(false);
    })();
  }, [testId]);

  const pct = (a: RecruitmentAttempt) =>
    a.max_score > 0 ? Math.round((Number(a.total_score) / Number(a.max_score)) * 100) : 0;

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={onBack}><ArrowLeft className="h-4 w-4 mr-2" />Back</Button>
        {test && <h1 className="text-xl font-bold">{test.title} — Results</h1>}
        <div className="w-20" />
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
    </div>
  );
}
