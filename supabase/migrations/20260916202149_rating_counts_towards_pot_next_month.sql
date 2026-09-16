-- The rating moves today; the bonus pot counts it from the 1st of next month.
--
-- Two different questions were being answered by one date. What rating does
-- this person hold — that is true the moment it is decided, and they are told
-- the same day. What rating was this person on when a month's pot was shared
-- out — that is a payroll question, and the owner's rule (16 September 2026)
-- is that a rating decided part-way through a month does not move the money
-- for that month.
--
-- So the profile is written now, and the history row is dated the 1st of next
-- month. inForceFor() reads that row as: every month before it keeps the old
-- rating, and from that month on the new one counts. The current month is
-- therefore still shared out on the rating the month was worked under.
create or replace function public.apply_rating_change(
  p_user_id uuid,
  p_new_rating text,
  p_reason text
)
returns table (previous_rating text, effective_date date)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_previous text;
  v_found boolean;
  v_effective date := (date_trunc('month', current_date) + interval '1 month')::date;
begin
  if not is_hr_or_admin() then
    raise exception 'Only an admin or HR can change a rating' using errcode = '42501';
  end if;
  if p_new_rating is null or btrim(p_new_rating) = '' then
    raise exception 'A rating is required' using errcode = '23514';
  end if;
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'A reason is required' using errcode = '23514';
  end if;

  select h.performance_rating, true into v_previous, v_found
  from hr_profiles h
  where h.user_id = p_user_id
  for update;

  if not coalesce(v_found, false) then
    raise exception 'No HR profile for this person' using errcode = '23503';
  end if;

  -- A change still waiting from the old scheme would otherwise land later and
  -- quietly overwrite this one.
  update pending_rating_changes
     set cancelled_at = now(), cancelled_by = auth.uid()
   where user_id = p_user_id
     and applied_at is null
     and cancelled_at is null;

  update hr_profiles
     set performance_rating = p_new_rating
   where user_id = p_user_id;

  -- Stamped applied: nothing is waiting to happen, the rating has already
  -- moved. The date says which month's pot it first counts towards.
  insert into pending_rating_changes
    (user_id, previous_rating, new_rating, reason, effective_date, created_by, applied_at)
  values
    (p_user_id, v_previous, p_new_rating, btrim(p_reason), v_effective, auth.uid(), now());

  return query select v_previous, v_effective;
end;
$$;

revoke all on function public.apply_rating_change(uuid, text, text) from public, anon;
grant execute on function public.apply_rating_change(uuid, text, text) to authenticated;
