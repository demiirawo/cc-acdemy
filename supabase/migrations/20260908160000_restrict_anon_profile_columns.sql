-- Stop anonymous visitors reading which of your staff are administrators.
--
-- public.profiles is readable by anon through a policy of `using (true)`, which
-- is deliberate: the public client schedule shows the name and email of the
-- administrator covering a client's shifts. What is not deliberate is that the
-- SAME read exposes every column to anybody holding the publishable key — which
-- ships in the JavaScript of a public website — including `role`.
--
-- role is admin / human_resources / viewer. Published anonymously it is a list
-- naming exactly who to target, which is the one column no public page reads:
-- verified across PublicClientSchedule, PublicLiveView, PublicPageView,
-- PublicTrainingMatrix, PublicStaffMeeting and CandidateApplyPage.
--
-- Column-level revoke rather than a policy change, because RLS filters rows and
-- this is a column problem. Signed-in users keep it — useUserRole depends on it.
-- A column-level revoke is a no-op while a table-level SELECT grant exists —
-- Postgres takes the wider grant. The table grant has to go first, then the
-- columns that public pages genuinely need are granted back explicitly.
revoke select on public.profiles from anon;
grant select (id, user_id, display_name, email, created_at, updated_at)
  on public.profiles to anon;

comment on column public.profiles.role is
  'Application role. NOT readable by anon: it identifies administrators. Signed-in users read their own via useUserRole.';
