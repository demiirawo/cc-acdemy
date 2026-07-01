-- Prevent non-admin staff from deleting a holiday, or changing any
-- refund-affecting field (dates, days taken, type, status) once it exists.
-- This stops staff inflating their unused-holiday refund by shrinking/removing
-- already-requested holidays. Admins and backend/service-role are unrestricted;
-- scheduling editors may still toggle cover-only fields (no_cover_required, notes).
CREATE OR REPLACE FUNCTION public.protect_holiday_refund_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Backend / service-role (no auth user) and admins are unrestricted.
  IF auth.uid() IS NULL OR public.get_current_user_role() = 'admin' THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Only an administrator can delete a holiday once it has been requested.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- UPDATE by a non-admin: the refund-affecting fields are locked.
  IF NEW.days_taken   IS DISTINCT FROM OLD.days_taken
     OR NEW.start_date   IS DISTINCT FROM OLD.start_date
     OR NEW.end_date     IS DISTINCT FROM OLD.end_date
     OR NEW.absence_type IS DISTINCT FROM OLD.absence_type
     OR NEW.status       IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'Only an administrator can change the dates, type, days or status of a holiday once it has been requested.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS staff_holidays_protect_refund_fields ON public.staff_holidays;
CREATE TRIGGER staff_holidays_protect_refund_fields
  BEFORE UPDATE OR DELETE ON public.staff_holidays
  FOR EACH ROW EXECUTE FUNCTION public.protect_holiday_refund_fields();
