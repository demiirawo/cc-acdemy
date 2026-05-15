import { useEffect, useRef, useState, useCallback } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { Loader2, ShieldCheck, Camera, Maximize, AlertCircle } from "lucide-react";
import { INTEGRITY_PENALTIES } from "./types";
import type { RecruitmentTest, RecruitmentQuestion } from "./types";

type Stage = "loading" | "intro" | "form" | "permissions" | "test" | "done" | "blocked";

const SNAPSHOT_INTERVAL_MS = 15000;
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function CandidateApplyPage() {
  const { slug } = useParams();
  const { toast } = useToast();
  const [stage, setStage] = useState<Stage>("loading");
  const [test, setTest] = useState<RecruitmentTest | null>(null);
  const [questions, setQuestions] = useState<RecruitmentQuestion[]>([]);
  const [form, setForm] = useState({ name: "", email: "", phone: "" });
  const [cvFile, setCvFile] = useState<File | null>(null);
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [qIndex, setQIndex] = useState(0);
  const [selected, setSelected] = useState<number[]>([]);
  const [timeLeft, setTimeLeft] = useState(20);
  const [submitting, setSubmitting] = useState(false);
  const totalScoreRef = useRef(0);
  const integrityScoreRef = useRef(100);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const snapshotTimerRef = useRef<number | null>(null);
  const tickRef = useRef<number | null>(null);
  const qStartRef = useRef<number>(0);
  const attemptIdRef = useRef<string | null>(null);
  const integritySaveTimerRef = useRef<number | null>(null);
  const errorToastShownRef = useRef<Set<string>>(new Set());

  // Block mobile
  useEffect(() => {
    if (typeof window !== "undefined" && window.innerWidth < 768) {
      setStage("blocked");
    }
  }, []);

  // Load test
  useEffect(() => {
    if (!slug) return;
    (async () => {
      const { data: t } = await supabase
        .from("recruitment_tests")
        .select("*")
        .eq("slug", slug)
        .eq("status", "live")
        .maybeSingle();
      if (!t) {
        setStage("blocked");
        return;
      }
      setTest(t as RecruitmentTest);
      const { data: qs } = await supabase
        .from("recruitment_questions")
        .select("*")
        .eq("test_id", t.id)
        .order("position");
      let list = (qs || []) as RecruitmentQuestion[];
      if (t.shuffle_questions) list = shuffle(list);
      setQuestions(list);
      setStage("intro");
    })();
  }, [slug]);

  // Helpers
  const showErrorOnce = useCallback(
    (key: string, title: string, description?: string) => {
      if (errorToastShownRef.current.has(key)) return;
      errorToastShownRef.current.add(key);
      toast({ title, description, variant: "destructive" });
    },
    [toast],
  );

  const persistIntegrity = useCallback(() => {
    if (integritySaveTimerRef.current) return;
    integritySaveTimerRef.current = window.setTimeout(async () => {
      integritySaveTimerRef.current = null;
      const id = attemptIdRef.current;
      if (!id) return;
      const { error } = await supabase
        .from("recruitment_attempts")
        .update({ integrity_score: integrityScoreRef.current })
        .eq("id", id);
      if (error) console.error("[recruitment] integrity update failed", error);
    }, 1000);
  }, []);

  const logEvent = useCallback(
    async (event_type: string, metadata: any = {}) => {
      const id = attemptIdRef.current;
      if (!id) return;
      const penalty = INTEGRITY_PENALTIES[event_type] ?? 0;
      if (penalty > 0) {
        integrityScoreRef.current = Math.max(0, integrityScoreRef.current - penalty);
        persistIntegrity();
      }
      const { error } = await supabase
        .from("recruitment_events")
        .insert({ attempt_id: id, event_type, metadata });
      if (error) {
        console.error("[recruitment] event insert failed", event_type, error);
        showErrorOnce(
          "event_insert",
          "Connection issue",
          "Some events could not be saved. Please stay on this page.",
        );
      }
    },
    [persistIntegrity, showErrorOnce],
  );

  // Anti-cheat listeners (active during test stage)
  useEffect(() => {
    if (stage !== "test") return;

    const lastEventAt: Record<string, number> = {};
    const throttle = (key: string, ms = 1500) => {
      const now = Date.now();
      if ((lastEventAt[key] ?? 0) + ms > now) return false;
      lastEventAt[key] = now;
      return true;
    };

    const onBlur = () => throttle("tab_blur") && logEvent("tab_blur");
    const onVisibility = () => {
      if (document.hidden && throttle("tab_hidden")) logEvent("tab_hidden");
    };
    // Real "cursor left the viewport" — verify with coordinates + relatedTarget to
    // avoid false positives from child element boundaries or focus shifts.
    const onMouseOut = (e: MouseEvent) => {
      if (e.relatedTarget !== null) return; // moved to another element, not out
      const x = e.clientX;
      const y = e.clientY;
      const trulyLeft =
        y <= 0 || x <= 0 || x >= window.innerWidth || y >= window.innerHeight;
      if (!trulyLeft) return;
      if (throttle("mouse_leave", 2500)) logEvent("mouse_leave");
    };
    const onFsChange = () => {
      if (!document.fullscreenElement && throttle("fullscreen_exit")) {
        logEvent("fullscreen_exit");
      }
    };
    const onContext = (e: MouseEvent) => {
      e.preventDefault();
      if (throttle("contextmenu")) logEvent("contextmenu");
    };
    const onCopy = (e: ClipboardEvent) => {
      e.preventDefault();
      if (throttle("copy_attempt")) logEvent("copy_attempt");
    };
    const onPaste = (e: ClipboardEvent) => {
      e.preventDefault();
      if (throttle("paste_attempt")) logEvent("paste_attempt");
    };

    window.addEventListener("blur", onBlur);
    document.addEventListener("visibilitychange", onVisibility);
    document.addEventListener("mouseout", onMouseOut);
    document.addEventListener("fullscreenchange", onFsChange);
    document.addEventListener("contextmenu", onContext);
    document.addEventListener("copy", onCopy);
    document.addEventListener("paste", onPaste);
    return () => {
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("visibilitychange", onVisibility);
      document.removeEventListener("mouseout", onMouseOut);
      document.removeEventListener("fullscreenchange", onFsChange);
      document.removeEventListener("contextmenu", onContext);
      document.removeEventListener("copy", onCopy);
      document.removeEventListener("paste", onPaste);
    };
  }, [stage, logEvent]);

  // Snapshot helper — fixed 320×240 to keep file size small
  const takeSnapshot = useCallback(async () => {
    const video = videoRef.current;
    const id = attemptIdRef.current;
    if (!id || !video) return;

    // Wait briefly for video to be ready
    let tries = 0;
    while ((video.readyState < 2 || !video.videoWidth) && tries < 10) {
      await new Promise((r) => setTimeout(r, 200));
      tries++;
    }
    if (video.readyState < 2 || !video.videoWidth) {
      console.warn("[recruitment] snapshot skipped — video not ready after wait");
      return;
    }

    // Capture at native video resolution (capped at 1280px wide) for clearer snapshots
    const MAX_W = 1280;
    const vw = video.videoWidth || 640;
    const vh = video.videoHeight || 480;
    const scale = Math.min(1, MAX_W / vw);
    const W = Math.round(vw * scale);
    const H = Math.round(vh * scale);
    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    try {
      ctx.drawImage(video, 0, 0, W, H);
    } catch (err) {
      console.error("[recruitment] drawImage failed", err);
      return;
    }
    const blob: Blob | null = await new Promise((res) =>
      canvas.toBlob(res, "image/jpeg", 0.9),
    );
    if (!blob) {
      console.error("[recruitment] toBlob returned null");
      return;
    }
    const path = `${id}/${Date.now()}.jpg`;
    const { error: upErr } = await supabase.storage
      .from("candidate-snapshots")
      .upload(path, blob, { contentType: "image/jpeg", upsert: false });
    if (upErr) {
      console.error("[recruitment] snapshot upload failed", upErr);
      showErrorOnce("snap_upload", "Webcam capture issue", upErr.message);
      return;
    }
    const { error: insErr } = await supabase
      .from("recruitment_snapshots")
      .insert({ attempt_id: id, storage_path: path });
    if (insErr) {
      console.error("[recruitment] snapshot row insert failed", insErr);
      return;
    }
    // Audit event (no penalty)
    await supabase
      .from("recruitment_events")
      .insert({ attempt_id: id, event_type: "snapshot" });
  }, [showErrorOnce]);

  // Snapshot loop
  useEffect(() => {
    if (stage !== "test") return;
    // First snap as soon as the video is ready, then every interval
    void takeSnapshot();
    snapshotTimerRef.current = window.setInterval(takeSnapshot, SNAPSHOT_INTERVAL_MS);
    return () => {
      if (snapshotTimerRef.current) clearInterval(snapshotTimerRef.current);
    };
  }, [stage, takeSnapshot]);

  // Stable advance via ref to avoid stale closures inside the interval
  const advanceRef = useRef<() => void>(() => {});

  // Question timer
  useEffect(() => {
    if (stage !== "test") return;
    setTimeLeft(test?.seconds_per_question ?? 20);
    qStartRef.current = Date.now();
    setSelected([]);
    if (tickRef.current) clearInterval(tickRef.current);
    tickRef.current = window.setInterval(() => {
      setTimeLeft((s) => {
        if (s <= 1) {
          if (tickRef.current) clearInterval(tickRef.current);
          advanceRef.current();
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, qIndex]);

  // Partial finalize on unload (sendBeacon → edge function)
  useEffect(() => {
    if (stage !== "test") return;
    const onBeforeUnload = () => {
      const id = attemptIdRef.current;
      if (!id) return;
      try {
        const url = `${SUPABASE_URL}/functions/v1/recruitment-finalize`;
        const payload = JSON.stringify({
          attempt_id: id,
          partial: true,
          integrity_score: integrityScoreRef.current,
        });
        const blob = new Blob([payload], { type: "application/json" });
        // sendBeacon doesn't allow custom headers, but the function accepts anon
        navigator.sendBeacon(url + `?apikey=${SUPABASE_ANON}`, blob);
      } catch (err) {
        console.error("[recruitment] beacon failed", err);
      }
    };
    window.addEventListener("pagehide", onBeforeUnload);
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      window.removeEventListener("pagehide", onBeforeUnload);
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, [stage]);

  const [clientIp, setClientIp] = useState<string | null>(null);

  const startPermissions = async () => {
    if (!form.name.trim() || !form.email.trim() || !cvFile) {
      toast({ title: "Please fill all fields and upload a CV.", variant: "destructive" });
      return;
    }
    if (cvFile.type !== "application/pdf") {
      toast({ title: "CV must be a PDF.", variant: "destructive" });
      return;
    }
    if (cvFile.size > 10 * 1024 * 1024) {
      toast({ title: "CV must be under 10MB.", variant: "destructive" });
      return;
    }

    // Pre-check: block duplicate attempts by email or IP
    if (test) {
      try {
        const { data, error } = await supabase.functions.invoke("recruitment-precheck", {
          body: { test_id: test.id, email: form.email.trim() },
        });
        if (error) throw error;
        if (data && data.allowed === false) {
          toast({
            title: "You can only take this test once",
            description: data.message || "A previous attempt was found.",
            variant: "destructive",
          });
          return;
        }
        setClientIp(data?.ip ?? null);
      } catch (e: any) {
        toast({
          title: "Could not verify eligibility",
          description: e?.message || "Please try again.",
          variant: "destructive",
        });
        return;
      }
    }

    setStage("permissions");
  };

  const requestAccess = async () => {
    if (!test) return;
    setSubmitting(true);

    // 1) Camera
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
    } catch {
      toast({
        title: "Camera access required",
        description: "Please allow your webcam to continue.",
        variant: "destructive",
      });
      setSubmitting(false);
      return;
    }
    streamRef.current = stream;

    if (videoRef.current) {
      videoRef.current.srcObject = stream;
      await new Promise<void>((res) => {
        const v = videoRef.current!;
        if (v.readyState >= 2 && v.videoWidth) return res();
        const onReady = () => {
          v.removeEventListener("loadedmetadata", onReady);
          res();
        };
        v.addEventListener("loadedmetadata", onReady);
        v.play().catch(() => {});
        // hard fallback so we don't hang forever
        setTimeout(res, 3000);
      });
    }

    // 2) Fullscreen
    try {
      await document.documentElement.requestFullscreen();
    } catch {
      stream.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      toast({
        title: "Fullscreen required",
        description: "Please allow fullscreen to continue.",
        variant: "destructive",
      });
      setSubmitting(false);
      return;
    }

    // 3) Upload CV first (so we have a path before inserting the attempt)
    const newAttemptId = crypto.randomUUID();
    let cvPath: string | null = null;
    if (cvFile) {
      const path = `${newAttemptId}/cv.pdf`;
      const { error: upErr } = await supabase.storage
        .from("candidate-cvs")
        .upload(path, cvFile, { contentType: "application/pdf", upsert: false });
      if (upErr) {
        toast({
          title: "CV upload failed",
          description: upErr.message,
          variant: "destructive",
        });
        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
        setSubmitting(false);
        return;
      }
      cvPath = path;
    }

    // 4) Insert attempt with cv_path already set
    const { error: aErr } = await supabase.from("recruitment_attempts").insert({
      id: newAttemptId,
      test_id: test.id,
      candidate_name: form.name,
      email: form.email,
      phone: form.phone || null,
      user_agent: navigator.userAgent,
      cv_path: cvPath,
      ip_address: clientIp,
    } as any);

    if (aErr) {
      toast({ title: "Could not start test", description: aErr.message, variant: "destructive" });
      stream.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
      setSubmitting(false);
      return;
    }

    totalScoreRef.current = 0;
    integrityScoreRef.current = 100;
    setAttemptId(newAttemptId);
    attemptIdRef.current = newAttemptId;
    setSubmitting(false);
    setStage("test");

    // First audit event so abandoned attempts aren't invisible
    void supabase
      .from("recruitment_events")
      .insert({ attempt_id: newAttemptId, event_type: "started" });
  };

  const handleAdvance = useCallback(async () => {
    const id = attemptIdRef.current;
    const q = questions[qIndex];
    if (!id || !q) return;

    const correctSet = new Set(q.correct_answers);
    const pickedSet = new Set(selected);
    const isCorrect =
      correctSet.size === pickedSet.size &&
      [...correctSet].every((v) => pickedSet.has(v));
    const points = isCorrect ? q.weight : 0;

    const { error } = await supabase.from("recruitment_answers").insert({
      attempt_id: id,
      question_id: q.id,
      answer: selected,
      is_correct: isCorrect,
      points_awarded: points,
      time_taken_ms: Date.now() - qStartRef.current,
    });

    if (error) {
      console.error("[recruitment] answer insert failed", error);
      // Best-effort audit so admins can see what broke
      void supabase.from("recruitment_events").insert({
        attempt_id: id,
        event_type: "client_error",
        metadata: { stage: "answer_insert", message: error.message },
      });
      toast({
        title: "Answer could not be saved",
        description: error.message,
        variant: "destructive",
      });
      return;
    }

    totalScoreRef.current += points;

    if (qIndex + 1 < questions.length) {
      setQIndex(qIndex + 1);
    } else {
      await finalize();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qIndex, questions, selected, toast]);

  // Keep advance ref in sync
  useEffect(() => {
    advanceRef.current = handleAdvance;
  }, [handleAdvance]);

  const finalize = async () => {
    const id = attemptIdRef.current;
    if (!id) return;

    const integrity = integrityScoreRef.current;

    // Use the edge function (service role) so the score/status update is reliable.
    // The anon UPDATE policy can silently affect 0 rows under some conditions; the
    // edge function recomputes total/max from recruitment_answers + recruitment_questions
    // and writes the row with elevated privileges, then logs a 'submitted' event.
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/recruitment-finalize`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: SUPABASE_ANON,
          Authorization: `Bearer ${SUPABASE_ANON}`,
        },
        body: JSON.stringify({ attempt_id: id, integrity_score: integrity }),
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        console.error("[recruitment] finalize failed", res.status, txt);
        toast({
          title: "We could not save your final score",
          description: "Your answers were saved. Please contact us if this persists.",
          variant: "destructive",
        });
      }
    } catch (err: any) {
      console.error("[recruitment] finalize network error", err);
      toast({
        title: "Network error submitting test",
        description: err?.message ?? "Your answers were saved.",
        variant: "destructive",
      });
    }

    setStage("done");

    // Cleanup
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  };

  const toggleOption = (i: number) => {
    const q = questions[qIndex];
    if (!q) return;
    if (q.question_type === "multi_select") {
      setSelected((s) => (s.includes(i) ? s.filter((x) => x !== i) : [...s, i]));
    } else {
      setSelected([i]);
    }
  };

  // ───────── Render ─────────

  // Mounted always so videoRef exists before requestAccess runs
  const VideoTile = (
    <video
      ref={videoRef}
      className="hidden"
      muted
      playsInline
      autoPlay
    />
  );

  if (stage === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center">
        {VideoTile}
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  if (stage === "blocked") {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-background">
        {VideoTile}
        <Card className="p-8 max-w-md text-center">
          <AlertCircle className="h-10 w-10 mx-auto text-destructive mb-3" />
          <h1 className="text-xl font-bold mb-2">Unavailable</h1>
          <p className="text-muted-foreground text-sm">
            This test is not currently available, or your device is not supported. Please open
            this link on a desktop or laptop computer.
          </p>
        </Card>
      </div>
    );
  }

  if (stage === "intro" && test) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        {VideoTile}
        <Card className="max-w-2xl w-full p-8">
          <div className="text-center mb-6">
            <div className="inline-block px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium mb-3">
              Care Cuddle — Recruitment
            </div>
            <h1 className="text-3xl font-bold">{test.title}</h1>
            {test.role && <p className="text-muted-foreground mt-1">{test.role}</p>}
          </div>
          {test.description && (
            <p className="text-sm mb-6 whitespace-pre-wrap">{test.description}</p>
          )}
          <div className="space-y-2 text-sm border rounded-lg p-4 bg-muted/30 mb-6">
            <p className="flex items-center gap-2">
              <Camera className="h-4 w-4" /> Webcam access required (snapshots taken regularly)
            </p>
            <p className="flex items-center gap-2">
              <Maximize className="h-4 w-4" /> Test runs in fullscreen — exiting will be flagged
            </p>
            <p className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4" /> {questions.length} questions •{" "}
              {test.seconds_per_question}s per question
            </p>
          </div>
          <Button className="w-full" size="lg" onClick={() => setStage("form")}>
            Get started
          </Button>
        </Card>
      </div>
    );
  }

  if (stage === "form") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        {VideoTile}
        <Card className="max-w-lg w-full p-8 space-y-4">
          <h1 className="text-2xl font-bold">Your details</h1>
          <div>
            <Label>Full name *</Label>
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>
          <div>
            <Label>Email *</Label>
            <Input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </div>
          <div>
            <Label>Phone</Label>
            <Input
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />
          </div>
          <div>
            <Label>CV (PDF, max 10MB) *</Label>
            <Input
              type="file"
              accept="application/pdf"
              onChange={(e) => setCvFile(e.target.files?.[0] || null)}
            />
            {cvFile && (
              <p className="text-xs text-muted-foreground mt-1">
                {cvFile.name} • {(cvFile.size / 1024).toFixed(0)} KB
              </p>
            )}
          </div>
          <Button className="w-full" onClick={startPermissions}>
            Continue
          </Button>
        </Card>
      </div>
    );
  }

  if (stage === "permissions") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        {VideoTile}
        <Card className="max-w-md w-full p-8 text-center space-y-4">
          <ShieldCheck className="h-12 w-12 mx-auto text-primary" />
          <h1 className="text-2xl font-bold">Almost ready</h1>
          <p className="text-sm text-muted-foreground">
            Click below to enable your webcam and enter fullscreen. The test will start
            immediately.
          </p>
          <Button className="w-full" size="lg" onClick={requestAccess} disabled={submitting}>
            {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Enable & start test
          </Button>
        </Card>
      </div>
    );
  }

  if (stage === "test") {
    const q = questions[qIndex];
    const total = questions.length;
    const secs = test?.seconds_per_question ?? 20;
    return (
      <div className="min-h-screen bg-background select-none">
        {VideoTile}
        <div className="max-w-3xl mx-auto p-8">
          <div className="flex items-center justify-between mb-4 text-sm text-muted-foreground">
            <span>
              Question {qIndex + 1} of {total}
            </span>
            <span className={timeLeft <= 5 ? "text-destructive font-bold" : ""}>{timeLeft}s</span>
          </div>
          <Progress value={(timeLeft / secs) * 100} className="mb-8" />
          {q && (
            <Card className="p-8">
              <h2 className="text-xl font-semibold mb-6">{q.question_text}</h2>
              <div className="space-y-2">
                {q.options.map((opt, i) => (
                  <button
                    key={i}
                    onClick={() => toggleOption(i)}
                    className={`w-full text-left border rounded-lg px-4 py-3 transition ${
                      selected.includes(i)
                        ? "border-primary bg-primary/10"
                        : "hover:bg-muted/50"
                    }`}
                  >
                    {opt}
                  </button>
                ))}
              </div>
              <div className="mt-6 flex justify-end">
                <Button onClick={handleAdvance} disabled={selected.length === 0}>
                  {qIndex + 1 === total ? "Submit" : "Next"}
                </Button>
              </div>
            </Card>
          )}
        </div>
      </div>
    );
  }

  if (stage === "done") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <Card className="max-w-md w-full p-8 text-center">
          <ShieldCheck className="h-12 w-12 mx-auto text-primary mb-3" />
          <h1 className="text-2xl font-bold mb-2">Thank you!</h1>
          <p className="text-muted-foreground">
            Your responses have been submitted. The Care Cuddle team will be in touch soon.
          </p>
        </Card>
      </div>
    );
  }

  return null;
}
