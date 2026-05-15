ALTER TABLE public.recruitment_attempts ADD COLUMN IF NOT EXISTS ip_address text;
CREATE INDEX IF NOT EXISTS idx_recruitment_attempts_test_email ON public.recruitment_attempts (test_id, lower(email));
CREATE INDEX IF NOT EXISTS idx_recruitment_attempts_test_ip ON public.recruitment_attempts (test_id, ip_address);