-- Bonus shifts: extra shifts paid through a monthly bonus instead of overtime.
--
-- A series marked with overtime_subtype = 'bonus' earns nothing at the overtime
-- day-rate. Instead its admin has a standing monthly amount, paid in proportion
-- to the bonus shifts actually worked that month (see src/lib/shiftBonus.ts).
-- At payment the pro-rated figure is written as a 'bonus' staff_pay_records row,
-- so a paid month is frozen by the existing record triggers and later edits to
-- the rota, leave or this config cannot move it.

create table public.shift_bonuses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  monthly_amount numeric(12, 2) not null check (monthly_amount > 0),
  -- The admin's own pay currency, like recurring_bonuses and one-off bonuses.
  currency text not null,
  description text,
  -- Whole months, like recurring_bonuses: from the first of a month, stopped at
  -- the end of one. Stopping in the month it began deletes the row instead.
  start_date date not null,
  end_date date,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint shift_bonuses_starts_on_the_first
    check (start_date = date_trunc('month', start_date)::date),
  constraint shift_bonuses_ends_on_a_month_end
    check (end_date is null or end_date = (date_trunc('month', end_date) + interval '1 month - 1 day')::date),
  constraint shift_bonuses_end_after_start
    check (end_date is null or end_date >= start_date)
);

create index shift_bonuses_user_id_idx on public.shift_bonuses (user_id);

comment on table public.shift_bonuses is
  'A standing monthly bonus per admin, paid pro rata across their bonus shifts (overtime_subtype = ''bonus''). Captured into staff_pay_records at payment.';

alter table public.shift_bonuses enable row level security;

-- Same shape as recurring_bonuses: admins manage, staff see their own so their
-- pay view can show what the bonus is and how it was worked out.
create policy "Admins can manage shift bonuses"
  on public.shift_bonuses for all
  using (get_current_user_role() = 'admin')
  with check (get_current_user_role() = 'admin');

create policy "Users can view their own shift bonuses"
  on public.shift_bonuses for select
  using (auth.uid() = user_id);

create trigger shift_bonuses_updated_at
  before update on public.shift_bonuses
  for each row execute function public.update_updated_at_column();

-- A typo in the subtype must fail, not pay. overtime_subtype is free text, and
-- every pay path reads an unrecognised value as 'standard' — so 'Bonus' or
-- 'bonus ' would have been paid at 1.5x overtime instead of through the bonus.
-- NULL stays allowed: fifteen early overtime patterns predate the column and
-- are read as 'standard'. Backfilling them would fire the shift audit trigger
-- and email those staff that their shifts "now count as overtime", which they
-- always have.
alter table public.recurring_shift_patterns
  add constraint recurring_shift_patterns_overtime_subtype_check
  check (overtime_subtype is null or overtime_subtype in ('standard', 'double_up', 'bonus'));

-- A bonus series is an extra shift, so it must carry is_overtime. With it off,
-- every reader treats the row as a normal contracted shift and the 'bonus'
-- would silently do nothing.
alter table public.recurring_shift_patterns
  add constraint recurring_shift_patterns_bonus_is_extra
  check (overtime_subtype is distinct from 'bonus' or is_overtime);

-- Bonus is set per series, never per day. A per-day override can still move
-- one bonus occurrence to paid overtime or to a normal shift, but it cannot
-- turn an ordinary day into a bonus day: that day would have no series to be
-- pro-rated against.
alter table public.shift_pattern_exceptions
  add constraint shift_pattern_exceptions_overtime_subtype_check
  check (overtime_subtype is null or overtime_subtype in ('standard', 'double_up'));
