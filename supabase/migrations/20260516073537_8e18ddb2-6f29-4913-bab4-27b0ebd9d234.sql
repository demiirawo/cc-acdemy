-- Prevent duplicate answer rows per question per attempt
ALTER TABLE public.recruitment_answers
  DROP CONSTRAINT IF EXISTS recruitment_answers_attempt_question_unique;
ALTER TABLE public.recruitment_answers
  ADD CONSTRAINT recruitment_answers_attempt_question_unique
  UNIQUE (attempt_id, question_id);

-- Repair any existing rows where total exceeds max
UPDATE public.recruitment_attempts
SET total_score = max_score
WHERE max_score IS NOT NULL
  AND total_score IS NOT NULL
  AND total_score > max_score;