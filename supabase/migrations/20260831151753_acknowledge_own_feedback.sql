-- Let somebody confirm they have read their own feedback, from inside the app.
--
-- Until now the only way was the link in the email. Delete the email and there
-- was no way to acknowledge at all — and the profile, which is where somebody
-- goes to look at their feedback, could not tell them what was still
-- outstanding.
--
-- A function rather than an update policy, because "you may acknowledge your
-- own feedback" and "you may edit your own feedback" are very different
-- permissions, and a policy on the table would grant the second along with the
-- first. This touches three columns and nothing else.
create or replace function public.acknowledge_feedback(_id uuid, _comment text default null)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  update public.staff_warnings
     set acknowledged_at = now(),
         acknowledgement_comment = nullif(btrim(coalesce(_comment, '')), ''),
         acknowledged_via = 'app'
   where id = _id
     and user_id = auth.uid()        -- only your own
     and acknowledged_at is null;    -- and only once

  if not found then
    -- Either it is not theirs, or it was already acknowledged. Neither is worth
    -- distinguishing to the caller: both mean there is nothing left to do.
    return;
  end if;
end;
$$;

revoke all on function public.acknowledge_feedback(uuid, text) from public;
grant execute on function public.acknowledge_feedback(uuid, text) to authenticated;

comment on function public.acknowledge_feedback is
  'Marks one piece of your own feedback as read, with an optional reply. Cannot touch the feedback itself.';
