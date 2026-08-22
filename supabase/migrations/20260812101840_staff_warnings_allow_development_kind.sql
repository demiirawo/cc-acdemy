-- The development-point feedback category was added in code (praise /
-- development / warning) but the check constraint still listed only the
-- original two, so saving a development point failed at the database. Align
-- the constraint with the app's three kinds.
alter table public.staff_warnings
  drop constraint staff_warnings_kind_check;
alter table public.staff_warnings
  add constraint staff_warnings_kind_check
  check (kind = any (array['praise'::text, 'development'::text, 'warning'::text]));
