-- Six onboarding steps sat on the stage "Systems & Tools" — one letter out from
-- the real "System & Tools" — and every screen filtered against a hardcoded list
-- of stage names, so they were invisible everywhere from 3 January onwards.
-- They were never edited again; the maintained set is the seven steps on the
-- correctly-named stage, last touched in July.
--
-- Each duplicate has a live counterpart, and every person who completed a
-- duplicate has also completed its counterpart, so removing them costs nobody
-- their progress:
--
--   Email Address        -> Care Cuddle Email Address
--   Workspace Timezone   -> Workspace Timezone
--   Whatsapp Desktop     -> Whatsapp Desktop
--   Zadarma              -> Zadarma Setup
--   Grammarly            -> Grammarly
--   Care Cuddle AI       -> Care Cuddle AI
--
-- The check below refuses to run if that stops being true. Completions cascade
-- with the step (onboarding_completions_step_id_fkey is ON DELETE CASCADE).

do $$
declare
  orphaned int;
begin
  select count(*) into orphaned
  from public.onboarding_completions c
  join public.onboarding_steps s on s.id = c.step_id
  where s.stage = 'Systems & Tools'
    and not exists (
      select 1
      from public.onboarding_completions c2
      join public.onboarding_steps s2 on s2.id = c2.step_id
      where c2.user_id = c.user_id
        and s2.stage = 'System & Tools'
        and lower(btrim(s2.title)) like '%' || lower(btrim(s.title)) || '%'
    );

  if orphaned > 0 then
    raise exception 'Refusing to delete: % completion(s) have no counterpart on the correctly-named stage', orphaned;
  end if;
end $$;

delete from public.onboarding_steps where stage = 'Systems & Tools';
