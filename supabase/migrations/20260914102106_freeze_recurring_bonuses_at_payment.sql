-- A paid month keeps the recurring bonuses it was paid with.
--
-- Recurring bonuses were added to a month live, even after it was paid, so a
-- paid month moved whenever one was added, backdated, stopped or deleted. A
-- bonus added "from June" for somebody still unpaid in June also raised the
-- July and August they had already been paid. Recurring deductions have been
-- captured into staff_pay_records at payment since 20260913193116. Recurring
-- bonuses now are too, and payroll and the staff pay view count the captured
-- record for a paid month instead of the row.
--
-- 1. Every month already paid has its recurring bonuses captured now, at the
--    amounts payroll shows for it today, so no paid total moves the day this
--    ships. The paid-record trigger is lifted for this insert only.
-- 2. A term can't be widened into a paid month, which it would silently skip.
-- 3. A month can't be marked paid unless exactly its active recurring bonuses
--    were captured with it, so a stale page can't skip or double one.

alter table public.staff_pay_records disable trigger block_paid_staff_pay_changes;

insert into public.staff_pay_records
  (user_id, record_type, amount, currency, description, pay_date, pay_period_start, pay_period_end, created_by)
select
  p.user_id,
  'bonus',
  b.amount,
  b.currency,
  'Recurring bonus: ' || coalesce(nullif(btrim(b.description, E' \t\r\n'), ''), 'Recurring bonus') || ' (captured at payment)',
  (p.pay_period_start + interval '1 month - 1 day')::date,
  p.pay_period_start,
  (p.pay_period_start + interval '1 month - 1 day')::date,
  b.created_by
from (
  select distinct user_id, pay_period_start
  from public.staff_pay_records
  where record_type = 'salary' and pay_period_start is not null
) p
join public.recurring_bonuses b
  on b.user_id = p.user_id
 and b.start_date <= (p.pay_period_start + interval '1 month - 1 day')::date
 and (b.end_date is null or b.end_date >= p.pay_period_start);

alter table public.staff_pay_records enable trigger block_paid_staff_pay_changes;

create or replace function public.refuse_recurring_bonus_in_paid_months()
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
      and (r.pay_period_start + interval '1 month - 1 day')::date >= new.start_date
      and (new.end_date is null or r.pay_period_start <= new.end_date);
  else
    -- Only the months this update brings in: stopping a bonus, or correcting
    -- its amount or description, still works when earlier months are paid.
    select min(r.pay_period_start) into first_paid
    from staff_pay_records r
    where r.user_id = new.user_id
      and r.record_type = 'salary'
      and (r.pay_period_start + interval '1 month - 1 day')::date >= new.start_date
      and (new.end_date is null or r.pay_period_start <= new.end_date)
      and (
        (r.pay_period_start + interval '1 month - 1 day')::date < old.start_date
        or (old.end_date is not null and r.pay_period_start > old.end_date)
        or new.user_id is distinct from old.user_id
      );
  end if;

  if first_paid is not null then
    raise exception '% is already paid for this person, so a recurring bonus can''t include it. Start it from the first unpaid month, or revert that payment first.',
      to_char(first_paid, 'FMMonth YYYY')
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger recurring_bonuses_not_into_paid_months
  before insert or update on public.recurring_bonuses
  for each row execute function public.refuse_recurring_bonus_in_paid_months();

create or replace function public.refuse_pay_without_recurring_bonuses()
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

  select count(*), coalesce(sum(b.amount), 0) into expected_count, expected_sum
  from recurring_bonuses b
  where b.user_id = new.user_id
    and b.start_date <= month_end
    and (b.end_date is null or b.end_date >= month_start);

  -- The captured rows come before the salary row in the same insert, and a
  -- row-level BEFORE trigger sees rows processed earlier in its statement.
  select count(*), coalesce(sum(r.amount), 0) into captured_count, captured_sum
  from staff_pay_records r
  where r.user_id = new.user_id
    and r.record_type = 'bonus'
    and r.pay_period_start = new.pay_period_start
    and r.description like 'Recurring bonus:%(captured at payment)';

  if expected_count <> captured_count or expected_sum <> captured_sum then
    raise exception 'This person''s recurring bonuses for % changed after the payroll page loaded, so they weren''t marked paid. Refresh the page and pay again.',
      to_char(month_start, 'FMMonth YYYY')
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger staff_pay_records_recurring_bonuses_captured
  before insert on public.staff_pay_records
  for each row execute function public.refuse_pay_without_recurring_bonuses();

revoke all on function public.refuse_recurring_bonus_in_paid_months() from public, anon, authenticated;
revoke all on function public.refuse_pay_without_recurring_bonuses() from public, anon, authenticated;
