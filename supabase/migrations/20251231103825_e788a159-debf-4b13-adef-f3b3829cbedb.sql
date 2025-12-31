-- Create enum for absence types
CREATE TYPE public.absence_type AS ENUM ('holiday', 'sick', 'personal', 'maternity', 'paternity', 'unpaid', 'other');

-- Create enum for pay record types
CREATE TYPE public.pay_record_type AS ENUM ('salary', 'bonus', 'deduction', 'expense', 'overtime');

-- Create staff HR profiles table
CREATE TABLE public.hr_profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE,
  employee_id TEXT,
  job_title TEXT,
  department TEXT,
  start_date DATE,
  base_currency TEXT NOT NULL DEFAULT 'GBP',
  annual_holiday_allowance INTEGER DEFAULT 28,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create staff holidays/absence table
CREATE TABLE public.staff_holidays (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  absence_type public.absence_type NOT NULL DEFAULT 'holiday',
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  days_taken NUMERIC(4,1) NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  notes TEXT,
  approved_by UUID,
  approved_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create staff pay records table with multi-currency support
CREATE TABLE public.staff_pay_records (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  record_type public.pay_record_type NOT NULL DEFAULT 'salary',
  amount NUMERIC(12,2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'GBP',
  description TEXT,
  pay_date DATE NOT NULL,
  pay_period_start DATE,
  pay_period_end DATE,
  created_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.hr_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_holidays ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_pay_records ENABLE ROW LEVEL SECURITY;

-- HR Profiles policies
CREATE POLICY "Users can view their own HR profile"
ON public.hr_profiles FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all HR profiles"
ON public.hr_profiles FOR SELECT
USING (get_current_user_role() = 'admin');

CREATE POLICY "Admins can manage HR profiles"
ON public.hr_profiles FOR ALL
USING (get_current_user_role() = 'admin');

-- Staff Holidays policies
CREATE POLICY "Users can view their own holidays"
ON public.staff_holidays FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all holidays"
ON public.staff_holidays FOR SELECT
USING (get_current_user_role() = 'admin');

CREATE POLICY "Users can request holidays"
ON public.staff_holidays FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can manage all holidays"
ON public.staff_holidays FOR ALL
USING (get_current_user_role() = 'admin');

-- Staff Pay Records policies
CREATE POLICY "Users can view their own pay records"
ON public.staff_pay_records FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all pay records"
ON public.staff_pay_records FOR SELECT
USING (get_current_user_role() = 'admin');

CREATE POLICY "Admins can manage pay records"
ON public.staff_pay_records FOR ALL
USING (get_current_user_role() = 'admin');

-- Add updated_at triggers
CREATE TRIGGER update_hr_profiles_updated_at
BEFORE UPDATE ON public.hr_profiles
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_staff_holidays_updated_at
BEFORE UPDATE ON public.staff_holidays
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_staff_pay_records_updated_at
BEFORE UPDATE ON public.staff_pay_records
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();