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
  ThumbsDown,
  CalendarCheck,
  Trophy,
  Maximize2,
} from "lucide-react";
import { format } from "date-fns";
import { INTEGRITY_PENALTIES, calcIntegrityScore } from "./types";
import { useToast } from "@/hooks/use-toast";

type PipelineStage = "rejected" | "interview" | "success";

const STAGE_META: Record<PipelineStage, { label: string; description: string; emails: boolean; tone: string }> = {
  rejected: {
    label: "Rejected",
    description: "Sends a polite rejection email to the candidate.",
    emails: true,
    tone: "destructive",
  },
  interview: {
    label: "Interview",
    description: "Sends an email with the Google Calendar scheduling link for the interview.",
    emails: true,
    tone: "default",
  },
  success: {
    label: "Success",
    description: "Marks the candidate as successful. No email is sent.",
    emails: false,
    tone: "default",
  },
};

interface Props {
  attemptId: string;
  onBack: () => void;
  onNavigate?: (attemptId: string) => void;
  siblingIds?: string[];
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

export function ResultDetail({ attemptId, onBack, onNavigate, siblingIds }: Props) {
  const [attempt, setAttempt] = useState<any>(null);
  const [test, setTest] = useState<any>(null);
  const [answers, setAnswers] = useState<AnswerRow[]>([]);
  const [questions, setQuestions] = useState<QuestionRow[]>([]);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [snapshots, setSnapshots] = useState<SnapRow[]>([]);
  const [snapUrls, setSnapUrls] = useState<Record<string, string>>({});
  const [snapIdx, setSnapIdx] = useState(0);
  const [cvUrl, setCvUrl] = useState<string | null>(null);
  const [cvSignedUrl, setCvSignedUrl] = useState<string | null>(null);
  const [cvError, setCvError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [enlarged, setEnlarged] = useState<number | null>(null);
  const [cvExpanded, setCvExpanded] = useState(false);
  const [siblings, setSiblings] = useState<string[]>([]);
  const [breakdownOpen, setBreakdownOpen] = useState(false);
  const [stageSaving, setStageSaving] = useState(false);
  const { toast } = useToast();

  const currentStage: PipelineStage | null =
    attempt && ["rejected", "interview", "success"].includes(attempt.status)
      ? (attempt.status as PipelineStage)
      : null;

  const applyStage = async (stage: PipelineStage) => {
    setStageSaving(true);
    try {
      const { data, error } = await supabase.functions.invoke("recruitment-set-stage", {
        body: { attempt_id: attemptId, stage },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      setAttempt((a: any) => ({ ...a, status: stage }));
      toast({
        title: `Marked as ${STAGE_META[stage].label}`,
        description: STAGE_META[stage].emails
          ? "Status updated and email sent to the candidate."
          : "Status updated.",
      });
      
    } catch (e: any) {
      toast({
        title: "Could not update stage",
        description: e?.message ?? String(e),
        variant: "destructive",
      });
    } finally {
      setStageSaving(false);
    }
  };

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
      const sibFetch = siblingIds && siblingIds.length > 0
        ? Promise.resolve({ data: siblingIds.map((id) => ({ id })) })
        : supabase
            .from("recruitment_attempts")
            .select("id")
            .eq("test_id", a.test_id)
            .order("total_score", { ascending: false })
            .order("created_at", { ascending: false });
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
          sibFetch,
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
  }, [attemptId, siblingIds]);

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

  // CV signed URL — download as blob with correct MIME so Safari previews inline
  useEffect(() => {
    if (!attempt?.cv_path) return;
    let revoked: string | null = null;
    let cancelled = false;
    (async () => {
      const { data } = await supabase.storage
        .from("candidate-cvs")
        .createSignedUrl(attempt.cv_path, 3600);
      if (!data?.signedUrl || cancelled) return;
      setCvSignedUrl(data.signedUrl);
      try {
        const res = await fetch(data.signedUrl);
        const buf = await res.arrayBuffer();
        const ext = (attempt.cv_path.split(".").pop() || "").toLowerCase();
        const mime =
          ext === "pdf" ? "application/pdf"
          : ext === "doc" ? "application/msword"
          : ext === "docx" ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          : ext === "rtf" ? "application/rtf"
          : ext === "odt" ? "application/vnd.oasis.opendocument.text"
          : ext === "xls" ? "application/vnd.ms-excel"
          : ext === "xlsx" ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          : ext === "ppt" ? "application/vnd.ms-powerpoint"
          : ext === "pptx" ? "application/vnd.openxmlformats-officedocument.presentationml.presentation"
          : res.headers.get("content-type") || "application/octet-stream";
        const url = URL.createObjectURL(new Blob([buf], { type: mime }));
        revoked = url;
        if (!cancelled) setCvUrl(url);
      } catch {
        if (!cancelled) setCvUrl(data.signedUrl);
      }
    })();
    return () => {
      cancelled = true;
      if (revoked) URL.revokeObjectURL(revoked);
    };
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

  const idx = siblings.indexOf(attemptId);
  const prevId = idx > 0 ? siblings[idx - 1] : null;
  const nextId = idx >= 0 && idx < siblings.length - 1 ? siblings[idx + 1] : null;

  return (
    <div className="max-w-[1600px] mx-auto space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={onBack}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <div className="flex items-baseline gap-2">
            <h1 className="text-xl font-bold">{attempt.candidate_name}</h1>
            {idx >= 0 && siblings.length > 1 && (
              <span className="text-xs text-muted-foreground">
                ({idx + 1} of {siblings.length})
              </span>
            )}
            {currentStage && (
              <Badge
                variant={currentStage === "rejected" ? "destructive" : "default"}
              >
                {STAGE_META[currentStage].label}
              </Badge>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant={currentStage === "rejected" ? "destructive" : "outline"}
            size="sm"
            onClick={() => applyStage("rejected")}
            disabled={stageSaving}
          >
            <ThumbsDown className="h-4 w-4 mr-1.5" />
            Reject
          </Button>
          <Button
            variant={currentStage === "interview" ? "default" : "outline"}
            size="sm"
            onClick={() => applyStage("interview")}
            disabled={stageSaving}
          >
            <CalendarCheck className="h-4 w-4 mr-1.5" />
            Interview
          </Button>
          <Button
            variant={currentStage === "success" ? "default" : "outline"}
            size="sm"
            onClick={() => applyStage("success")}
            disabled={stageSaving}
          >
            <Trophy className="h-4 w-4 mr-1.5" />
            Success
          </Button>
          <div className="w-px h-6 bg-border mx-1" />
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

      {/* Compact summary strip: candidate info + scores in one row */}
      <Card className="p-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-center">
          <div className="md:col-span-2 grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
            <div className="truncate">
              <span className="text-muted-foreground">Name:</span> {attempt.candidate_name}
            </div>
            <div className="truncate">
              <span className="text-muted-foreground">Email:</span>{" "}
              <a className="underline" href={`mailto:${attempt.email}`}>{attempt.email}</a>
            </div>
            <div className="truncate">
              <span className="text-muted-foreground">Phone:</span> {attempt.phone || "—"}
            </div>
            <div className="truncate">
              <span className="text-muted-foreground">Submitted:</span>{" "}
              {attempt.submitted_at
                ? format(new Date(attempt.submitted_at), "d MMM yyyy HH:mm")
                : "—"}
            </div>
          </div>
          <div className="border-l pl-4">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Test Score</p>
            <div className="flex items-baseline gap-2 mt-0.5">
              <p className="text-2xl font-bold leading-none">{scorePct}%</p>
              {test && (
                <Badge
                  variant={scorePct >= test.pass_threshold ? "default" : "secondary"}
                  className="text-[10px]"
                >
                  {scorePct >= test.pass_threshold ? "Completed" : "Below"}
                </Badge>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">
              {Number(attempt.total_score)} / {Number(attempt.max_score)} pts
            </p>
          </div>
          <div className="border-l pl-4">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Integrity</p>
            <p className="text-2xl font-bold leading-none mt-0.5">{calcIntegrityScore(events)}</p>
            <p className="text-[11px] text-muted-foreground mt-1">Lower = more flags</p>
          </div>
        </div>
      </Card>

      {/* Two-column main grid: left detail, right CV */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="space-y-4">
          <Card className="p-4">
            <h2 className="font-semibold mb-2 text-sm">Anti-cheat timeline ({events.filter((e) => (INTEGRITY_PENALTIES[e.event_type] ?? 0) > 0).length})</h2>
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
        </div>

        <div className="space-y-4">
          <Card className="p-4">
            <h2 className="font-semibold mb-3 text-sm">Webcam snapshots ({snapshots.length})</h2>
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
              {(cvSignedUrl || cvUrl) && (
                <div className="flex items-center gap-1">
                  <Button size="sm" variant="outline" asChild>
                    <a href={cvSignedUrl || cvUrl!} target="_blank" rel="noreferrer">
                      <ExternalLink className="h-3.5 w-3.5 mr-1" />
                      Open
                    </a>
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setCvExpanded(true)}>
                    <Maximize2 className="h-3.5 w-3.5 mr-1" />
                    Expand
                  </Button>
                  <Button size="sm" variant="outline" asChild>
                    <a href={cvSignedUrl || cvUrl!} download="cv.pdf">
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
                src={
                  /\.(docx?|rtf|odt|pptx?|xlsx?)$/i.test(attempt.cv_path || "") && cvSignedUrl
                    ? `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(cvSignedUrl)}`
                    : `${cvUrl}#toolbar=0&navpanes=0`
                }
                title="CV"
                className="w-full h-[640px] border rounded bg-white"
                onError={() => setCvError(true)}
              />
            )}
          </Card>
        </div>
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


      {cvExpanded && cvUrl && (
        <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm flex flex-col p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold flex items-center gap-2">
              <FileText className="h-4 w-4" />
              {attempt.candidate_name} — CV
            </h2>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" asChild>
                <a href={cvSignedUrl || cvUrl} target="_blank" rel="noreferrer">
                  <ExternalLink className="h-3.5 w-3.5 mr-1" />
                  Open in new tab
                </a>
              </Button>
              <Button size="sm" variant="outline" onClick={() => setCvExpanded(false)}>
                <X className="h-3.5 w-3.5 mr-1" />
                Close
              </Button>
            </div>
          </div>
          <iframe
            src={
              /\.(docx?|rtf|odt|pptx?|xlsx?)$/i.test(attempt.cv_path || "") && cvSignedUrl
                ? `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(cvSignedUrl)}`
                : `${cvUrl}#toolbar=0&navpanes=0`
            }
            title="CV expanded"
            className="flex-1 w-full border rounded bg-white"
          />
        </div>
      )}
    </div>
  );
}
