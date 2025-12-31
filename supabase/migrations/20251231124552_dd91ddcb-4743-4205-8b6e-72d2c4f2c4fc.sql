-- Create enum for request types
CREATE TYPE public.staff_request_type AS ENUM (
  'overtime_standard',    -- Working outside normal hours
  'overtime_double_up',   -- Covering colleague during regular hours
  'holiday',              -- Time off request
  'shift_swap'            -- Swapping shifts with another staff member
);

-- Create table for staff requests
CREATE TABLE public.staff_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  request_type public.staff_request_type NOT NULL,
  swap_with_user_id UUID, -- For shift swaps, the other staff member
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  days_requested NUMERIC NOT NULL DEFAULT 1,
  details TEXT, -- Explanation of the request
  status TEXT NOT NULL DEFAULT 'pending', -- pending, approved, rejected
  reviewed_by UUID,
  reviewed_at TIMESTAMP WITH TIME ZONE,
  review_notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.staff_requests ENABLE ROW LEVEL SECURITY;

-- Users can view their own requests
CREATE POLICY "Users can view their own requests"
ON public.staff_requests
FOR SELECT
USING (auth.uid() = user_id);

-- Users can create their own requests
CREATE POLICY "Users can create their own requests"
ON public.staff_requests
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Admins can view all requests
CREATE POLICY "Admins can view all requests"
ON public.staff_requests
FOR SELECT
USING (get_current_user_role() = 'admin');

-- Admins can manage all requests
CREATE POLICY "Admins can manage all requests"
ON public.staff_requests
FOR ALL
USING (get_current_user_role() = 'admin');

-- Users can view requests where they are the swap partner
CREATE POLICY "Users can view requests where they are swap partner"
ON public.staff_requests
FOR SELECT
USING (auth.uid() = swap_with_user_id);

-- Create trigger for updated_at
CREATE TRIGGER update_staff_requests_updated_at
BEFORE UPDATE ON public.staff_requests
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();