import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Plus, Trash2, GripVertical } from "lucide-react";
import type { QuestionType, RecruitmentQuestion, RecruitmentTest, TestStatus } from "./types";
import { useAuth } from "@/hooks/useAuth";

interface Props {
  testId: string | null;
  onBack: () => void;
}

const slugify = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);

type DraftQ = Omit<RecruitmentQuestion, "id" | "test_id"> & { id?: string; _isNew?: boolean };

export function TestBuilder({ testId, onBack }: Props) {
  const { toast } = useToast();
  const { user } = useAuth();
  const [test, setTest] = useState<Partial<RecruitmentTest>>({
    title: "",
    slug: "",
    description: "",
    role: "",
    pass_threshold: 70,
    seconds_per_question: 20,
    status: "draft" as TestStatus,
    shuffle_questions: true,
  });
  const [questions, setQuestions] = useState<DraftQ[]>([]);
  const [loading, setLoading] = useState(!!testId);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!testId) return;
    (async () => {
      const [{ data: t }, { data: qs }] = await Promise.all([
        supabase.from("recruitment_tests").select("*").eq("id", testId).maybeSingle(),
        supabase.from("recruitment_questions").select("*").eq("test_id", testId).order("position"),
      ]);
      if (t) setTest(t as RecruitmentTest);
      if (qs)
        setQuestions(
          (qs as any[]).map((q) => ({
            id: q.id,
            position: q.position,
            question_text: q.question_text,
            question_type: q.question_type,
            options: q.options || [],
            correct_answers: q.correct_answers || [],
            weight: q.weight,
          }))
        );
      setLoading(false);
    })();
  }, [testId]);

  const addQuestion = () => {
    setQuestions((qs) => [
      ...qs,
      {
        position: qs.length,
        question_text: "",
        question_type: "multiple_choice",
        options: ["", "", "", ""],
        correct_answers: [],
        weight: 1,
        _isNew: true,
      },
    ]);
  };

  const updateQ = (idx: number, patch: Partial<DraftQ>) => {
    setQuestions((qs) => qs.map((q, i) => (i === idx ? { ...q, ...patch } : q)));
  };

  const removeQ = (idx: number) => {
    setQuestions((qs) => qs.filter((_, i) => i !== idx));
  };

  const setQType = (idx: number, t: QuestionType) => {
    if (t === "true_false") {
      updateQ(idx, { question_type: t, options: ["True", "False"], correct_answers: [] });
    } else {
      const q = questions[idx];
      const opts = q.options.length >= 2 ? q.options : ["", "", "", ""];
      updateQ(idx, { question_type: t, options: opts, correct_answers: [] });
    }
  };

  const toggleCorrect = (idx: number, optIdx: number) => {
    const q = questions[idx];
    const isMulti = q.question_type === "multi_select";
    let next: number[];
    if (isMulti) {
      next = q.correct_answers.includes(optIdx)
        ? q.correct_answers.filter((i) => i !== optIdx)
        : [...q.correct_answers, optIdx];
    } else {
      next = [optIdx];
    }
    updateQ(idx, { correct_answers: next });
  };

  const save = async () => {
    if (!test.title) {
      toast({ title: "Title required", variant: "destructive" });
      return;
    }
    if (!user) return;
    setSaving(true);

    const slug = test.slug || slugify(test.title);
    const payload = {
      title: test.title,
      slug,
      description: test.description || null,
      role: test.role || null,
      pass_threshold: test.pass_threshold ?? 70,
      seconds_per_question: test.seconds_per_question ?? 20,
      status: test.status ?? "draft",
      shuffle_questions: test.shuffle_questions ?? true,
      created_by: user.id,
    };

    let savedTestId = testId;
    if (testId) {
      const { error } = await supabase.from("recruitment_tests").update(payload).eq("id", testId);
      if (error) {
        toast({ title: "Save failed", description: error.message, variant: "destructive" });
        setSaving(false);
        return;
      }
    } else {
      const { data, error } = await supabase
        .from("recruitment_tests")
        .insert(payload)
        .select("id")
        .single();
      if (error) {
        toast({ title: "Save failed", description: error.message, variant: "destructive" });
        setSaving(false);
        return;
      }
      savedTestId = data.id;
    }

    // Replace all questions (simplest reliable approach)
    if (savedTestId) {
      await supabase.from("recruitment_questions").delete().eq("test_id", savedTestId);
      if (questions.length > 0) {
        const rows = questions.map((q, i) => ({
          test_id: savedTestId!,
          position: i,
          question_text: q.question_text,
          question_type: q.question_type,
          options: q.options.filter((o) => o.trim().length > 0),
          correct_answers: q.correct_answers,
          weight: q.weight,
        }));
        const { error } = await supabase.from("recruitment_questions").insert(rows);
        if (error) {
          toast({ title: "Questions save failed", description: error.message, variant: "destructive" });
          setSaving(false);
          return;
        }
      }
    }

    toast({ title: "Saved" });
    setSaving(false);
    onBack();
  };

  if (loading) return <p className="text-muted-foreground">Loading...</p>;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={onBack}><ArrowLeft className="h-4 w-4 mr-2" />Back</Button>
        <Button onClick={save} disabled={saving}>{saving ? "Saving..." : "Save"}</Button>
      </div>

      <Card className="p-6 space-y-4">
        <h2 className="font-semibold text-lg">Test details</h2>
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <Label>Title</Label>
            <Input
              value={test.title || ""}
              onChange={(e) => setTest({ ...test, title: e.target.value, slug: test.slug || slugify(e.target.value) })}
              placeholder="e.g. Care Assistant — Pre-screen"
            />
          </div>
          <div>
            <Label>Role</Label>
            <Input value={test.role || ""} onChange={(e) => setTest({ ...test, role: e.target.value })} placeholder="e.g. Care Assistant" />
          </div>
          <div>
            <Label>URL slug</Label>
            <Input value={test.slug || ""} onChange={(e) => setTest({ ...test, slug: slugify(e.target.value) })} />
          </div>
          <div className="col-span-2">
            <Label>Description (shown to candidate)</Label>
            <Textarea
              value={test.description || ""}
              onChange={(e) => setTest({ ...test, description: e.target.value })}
              placeholder="Briefly describe the role and what to expect."
              rows={3}
            />
          </div>
          <div>
            <Label>Pass threshold (%)</Label>
            <Input
              type="number"
              min={0}
              max={100}
              value={test.pass_threshold ?? 70}
              onChange={(e) => setTest({ ...test, pass_threshold: Number(e.target.value) })}
            />
          </div>
          <div>
            <Label>Seconds per question</Label>
            <Input
              type="number"
              min={5}
              max={300}
              value={test.seconds_per_question ?? 20}
              onChange={(e) => setTest({ ...test, seconds_per_question: Number(e.target.value) })}
            />
          </div>
          <div>
            <Label>Status</Label>
            <Select value={test.status || "draft"} onValueChange={(v) => setTest({ ...test, status: v as TestStatus })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="live">Live</SelectItem>
                <SelectItem value="closed">Closed</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-3 pt-6">
            <Switch
              id="shuffle"
              checked={test.shuffle_questions ?? true}
              onCheckedChange={(v) => setTest({ ...test, shuffle_questions: v })}
            />
            <Label htmlFor="shuffle">Shuffle questions per candidate</Label>
          </div>
        </div>
      </Card>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-lg">Questions ({questions.length})</h2>
          <Button onClick={addQuestion} size="sm"><Plus className="h-4 w-4 mr-2" />Add question</Button>
        </div>

        {questions.map((q, idx) => (
          <Card key={idx} className="p-4 space-y-3">
            <div className="flex items-start gap-2">
              <GripVertical className="h-4 w-4 text-muted-foreground mt-2" />
              <div className="flex-1 space-y-3">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-muted-foreground">Q{idx + 1}</span>
                  <Select value={q.question_type} onValueChange={(v) => setQType(idx, v as QuestionType)}>
                    <SelectTrigger className="w-44 h-8"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="multiple_choice">Multiple choice</SelectItem>
                      <SelectItem value="multi_select">Multi-select</SelectItem>
                      <SelectItem value="true_false">True / False</SelectItem>
                    </SelectContent>
                  </Select>
                  <div className="flex items-center gap-1 ml-auto">
                    <Label className="text-xs">Weight</Label>
                    <Input
                      type="number"
                      min={1}
                      max={10}
                      value={q.weight}
                      onChange={(e) => updateQ(idx, { weight: Number(e.target.value) })}
                      className="w-16 h-8"
                    />
                    <Button variant="ghost" size="icon" onClick={() => removeQ(idx)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
                <Textarea
                  value={q.question_text}
                  onChange={(e) => updateQ(idx, { question_text: e.target.value })}
                  placeholder="Question text..."
                  rows={2}
                />
                <div className="space-y-2">
                  {q.options.map((opt, oi) => (
                    <div key={oi} className="flex items-center gap-2">
                      <input
                        type={q.question_type === "multi_select" ? "checkbox" : "radio"}
                        name={`correct-${idx}`}
                        checked={q.correct_answers.includes(oi)}
                        onChange={() => toggleCorrect(idx, oi)}
                        className="h-4 w-4"
                      />
                      <Input
                        value={opt}
                        onChange={(e) =>
                          updateQ(idx, {
                            options: q.options.map((o, i) => (i === oi ? e.target.value : o)),
                          })
                        }
                        placeholder={`Option ${oi + 1}`}
                        disabled={q.question_type === "true_false"}
                      />
                      {q.question_type !== "true_false" && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() =>
                            updateQ(idx, {
                              options: q.options.filter((_, i) => i !== oi),
                              correct_answers: q.correct_answers.filter((c) => c !== oi).map((c) => (c > oi ? c - 1 : c)),
                            })
                          }
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  ))}
                  {q.question_type !== "true_false" && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => updateQ(idx, { options: [...q.options, ""] })}
                    >
                      <Plus className="h-3.5 w-3.5 mr-1" />Add option
                    </Button>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  Tick the {q.question_type === "multi_select" ? "correct answers" : "correct answer"}.
                </p>
              </div>
            </div>
          </Card>
        ))}

        {questions.length === 0 && (
          <Card className="p-8 text-center text-muted-foreground">
            No questions yet. Click "Add question" to start.
          </Card>
        )}
      </div>
    </div>
  );
}
