-- staff_onboarding_documents holds bank details, date of birth, home address and
-- emergency contacts. The "All authenticated users can view birthdays" policy was
-- written as `using (true)`, which grants every signed-in user every column of every
-- row — not just the birthday fields it was named for. Colleagues should only see
-- each other's names, birthdays and team photos.

drop policy if exists "All authenticated users can view birthdays" on public.staff_onboarding_documents;

-- HR keeps full access: the onboarding matrix and documentation matrix rely on it.
-- (Previously HR only worked by accident, via the blanket policy above.)
drop policy if exists "HR can view all onboarding forms" on public.staff_onboarding_documents;
create policy "HR can view all onboarding forms"
  on public.staff_onboarding_documents
  for select
  using (public.get_current_user_role() = 'human_resources');

-- The narrow slice colleagues are allowed to see. Security definer so it can read
-- past the row policies above, returning only these four columns and nothing else.
create or replace function public.get_staff_directory()
returns table (
  user_id uuid,
  full_name text,
  date_of_birth date,
  photograph_path text
)
language sql
stable
security definer
set search_path = public
as $$
  select d.user_id, d.full_name, d.date_of_birth, d.photograph_path
  from public.staff_onboarding_documents d
$$;

revoke all on function public.get_staff_directory() from public, anon;
grant execute on function public.get_staff_directory() to authenticated;

comment on function public.get_staff_directory() is
  'Name, birthday and team photo for every staff member — the only staff_onboarding_documents fields colleagues may read. Everything else on that table is restricted to the record owner, HR and admins.';
