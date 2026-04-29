-- Contractor invoicing details (staff's limited company info)
CREATE TABLE public.contractor_invoice_details (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE,
  company_name TEXT,
  contact_name TEXT,
  phone TEXT,
  email TEXT,
  company_address TEXT,
  bank_account_name TEXT,
  bank_account_number TEXT,
  bank_name TEXT,
  sort_code TEXT,
  iban TEXT,
  swift TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.contractor_invoice_details ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own contractor details"
  ON public.contractor_invoice_details FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own contractor details"
  ON public.contractor_invoice_details FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own contractor details"
  ON public.contractor_invoice_details FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can manage all contractor details"
  ON public.contractor_invoice_details FOR ALL
  USING (get_current_user_role() = 'admin');

CREATE TRIGGER update_contractor_invoice_details_updated_at
  BEFORE UPDATE ON public.contractor_invoice_details
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Invoice numbering sequence
CREATE SEQUENCE public.staff_invoice_number_seq START 1;

-- Generated invoices log
CREATE TABLE public.staff_invoices (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  invoice_number INT NOT NULL UNIQUE DEFAULT nextval('public.staff_invoice_number_seq'),
  user_id UUID NOT NULL,
  month DATE NOT NULL,
  description TEXT NOT NULL,
  amount NUMERIC NOT NULL,
  currency TEXT NOT NULL DEFAULT 'GBP',
  status TEXT NOT NULL DEFAULT 'draft',
  date_requested DATE NOT NULL DEFAULT CURRENT_DATE,
  sent_at TIMESTAMPTZ,
  sent_to_emails TEXT[],
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT staff_invoices_status_check CHECK (status IN ('draft','sent','paid','cancelled'))
);

ALTER TABLE public.staff_invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own invoices"
  ON public.staff_invoices FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own invoices"
  ON public.staff_invoices FOR INSERT
  WITH CHECK (auth.uid() = user_id OR get_current_user_role() = 'admin');

CREATE POLICY "Users can update their own draft invoices"
  ON public.staff_invoices FOR UPDATE
  USING (auth.uid() = user_id AND status = 'draft');

CREATE POLICY "Admins can manage all invoices"
  ON public.staff_invoices FOR ALL
  USING (get_current_user_role() = 'admin');

CREATE TRIGGER update_staff_invoices_updated_at
  BEFORE UPDATE ON public.staff_invoices
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_staff_invoices_user_id ON public.staff_invoices(user_id);
CREATE INDEX idx_staff_invoices_month ON public.staff_invoices(month);

-- Bill To settings (single row)
CREATE TABLE public.invoice_bill_to_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_name TEXT NOT NULL DEFAULT 'Care Cuddle Ltd',
  company_number TEXT DEFAULT '14893276',
  address_lines TEXT[] NOT NULL DEFAULT ARRAY['71-75 Shelton Street','Covent Garden','London','WC2H 9JQ','United Kingdom'],
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.invoice_bill_to_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view bill to settings"
  ON public.invoice_bill_to_settings FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can manage bill to settings"
  ON public.invoice_bill_to_settings FOR ALL
  USING (get_current_user_role() = 'admin');

CREATE TRIGGER update_invoice_bill_to_settings_updated_at
  BEFORE UPDATE ON public.invoice_bill_to_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Insert default Bill To row
INSERT INTO public.invoice_bill_to_settings (company_name, company_number, address_lines)
VALUES ('Care Cuddle Ltd', '14893276',
  ARRAY['71-75 Shelton Street','Covent Garden','London','WC2H 9JQ','United Kingdom']);
