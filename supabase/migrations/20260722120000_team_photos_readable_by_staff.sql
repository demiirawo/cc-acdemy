-- The Staff Meetings "Our Team" board shows everyone's photo to the whole team.
-- Onboarding documents stay admin/owner-only; this exposes ONLY the photograph
-- files (stored as <user_id>/photograph_path_<timestamp>.<ext>).
drop policy if exists "Staff can view team photographs" on storage.objects;
create policy "Staff can view team photographs" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'onboarding-documents'
    and storage.filename(name) like 'photograph\_path\_%'
  );
