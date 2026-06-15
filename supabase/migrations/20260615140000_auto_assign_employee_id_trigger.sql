-- Automatically assign a sequential employee ID (EMP001, EMP002, …) to every
-- HR profile on creation when one isn't supplied.
CREATE OR REPLACE FUNCTION public.assign_employee_id()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  next_num integer;
BEGIN
  IF NEW.employee_id IS NULL OR btrim(NEW.employee_id) = '' THEN
    SELECT COALESCE(MAX((substring(employee_id from '^EMP(\d+)$'))::int), 0) + 1
      INTO next_num
      FROM public.hr_profiles
     WHERE employee_id ~ '^EMP\d+$';
    NEW.employee_id := 'EMP' || lpad(next_num::text, 3, '0');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS hr_profiles_assign_employee_id ON public.hr_profiles;
CREATE TRIGGER hr_profiles_assign_employee_id
  BEFORE INSERT ON public.hr_profiles
  FOR EACH ROW EXECUTE FUNCTION public.assign_employee_id();
