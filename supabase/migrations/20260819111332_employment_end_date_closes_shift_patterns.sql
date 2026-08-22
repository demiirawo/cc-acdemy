-- Recording a leaving date now closes that person's shift patterns on the same
-- date. Until now the date was only a label: the patterns carried on generating
-- shifts indefinitely, so the schedule kept projecting people who had gone.
--
-- The previous end date of every pattern the trigger touches is kept, so that
-- clearing a leaving date — set in error, or a resignation withdrawn — puts the
-- patterns back exactly as they were. Without that record, capping would be a
-- one-way door.

create table if not exists public.shift_pattern_leaving_caps (
  id uuid primary key default gen_random_uuid(),
  pattern_id uuid not null,
  user_id uuid not null,
  previous_end_date date,          -- null means the pattern had no end at all
  capped_to date not null,
  created_at timestamptz not null default now()
);

create index if not exists shift_pattern_leaving_caps_user_idx
  on public.shift_pattern_leaving_caps (user_id);

-- Nothing in the application reads this; it exists so the trigger can undo
-- itself. Deny-all: RLS on with no policies leaves only the service role.
alter table public.shift_pattern_leaving_caps enable row level security;
revoke all on public.shift_pattern_leaving_caps from anon, authenticated;

create or replace function public.close_shift_patterns_on_leaving()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  -- A leaving date was set or moved: close anything still running past it.
  if new.employment_end_date is not null
     and (tg_op = 'INSERT' or old.employment_end_date is distinct from new.employment_end_date)
  then
    insert into public.shift_pattern_leaving_caps (pattern_id, user_id, previous_end_date, capped_to)
    select rp.id, rp.user_id, rp.end_date, new.employment_end_date
    from public.recurring_shift_patterns rp
    where rp.user_id = new.user_id
      and (rp.end_date is null or rp.end_date > new.employment_end_date);

    update public.recurring_shift_patterns rp
    set end_date = new.employment_end_date
    where rp.user_id = new.user_id
      and (rp.end_date is null or rp.end_date > new.employment_end_date);

  -- The leaving date was cleared: put back what this trigger changed, but only
  -- where the pattern still holds the date we set. If someone has edited it
  -- since, their edit is the newer intention and is left alone.
  elsif new.employment_end_date is null
        and tg_op = 'UPDATE'
        and old.employment_end_date is not null
  then
    update public.recurring_shift_patterns rp
    set end_date = c.previous_end_date
    from public.shift_pattern_leaving_caps c
    where c.pattern_id = rp.id
      and c.user_id = new.user_id
      and rp.end_date = c.capped_to;

    delete from public.shift_pattern_leaving_caps c where c.user_id = new.user_id;
  end if;

  return new;
end;
$fn$;

drop trigger if exists close_shift_patterns_on_leaving on public.hr_profiles;
create trigger close_shift_patterns_on_leaving
  after insert or update of employment_end_date on public.hr_profiles
  for each row execute function public.close_shift_patterns_on_leaving();
