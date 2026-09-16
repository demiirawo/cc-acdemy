-- A rating takes effect when it is decided, not on the 2nd of next month.
--
-- The wait existed so a rating landed after payroll had run, reading as an
-- assessment of the month just finished rather than a reaction to whatever
-- conversation preceded it. The owner's call (16 September 2026) is that the
-- delay costs more than it buys: a rating decided today is the rating today.
--
-- Superseded the same day by 20260916202149, which keeps the immediate change
-- but dates the history row to the 1st of next month, so a rating decided
-- part-way through a month does not move that month's bonus pot.
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

  update pending_rating_changes
     set cancelled_at = now(), cancelled_by = auth.uid()
   where user_id = p_user_id
     and applied_at is null
     and cancelled_at is null;

  update hr_profiles
     set performance_rating = p_new_rating
   where user_id = p_user_id;

  insert into pending_rating_changes
    (user_id, previous_rating, new_rating, reason, effective_date, created_by, applied_at)
  values
    (p_user_id, v_previous, p_new_rating, btrim(p_reason), current_date, auth.uid(), now());

  return query select v_previous, current_date;
end;
$$;

revoke all on function public.apply_rating_change(uuid, text, text) from public, anon;
grant execute on function public.apply_rating_change(uuid, text, text) to authenticated;
