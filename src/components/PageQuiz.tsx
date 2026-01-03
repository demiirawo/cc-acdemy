import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { CheckCircle2, XCircle, HelpCircle, Trophy, RotateCcw } from "lucide-react";
import { Progress } from "@/components/ui/progress";

interface QuizQuestion {
  id: string;
  question: string;
  options: string[];
  correct_answer: number;
  sort_order: number;
}

interface Quiz {
  id: string;
  title: string;
  description: string | null;
  passing_score: number;
}

interface QuizCompletion {
  id: string;
  score: number;
  passed: boolean;
  completed_at: string;
}

interface PageQuizProps {
  pageId: string;
  onQuizComplete?: (passed: boolean) => void;
}

export function PageQuiz({ pageId, onQuizComplete }: PageQuizProps) {
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [completion, setCompletion] = useState<QuizCompletion | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [showResults, setShowResults] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const { user } = useAuth();
  const { toast } = useToast();

  useEffect(() => {
    if (pageId) {
      fetchQuiz();
    }
  }, [pageId, user]);

  const fetchQuiz = async () => {
    try {
      // Fetch quiz for this page
      const { data: quizData, error: quizError } = await supabase
        .from('page_quizzes')
        .select('*')
        .eq('page_id', pageId)
        .eq('is_active', true)
        .maybeSingle();

      if (quizError) throw quizError;

      if (!quizData) {
        setLoading(false);
        return;
      }

      setQuiz(quizData);

      // Fetch questions
      const { data: questionsData, error: questionsError } = await supabase
        .from('quiz_questions')
        .select('*')
        .eq('quiz_id', quizData.id)
        .order('sort_order', { ascending: true });

      if (questionsError) throw questionsError;
      
      // Parse options from JSONB
      const parsedQuestions = (questionsData || []).map(q => ({
        ...q,
        options: Array.isArray(q.options) ? q.options.map(String) : []
      }));
      
      setQuestions(parsedQuestions);

      // Check if user has completed this quiz
      if (user) {
        const { data: completionData, error: completionError } = await supabase
          .from('quiz_completions')
          .select('*')
          .eq('quiz_id', quizData.id)
          .eq('user_id', user.id)
          .maybeSingle();

        if (completionError) throw completionError;
        
        if (completionData) {
          setCompletion(completionData);
          onQuizComplete?.(completionData.passed);
        }
      }
    } catch (error) {
      console.error('Error fetching quiz:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAnswerChange = (questionId: string, answerIndex: number) => {
    setAnswers(prev => ({
      ...prev,
      [questionId]: answerIndex
    }));
  };

  const calculateScore = (): number => {
    if (questions.length === 0) return 0;
    
    let correct = 0;
    questions.forEach(q => {
      if (answers[q.id] === q.correct_answer) {
        correct++;
      }
    });
    
    return Math.round((correct / questions.length) * 100);
  };

  const handleSubmitQuiz = async () => {
    if (!user || !quiz) return;

    setSubmitting(true);
    try {
      const score = calculateScore();
      const passed = score >= quiz.passing_score;

      const { error } = await supabase
        .from('quiz_completions')
        .insert({
          quiz_id: quiz.id,
          user_id: user.id,
          score,
          passed,
          answers: answers
        });

      if (error) throw error;

      setCompletion({
        id: '',
        score,
        passed,
        completed_at: new Date().toISOString()
      });
      
      setShowResults(true);
      onQuizComplete?.(passed);

      toast({
        title: passed ? "Quiz Passed!" : "Quiz Not Passed",
        description: passed 
          ? `Congratulations! You scored ${score}%` 
          : `You scored ${score}%. You need ${quiz.passing_score}% to pass.`,
        variant: passed ? "default" : "destructive"
      });
    } catch (error: any) {
      console.error('Error submitting quiz:', error);
      // Handle duplicate key error
      if (error.code === '23505') {
        toast({
          title: "Already Completed",
          description: "You have already completed this quiz.",
        });
        fetchQuiz(); // Refresh to get the completion
      } else {
        toast({
          title: "Error",
          description: "Failed to submit quiz. Please try again.",
          variant: "destructive"
        });
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleRetakeQuiz = async () => {
    if (!user || !quiz) return;

    // Delete the existing completion to allow retake
    try {
      await supabase
        .from('quiz_completions')
        .delete()
        .eq('quiz_id', quiz.id)
        .eq('user_id', user.id);

      setCompletion(null);
      setAnswers({});
      setCurrentQuestion(0);
      setShowResults(false);
      onQuizComplete?.(false);
    } catch (error) {
      console.error('Error resetting quiz:', error);
    }
  };

  if (loading) {
    return null;
  }

  if (!quiz || questions.length === 0) {
    return null;
  }

  // Already completed and passed
  if (completion?.passed && !showResults) {
    return (
      <Card className="mt-6 border-green-200 bg-green-50 dark:border-green-900/30 dark:bg-green-900/10">
        <CardContent className="py-6">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-full bg-green-100 dark:bg-green-900/30">
              <Trophy className="h-6 w-6 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <h3 className="font-semibold text-foreground">Quiz Completed</h3>
              <p className="text-sm text-muted-foreground">
                You passed with a score of {completion.score}%
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Failed but can retake
  if (completion && !completion.passed && !showResults) {
    return (
      <Card className="mt-6 border-amber-200 bg-amber-50 dark:border-amber-900/30 dark:bg-amber-900/10">
        <CardContent className="py-6">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-full bg-amber-100 dark:bg-amber-900/30">
                <XCircle className="h-6 w-6 text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <h3 className="font-semibold text-foreground">Quiz Not Passed</h3>
                <p className="text-sm text-muted-foreground">
                  You scored {completion.score}%. You need {quiz.passing_score}% to pass.
                </p>
              </div>
            </div>
            <Button onClick={handleRetakeQuiz} variant="outline" className="flex items-center gap-2">
              <RotateCcw className="h-4 w-4" />
              Retake Quiz
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Show results after submission
  if (showResults && completion) {
    return (
      <Card className={`mt-6 ${completion.passed ? 'border-green-200 bg-green-50 dark:border-green-900/30 dark:bg-green-900/10' : 'border-amber-200 bg-amber-50 dark:border-amber-900/30 dark:bg-amber-900/10'}`}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {completion.passed ? (
              <>
                <Trophy className="h-5 w-5 text-green-600" />
                Congratulations!
              </>
            ) : (
              <>
                <XCircle className="h-5 w-5 text-amber-600" />
                Quiz Not Passed
              </>
            )}
          </CardTitle>
          <CardDescription>
            {completion.passed 
              ? `You passed with ${completion.score}%!`
              : `You scored ${completion.score}%. You need ${quiz.passing_score}% to pass.`
            }
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {questions.map((q, idx) => {
              const userAnswer = answers[q.id];
              const isCorrect = userAnswer === q.correct_answer;
              
              return (
                <div key={q.id} className={`p-4 rounded-lg ${isCorrect ? 'bg-green-100/50 dark:bg-green-900/20' : 'bg-red-100/50 dark:bg-red-900/20'}`}>
                  <div className="flex items-start gap-2">
                    {isCorrect ? (
                      <CheckCircle2 className="h-5 w-5 text-green-600 mt-0.5" />
                    ) : (
                      <XCircle className="h-5 w-5 text-red-600 mt-0.5" />
                    )}
                    <div>
                      <p className="font-medium">{idx + 1}. {q.question}</p>
                      <p className="text-sm mt-1">
                        Your answer: <span className={isCorrect ? 'text-green-600' : 'text-red-600'}>{q.options[userAnswer] || 'Not answered'}</span>
                      </p>
                      {!isCorrect && (
                        <p className="text-sm text-green-600">
                          Correct answer: {q.options[q.correct_answer]}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
        {!completion.passed && (
          <CardFooter>
            <Button onClick={handleRetakeQuiz} variant="outline" className="flex items-center gap-2">
              <RotateCcw className="h-4 w-4" />
              Retake Quiz
            </Button>
          </CardFooter>
        )}
      </Card>
    );
  }

  // Quiz in progress
  const currentQ = questions[currentQuestion];
  const allAnswered = questions.every(q => answers[q.id] !== undefined);

  return (
    <Card className="mt-6 border-primary/20">
      <CardHeader>
        <div className="flex items-center gap-2 mb-2">
          <HelpCircle className="h-5 w-5 text-primary" />
          <CardTitle className="text-lg">{quiz.title}</CardTitle>
        </div>
        {quiz.description && (
          <CardDescription>{quiz.description}</CardDescription>
        )}
        <div className="mt-4">
          <div className="flex justify-between text-sm text-muted-foreground mb-2">
            <span>Question {currentQuestion + 1} of {questions.length}</span>
            <span>Passing score: {quiz.passing_score}%</span>
          </div>
          <Progress value={((currentQuestion + 1) / questions.length) * 100} className="h-2" />
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <h3 className="font-medium text-lg">{currentQ.question}</h3>
          <RadioGroup
            value={answers[currentQ.id]?.toString()}
            onValueChange={(value) => handleAnswerChange(currentQ.id, parseInt(value))}
          >
            {currentQ.options.map((option, idx) => (
              <div key={idx} className="flex items-center space-x-3 p-3 rounded-lg border hover:bg-muted/50 transition-colors">
                <RadioGroupItem value={idx.toString()} id={`option-${idx}`} />
                <Label htmlFor={`option-${idx}`} className="flex-1 cursor-pointer">
                  {option}
                </Label>
              </div>
            ))}
          </RadioGroup>
        </div>
      </CardContent>
      <CardFooter className="flex justify-between">
        <Button
          variant="outline"
          onClick={() => setCurrentQuestion(prev => prev - 1)}
          disabled={currentQuestion === 0}
        >
          Previous
        </Button>
        <div className="flex gap-2">
          {currentQuestion < questions.length - 1 ? (
            <Button
              onClick={() => setCurrentQuestion(prev => prev + 1)}
              disabled={answers[currentQ.id] === undefined}
            >
              Next
            </Button>
          ) : (
            <Button
              onClick={handleSubmitQuiz}
              disabled={!allAnswered || submitting}
            >
              {submitting ? 'Submitting...' : 'Submit Quiz'}
            </Button>
          )}
        </div>
      </CardFooter>
    </Card>
  );
}
