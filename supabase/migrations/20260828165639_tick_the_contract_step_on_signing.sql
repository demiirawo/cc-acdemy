-- Let a signed contract tick its own onboarding step.
--
-- The Employment Contract step relied on the new joiner ticking a box to say
-- they had signed. The app already knows whether they signed — contracts carry
-- a signed_at — so the box was recording a claim next to a fact that
-- contradicted it half the time.
--
-- Rather than hard-code which step this is, a step declares what completes it.
-- Today there is one such trigger event; a step completed by, say, finishing a
-- training course would slot in the same way.

alter table public.onboarding_steps
  add column if not exists auto_complete_on text;

comment on column public.onboarding_steps.auto_complete_on is
  'When set, the step is ticked by the system rather than by hand. Currently only ''contract_signed''.';

alter table public.onboarding_steps
  drop constraint if exists onboarding_steps_auto_complete_on_check;
alter table public.onboarding_steps
  add constraint onboarding_steps_auto_complete_on_check
  check (auto_complete_on is null or auto_complete_on in ('contract_signed'));

/**
 * Tick every self-completing contract step for whoever just signed.
 *
 * SECURITY DEFINER because the person signing has no business writing
 * onboarding_completions directly — the point is that the system records this,
 * not them. ON CONFLICT because a second contract signed later should not
 * error, and should not move the original completion date either.
 */
create or replace function public.complete_onboarding_on_contract_signed()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.signed_at is not null and old.signed_at is null and new.recipient_user_id is not null then
    insert into public.onboarding_completions (step_id, user_id, completed_at, notes)
    select s.id, new.recipient_user_id, new.signed_at,
           'Signed ' || coalesce(new.title, 'their contract')
    from public.onboarding_steps s
    where s.auto_complete_on = 'contract_signed'
    on conflict (step_id, user_id) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists complete_onboarding_on_contract_signed on public.contracts;
create trigger complete_onboarding_on_contract_signed
  after update of signed_at on public.contracts
  for each row
  execute function public.complete_onboarding_on_contract_signed();

-- Mark the step that this applies to.
update public.onboarding_steps
set auto_complete_on = 'contract_signed', updated_at = now()
where title = 'Employment Contract';

-- Anyone who already signed should not still be looking at an unticked step.
insert into public.onboarding_completions (step_id, user_id, completed_at, notes)
select s.id, c.recipient_user_id, c.signed_at, 'Signed ' || coalesce(c.title, 'their contract')
from public.contracts c
cross join public.onboarding_steps s
where s.auto_complete_on = 'contract_signed'
  and c.signed_at is not null
  and c.recipient_user_id is not null
on conflict (step_id, user_id) do nothing;
