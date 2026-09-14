-- Nothing rewrites a shift that has already happened.
--
-- edit_shift_series() carries a series on from a date instead of rewriting it.
-- This holds every other write to the same rule. An update or delete that would
-- change a day before today on a series already under way is refused, whether
-- it comes from the app, a page left open since before this shipped, or SQL
-- typed by hand. Ending a series from today onwards, or changing one before it
-- starts, is still a plain edit. And a row that another row carries on (see
-- continues_pattern_id) can't be made to run into that row's days, or both
-- would have the same shifts.
--
-- Two ways through, both deliberate. edit_shift_series() sets
-- app.shift_history_edit for its own transaction, and lets an admin correct
-- past shifts with a reason. A write made by another trigger, such as a leaving
-- date closing the leaver's series, is let past too.

create or replace function public.refuse_shift_history_rewrite()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_today date := (now() at time zone 'Europe/London')::date;
begin
  if current_setting('app.shift_history_edit', true) = 'on' or pg_trigger_depth() > 1 then
    return coalesce(new, old);
  end if;

  if tg_op = 'DELETE' then
    if old.start_date < v_today then
      raise exception 'This series has already started, so deleting it would remove shifts that happened. End it from today instead.'
        using errcode = 'check_violation';
    end if;
    return old;
  end if;

  -- A row that another carries on stops the day before that one starts, or the
  -- two would both have the shifts in between.
  if new.end_date is distinct from old.end_date and exists (
    select 1 from public.recurring_shift_patterns c
    where c.continues_pattern_id = new.id
      and (new.end_date is null or new.end_date >= c.start_date)
  ) then
    raise exception 'This series carries on in another row from %, so this row can''t run past it. Change the end date of the series instead.',
      (select to_char(c.start_date, 'FMDD FMMonth YYYY') from public.recurring_shift_patterns c where c.continues_pattern_id = new.id)
      using errcode = 'check_violation';
  end if;

  -- Not started, and not moved to start before today: an ordinary edit.
  if old.start_date >= v_today and new.start_date >= v_today then
    return new;
  end if;

  if new.start_date is distinct from old.start_date then
    raise exception 'A series that has already started keeps its start date. To change it from a later date, edit it from that date.'
      using errcode = 'check_violation';
  end if;

  if (to_jsonb(new) - 'end_date' - 'updated_at' - 'notes' - 'continues_pattern_id')
     is distinct from (to_jsonb(old) - 'end_date' - 'updated_at' - 'notes' - 'continues_pattern_id') then
    raise exception 'Changing a series that has already started would rewrite shifts that happened. Apply the change from today or later.'
      using errcode = 'check_violation';
  end if;

  if new.end_date is distinct from old.end_date
     and (coalesce(new.end_date, 'infinity'::date) < v_today - 1
          or coalesce(old.end_date, 'infinity'::date) < v_today - 1) then
    raise exception 'That end date would remove or add shifts before today. A series can be ended from today onwards.'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

create trigger recurring_shift_patterns_keep_history
  before update or delete on public.recurring_shift_patterns
  for each row execute function public.refuse_shift_history_rewrite();

revoke all on function public.refuse_shift_history_rewrite() from public, anon, authenticated;
