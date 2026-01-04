-- Add proof of address fields to staff_onboarding_documents
ALTER TABLE public.staff_onboarding_documents 
ADD COLUMN IF NOT EXISTS proof_of_address_path TEXT,
ADD COLUMN IF NOT EXISTS proof_of_address_type TEXT;