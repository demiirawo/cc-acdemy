-- Who may see that someone is off sick.
--
-- A confirmed sickness is a staff_holidays row with absence_type 'sick'. The
-- approved-holiday policies let anonymous visitors (the anon key ships in the
-- app bundle) and every signed-in user read every approved row, so "who was
-- off sick, and when" was one REST call away, joined to names through
-- profiles. Sickness is special-category health data under UK GDPR.
--
-- Now the raw 'sick' value is visible only to the person, admins, and
-- scheduling editors for staff on clients they can see. Everyone else still
-- needs to know the person is away — clients on the public schedule, the live
-- embed, colleagues on the rota, someone offering cover — so they read
-- public_staff_absences(), which returns every approved absence with sickness
-- shown as 'absent' and its notes removed.
--
-- Backward compatible with the app as deployed before this change: no sick
-- rows existed, and the anon column grant below is exactly the set of columns
-- the public pages select and filter on.

create or replace function public.public_staff_absences()
returns table (
  id uuid,
  user_id uuid,
  absence_type text,
  start_date date,
  end_date date,
  days_taken numeric,
  status text,
  notes text,
  no_cover_required boolean,
  no_cover_dates text[]
)
language sql
stable
security definer
set search_path = ''
as $$
  select h.id,
         h.user_id,
         case when h.absence_type = 'sick' then 'absent' else h.absence_type::text end,
         h.start_date,
         h.end_date,
         h.days_taken,
         h.status,
         case when h.absence_type = 'sick' then null else h.notes end,
         h.no_cover_required,
         h.no_cover_dates
  from public.staff_holidays h
  where h.status = 'approved';
$$;

revoke all on function public.public_staff_absences() from public;
grant execute on function public.public_staff_absences() to anon, authenticated;

-- Unconfirmed sickness, for the people who arrange cover. Pending sickness
-- requests are otherwise visible only to the person and admins, so scheduling
-- editors — who fill the gaps — could not see a same-day report until an admin
-- happened to approve it. Only who and when; never the request's text.
create or replace function public.pending_sickness(p_from date, p_to date)
returns table (user_id uuid, start_date date, end_date date)
language sql
stable
security definer
set search_path = ''
as $$
  select r.user_id, r.start_date, r.end_date
  from public.staff_requests r
  where r.request_type = 'sickness'
    and r.status = 'pending'
    and r.start_date <= p_to
    and r.end_date >= p_from
    and (public.get_current_user_role() in ('admin', 'human_resources')
         or public.is_scheduling_editor(auth.uid()));
$$;

revoke all on function public.pending_sickness(date, date) from public;
grant execute on function public.pending_sickness(date, date) to authenticated;

alter policy "Anon can view approved holidays" on public.staff_holidays
  using (status = 'approved' and absence_type <> 'sick');

alter policy "Public can view approved holidays" on public.staff_holidays
  using (status = 'approved' and absence_type <> 'sick');

alter policy "Authenticated users can view holidays for their clients" on public.staff_holidays
  using (
    auth.uid() = user_id
    or get_current_user_role() = 'admin'
    or (
      (absence_type <> 'sick' or is_scheduling_editor(auth.uid()))
      and exists (
        select 1 from staff_client_assignments sca
        where sca.staff_user_id = staff_holidays.user_id
          and can_view_schedule_for_client(auth.uid(), sca.client_name)
      )
    )
  );

-- Anonymous visitors read requests only to draw cover on the public pages.
-- They never needed the free text, and details held staff's own descriptions
-- of illness from before sickness had its own request type.
revoke select on public.staff_requests from anon;
grant select (id, user_id, request_type, swap_with_user_id, start_date, end_date, status, linked_holiday_id, coverage_metadata)
  on public.staff_requests to anon;

-- Sickness neither resets a client's handover checklist nor counts as another
-- leave's handover: without the second exclusion, an ongoing sickness at a
-- shared client stopped a colleague's new holiday from resetting stale ticks.
create or replace function public.reset_client_handovers_on_new_leave()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  candidate text;
begin
  -- Only when this leave is (newly) approved and actually needs cover.
  if new.status <> 'approved' or coalesce(new.no_cover_required, false) then
    return new;
  end if;
  -- Sickness is not handed over. It is reported on the day or after, and
  -- resetting the client's checklist for it would throw away handover work in
  -- progress, including a departing colleague's handover at the same client.
  if new.absence_type = 'sick' then
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
    -- tasks on file may be that handover's — leave them. Sickness never owns a
    -- handover, so it doesn't count here either.
    if exists (
      select 1
      from public.staff_holidays oh
      join public.recurring_shift_patterns orp on orp.user_id = oh.user_id
      where oh.id <> new.id
        and oh.status = 'approved'
        and oh.absence_type <> 'sick'
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
$function$;
