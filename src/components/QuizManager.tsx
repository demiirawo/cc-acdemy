import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Trash2, GripVertical, Settings2, HelpCircle } from "lucide-react";
import { Switch } from "@/components/ui/switch";

interface QuizQuestion {
  id?: string;
  question: string;
  options: string[];
  correct_answer: number;
  sort_order: number;
}

interface Quiz {
  id?: string;
  page_id: string;
  title: string;
  description: string;
  passing_score: number;
  is_active: boolean;
}

interface QuizManagerProps {
  pageId: string;
  pageTitle: string;
}

export function QuizManager({ pageId, pageTitle }: QuizManagerProps) {
  const [open, setOpen] = useState(false);
  const [quiz, setQuiz] = useState<Quiz>({
    page_id: pageId,
    title: 'Knowledge Check',
    description: '',
    passing_score: 80,
    is_active: true
  });
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [hasExistingQuiz, setHasExistingQuiz] = useState(false);
  const { user } = useAuth();
  const { toast } = useToast();

  useEffect(() => {
    if (open && pageId) {
      fetchQuiz();
    }
  }, [open, pageId]);

  const fetchQuiz = async () => {
    setLoading(true);
    try {
      const { data: quizData, error: quizError } = await supabase
        .from('page_quizzes')
        .select('*')
        .eq('page_id', pageId)
        .maybeSingle();

      if (quizError) throw quizError;

      if (quizData) {
        setQuiz(quizData);
        setHasExistingQuiz(true);

        const { data: questionsData, error: questionsError } = await supabase
          .from('quiz_questions')
          .select('*')
          .eq('quiz_id', quizData.id)
          .order('sort_order', { ascending: true });

        if (questionsError) throw questionsError;
        
        const parsedQuestions: QuizQuestion[] = (questionsData || []).map(q => ({
          ...q,
          options: Array.isArray(q.options) ? q.options.map(String) : []
        }));
        
        setQuestions(parsedQuestions);
      } else {
        setQuiz({
          page_id: pageId,
          title: 'Knowledge Check',
          description: '',
          passing_score: 80,
          is_active: true
        });
        setQuestions([]);
        setHasExistingQuiz(false);
      }
    } catch (error) {
      console.error('Error fetching quiz:', error);
      toast({
        title: "Error",
        description: "Failed to load quiz data",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const addQuestion = () => {
    setQuestions(prev => [
      ...prev,
      {
        question: '',
        options: ['', '', '', ''],
        correct_answer: 0,
        sort_order: prev.length
      }
    ]);
  };

  const updateQuestion = (index: number, field: keyof QuizQuestion, value: any) => {
    setQuestions(prev => prev.map((q, i) => 
      i === index ? { ...q, [field]: value } : q
    ));
  };

  const updateOption = (questionIndex: number, optionIndex: number, value: string) => {
    setQuestions(prev => prev.map((q, i) => {
      if (i === questionIndex) {
        const newOptions = [...q.options];
        newOptions[optionIndex] = value;
        return { ...q, options: newOptions };
      }
      return q;
    }));
  };

  const removeQuestion = (index: number) => {
    setQuestions(prev => prev.filter((_, i) => i !== index).map((q, i) => ({
      ...q,
      sort_order: i
    })));
  };

  const handleSave = async () => {
    if (!user) return;

    // Validate
    if (questions.length === 0) {
      toast({
        title: "Validation Error",
        description: "Please add at least one question",
        variant: "destructive"
      });
      return;
    }

    for (const q of questions) {
      if (!q.question.trim()) {
        toast({
          title: "Validation Error",
          description: "All questions must have text",
          variant: "destructive"
        });
        return;
      }
      if (q.options.some(opt => !opt.trim())) {
        toast({
          title: "Validation Error",
          description: "All options must have text",
          variant: "destructive"
        });
        return;
      }
    }

    setSaving(true);
    try {
      let quizId = quiz.id;

      if (hasExistingQuiz && quizId) {
        // Update existing quiz
        const { error: updateError } = await supabase
          .from('page_quizzes')
          .update({
            title: quiz.title,
            description: quiz.description,
            passing_score: quiz.passing_score,
            is_active: quiz.is_active,
            updated_at: new Date().toISOString()
          })
          .eq('id', quizId);

        if (updateError) throw updateError;

        // Delete existing questions and re-insert
        await supabase
          .from('quiz_questions')
          .delete()
          .eq('quiz_id', quizId);
      } else {
        // Create new quiz
        const { data: newQuiz, error: createError } = await supabase
          .from('page_quizzes')
          .insert({
            page_id: pageId,
            title: quiz.title,
            description: quiz.description,
            passing_score: quiz.passing_score,
            is_active: quiz.is_active,
            created_by: user.id
          })
          .select()
          .single();

        if (createError) throw createError;
        quizId = newQuiz.id;
      }

      // Insert questions
      if (quizId && questions.length > 0) {
        const { error: questionsError } = await supabase
          .from('quiz_questions')
          .insert(
            questions.map((q, idx) => ({
              quiz_id: quizId,
              question: q.question,
              options: q.options,
              correct_answer: q.correct_answer,
              sort_order: idx
            }))
          );

        if (questionsError) throw questionsError;
      }

      toast({
        title: "Quiz Saved",
        description: "The quiz has been saved successfully"
      });

      setOpen(false);
    } catch (error) {
      console.error('Error saving quiz:', error);
      toast({
        title: "Error",
        description: "Failed to save quiz",
        variant: "destructive"
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteQuiz = async () => {
    if (!quiz.id) return;

    if (!confirm('Are you sure you want to delete this quiz? This will also delete all completions.')) {
      return;
    }

    try {
      const { error } = await supabase
        .from('page_quizzes')
        .delete()
        .eq('id', quiz.id);

      if (error) throw error;

      toast({
        title: "Quiz Deleted",
        description: "The quiz has been deleted"
      });

      setOpen(false);
      setHasExistingQuiz(false);
      setQuestions([]);
    } catch (error) {
      console.error('Error deleting quiz:', error);
      toast({
        title: "Error",
        description: "Failed to delete quiz",
        variant: "destructive"
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="flex items-center gap-2">
          <HelpCircle className="h-4 w-4" />
          {hasExistingQuiz ? 'Edit Quiz' : 'Add Quiz'}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {hasExistingQuiz ? 'Edit' : 'Create'} Quiz for "{pageTitle}"
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="py-8 text-center text-muted-foreground">Loading...</div>
        ) : (
          <div className="space-y-6">
            {/* Quiz Settings */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Settings2 className="h-4 w-4" />
                  Quiz Settings
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="title">Quiz Title</Label>
                    <Input
                      id="title"
                      value={quiz.title}
                      onChange={(e) => setQuiz(prev => ({ ...prev, title: e.target.value }))}
                      placeholder="Knowledge Check"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="passing_score">Passing Score (%)</Label>
                    <Input
                      id="passing_score"
                      type="number"
                      min="0"
                      max="100"
                      value={quiz.passing_score}
                      onChange={(e) => setQuiz(prev => ({ ...prev, passing_score: parseInt(e.target.value) || 0 }))}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="description">Description (optional)</Label>
                  <Textarea
                    id="description"
                    value={quiz.description}
                    onChange={(e) => setQuiz(prev => ({ ...prev, description: e.target.value }))}
                    placeholder="Answer the following questions to demonstrate your understanding..."
                    rows={2}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Quiz Active</Label>
                    <p className="text-sm text-muted-foreground">
                      When active, users must complete the quiz before acknowledging the page
                    </p>
                  </div>
                  <Switch
                    checked={quiz.is_active}
                    onCheckedChange={(checked) => setQuiz(prev => ({ ...prev, is_active: checked }))}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Questions */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">Questions</h3>
                <Button onClick={addQuestion} size="sm" variant="outline" className="flex items-center gap-2">
                  <Plus className="h-4 w-4" />
                  Add Question
                </Button>
              </div>

              {questions.length === 0 ? (
                <Card className="border-dashed">
                  <CardContent className="py-8 text-center text-muted-foreground">
                    No questions yet. Click "Add Question" to get started.
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-4">
                  {questions.map((q, qIdx) => (
                    <Card key={qIdx}>
                      <CardContent className="pt-4">
                        <div className="flex items-start gap-3">
                          <div className="flex items-center gap-2 pt-2 text-muted-foreground">
                            <GripVertical className="h-4 w-4" />
                            <span className="font-medium">{qIdx + 1}.</span>
                          </div>
                          <div className="flex-1 space-y-4">
                            <div className="space-y-2">
                              <Label>Question</Label>
                              <Input
                                value={q.question}
                                onChange={(e) => updateQuestion(qIdx, 'question', e.target.value)}
                                placeholder="Enter your question..."
                              />
                            </div>
                            <div className="space-y-2">
                              <Label>Options (select the correct answer)</Label>
                              <div className="space-y-2">
                                {q.options.map((opt, optIdx) => (
                                  <div key={optIdx} className="flex items-center gap-2">
                                    <input
                                      type="radio"
                                      name={`correct-${qIdx}`}
                                      checked={q.correct_answer === optIdx}
                                      onChange={() => updateQuestion(qIdx, 'correct_answer', optIdx)}
                                      className="h-4 w-4"
                                    />
                                    <Input
                                      value={opt}
                                      onChange={(e) => updateOption(qIdx, optIdx, e.target.value)}
                                      placeholder={`Option ${optIdx + 1}`}
                                      className={q.correct_answer === optIdx ? 'border-green-500 bg-green-50 dark:bg-green-900/20' : ''}
                                    />
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => removeQuestion(qIdx)}
                            className="text-destructive hover:text-destructive"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex justify-between pt-4 border-t">
              {hasExistingQuiz && (
                <Button variant="destructive" onClick={handleDeleteQuiz}>
                  Delete Quiz
                </Button>
              )}
              <div className="flex gap-2 ml-auto">
                <Button variant="outline" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleSave} disabled={saving}>
                  {saving ? 'Saving...' : 'Save Quiz'}
                </Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
