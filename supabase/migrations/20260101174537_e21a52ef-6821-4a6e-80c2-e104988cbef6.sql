-- Add additional fields to clients table for comprehensive client management
ALTER TABLE public.clients 
ADD COLUMN IF NOT EXISTS mrr numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS status text DEFAULT 'active',
ADD COLUMN IF NOT EXISTS software text,
ADD COLUMN IF NOT EXISTS recurring_day integer,
ADD COLUMN IF NOT EXISTS contract_start_date date,
ADD COLUMN IF NOT EXISTS contract_end_date date,
ADD COLUMN IF NOT EXISTS key_contact_name text,
ADD COLUMN IF NOT EXISTS key_contact_email text,
ADD COLUMN IF NOT EXISTS key_contact_phone text,
ADD COLUMN IF NOT EXISTS company_address text,
ADD COLUMN IF NOT EXISTS website_address text,
ADD COLUMN IF NOT EXISTS software_used text,
ADD COLUMN IF NOT EXISTS software_login_details text,
ADD COLUMN IF NOT EXISTS billing_contact_name text,
ADD COLUMN IF NOT EXISTS billing_contact_email text,
ADD COLUMN IF NOT EXISTS billing_contact_phone text,
ADD COLUMN IF NOT EXISTS notes text,
ADD COLUMN IF NOT EXISTS source text;

-- Add comment for context
COMMENT ON COLUMN public.clients.mrr IS 'Monthly Recurring Revenue';
COMMENT ON COLUMN public.clients.recurring_day IS 'Day of month payment is due';
COMMENT ON COLUMN public.clients.status IS 'Client status: active, inactive, prospect, churned';