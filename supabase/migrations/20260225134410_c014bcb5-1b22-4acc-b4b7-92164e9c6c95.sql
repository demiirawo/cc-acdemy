
-- Create table for persisted manual currency rate overrides
CREATE TABLE public.manual_currency_rates (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  currency_code text NOT NULL UNIQUE,
  rate_to_gbp numeric NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_by uuid NOT NULL
);

-- Enable RLS
ALTER TABLE public.manual_currency_rates ENABLE ROW LEVEL SECURITY;

-- Admins can manage manual rates
CREATE POLICY "Admins can manage manual currency rates"
ON public.manual_currency_rates
FOR ALL
USING (get_current_user_role() = 'admin');

-- Everyone can view rates (needed for pay forecast)
CREATE POLICY "Authenticated users can view manual rates"
ON public.manual_currency_rates
FOR SELECT
USING (true);
