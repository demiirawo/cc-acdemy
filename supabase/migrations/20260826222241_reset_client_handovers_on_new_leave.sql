-- A new period of approved leave starts its handover from a blank slate.
--
-- Handover tasks are keyed only by client, with no link to a person or a
-- leave. So when someone booked their next holiday, the tracker happily
-- showed the 100%-complete task list from their PREVIOUS leave — "Ready",
-- before anyone had handed over anything, and usually to a different person
-- covering this time.
--
-- When a leave becomes approved (inserted approved, or updated to approved),
-- the tasks for each client that leave needs cover for are cleared, so a
-- fresh handover can begin. One protection: if another approved, still-
-- current leave also needs cover at the same client, its handover may own
-- those tasks, so that client is left alone — the manual Clear button
-- remains for judgement calls.
--
-- Comments on cleared tasks go with them (task_id FK is ON DELETE CASCADE).

create or replace function public.reset_client_handovers_on_new_leave()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  candidate text;
begin
  -- Only when this leave is (newly) approved and actually needs cover.
  if new.status <> 'approved' or coalesce(new.no_cover_required, false) then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.status = 'approved' then
    return new;  -- was already approved; not a new period of leave
  end if;
  if new.end_date < current_date then
    return new;  -- historic import, nothing to reset
  end if;

  for candidate in
    select distinct btrim(rp.client_name)
    from public.recurring_shift_patterns rp
    where rp.user_id = new.user_id
      and rp.client_name is not null
      and btrim(rp.client_name) <> ''
      and lower(btrim(rp.client_name)) <> 'care cuddle'
      and rp.is_overtime = false
      and rp.start_date <= new.end_date
      and (rp.end_date is null or rp.end_date >= new.start_date)
  loop
    -- Another current approved leave needing cover at this client? Then the
    -- tasks on file may be that handover's — leave them.
    if exists (
      select 1
      from public.staff_holidays oh
      join public.recurring_shift_patterns orp on orp.user_id = oh.user_id
      where oh.id <> new.id
        and oh.status = 'approved'
        and coalesce(oh.no_cover_required, false) = false
        and oh.end_date >= current_date
        and orp.client_name is not null
        and btrim(orp.client_name) = candidate
        and orp.is_overtime = false
        and orp.start_date <= oh.end_date
        and (orp.end_date is null or orp.end_date >= oh.start_date)
    ) then
      continue;
    end if;

    delete from public.client_handover_tasks t where btrim(t.client_name) = candidate;
  end loop;

  return new;
end;
$fn$;

drop trigger if exists reset_client_handovers_on_new_leave on public.staff_holidays;
create trigger reset_client_handovers_on_new_leave
  after insert or update of status on public.staff_holidays
  for each row execute function public.reset_client_handovers_on_new_leave();
