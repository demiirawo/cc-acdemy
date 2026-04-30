-- Create table for persisting payroll "ready to pay" status per staff per month
CREATE TABLE public.payroll_ready_status (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  pay_period_month DATE NOT NULL, -- first day of the month
  marked_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (user_id, pay_period_month)
);

ALTER TABLE public.payroll_ready_status ENABLE ROW LEVEL SECURITY;

-- Only admins can view/manage payroll ready status
CREATE POLICY "Admins can view payroll ready status"
ON public.payroll_ready_status
FOR SELECT
USING (get_current_user_role() = 'admin');

CREATE POLICY "Admins can insert payroll ready status"
ON public.payroll_ready_status
FOR INSERT
WITH CHECK (get_current_user_role() = 'admin');

CREATE POLICY "Admins can update payroll ready status"
ON public.payroll_ready_status
FOR UPDATE
USING (get_current_user_role() = 'admin');

CREATE POLICY "Admins can delete payroll ready status"
ON public.payroll_ready_status
FOR DELETE
USING (get_current_user_role() = 'admin');

CREATE TRIGGER update_payroll_ready_status_updated_at
BEFORE UPDATE ON public.payroll_ready_status
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_payroll_ready_status_month ON public.payroll_ready_status(pay_period_month);
