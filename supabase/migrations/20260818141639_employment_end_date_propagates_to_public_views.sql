-- A leaving date is the reliable record of someone leaving; employment_status
-- is not, because it keeps reading "active" once a date is recorded. The public
-- training matrix trusted the status alone, so two people who had already left
-- were still listed on a page clients and regulators can see.
--
-- The date is inclusive, matching payroll: someone leaving on the 14th is still
-- staff on the 14th and gone on the 15th. current_date is evaluated per query,
-- so these stay correct as time passes without anyone maintaining them.

create or replace view public.training_matrix_staff_public as
  select user_id, employment_status
  from public.hr_profiles
  where employment_status = any (array[
          'onboarding_probation'::employment_status,
          'onboarding_passed'::employment_status,
          'active'::employment_status])
    and (employment_end_date is null or employment_end_date >= current_date);

-- The leaving date belongs alongside the start date here; without it, anything
-- reading this view can only see when someone arrived. Appended rather than
-- slotted next to start_date so the existing columns keep their positions.
create or replace view public.hr_profiles_public as
  select id, user_id, employee_id, job_title, department, employment_status,
         scheduling_role, start_date, created_at, updated_at,
         employment_end_date
  from public.hr_profiles;

-- The anonymous live board cannot read hr_profiles at all (its SELECT policy is
-- authenticated-only), so it had no way to tell who had left. This exposes the
-- employment window and nothing else — no salary, no rating, no personal
-- details — which is the minimum a public schedule needs to stop showing people
-- who no longer work here.
create or replace view public.staff_employment_public
  with (security_invoker = off) as
  select user_id, start_date, employment_end_date
  from public.hr_profiles;

grant select on public.staff_employment_public to anon, authenticated;
