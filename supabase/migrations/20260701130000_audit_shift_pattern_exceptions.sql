-- Notify staff of single-day schedule changes too: cancelling one shift
-- (exception_type='deleted') or toggling a day to/from overtime creates a row in
-- shift_pattern_exceptions, which previously had NO audit trigger, so those changes
-- were silent. Mirror log_shift_change() into shift_audit_log so the existing
-- staff-shift-change-notification cron picks them up. The exceptions table has no
-- user_id/client_name, so join back to the parent recurring_shift_patterns.
CREATE OR REPLACE FUNCTION public.log_shift_exception_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pattern_id uuid := COALESCE(NEW.pattern_id, OLD.pattern_id);
  v_user_id uuid;
  v_client_name text;
  v_payload jsonb;
BEGIN
  SELECT user_id, client_name INTO v_user_id, v_client_name
  FROM public.recurring_shift_patterns
  WHERE id = v_pattern_id;

  -- Parent pattern gone (e.g. cascade delete of the whole pattern): skip. The
  -- pattern's own audit row already tells the staff member the pattern was removed.
  IF v_user_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  v_payload := jsonb_build_object(
    'user_id',          v_user_id,
    'client_name',      v_client_name,
    'pattern_id',       v_pattern_id,
    'exception_date',   COALESCE(NEW.exception_date, OLD.exception_date),
    'exception_type',   COALESCE(NEW.exception_type, OLD.exception_type),
    'overtime_subtype', COALESCE(NEW.overtime_subtype, OLD.overtime_subtype)
  );

  INSERT INTO public.shift_audit_log (table_name, record_id, action, changed_by, old_data, new_data)
  VALUES (
    'shift_pattern_exceptions',
    COALESCE(NEW.id, OLD.id),
    TG_OP,
    COALESCE(NEW.created_by, OLD.created_by, auth.uid()),
    CASE WHEN TG_OP = 'DELETE' THEN v_payload ELSE NULL END,
    CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE v_payload END
  );

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS shift_pattern_exceptions_audit ON public.shift_pattern_exceptions;
CREATE TRIGGER shift_pattern_exceptions_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.shift_pattern_exceptions
  FOR EACH ROW EXECUTE FUNCTION public.log_shift_exception_change();
