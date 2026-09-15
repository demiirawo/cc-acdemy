-- Recruitment is a tab on HR, and human_resources has been able to open it since
-- it moved there in July, but every recruitment table and both candidate buckets
-- still let only admins read. So HR saw the live test (that part is public) and
-- nothing behind it: no results, answers, photos or CVs. Give HR the same rights
-- admins have, alongside the admin policies rather than replacing them.
set local lock_timeout = '5s';

drop policy if exists "HR can manage recruitment tests" on public.recruitment_tests;
create policy "HR can manage recruitment tests"
  on public.recruitment_tests for all to authenticated
  using ((select public.get_current_user_role()) = 'human_resources')
  with check ((select public.get_current_user_role()) = 'human_resources');

drop policy if exists "HR can manage recruitment questions" on public.recruitment_questions;
create policy "HR can manage recruitment questions"
  on public.recruitment_questions for all to authenticated
  using ((select public.get_current_user_role()) = 'human_resources')
  with check ((select public.get_current_user_role()) = 'human_resources');

drop policy if exists "HR can manage recruitment attempts" on public.recruitment_attempts;
create policy "HR can manage recruitment attempts"
  on public.recruitment_attempts for all to authenticated
  using ((select public.get_current_user_role()) = 'human_resources')
  with check ((select public.get_current_user_role()) = 'human_resources');

drop policy if exists "HR can read recruitment answers" on public.recruitment_answers;
create policy "HR can read recruitment answers"
  on public.recruitment_answers for select to authenticated
  using ((select public.get_current_user_role()) = 'human_resources');

drop policy if exists "HR can read recruitment events" on public.recruitment_events;
create policy "HR can read recruitment events"
  on public.recruitment_events for select to authenticated
  using ((select public.get_current_user_role()) = 'human_resources');

drop policy if exists "HR can read recruitment snapshots" on public.recruitment_snapshots;
create policy "HR can read recruitment snapshots"
  on public.recruitment_snapshots for select to authenticated
  using ((select public.get_current_user_role()) = 'human_resources');

drop policy if exists "HR read candidate CVs" on storage.objects;
create policy "HR read candidate CVs"
  on storage.objects for select to authenticated
  using (bucket_id = 'candidate-cvs' and (select public.get_current_user_role()) = 'human_resources');

drop policy if exists "HR read candidate snapshots" on storage.objects;
create policy "HR read candidate snapshots"
  on storage.objects for select to authenticated
  using (bucket_id = 'candidate-snapshots' and (select public.get_current_user_role()) = 'human_resources');
