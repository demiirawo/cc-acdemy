-- HR managers could read everyone's onboarding completions but not their page
-- acknowledgements, so any step completed by reading and acknowledging a page
-- looked untouched for every colleague — the onboarding matrix was quietly
-- under-reporting progress rather than failing visibly.
create policy "HR can view all acknowledgements"
  on public.page_acknowledgements
  for select
  using (get_current_user_role() = 'human_resources'::text);
