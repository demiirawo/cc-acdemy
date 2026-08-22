-- A completed payroll month is frozen: once every staff member has been marked
-- paid, that month's pay records stop accepting changes. Reverting anyone back to
-- ready lifts the lock, which is the only intended way to reopen a month.
--
-- The lock is an explicit row rather than a derived "is everyone paid?" check, so
-- the database can enforce it cheaply and the decision is auditable — who froze
-- which month, and when.
create table if not exists public.payroll_locks (
  month date primary key,            -- first day of the payroll month
  locked_at timestamptz not null default now(),
  locked_by uuid
);

alter table public.payroll_locks enable row level security;

drop policy if exists "Admins manage payroll locks" on public.payroll_locks;
create policy "Admins manage payroll locks" on public.payroll_locks for all
  using (public.get_current_user_role() = 'admin')
  with check (public.get_current_user_role() = 'admin');

drop policy if exists "Staff can see payroll locks" on public.payroll_locks;
create policy "Staff can see payroll locks" on public.payroll_locks for select
  using (auth.uid() is not null);

-- Refuse any change to pay records belonging to a frozen month. This is the real
-- guard: disabling buttons in the UI only stops the honest path, and the bonus-pot
-- recalculation rewrites pay records from several places.
create or replace function public.block_locked_payroll_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  affected date;
begin
  affected := date_trunc('month', coalesce(new.pay_period_start, old.pay_period_start))::date;
  if exists (select 1 from public.payroll_locks l where l.month = affected) then
    raise exception 'Payroll for % is finalised and locked. Revert a staff member to ready to reopen it.',
      to_char(affected, 'Mon YYYY')
      using errcode = 'check_violation';
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists block_locked_payroll_changes on public.staff_pay_records;
create trigger block_locked_payroll_changes
  before insert or update or delete on public.staff_pay_records
  for each row execute function public.block_locked_payroll_changes();

comment on table public.payroll_locks is
  'Frozen payroll months. A row here blocks all writes to staff_pay_records for that month via the block_locked_payroll_changes trigger.';
