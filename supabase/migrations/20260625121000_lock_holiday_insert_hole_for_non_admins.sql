-- Close the holiday-refund abuse vector at the INSERT layer.
--
-- 1) Staff never insert into staff_holidays directly: the request flow writes to
--    staff_requests, and approvals are performed by admins in RequestDetailPage
--    (which sets user_id = the requester, so the old policy's auth.uid() = user_id
--    check never covered approvals anyway). The vestigial "Users can request
--    holidays" policy let ANY authenticated user insert an *approved* holiday for
--    themselves -- including one with a NEGATIVE days_taken, which would shrink
--    Sigma(days_taken) and inflate their unused-holiday refund. Remove it so only
--    admins ("Admins can manage all holidays") can insert.
DROP POLICY IF EXISTS "Users can request holidays" ON public.staff_holidays;

-- 2) Defense in depth: days_taken can never be negative, so no future policy or
--    code path can drive Sigma(days_taken) below zero to game the refund.
--    Verified: 0 of 137 existing rows have negative days_taken.
ALTER TABLE public.staff_holidays
  DROP CONSTRAINT IF EXISTS staff_holidays_days_taken_nonneg;
ALTER TABLE public.staff_holidays
  ADD CONSTRAINT staff_holidays_days_taken_nonneg CHECK (days_taken >= 0);
