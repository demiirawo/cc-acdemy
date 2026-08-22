-- hr_profiles rows were surviving the deletion of their auth account — profiles
-- cascades, hr_profiles didn't — leaving ghost records with no name that still
-- fed anniversary emails ("Unknown — 2 years") and anything else keyed on
-- hr_profiles alone. Remove the orphans and add the missing cascade so a deleted
-- account takes its HR record with it from now on.
delete from public.hr_profiles h
where not exists (select 1 from auth.users u where u.id = h.user_id);

alter table public.hr_profiles
  drop constraint if exists hr_profiles_user_id_auth_fkey;
alter table public.hr_profiles
  add constraint hr_profiles_user_id_auth_fkey
  foreign key (user_id) references auth.users(id) on delete cascade;
