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
import type { RecruitmentTest, RecruitmentQuestion } from "./types";

type Stage = "loading" | "intro" | "form" | "permissions" | "test" | "done" | "blocked";

const SNAPSHOT_INTERVAL_MS = 15000;

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

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const snapshotTimerRef = useRef<number | null>(null);
  const tickRef = useRef<number | null>(null);
  const qStartRef = useRef<number>(0);
  const attemptIdRef = useRef<string | null>(null);

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

  const logEvent = useCallback(async (event_type: string, metadata: any = {}) => {
    const id = attemptIdRef.current;
    if (!id) return;
    await supabase.from("recruitment_events").insert({ attempt_id: id, event_type, metadata });
  }, []);

  // Anti-cheat listeners (active during test stage)
  useEffect(() => {
    if (stage !== "test") return;

    const onBlur = () => logEvent("tab_blur");
    const onMouseLeave = (e: MouseEvent) => {
      if (e.relatedTarget === null) logEvent("mouse_leave");
    };
    const onFsChange = () => {
      if (!document.fullscreenElement) logEvent("fullscreen_exit");
    };
    const onContext = (e: MouseEvent) => {
      e.preventDefault();
      logEvent("contextmenu");
    };
    const onCopy = (e: ClipboardEvent) => {
      e.preventDefault();
      logEvent("copy_attempt");
    };
    const onPaste = (e: ClipboardEvent) => {
      e.preventDefault();
      logEvent("paste_attempt");
    };

    window.addEventListener("blur", onBlur);
    document.addEventListener("mouseleave", onMouseLeave);
    document.addEventListener("fullscreenchange", onFsChange);
    document.addEventListener("contextmenu", onContext);
    document.addEventListener("copy", onCopy);
    document.addEventListener("paste", onPaste);
    return () => {
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("mouseleave", onMouseLeave);
      document.removeEventListener("fullscreenchange", onFsChange);
      document.removeEventListener("contextmenu", onContext);
      document.removeEventListener("copy", onCopy);
      document.removeEventListener("paste", onPaste);
    };
  }, [stage, logEvent]);

  // Snapshot loop
  const takeSnapshot = useCallback(async () => {
    const video = videoRef.current;
    const id = attemptIdRef.current;
    if (!video || !id || video.readyState < 2) return;
    const canvas = document.createElement("canvas");
    canvas.width = 320;
    canvas.height = 240;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const blob: Blob | null = await new Promise((res) => canvas.toBlob(res, "image/jpeg", 0.7));
    if (!blob) return;
    const path = `${id}/${Date.now()}.jpg`;
    const { error } = await supabase.storage.from("candidate-snapshots").upload(path, blob, {
      contentType: "image/jpeg",
    });
    if (!error) {
      await supabase.from("recruitment_snapshots").insert({ attempt_id: id, storage_path: path });
      await supabase.from("recruitment_events").insert({ attempt_id: id, event_type: "snapshot" });
    }
  }, []);

  useEffect(() => {
    if (stage !== "test") return;
    snapshotTimerRef.current = window.setInterval(takeSnapshot, SNAPSHOT_INTERVAL_MS);
    // first snap shortly after start
    const first = window.setTimeout(takeSnapshot, 2000);
    return () => {
      if (snapshotTimerRef.current) clearInterval(snapshotTimerRef.current);
      clearTimeout(first);
    };
  }, [stage, takeSnapshot]);

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
          clearInterval(tickRef.current!);
          handleAdvance();
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
    setStage("permissions");
  };

  const requestAccess = async () => {
    if (!test) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
      await document.documentElement.requestFullscreen();
    } catch (err: any) {
      toast({ title: "Access required", description: "Please allow camera and fullscreen to continue.", variant: "destructive" });
      return;
    }

    // Create attempt + upload CV
    setSubmitting(true);
    const { data: a, error: aErr } = await supabase
      .from("recruitment_attempts")
      .insert({
        test_id: test.id,
        candidate_name: form.name,
        email: form.email,
        phone: form.phone || null,
        user_agent: navigator.userAgent,
      })
      .select("id")
      .single();

    if (aErr || !a) {
      toast({ title: "Could not start test", description: aErr?.message, variant: "destructive" });
      setSubmitting(false);
      return;
    }

    let cvPath: string | null = null;
    if (cvFile) {
      const path = `${a.id}/cv.pdf`;
      const { error: upErr } = await supabase.storage
        .from("candidate-cvs")
        .upload(path, cvFile, { contentType: "application/pdf", upsert: true });
      if (!upErr) {
        cvPath = path;
        await supabase.from("recruitment_attempts").update({ cv_path: cvPath }).eq("id", a.id);
      }
    }

    setAttemptId(a.id);
    attemptIdRef.current = a.id;
    setSubmitting(false);
    setStage("test");
  };

  const handleAdvance = async () => {
    const id = attemptIdRef.current;
    const q = questions[qIndex];
    if (!id || !q) return;

    const correctSet = new Set(q.correct_answers);
    const pickedSet = new Set(selected);
    const isCorrect =
      correctSet.size === pickedSet.size &&
      [...correctSet].every((v) => pickedSet.has(v));
    const points = isCorrect ? q.weight : 0;

    await supabase.from("recruitment_answers").insert({
      attempt_id: id,
      question_id: q.id,
      answer: selected,
      is_correct: isCorrect,
      points_awarded: points,
      time_taken_ms: Date.now() - qStartRef.current,
    });

    if (qIndex + 1 < questions.length) {
      setQIndex(qIndex + 1);
    } else {
      await finalize();
    }
  };

  const finalize = async () => {
    const id = attemptIdRef.current;
    if (!id) return;
    setStage("done");

    // Compute totals
    const { data: ans } = await supabase
      .from("recruitment_answers")
      .select("points_awarded")
      .eq("attempt_id", id);
    const total = (ans || []).reduce((s, r: any) => s + Number(r.points_awarded || 0), 0);
    const max = questions.reduce((s, q) => s + q.weight, 0);

    const { data: ev } = await supabase
      .from("recruitment_events")
      .select("event_type")
      .eq("attempt_id", id);
    const PENALTIES: Record<string, number> = {
      tab_blur: 5, mouse_leave: 5, fullscreen_exit: 10,
      copy_attempt: 2, paste_attempt: 2, contextmenu: 2,
    };
    let integrity = 100;
    (ev || []).forEach((e: any) => (integrity -= PENALTIES[e.event_type] ?? 0));
    integrity = Math.max(0, integrity);

    await supabase
      .from("recruitment_attempts")
      .update({
        total_score: total,
        max_score: max,
        integrity_score: integrity,
        submitted_at: new Date().toISOString(),
        status: "submitted",
      })
      .eq("id", id);

    // Cleanup
    streamRef.current?.getTracks().forEach((t) => t.stop());
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
  if (stage === "loading") {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  }

  if (stage === "blocked") {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-background">
        <Card className="p-8 max-w-md text-center">
          <AlertCircle className="h-10 w-10 mx-auto text-destructive mb-3" />
          <h1 className="text-xl font-bold mb-2">Unavailable</h1>
          <p className="text-muted-foreground text-sm">
            This test is not currently available, or your device is not supported. Please open this link on a desktop or laptop computer.
          </p>
        </Card>
      </div>
    );
  }

  if (stage === "intro" && test) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <Card className="max-w-2xl w-full p-8">
          <div className="text-center mb-6">
            <div className="inline-block px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium mb-3">
              Care Cuddle — Recruitment
            </div>
            <h1 className="text-3xl font-bold">{test.title}</h1>
            {test.role && <p className="text-muted-foreground mt-1">{test.role}</p>}
          </div>
          {test.description && <p className="text-sm mb-6 whitespace-pre-wrap">{test.description}</p>}
          <div className="space-y-2 text-sm border rounded-lg p-4 bg-muted/30 mb-6">
            <p className="flex items-center gap-2"><Camera className="h-4 w-4" /> Webcam access required (snapshots taken regularly)</p>
            <p className="flex items-center gap-2"><Maximize className="h-4 w-4" /> Test runs in fullscreen — exiting will be flagged</p>
            <p className="flex items-center gap-2"><ShieldCheck className="h-4 w-4" /> {questions.length} questions • {test.seconds_per_question}s per question</p>
          </div>
          <Button className="w-full" size="lg" onClick={() => setStage("form")}>Get started</Button>
        </Card>
      </div>
    );
  }

  if (stage === "form") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <Card className="max-w-lg w-full p-8 space-y-4">
          <h1 className="text-2xl font-bold">Your details</h1>
          <div>
            <Label>Full name *</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div>
            <Label>Email *</Label>
            <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          <div>
            <Label>Phone</Label>
            <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </div>
          <div>
            <Label>CV (PDF, max 10MB) *</Label>
            <Input type="file" accept="application/pdf" onChange={(e) => setCvFile(e.target.files?.[0] || null)} />
          </div>
          <Button className="w-full" onClick={startPermissions}>Continue</Button>
        </Card>
      </div>
    );
  }

  if (stage === "permissions") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <Card className="max-w-md w-full p-8 text-center space-y-4">
          <ShieldCheck className="h-12 w-12 mx-auto text-primary" />
          <h1 className="text-2xl font-bold">Almost ready</h1>
          <p className="text-sm text-muted-foreground">
            Click below to enable your webcam and enter fullscreen. The test will start immediately.
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
        <video ref={videoRef} className="fixed bottom-4 right-4 w-32 h-24 rounded border-2 border-primary shadow-lg object-cover z-50" muted playsInline />
        <div className="max-w-3xl mx-auto p-8">
          <div className="flex items-center justify-between mb-4 text-sm text-muted-foreground">
            <span>Question {qIndex + 1} of {total}</span>
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
                      selected.includes(i) ? "border-primary bg-primary/10" : "hover:bg-muted/50"
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
          <p className="text-muted-foreground">Your responses have been submitted. The Care Cuddle team will be in touch soon.</p>
        </Card>
      </div>
    );
  }

  return null;
}
