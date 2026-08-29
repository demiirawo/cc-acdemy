-- A salary change stops taking effect the moment it is typed.
--
-- Payroll is run on the 1st. A rise entered on the 20th of the month used to
-- land immediately, so the run on the 1st paid the new figure for a month that
-- was worked at the old one — a backdated rise nobody decided to give, and one
-- that is invisible until somebody reconciles the payslip.
--
-- So the change is recorded here and applied on the 2nd: the day after payday,
-- once the run it must not disturb has been and gone. staff_salaries is
-- untouched until then, which means payroll, the bonus pot and the person's own
-- profile all keep showing the figure they are actually being paid.
--
-- The person is told straight away, though. Unlike a rating, there is nothing
-- to be gained by keeping a pay rise quiet until it lands.

create table if not exists public.pending_salary_changes (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null,
  previous_salary    numeric,
  previous_currency  text,
  new_salary         numeric not null,
  new_currency       text not null,
  reason             text,
  effective_date     date not null,
  notified_at        timestamptz,
  created_by         uuid,
  created_at         timestamptz not null default now(),
  applied_at         timestamptz,
  cancelled_at       timestamptz,
  cancelled_by       uuid,
  constraint pending_salary_changes_positive check (new_salary > 0)
);

-- One change in flight per person: changing your mind before it lands replaces
-- the decision rather than queueing two rises for the same morning.
create unique index if not exists pending_salary_changes_one_open_per_user
  on public.pending_salary_changes (user_id)
  where applied_at is null and cancelled_at is null;

create index if not exists pending_salary_changes_due
  on public.pending_salary_changes (effective_date)
  where applied_at is null and cancelled_at is null;

alter table public.pending_salary_changes enable row level security;

create policy "Admins manage pending salary changes"
  on public.pending_salary_changes for all
  using (get_current_user_role() = 'admin')
  with check (get_current_user_role() = 'admin');

-- Unlike a pending rating, the person may read their own: they have already
-- been emailed about it, so hiding it in the app would only be confusing.
create policy "Staff read their own pending salary change"
  on public.pending_salary_changes for select
  using (auth.uid() = user_id);

/**
 * When a salary decided today should take effect: the next 2nd of a month,
 * strictly after today.
 *
 * The 2nd rather than the 1st because the 1st is payday — a change landing that
 * morning could still catch the run. Strictly after today so a change entered
 * on the 2nd waits for next month rather than applying the moment it is typed,
 * which is the whole thing this is here to prevent.
 */
create or replace function public.next_salary_effective_date(p_from date default current_date)
returns date
language sql
immutable
as $$
  select case
    when extract(day from p_from) < 2
      then make_date(extract(year from p_from)::int, extract(month from p_from)::int, 2)
    else make_date(
      extract(year from (p_from + interval '1 month'))::int,
      extract(month from (p_from + interval '1 month'))::int,
      2)
  end;
$$;

comment on table public.pending_salary_changes is
  'Salary changes waiting for the 2nd of the month, after payroll has run. Applied by apply-pending-salaries.';

-- The daily job that applies due changes is scheduled separately, because the
-- cron command carries a bearer token that does not belong in version control.
-- It was created by copying an existing job's command and retargeting the URL:
--
--   select cron.schedule('apply-pending-salaries', '40 6 * * *',
--     replace((select command from cron.job where jobname = 'shift-ack-reminders'),
--             'shift-ack-reminders', 'apply-pending-salaries'));
--
-- Daily rather than monthly on purpose: apply-pending-salaries takes everything
-- with effective_date <= today, so a missed morning costs a day, not a month.
