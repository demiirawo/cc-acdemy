import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, ArrowRight, Check, X, FileText, ExternalLink, ChevronLeft, ChevronRight } from "lucide-react";
import { format } from "date-fns";
import { INTEGRITY_PENALTIES } from "./types";

interface Props {
  attemptId: string;
  onBack: () => void;
  onNavigate?: (attemptId: string) => void;
}

interface AnswerRow {
  id: string;
  question_id: string;
  answer: number[];
  is_correct: boolean;
  points_awarded: number;
  time_taken_ms: number | null;
}
interface QuestionRow {
  id: string;
  question_text: string;
  question_type: string;
  options: string[];
  correct_answers: number[];
  weight: number;
}
interface EventRow {
  id: string;
  event_type: string;
  occurred_at: string;
  metadata: any;
}
interface SnapRow {
  id: string;
  storage_path: string;
  taken_at: string;
}

export function ResultDetail({ attemptId, onBack }: Props) {
  const [attempt, setAttempt] = useState<any>(null);
  const [test, setTest] = useState<any>(null);
  const [answers, setAnswers] = useState<AnswerRow[]>([]);
  const [questions, setQuestions] = useState<QuestionRow[]>([]);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [snapshots, setSnapshots] = useState<SnapRow[]>([]);
  const [snapUrls, setSnapUrls] = useState<Record<string, string>>({});
  const [cvUrl, setCvUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [enlarged, setEnlarged] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data: a } = await supabase
        .from("recruitment_attempts")
        .select("*")
        .eq("id", attemptId)
        .maybeSingle();
      if (!a) {
        setLoading(false);
        return;
      }
      setAttempt(a);
      const [{ data: t }, { data: ans }, { data: ev }, { data: sn }] = await Promise.all([
        supabase.from("recruitment_tests").select("*").eq("id", a.test_id).maybeSingle(),
        supabase.from("recruitment_answers").select("*").eq("attempt_id", attemptId),
        supabase.from("recruitment_events").select("*").eq("attempt_id", attemptId).order("occurred_at"),
        supabase.from("recruitment_snapshots").select("*").eq("attempt_id", attemptId).order("taken_at"),
      ]);
      setTest(t);
      setAnswers((ans as AnswerRow[]) || []);
      setEvents((ev as EventRow[]) || []);
      setSnapshots((sn as SnapRow[]) || []);

      const qIds = (ans || []).map((r: any) => r.question_id);
      if (qIds.length) {
        const { data: qs } = await supabase
          .from("recruitment_questions")
          .select("*")
          .in("id", qIds);
        setQuestions((qs as QuestionRow[]) || []);
      }

      // Signed URLs for snapshots and CV
      if (sn && sn.length) {
        const urls: Record<string, string> = {};
        await Promise.all(
          (sn as SnapRow[]).map(async (s) => {
            const { data } = await supabase.storage
              .from("candidate-snapshots")
              .createSignedUrl(s.storage_path, 3600);
            if (data?.signedUrl) urls[s.id] = data.signedUrl;
          })
        );
        setSnapUrls(urls);
      }
      if (a.cv_path) {
        const { data: cv } = await supabase.storage
          .from("candidate-cvs")
          .createSignedUrl(a.cv_path, 3600);
        if (cv?.signedUrl) setCvUrl(cv.signedUrl);
      }
      setLoading(false);
    })();
  }, [attemptId]);

  const qById = useMemo(() => {
    const m: Record<string, QuestionRow> = {};
    questions.forEach((q) => (m[q.id] = q));
    return m;
  }, [questions]);

  const eventCounts = useMemo(() => {
    const c: Record<string, number> = {};
    events.forEach((e) => (c[e.event_type] = (c[e.event_type] ?? 0) + 1));
    return c;
  }, [events]);

  if (loading) return <p className="text-muted-foreground">Loading...</p>;
  if (!attempt) return <p className="text-muted-foreground">Not found.</p>;

  const scorePct = attempt.max_score > 0 ? Math.round((Number(attempt.total_score) / Number(attempt.max_score)) * 100) : 0;

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={onBack}><ArrowLeft className="h-4 w-4 mr-2" />Back</Button>
        <h1 className="text-xl font-bold">{attempt.candidate_name}</h1>
        <div className="w-20" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: scores + breakdown */}
        <div className="lg:col-span-2 space-y-4">
          <Card className="p-6">
            <h2 className="font-semibold mb-3">Candidate</h2>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><span className="text-muted-foreground">Name:</span> {attempt.candidate_name}</div>
              <div><span className="text-muted-foreground">Email:</span> {attempt.email}</div>
              <div><span className="text-muted-foreground">Phone:</span> {attempt.phone || "—"}</div>
              <div><span className="text-muted-foreground">Submitted:</span> {attempt.submitted_at ? format(new Date(attempt.submitted_at), "d MMM yyyy HH:mm") : "—"}</div>
            </div>
          </Card>

          <div className="grid grid-cols-2 gap-4">
            <Card className="p-6">
              <p className="text-xs text-muted-foreground uppercase">Test Score</p>
              <p className="text-4xl font-bold mt-1">{scorePct}%</p>
              <p className="text-xs text-muted-foreground mt-1">
                {Number(attempt.total_score)} / {Number(attempt.max_score)} points
              </p>
              {test && (
                <Badge className="mt-2" variant={scorePct >= test.pass_threshold ? "default" : "secondary"}>
                  {scorePct >= test.pass_threshold ? "Passed" : "Below threshold"}
                </Badge>
              )}
            </Card>
            <Card className="p-6">
              <p className="text-xs text-muted-foreground uppercase">Integrity Score</p>
              <p className="text-4xl font-bold mt-1">{attempt.integrity_score}</p>
              <p className="text-xs text-muted-foreground mt-1">Lower means more flags</p>
            </Card>
          </div>

          <Card className="p-6">
            <h2 className="font-semibold mb-3">Anti-cheat flags</h2>
            {Object.keys(eventCounts).length === 0 ? (
              <p className="text-sm text-muted-foreground">No flags raised. ✅</p>
            ) : (
              <div className="grid grid-cols-2 gap-2 text-sm">
                {Object.entries(eventCounts).map(([k, n]) => (
                  <div key={k} className="flex justify-between border rounded px-3 py-2">
                    <span className="capitalize">{k.replace(/_/g, " ")}</span>
                    <span className="font-mono">
                      {n}× <span className="text-muted-foreground">(−{(INTEGRITY_PENALTIES[k] ?? 0) * n})</span>
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card className="p-6">
            <h2 className="font-semibold mb-3">Question breakdown</h2>
            <div className="space-y-3">
              {answers.map((a) => {
                const q = qById[a.question_id];
                if (!q) return null;
                return (
                  <div key={a.id} className="border rounded p-3">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <p className="text-sm font-medium flex-1">{q.question_text}</p>
                      {a.is_correct ? (
                        <Check className="h-4 w-4 text-green-600 shrink-0" />
                      ) : (
                        <X className="h-4 w-4 text-destructive shrink-0" />
                      )}
                    </div>
                    <div className="text-xs space-y-1">
                      {q.options.map((opt, i) => {
                        const isCorrect = q.correct_answers.includes(i);
                        const isPicked = (a.answer as number[]).includes(i);
                        return (
                          <div
                            key={i}
                            className={`flex items-center gap-2 ${
                              isCorrect ? "text-green-700" : isPicked ? "text-destructive" : "text-muted-foreground"
                            }`}
                          >
                            <span>{isPicked ? "●" : "○"}</span>
                            <span>{opt}</span>
                            {isCorrect && <span className="text-[10px] uppercase">correct</span>}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>

          <Card className="p-6">
            <h2 className="font-semibold mb-3">Webcam snapshots ({snapshots.length})</h2>
            {snapshots.length === 0 ? (
              <p className="text-sm text-muted-foreground">No snapshots captured.</p>
            ) : (
              <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                {snapshots.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => setEnlarged(snapUrls[s.id])}
                    className="border rounded overflow-hidden hover:ring-2 hover:ring-primary"
                  >
                    {snapUrls[s.id] ? (
                      <img src={snapUrls[s.id]} alt="snap" className="w-full h-24 object-cover" />
                    ) : (
                      <div className="w-full h-24 bg-muted" />
                    )}
                    <p className="text-[10px] text-muted-foreground p-1 truncate">
                      {format(new Date(s.taken_at), "HH:mm:ss")}
                    </p>
                  </button>
                ))}
              </div>
            )}
          </Card>
        </div>

        {/* Right: CV preview */}
        <div className="space-y-4">
          <Card className="p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold flex items-center gap-2"><FileText className="h-4 w-4" />CV</h2>
              {cvUrl && (
                <Button size="sm" variant="outline" asChild>
                  <a href={cvUrl} target="_blank" rel="noreferrer">
                    <ExternalLink className="h-3.5 w-3.5 mr-1" />Open
                  </a>
                </Button>
              )}
            </div>
            {cvUrl ? (
              <object data={cvUrl} type="application/pdf" className="w-full h-[800px] border rounded">
                <p className="p-4 text-sm text-muted-foreground">
                  PDF preview unavailable. <a className="underline" href={cvUrl} target="_blank" rel="noreferrer">Open in new tab</a>
                </p>
              </object>
            ) : (
              <p className="text-sm text-muted-foreground">No CV uploaded.</p>
            )}
          </Card>
        </div>
      </div>

      {enlarged && (
        <div
          className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4"
          onClick={() => setEnlarged(null)}
        >
          <img src={enlarged} alt="snap" className="max-w-full max-h-full" />
        </div>
      )}
    </div>
  );
}
