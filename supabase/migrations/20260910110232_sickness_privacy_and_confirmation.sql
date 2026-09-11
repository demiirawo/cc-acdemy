-- Sickness requests: confirmed by an admin, and seen only by the person and admins.

-- Staff submit requests; admins decide them. The request form sends 'pending'
-- for staff and 'approved' for admins, but nothing on the server enforced it:
-- a staff member could insert their own request already approved. An approved
-- shift_swap is paid as overtime, and a sickness report must be confirmed by
-- an admin before it counts. Admins insert through "Admins can manage all
-- requests", which is untouched. (The client's isAdmin is role = 'admin', the
-- same test get_current_user_role() makes here, so no admin path is affected.)
drop policy if exists "Users can create their own requests" on public.staff_requests;
create policy "Users can create their own requests"
  on public.staff_requests for insert
  with check (auth.uid() = user_id and status = 'pending');

-- Sickness is health data, special category under UK GDPR. A sickness request,
-- and whatever reason was typed into it, is for the person and admins only:
-- not for anonymous visitors to the public client schedule (this policy also
-- applies to every signed-in user), and not for colleagues who share a client.
-- The rota still shows the absence itself, from the staff_holidays row written
-- on approval, which carries no notes.
drop policy if exists "Anon can view approved staff requests" on public.staff_requests;
create policy "Anon can view approved staff requests"
  on public.staff_requests for select
  using (status = 'approved' and request_type not in ('departure', 'sickness'));

drop policy if exists "Authenticated users can view requests for their clients" on public.staff_requests;
create policy "Authenticated users can view requests for their clients"
  on public.staff_requests for select
  using (
    get_current_user_role() = 'admin'
    or (
      request_type <> 'departure'
      and (
        auth.uid() = user_id
        or auth.uid() = swap_with_user_id
        or (
          request_type <> 'sickness'
          and exists (
            select 1 from staff_client_assignments sca
            where sca.staff_user_id = staff_requests.user_id
              and can_view_schedule_for_client(auth.uid(), sca.client_name)
          )
        )
      )
    )
  );

-- Approving leave resets the handover checklists of the person's clients, so a
-- fresh handover is done before they go. Sickness is not handed over, and it
-- used to wipe those checklists — including a departing colleague's.
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
$function$;
