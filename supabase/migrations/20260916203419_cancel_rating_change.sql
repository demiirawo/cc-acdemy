-- Undo a rating change that hasn't reached the bonus pot yet.
--
-- Since ratings apply on the spot, "pending" no longer means the rating is
-- waiting to move — it means the pot has not started counting it. Until the
-- 1st of next month the whole change can be taken back: the profile goes back
-- to the rating it held, and the history row is cancelled so no month's pot
-- ever reads it.
--
-- Once the pot has started counting it, the change is part of how a month was
-- shared out, and unpicking it would quietly restate that month. From then on
-- the answer is a new rating, not an undo.
create or replace function public.cancel_rating_change(p_user_id uuid)
returns table (restored_rating text, undone_rating text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_change record;
  v_current text;
begin
  if not is_hr_or_admin() then
    raise exception 'Only an admin or HR can undo a rating change' using errcode = '42501';
  end if;

  select c.* into v_change
  from pending_rating_changes c
  where c.user_id = p_user_id
    and c.cancelled_at is null
    and c.applied_at is not null
    and c.effective_date > current_date
  order by c.applied_at desc
  limit 1
  for update;

  if v_change.id is null then
    raise exception 'There is no rating change left to undo for this person'
      using errcode = 'P0002';
  end if;

  select h.performance_rating into v_current
  from hr_profiles h
  where h.user_id = p_user_id
  for update;

  -- Someone has set a different rating since; undoing would overwrite theirs.
  if v_current is distinct from v_change.new_rating then
    raise exception 'Their rating has changed since — refresh and look again'
      using errcode = '40001';
  end if;

  update hr_profiles
     set performance_rating = v_change.previous_rating
   where user_id = p_user_id;

  update pending_rating_changes
     set cancelled_at = now(), cancelled_by = auth.uid()
   where id = v_change.id;

  return query select v_change.previous_rating, v_change.new_rating;
end;
$$;

revoke all on function public.cancel_rating_change(uuid) from public, anon;
grant execute on function public.cancel_rating_change(uuid) to authenticated;
