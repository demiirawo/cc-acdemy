
-- Recruitment / candidate evaluation module

CREATE TABLE public.recruitment_tests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  role TEXT,
  pass_threshold INTEGER NOT NULL DEFAULT 70,
  seconds_per_question INTEGER NOT NULL DEFAULT 20,
  status TEXT NOT NULL DEFAULT 'draft', -- draft | live | closed
  shuffle_questions BOOLEAN NOT NULL DEFAULT true,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.recruitment_questions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  test_id UUID NOT NULL REFERENCES public.recruitment_tests(id) ON DELETE CASCADE,
  position INTEGER NOT NULL DEFAULT 0,
  question_text TEXT NOT NULL,
  question_type TEXT NOT NULL DEFAULT 'multiple_choice', -- multiple_choice | multi_select | true_false
  options JSONB NOT NULL DEFAULT '[]'::jsonb,
  correct_answers JSONB NOT NULL DEFAULT '[]'::jsonb,
  weight INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_recruitment_questions_test ON public.recruitment_questions(test_id, position);

CREATE TABLE public.recruitment_attempts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  test_id UUID NOT NULL REFERENCES public.recruitment_tests(id) ON DELETE CASCADE,
  candidate_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  cv_path TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  submitted_at TIMESTAMPTZ,
  total_score NUMERIC NOT NULL DEFAULT 0,
  max_score NUMERIC NOT NULL DEFAULT 0,
  integrity_score INTEGER NOT NULL DEFAULT 100,
  status TEXT NOT NULL DEFAULT 'in_progress', -- in_progress | submitted | abandoned
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_recruitment_attempts_test ON public.recruitment_attempts(test_id, total_score DESC);

CREATE TABLE public.recruitment_answers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  attempt_id UUID NOT NULL REFERENCES public.recruitment_attempts(id) ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES public.recruitment_questions(id) ON DELETE CASCADE,
  answer JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_correct BOOLEAN NOT NULL DEFAULT false,
  points_awarded NUMERIC NOT NULL DEFAULT 0,
  time_taken_ms INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_recruitment_answers_attempt ON public.recruitment_answers(attempt_id);

CREATE TABLE public.recruitment_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  attempt_id UUID NOT NULL REFERENCES public.recruitment_attempts(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL, -- tab_blur | mouse_leave | fullscreen_exit | copy_attempt | paste_attempt | contextmenu | snapshot
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX idx_recruitment_events_attempt ON public.recruitment_events(attempt_id, occurred_at);

CREATE TABLE public.recruitment_snapshots (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  attempt_id UUID NOT NULL REFERENCES public.recruitment_attempts(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  taken_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_recruitment_snapshots_attempt ON public.recruitment_snapshots(attempt_id, taken_at);

-- Enable RLS
ALTER TABLE public.recruitment_tests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recruitment_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recruitment_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recruitment_answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recruitment_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recruitment_snapshots ENABLE ROW LEVEL SECURITY;

-- Tests: admins manage; public can read live tests by slug (needed for public landing page)
CREATE POLICY "Admins manage tests" ON public.recruitment_tests
  FOR ALL USING (get_current_user_role() = 'admin')
  WITH CHECK (get_current_user_role() = 'admin');

CREATE POLICY "Public can view live tests" ON public.recruitment_tests
  FOR SELECT USING (status = 'live');

-- Questions: admins manage; public can read questions of live tests (for taking the test)
CREATE POLICY "Admins manage questions" ON public.recruitment_questions
  FOR ALL USING (get_current_user_role() = 'admin')
  WITH CHECK (get_current_user_role() = 'admin');

CREATE POLICY "Public can view questions of live tests" ON public.recruitment_questions
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.recruitment_tests t WHERE t.id = test_id AND t.status = 'live')
  );

-- Attempts: admins read all; public can insert + update their attempt (anon)
CREATE POLICY "Admins read attempts" ON public.recruitment_attempts
  FOR SELECT USING (get_current_user_role() = 'admin');

CREATE POLICY "Admins manage attempts" ON public.recruitment_attempts
  FOR ALL USING (get_current_user_role() = 'admin')
  WITH CHECK (get_current_user_role() = 'admin');

CREATE POLICY "Public can create attempt for live test" ON public.recruitment_attempts
  FOR INSERT TO anon, authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.recruitment_tests t WHERE t.id = test_id AND t.status = 'live')
  );

CREATE POLICY "Public can update own in-progress attempt" ON public.recruitment_attempts
  FOR UPDATE TO anon, authenticated USING (status = 'in_progress')
  WITH CHECK (true);

-- Answers: admins read; public can insert linked to in-progress attempt
CREATE POLICY "Admins read answers" ON public.recruitment_answers
  FOR SELECT USING (get_current_user_role() = 'admin');

CREATE POLICY "Public can insert answers" ON public.recruitment_answers
  FOR INSERT TO anon, authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.recruitment_attempts a WHERE a.id = attempt_id AND a.status = 'in_progress')
  );

-- Events: same pattern
CREATE POLICY "Admins read events" ON public.recruitment_events
  FOR SELECT USING (get_current_user_role() = 'admin');

CREATE POLICY "Public can insert events" ON public.recruitment_events
  FOR INSERT TO anon, authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.recruitment_attempts a WHERE a.id = attempt_id AND a.status = 'in_progress')
  );

-- Snapshots: same pattern
CREATE POLICY "Admins read snapshots" ON public.recruitment_snapshots
  FOR SELECT USING (get_current_user_role() = 'admin');

CREATE POLICY "Public can insert snapshots" ON public.recruitment_snapshots
  FOR INSERT TO anon, authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.recruitment_attempts a WHERE a.id = attempt_id AND a.status = 'in_progress')
  );

-- updated_at triggers
CREATE TRIGGER trg_recruitment_tests_updated_at
  BEFORE UPDATE ON public.recruitment_tests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_recruitment_questions_updated_at
  BEFORE UPDATE ON public.recruitment_questions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Storage buckets
INSERT INTO storage.buckets (id, name, public) VALUES ('candidate-cvs', 'candidate-cvs', false)
  ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('candidate-snapshots', 'candidate-snapshots', false)
  ON CONFLICT (id) DO NOTHING;

-- Storage policies: admins read; public can upload (anon)
CREATE POLICY "Admins read candidate CVs" ON storage.objects
  FOR SELECT USING (bucket_id = 'candidate-cvs' AND get_current_user_role() = 'admin');

CREATE POLICY "Anyone can upload candidate CV" ON storage.objects
  FOR INSERT TO anon, authenticated
  WITH CHECK (bucket_id = 'candidate-cvs');

CREATE POLICY "Admins read candidate snapshots" ON storage.objects
  FOR SELECT USING (bucket_id = 'candidate-snapshots' AND get_current_user_role() = 'admin');

CREATE POLICY "Anyone can upload candidate snapshot" ON storage.objects
  FOR INSERT TO anon, authenticated
  WITH CHECK (bucket_id = 'candidate-snapshots');
