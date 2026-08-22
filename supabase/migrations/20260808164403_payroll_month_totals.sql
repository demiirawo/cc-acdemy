-- The Payroll tab computes the real monthly cost per person — holiday overtime,
-- bonuses, deductions, pro-rata — but only while it is on screen. Finance could
-- therefore show two different payroll figures for one month depending on which
-- tab you had opened. Persist what Payroll computes so Finance reads the same
-- number for any month, whether or not the Payroll tab has been visited.
create table if not exists public.payroll_month_totals (
  month text not null,                  -- 'YYYY-MM'
  user_id uuid not null references auth.users(id) on delete cascade,
  total_gbp numeric not null default 0,
  updated_at timestamptz not null default now(),
  primary key (month, user_id)
);

create index if not exists payroll_month_totals_month_idx
  on public.payroll_month_totals (month);

alter table public.payroll_month_totals enable row level security;

create policy "Admins manage payroll month totals"
  on public.payroll_month_totals for all
  using (get_current_user_role() = 'admin')
  with check (get_current_user_role() = 'admin');

create policy "HR can view payroll month totals"
  on public.payroll_month_totals for select
  using (get_current_user_role() = any (array['admin','human_resources']));
