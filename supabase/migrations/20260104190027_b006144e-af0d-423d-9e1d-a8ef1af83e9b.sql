-- Create storage bucket for onboarding documents
INSERT INTO storage.buckets (id, name, public)
VALUES ('onboarding-documents', 'onboarding-documents', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for onboarding documents
CREATE POLICY "Users can upload their own onboarding documents"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'onboarding-documents' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can view their own onboarding documents"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'onboarding-documents' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can update their own onboarding documents"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'onboarding-documents' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can delete their own onboarding documents"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'onboarding-documents' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Admins can view all onboarding documents"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'onboarding-documents'
  AND EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE user_id = auth.uid() AND role = 'admin'
  )
);

-- Create onboarding form table
CREATE TABLE public.staff_onboarding_documents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Personal Details
  employment_start_date DATE,
  full_name TEXT,
  date_of_birth DATE,
  phone_number TEXT,
  personal_email TEXT,
  address TEXT,
  
  -- Document uploads (store paths)
  proof_of_id_1_path TEXT,
  proof_of_id_1_type TEXT,
  proof_of_id_2_path TEXT,
  proof_of_id_2_type TEXT,
  photograph_path TEXT,
  
  -- Payroll
  bank_name TEXT,
  account_number TEXT,
  
  -- Emergency Contact
  emergency_contact_name TEXT,
  emergency_contact_relationship TEXT,
  emergency_contact_phone TEXT,
  emergency_contact_email TEXT,
  
  -- Form status
  form_status TEXT NOT NULL DEFAULT 'incomplete',
  submitted_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  UNIQUE(user_id)
);

-- Enable RLS
ALTER TABLE public.staff_onboarding_documents ENABLE ROW LEVEL SECURITY;

-- Users can view their own onboarding form
CREATE POLICY "Users can view their own onboarding form"
ON public.staff_onboarding_documents FOR SELECT
USING (auth.uid() = user_id);

-- Users can insert their own onboarding form
CREATE POLICY "Users can insert their own onboarding form"
ON public.staff_onboarding_documents FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Users can update their own onboarding form
CREATE POLICY "Users can update their own onboarding form"
ON public.staff_onboarding_documents FOR UPDATE
USING (auth.uid() = user_id);

-- Admins can view all onboarding forms
CREATE POLICY "Admins can view all onboarding forms"
ON public.staff_onboarding_documents FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE user_id = auth.uid() AND role = 'admin'
  )
);

-- Admins can update all onboarding forms
CREATE POLICY "Admins can update all onboarding forms"
ON public.staff_onboarding_documents FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE user_id = auth.uid() AND role = 'admin'
  )
);

-- Trigger for updated_at
CREATE TRIGGER update_staff_onboarding_documents_updated_at
BEFORE UPDATE ON public.staff_onboarding_documents
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();