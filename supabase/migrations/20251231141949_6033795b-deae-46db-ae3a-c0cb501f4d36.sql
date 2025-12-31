-- Add new holiday types to the staff_request_type enum
ALTER TYPE staff_request_type ADD VALUE IF NOT EXISTS 'holiday_paid';
ALTER TYPE staff_request_type ADD VALUE IF NOT EXISTS 'holiday_unpaid';

-- Note: We'll keep 'holiday' for backwards compatibility with existing data
-- The UI will use the new types going forward