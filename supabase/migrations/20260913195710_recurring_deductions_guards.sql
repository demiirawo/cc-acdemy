-- Two guards so a recurring deduction is never silently skipped or taken twice.
--
-- 1. A term cannot include a month that is already paid. A paid month only
--    carries an instalment if it was captured at the moment of payment, so a
--    deduction added afterwards would skip that month while the next one still
--    read "month 3 of 3". Checked on insert for the whole term, and on update
--    only for the months the update brings in, so stopping a deduction whose
--    earlier months are paid still works.
-- 2. A month cannot be marked paid unless every recurring deduction running
--    through it was captured, and nothing else was. The pay run captures from
--    what the page loaded; if another admin added or stopped a deduction in the
--    meantime, the salary row is refused and the admin refreshes. The captured
--    rows come before the salary row in the same insert, and a row-level BEFORE
--    trigger sees rows processed earlier in its statement — the ordering
--    block_paid_staff_pay_changes already relies on.

alter table public.recurring_deductions
  add constraint recurring_deductions_term_at_most_ten_years
  check (end_date is null or end_date < start_date + interval '10 years');

create or replace function public.refuse_recurring_deduction_in_paid_months()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  first_paid date;
begin
  if tg_op = 'INSERT' then
    select min(r.pay_period_start) into first_paid
    from staff_pay_records r
    where r.user_id = new.user_id
      and r.record_type = 'salary'
      and r.pay_period_start >= new.start_date
      and (new.end_date is null or r.pay_period_start <= new.end_date);
  else
    select min(r.pay_period_start) into first_paid
    from staff_pay_records r
    where r.user_id = new.user_id
      and r.record_type = 'salary'
      and r.pay_period_start >= new.start_date
      and (new.end_date is null or r.pay_period_start <= new.end_date)
      and (
        r.pay_period_start < old.start_date
        or (old.end_date is not null and r.pay_period_start > old.end_date)
        or new.user_id is distinct from old.user_id
      );
  end if;

  if first_paid is not null then
    raise exception '% is already paid for this person, so a recurring deduction can''t include it. Start it from the first unpaid month, or revert that payment first.',
      to_char(first_paid, 'FMMonth YYYY')
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger recurring_deductions_not_into_paid_months
  before insert or update on public.recurring_deductions
  for each row execute function public.refuse_recurring_deduction_in_paid_months();

create or replace function public.refuse_pay_without_recurring_deductions()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  month_start date;
  month_end date;
  expected_count integer;
  expected_sum numeric;
  captured_count integer;
  captured_sum numeric;
begin
  if new.record_type <> 'salary' or new.pay_period_start is null then
    return new;
  end if;
  month_start := date_trunc('month', new.pay_period_start)::date;
  month_end := (date_trunc('month', new.pay_period_start) + interval '1 month - 1 day')::date;

  select count(*), coalesce(sum(d.amount), 0) into expected_count, expected_sum
  from recurring_deductions d
  where d.user_id = new.user_id
    and d.start_date <= month_end
    and (d.end_date is null or d.end_date >= month_start);

  select count(*), coalesce(sum(r.amount), 0) into captured_count, captured_sum
  from staff_pay_records r
  where r.user_id = new.user_id
    and r.record_type = 'deduction'
    and r.pay_period_start = new.pay_period_start
    and r.description like 'Recurring deduction:%(captured at payment)';

  if expected_count <> captured_count or expected_sum <> captured_sum then
    raise exception 'This person''s recurring deductions for % changed after the payroll page loaded, so they weren''t marked paid. Refresh the page and pay again.',
      to_char(month_start, 'FMMonth YYYY')
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger staff_pay_records_recurring_deductions_captured
  before insert on public.staff_pay_records
  for each row execute function public.refuse_pay_without_recurring_deductions();

revoke all on function public.refuse_recurring_deduction_in_paid_months() from public, anon, authenticated;
revoke all on function public.refuse_pay_without_recurring_deductions() from public, anon, authenticated;
