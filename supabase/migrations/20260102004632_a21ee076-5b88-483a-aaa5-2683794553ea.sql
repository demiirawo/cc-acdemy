-- Add category and sort_order columns to client_passwords table
ALTER TABLE public.client_passwords
ADD COLUMN category text DEFAULT 'other',
ADD COLUMN sort_order integer DEFAULT 0;

-- Create an index on category for efficient filtering
CREATE INDEX idx_client_passwords_category ON public.client_passwords(category);

-- Create an index on sort_order for efficient ordering
CREATE INDEX idx_client_passwords_sort_order ON public.client_passwords(client_name, category, sort_order);