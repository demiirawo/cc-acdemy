-- Add 'overtime' to the staff_request_type enum
ALTER TYPE public.staff_request_type ADD VALUE IF NOT EXISTS 'overtime';

-- Add column to link overtime requests to approved holidays
ALTER TABLE public.staff_requests 
ADD COLUMN IF NOT EXISTS linked_holiday_id uuid REFERENCES public.staff_holidays(id) ON DELETE SET NULL;

-- Add column to track if overtime is during standard hours or outside
ALTER TABLE public.staff_requests 
ADD COLUMN IF NOT EXISTS overtime_type text CHECK (overtime_type IN ('standard_hours', 'outside_hours', NULL));

-- Create index for the new column
CREATE INDEX IF NOT EXISTS idx_staff_requests_linked_holiday_id ON public.staff_requests(linked_holiday_id);