-- Pin search_path on the shared trigger function.
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Restrict the SECURITY DEFINER RPCs to signed-in users only.
REVOKE EXECUTE ON FUNCTION public.mark_contract_viewed(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.sign_contract(uuid, text, text, text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.decline_contract(uuid, text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.mark_contract_viewed(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sign_contract(uuid, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.decline_contract(uuid, text) TO authenticated;

-- Signatures are PII: make the bucket private and only readable by the
-- signer (files are stored under <user_id>/...) or an admin. Access is via
-- short-lived signed URLs generated in the app.
UPDATE storage.buckets SET public = false WHERE id = 'contract-signatures';

DROP POLICY IF EXISTS "Public read contract signatures" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated upload contract signatures" ON storage.objects;

CREATE POLICY "Owner or admin read contract signatures"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'contract-signatures'
    AND (
      public.get_current_user_role() = 'admin'
      OR (storage.foldername(name))[1] = auth.uid()::text
    )
  );

-- Staff may only upload signatures into their own folder.
CREATE POLICY "Owner upload contract signatures"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'contract-signatures'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
