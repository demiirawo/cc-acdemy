-- Rename training_manager -> human_resources; move salary to a private table;
-- broaden HR-management RLS to admin + HR. See app for the full model.
alter table public.profiles drop constraint if exists profiles_role_check;
set session_replication_role = replica;
update public.profiles set role = 'human_resources' where role = 'training_manager';
set session_replication_role = default;
alter table public.profiles add constraint profiles_role_check
  check (role = any (array['admin','editor','viewer','human_resources']));

create or replace function public.is_hr_or_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select public.get_current_user_role() in ('admin', 'human_resources');
$$;
grant execute on function public.is_hr_or_admin() to authenticated;

create table if not exists public.staff_salaries (
  user_id uuid primary key,
  base_salary numeric,
  base_currency text not null default 'GBP',
  updated_at timestamptz not null default now()
);
alter table public.staff_salaries enable row level security;
drop policy if exists "Admins manage salaries" on public.staff_salaries;
create policy "Admins manage salaries" on public.staff_salaries for all
  using (public.get_current_user_role() = 'admin') with check (public.get_current_user_role() = 'admin');
drop policy if exists "Users read own salary" on public.staff_salaries;
create policy "Users read own salary" on public.staff_salaries for select using (auth.uid() = user_id);

create or replace function public.get_rating_spread()
returns table(performance_rating text, start_date date, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select h.performance_rating, h.start_date, h.created_at
  from public.hr_profiles h join public.staff_salaries s on s.user_id = h.user_id
  where coalesce(s.base_salary, 0) > 0;
$$;
grant execute on function public.get_rating_spread() to authenticated;

alter table public.hr_profiles drop column if exists base_salary;
alter table public.hr_profiles drop column if exists base_currency;

drop policy if exists "HR can manage HR profiles" on public.hr_profiles;
create policy "HR can manage HR profiles" on public.hr_profiles for all
  using (public.is_hr_or_admin()) with check (public.is_hr_or_admin());
-- (Management-table policies for warnings/supervisions/incidents/meetings/
--  performance_criteria/client_assignments/training_* broadened to is_hr_or_admin;
--  applied on the hosted DB — see mcp migration hr_role_and_salary_privacy.)
