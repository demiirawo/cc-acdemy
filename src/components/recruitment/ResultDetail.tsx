import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import {
  ArrowLeft,
  Check,
  X,
  FileText,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Download,
} from "lucide-react";
import { format } from "date-fns";
import { INTEGRITY_PENALTIES, calcIntegrityScore } from "./types";

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

export function ResultDetail({ attemptId, onBack, onNavigate }: Props) {
  const [attempt, setAttempt] = useState<any>(null);
  const [test, setTest] = useState<any>(null);
  const [answers, setAnswers] = useState<AnswerRow[]>([]);
  const [questions, setQuestions] = useState<QuestionRow[]>([]);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [snapshots, setSnapshots] = useState<SnapRow[]>([]);
  const [snapUrls, setSnapUrls] = useState<Record<string, string>>({});
  const [snapIdx, setSnapIdx] = useState(0);
  const [cvUrl, setCvUrl] = useState<string | null>(null);
  const [cvError, setCvError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [enlarged, setEnlarged] = useState<number | null>(null);
  const [siblings, setSiblings] = useState<string[]>([]);
  const [breakdownOpen, setBreakdownOpen] = useState(false);

  // Main fetch
  useEffect(() => {
    setLoading(true);
    setCvUrl(null);
    setCvError(false);
    setSnapUrls({});
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
      const [{ data: t }, { data: ans }, { data: ev }, { data: sn }, { data: sib }] =
        await Promise.all([
          supabase.from("recruitment_tests").select("*").eq("id", a.test_id).maybeSingle(),
          supabase.from("recruitment_answers").select("*").eq("attempt_id", attemptId),
          supabase
            .from("recruitment_events")
            .select("*")
            .eq("attempt_id", attemptId)
            .order("occurred_at"),
          supabase
            .from("recruitment_snapshots")
            .select("*")
            .eq("attempt_id", attemptId)
            .order("taken_at"),
          supabase
            .from("recruitment_attempts")
            .select("id")
            .eq("test_id", a.test_id)
            .order("total_score", { ascending: false })
            .order("created_at", { ascending: false }),
        ]);
      setTest(t);
      setAnswers((ans as AnswerRow[]) || []);
      setEvents((ev as EventRow[]) || []);
      setSnapshots((sn as SnapRow[]) || []);
      setSiblings(((sib as { id: string }[]) || []).map((r) => r.id));

      const qIds = (ans || []).map((r: any) => r.question_id);
      if (qIds.length) {
        const { data: qs } = await supabase
          .from("recruitment_questions")
          .select("*")
          .in("id", qIds);
        setQuestions((qs as QuestionRow[]) || []);
      } else {
        setQuestions([]);
      }
      setLoading(false);
    })();
  }, [attemptId]);

  // Snapshot signed URLs (separate effect so they stream in)
  useEffect(() => {
    if (snapshots.length === 0) return;
    let cancelled = false;
    (async () => {
      const next: Record<string, string> = {};
      await Promise.all(
        snapshots.map(async (s) => {
          const { data } = await supabase.storage
            .from("candidate-snapshots")
            .createSignedUrl(s.storage_path, 3600);
          if (data?.signedUrl) next[s.id] = data.signedUrl;
        }),
      );
      if (!cancelled) setSnapUrls(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [snapshots]);

  // CV signed URL
  useEffect(() => {
    if (!attempt?.cv_path) return;
    (async () => {
      const { data } = await supabase.storage
        .from("candidate-cvs")
        .createSignedUrl(attempt.cv_path, 3600);
      if (data?.signedUrl) setCvUrl(data.signedUrl);
    })();
  }, [attempt?.cv_path]);

  // Lightbox keyboard navigation
  useEffect(() => {
    if (enlarged === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setEnlarged(null);
      else if (e.key === "ArrowLeft") setEnlarged((i) => (i === null ? null : Math.max(0, i - 1)));
      else if (e.key === "ArrowRight")
        setEnlarged((i) => (i === null ? null : Math.min(snapshots.length - 1, i + 1)));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enlarged, snapshots.length]);

  const qById = useMemo(() => {
    const m: Record<string, QuestionRow> = {};
    questions.forEach((q) => (m[q.id] = q));
    return m;
  }, [questions]);

  const eventCounts = useMemo(() => {
    const c: Record<string, number> = {};
    events.forEach((e) => {
      if ((INTEGRITY_PENALTIES[e.event_type] ?? 0) > 0) {
        c[e.event_type] = (c[e.event_type] ?? 0) + 1;
      }
    });
    return c;
  }, [events]);

  if (loading) return <p className="text-muted-foreground">Loading...</p>;
  if (!attempt) return <p className="text-muted-foreground">Not found.</p>;

  const cappedTotal = Math.min(Number(attempt.total_score), Number(attempt.max_score));
  const scorePct =
    attempt.max_score > 0
      ? Math.min(100, Math.round((cappedTotal / Number(attempt.max_score)) * 100))
      : 0;

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {(() => {
        const idx = siblings.indexOf(attemptId);
        const prevId = idx > 0 ? siblings[idx - 1] : null;
        const nextId = idx >= 0 && idx < siblings.length - 1 ? siblings[idx + 1] : null;
        return (
          <div className="flex items-center justify-between gap-3">
            <Button variant="ghost" onClick={onBack}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold">{attempt.candidate_name}</h1>
              {idx >= 0 && siblings.length > 1 && (
                <span className="text-xs text-muted-foreground">
                  ({idx + 1} of {siblings.length})
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={!prevId}
                onClick={() => prevId && onNavigate?.(prevId)}
              >
                <ChevronLeft className="h-4 w-4 mr-1" />
                Prev
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={!nextId}
                onClick={() => nextId && onNavigate?.(nextId)}
              >
                Next
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </div>
        );
      })()}

      <div className="space-y-4">
          <Card className="p-6">
            <h2 className="font-semibold mb-3">Candidate</h2>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <span className="text-muted-foreground">Name:</span> {attempt.candidate_name}
              </div>
              <div>
                <span className="text-muted-foreground">Email:</span> {attempt.email}
              </div>
              <div>
                <span className="text-muted-foreground">Phone:</span> {attempt.phone || "—"}
              </div>
              <div>
                <span className="text-muted-foreground">Submitted:</span>{" "}
                {attempt.submitted_at
                  ? format(new Date(attempt.submitted_at), "d MMM yyyy HH:mm")
                  : "—"}
              </div>
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
                <Badge
                  className="mt-2"
                  variant={scorePct >= test.pass_threshold ? "default" : "secondary"}
                >
                  {scorePct >= test.pass_threshold ? "Passed" : "Below threshold"}
                </Badge>
              )}
            </Card>
            <Card className="p-6">
              <p className="text-xs text-muted-foreground uppercase">Integrity Score</p>
              <p className="text-4xl font-bold mt-1">{calcIntegrityScore(events)}</p>
              <p className="text-xs text-muted-foreground mt-1">Lower means more flags</p>
            </Card>
          </div>

          <Card className="p-6">
            <h2 className="font-semibold mb-3">Anti-cheat timeline ({events.filter((e) => (INTEGRITY_PENALTIES[e.event_type] ?? 0) > 0).length})</h2>
            {events.filter((e) => (INTEGRITY_PENALTIES[e.event_type] ?? 0) > 0).length === 0 ? (
              <p className="text-sm text-muted-foreground">No flags raised. ✅</p>
            ) : (
              <div className="space-y-1 text-xs max-h-80 overflow-y-auto">
                {events.filter((e) => (INTEGRITY_PENALTIES[e.event_type] ?? 0) > 0).map((e) => {
                  const penalty = INTEGRITY_PENALTIES[e.event_type] ?? 0;
                  return (
                    <div
                      key={e.id}
                      className="flex items-center justify-between gap-3 border-b py-1.5 last:border-0"
                    >
                      <span className="text-muted-foreground font-mono">
                        {format(new Date(e.occurred_at), "HH:mm:ss")}
                      </span>
                      <span className="capitalize flex-1">{e.event_type.replace(/_/g, " ")}</span>
                      <span className="font-mono text-destructive">−{penalty}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>

          <Card className="p-6">
            <button
              type="button"
              onClick={() => setBreakdownOpen((v) => !v)}
              className="w-full flex items-center justify-between gap-2 text-left"
              aria-expanded={breakdownOpen}
            >
              <h2 className="font-semibold">Question breakdown ({answers.length})</h2>
              <ChevronDown
                className={`h-4 w-4 text-muted-foreground transition-transform ${
                  breakdownOpen ? "rotate-180" : ""
                }`}
              />
            </button>
            {breakdownOpen && (
              <div className="mt-3">
                {answers.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No answers were recorded.</p>
                ) : (
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
                                    isCorrect
                                      ? "text-green-700"
                                      : isPicked
                                      ? "text-destructive"
                                      : "text-muted-foreground"
                                  }`}
                                >
                                  <span>{isPicked ? "●" : "○"}</span>
                                  <span>{opt}</span>
                                  {isCorrect && (
                                    <span className="text-[10px] uppercase">correct</span>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </Card>

          <Card className="p-6">
            <h2 className="font-semibold mb-3">Webcam snapshots ({snapshots.length})</h2>
            {snapshots.length === 0 ? (
              <p className="text-sm text-muted-foreground">No snapshots captured.</p>
            ) : (() => {
              const safeIdx = Math.min(snapIdx, snapshots.length - 1);
              const current = snapshots[safeIdx];
              return (
                <div className="space-y-4">
                  <button
                    type="button"
                    onClick={() => setEnlarged(safeIdx)}
                    className="block w-full bg-muted rounded overflow-hidden border hover:ring-2 hover:ring-primary"
                  >
                    {snapUrls[current.id] ? (
                      <img
                        src={snapUrls[current.id]}
                        alt={`snapshot ${safeIdx + 1}`}
                        className="w-full max-h-[480px] object-contain bg-black/5"
                      />
                    ) : (
                      <div className="w-full h-[360px] bg-muted animate-pulse" />
                    )}
                  </button>
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>
                      {safeIdx + 1} / {snapshots.length}
                    </span>
                    <span>{format(new Date(current.taken_at), "HH:mm:ss")}</span>
                  </div>
                  {snapshots.length > 1 && (
                    <Slider
                      min={0}
                      max={snapshots.length - 1}
                      step={1}
                      value={[safeIdx]}
                      onValueChange={(v) => setSnapIdx(v[0] ?? 0)}
                    />
                  )}
                </div>
              );
            })()}
          </Card>

          {/* CV preview at bottom, full width */}
          <Card className="p-4">
            <div className="flex items-center justify-between mb-3 gap-2">
              <h2 className="font-semibold flex items-center gap-2">
                <FileText className="h-4 w-4" />
                CV
              </h2>
              {cvUrl && (
                <div className="flex items-center gap-1">
                  <Button size="sm" variant="outline" asChild>
                    <a href={cvUrl} target="_blank" rel="noreferrer">
                      <ExternalLink className="h-3.5 w-3.5 mr-1" />
                      Open
                    </a>
                  </Button>
                  <Button size="sm" variant="outline" asChild>
                    <a href={cvUrl} download="cv.pdf">
                      <Download className="h-3.5 w-3.5 mr-1" />
                      Download
                    </a>
                  </Button>
                </div>
              )}
            </div>
            {!attempt.cv_path ? (
              <p className="text-sm text-muted-foreground">No CV uploaded.</p>
            ) : !cvUrl ? (
              <p className="text-sm text-muted-foreground">Loading CV…</p>
            ) : cvError ? (
              <div className="text-sm text-muted-foreground space-y-2">
                <p>Inline preview unavailable in this browser.</p>
                <a className="underline" href={cvUrl} target="_blank" rel="noreferrer">
                  Open the CV in a new tab
                </a>
              </div>
            ) : (
              <iframe
                src={`${cvUrl}#toolbar=0&navpanes=0`}
                title="CV"
                className="w-full h-[900px] border rounded"
                onError={() => setCvError(true)}
              />
            )}
          </Card>
      </div>

      {enlarged !== null && snapshots[enlarged] && (
        <div
          className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4"
          onClick={() => setEnlarged(null)}
        >
          <button
            onClick={(e) => {
              e.stopPropagation();
              setEnlarged((i) => (i === null ? null : Math.max(0, i - 1)));
            }}
            disabled={enlarged === 0}
            className="absolute left-4 top-1/2 -translate-y-1/2 text-white p-2 disabled:opacity-30"
          >
            <ChevronLeft className="h-8 w-8" />
          </button>
          <img
            src={snapUrls[snapshots[enlarged].id]}
            alt="snap"
            className="max-w-full max-h-full"
            onClick={(e) => e.stopPropagation()}
          />
          <button
            onClick={(e) => {
              e.stopPropagation();
              setEnlarged((i) =>
                i === null ? null : Math.min(snapshots.length - 1, i + 1),
              );
            }}
            disabled={enlarged === snapshots.length - 1}
            className="absolute right-4 top-1/2 -translate-y-1/2 text-white p-2 disabled:opacity-30"
          >
            <ChevronRight className="h-8 w-8" />
          </button>
        </div>
      )}
    </div>
  );
}
