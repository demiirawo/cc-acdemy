-- Admins could already UPDATE anyone's onboarding record, but not INSERT one,
-- and storage confined every writer to their own folder. So an admin fixing a
-- colleague's photo failed twice over: the upload was rejected before it began,
-- and for anyone without an onboarding row the upsert became an INSERT and was
-- rejected too. Grant what the profile's photo control already implies.

create policy "Admins can insert onboarding forms"
  on public.staff_onboarding_documents
  for insert
  with check (exists (
    select 1 from public.profiles
    where profiles.user_id = auth.uid() and profiles.role = 'admin'
  ));

create policy "Admins can upload onboarding documents"
  on storage.objects
  for insert
  with check (
    bucket_id = 'onboarding-documents'
    and exists (
      select 1 from public.profiles
      where profiles.user_id = auth.uid() and profiles.role = 'admin'
    )
  );

create policy "Admins can replace onboarding documents"
  on storage.objects
  for update
  using (
    bucket_id = 'onboarding-documents'
    and exists (
      select 1 from public.profiles
      where profiles.user_id = auth.uid() and profiles.role = 'admin'
    )
  );
