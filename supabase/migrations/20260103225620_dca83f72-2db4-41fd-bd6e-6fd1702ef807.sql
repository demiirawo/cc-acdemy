-- Create page_quizzes table for quiz metadata
CREATE TABLE public.page_quizzes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  page_id UUID NOT NULL REFERENCES public.pages(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'Knowledge Check',
  description TEXT,
  passing_score INTEGER NOT NULL DEFAULT 80,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(page_id)
);

-- Create quiz_questions table
CREATE TABLE public.quiz_questions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  quiz_id UUID NOT NULL REFERENCES public.page_quizzes(id) ON DELETE CASCADE,
  question TEXT NOT NULL,
  options JSONB NOT NULL DEFAULT '[]'::jsonb,
  correct_answer INTEGER NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create quiz_completions table to track user quiz attempts
CREATE TABLE public.quiz_completions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  quiz_id UUID NOT NULL REFERENCES public.page_quizzes(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  score INTEGER NOT NULL,
  passed BOOLEAN NOT NULL,
  answers JSONB NOT NULL DEFAULT '[]'::jsonb,
  completed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(quiz_id, user_id)
);

-- Enable RLS
ALTER TABLE public.page_quizzes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quiz_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quiz_completions ENABLE ROW LEVEL SECURITY;

-- RLS policies for page_quizzes
CREATE POLICY "Admins can manage quizzes"
ON public.page_quizzes FOR ALL
USING (get_current_user_role() = 'admin');

CREATE POLICY "Everyone can view active quizzes"
ON public.page_quizzes FOR SELECT
USING (is_active = true);

-- RLS policies for quiz_questions
CREATE POLICY "Admins can manage quiz questions"
ON public.quiz_questions FOR ALL
USING (get_current_user_role() = 'admin');

CREATE POLICY "Everyone can view questions for active quizzes"
ON public.quiz_questions FOR SELECT
USING (EXISTS (
  SELECT 1 FROM public.page_quizzes
  WHERE page_quizzes.id = quiz_questions.quiz_id
  AND page_quizzes.is_active = true
));

-- RLS policies for quiz_completions
CREATE POLICY "Users can submit their own quiz completions"
ON public.quiz_completions FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view their own completions"
ON public.quiz_completions FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all completions"
ON public.quiz_completions FOR SELECT
USING (get_current_user_role() = 'admin');

-- Create indexes
CREATE INDEX idx_page_quizzes_page_id ON public.page_quizzes(page_id);
CREATE INDEX idx_quiz_questions_quiz_id ON public.quiz_questions(quiz_id);
CREATE INDEX idx_quiz_completions_quiz_id ON public.quiz_completions(quiz_id);
CREATE INDEX idx_quiz_completions_user_id ON public.quiz_completions(user_id);