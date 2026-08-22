-- Once a person is marked paid for a month (their salary record exists), their
-- pay records for that month are frozen: nothing added, changed or removed.
-- The one exception is deleting the salary record itself — that IS the act of
-- reverting them to unpaid, after which the month's records open up again.
-- This complements the whole-month lock in payroll_locks: that freezes a
-- completed month; this freezes each person the moment they are paid.
create or replace function public.block_paid_staff_pay_changes()
returns trigger
language plpgsql
security definer
as $$
declare
  target_user uuid;
  period_start date;
  is_paid boolean;
begin
  target_user := coalesce(new.user_id, old.user_id);
  period_start := coalesce(new.pay_period_start, old.pay_period_start);
  if target_user is null or period_start is null then
    return coalesce(new, old);
  end if;

  -- Deleting the salary record is the revert action — always allowed.
  if tg_op = 'DELETE' and old.record_type = 'salary' then
    return old;
  end if;

  select exists (
    select 1 from public.staff_pay_records r
    where r.user_id = target_user
      and r.pay_period_start = period_start
      and r.record_type = 'salary'
      and (tg_op = 'INSERT' or r.id <> coalesce(old.id, new.id) or r.record_type <> new.record_type)
  ) into is_paid;

  -- For UPDATE of the salary record itself, the row found IS the lock.
  if tg_op = 'UPDATE' then
    select exists (
      select 1 from public.staff_pay_records r
      where r.user_id = target_user
        and r.pay_period_start = period_start
        and r.record_type = 'salary'
    ) into is_paid;
  end if;

  if is_paid then
    raise exception 'This person is marked paid for % — revert them to unpaid before changing their pay records.',
      to_char(period_start, 'FMMonth YYYY');
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists block_paid_staff_pay_changes on public.staff_pay_records;
create trigger block_paid_staff_pay_changes
  before insert or update or delete on public.staff_pay_records
  for each row execute function public.block_paid_staff_pay_changes();
