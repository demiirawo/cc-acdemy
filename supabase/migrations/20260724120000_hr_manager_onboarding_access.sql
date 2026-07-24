-- HR managers (human_resources) manage onboarding alongside admins, so give them
-- read access to the data the Onboarding Matrix / Documents views need.

-- Onboarding step completions (drives the matrix progress).
drop policy if exists "HR can view all completions" on public.onboarding_completions;
create policy "HR can view all completions" on public.onboarding_completions
  for select using (public.get_current_user_role() = 'human_resources');

-- The uploaded onboarding document files (proof of ID / address, photo, etc.)
-- live in the private onboarding-documents bucket — let HR view them too.
drop policy if exists "HR can view all onboarding documents" on storage.objects;
create policy "HR can view all onboarding documents" on storage.objects
  for select using (
    bucket_id = 'onboarding-documents' and public.get_current_user_role() = 'human_resources'
  );
