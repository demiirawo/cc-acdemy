-- RLS policies for onboarding-voice-notes bucket
DROP POLICY IF EXISTS "Public can read onboarding voice notes" ON storage.objects;
DROP POLICY IF EXISTS "Admins can upload onboarding voice notes" ON storage.objects;
DROP POLICY IF EXISTS "Admins can update onboarding voice notes" ON storage.objects;
DROP POLICY IF EXISTS "Admins can delete onboarding voice notes" ON storage.objects;

CREATE POLICY "Public can read onboarding voice notes"
ON storage.objects FOR SELECT
USING (bucket_id = 'onboarding-voice-notes');

CREATE POLICY "Admins can upload onboarding voice notes"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'onboarding-voice-notes' AND public.get_current_user_role() = 'admin');

CREATE POLICY "Admins can update onboarding voice notes"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'onboarding-voice-notes' AND public.get_current_user_role() = 'admin');

CREATE POLICY "Admins can delete onboarding voice notes"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'onboarding-voice-notes' AND public.get_current_user_role() = 'admin');