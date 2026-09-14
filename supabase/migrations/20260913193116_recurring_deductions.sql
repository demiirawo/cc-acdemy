-- A deduction that runs for a term: the same amount every month from a start
-- month to an end month, or until stopped.
--
-- A deduction was a one-off pay record, one per month, and the adjustments
-- dialog could hold one per month. Recovering a laptop over three months
-- meant typing the same amount into three months by hand, and forgetting one
-- was easy. This is the same shape as recurring_bonuses, with whole months
-- and a term: end_date is the last day of the last month it applies to, or
-- NULL for "until stopped".
--
-- Unlike recurring bonuses, which are added live even after a month is paid,
-- each month's instalment is written into staff_pay_records when the month is
-- paid (see buildPaymentRecords), so a paid month is frozen at what was
-- deducted on the day and a later change here cannot move it.
create table public.recurring_deductions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  amount numeric(12, 2) not null check (amount > 0),
  currency text not null,
  -- The reason. Shown to the staff member on their pay breakdown.
  description text,
  start_date date not null,
  end_date date,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint recurring_deductions_starts_on_the_first
    check (start_date = date_trunc('month', start_date)::date),
  constraint recurring_deductions_ends_on_a_month_end
    check (end_date is null or end_date = (date_trunc('month', end_date) + interval '1 month - 1 day')::date),
  constraint recurring_deductions_end_after_start
    check (end_date is null or end_date >= start_date)
);

comment on table public.recurring_deductions is
  'A deduction taken every month from start_date to end_date (NULL = until stopped). Each month''s instalment is captured into staff_pay_records at payment.';

create index recurring_deductions_user_id_idx on public.recurring_deductions (user_id);

alter table public.recurring_deductions enable row level security;

create policy "Admins can manage recurring deductions"
  on public.recurring_deductions for all
  using (get_current_user_role() = 'admin')
  with check (get_current_user_role() = 'admin');

create policy "Users can view their own recurring deductions"
  on public.recurring_deductions for select
  using (auth.uid() = user_id);

create trigger recurring_deductions_updated_at
  before update on public.recurring_deductions
  for each row execute function public.update_updated_at_column();
