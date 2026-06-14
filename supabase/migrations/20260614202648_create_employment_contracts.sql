-- =========================================================================
-- Employment contracts: templates, sent contracts, signing RPC, storage RLS
-- =========================================================================

-- ---------- contract_templates ----------
CREATE TABLE IF NOT EXISTS public.contract_templates (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  description text,
  body_html   text NOT NULL DEFAULT '',
  is_archived boolean NOT NULL DEFAULT false,
  created_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.contract_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage contract templates" ON public.contract_templates;
CREATE POLICY "Admins manage contract templates"
  ON public.contract_templates FOR ALL
  TO authenticated
  USING (public.get_current_user_role() = 'admin')
  WITH CHECK (public.get_current_user_role() = 'admin');

-- ---------- contracts (issued copies) ----------
CREATE TABLE IF NOT EXISTS public.contracts (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id         uuid REFERENCES public.contract_templates(id) ON DELETE SET NULL,
  title               text NOT NULL,
  -- Snapshot of the template body at send time so later template edits
  -- never alter an already-issued contract.
  body_html           text NOT NULL,
  recipient_user_id   uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  recipient_email     text,
  recipient_name      text,
  status              text NOT NULL DEFAULT 'sent'
                       CHECK (status IN ('sent','viewed','signed','declined','cancelled')),
  sent_at             timestamptz NOT NULL DEFAULT now(),
  viewed_at           timestamptz,
  signed_at           timestamptz,
  declined_at         timestamptz,
  decline_reason      text,
  signed_name         text,
  signature_image_url text,
  signature_ip        text,
  created_by          uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS contracts_recipient_idx ON public.contracts(recipient_user_id);
CREATE INDEX IF NOT EXISTS contracts_status_idx ON public.contracts(status);

ALTER TABLE public.contracts ENABLE ROW LEVEL SECURITY;

-- Admins: full control over every contract.
DROP POLICY IF EXISTS "Admins manage all contracts" ON public.contracts;
CREATE POLICY "Admins manage all contracts"
  ON public.contracts FOR ALL
  TO authenticated
  USING (public.get_current_user_role() = 'admin')
  WITH CHECK (public.get_current_user_role() = 'admin');

-- Recipients: read their own contracts. Signing happens through the RPC below
-- (SECURITY DEFINER), so no broad UPDATE policy is granted to staff.
DROP POLICY IF EXISTS "Recipients read own contracts" ON public.contracts;
CREATE POLICY "Recipients read own contracts"
  ON public.contracts FOR SELECT
  TO authenticated
  USING (recipient_user_id = auth.uid());

-- ---------- keep updated_at fresh ----------
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS contract_templates_set_updated_at ON public.contract_templates;
CREATE TRIGGER contract_templates_set_updated_at
  BEFORE UPDATE ON public.contract_templates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS contracts_set_updated_at ON public.contracts;
CREATE TRIGGER contracts_set_updated_at
  BEFORE UPDATE ON public.contracts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------- mark a contract as viewed (idempotent, recipient only) ----------
CREATE OR REPLACE FUNCTION public.mark_contract_viewed(_contract_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.contracts
     SET status = 'viewed',
         viewed_at = COALESCE(viewed_at, now())
   WHERE id = _contract_id
     AND recipient_user_id = auth.uid()
     AND status = 'sent';
END;
$$;

-- ---------- sign a contract (recipient only) ----------
CREATE OR REPLACE FUNCTION public.sign_contract(
  _contract_id uuid,
  _signed_name text,
  _signature_image_url text DEFAULT NULL,
  _signature_ip text DEFAULT NULL
)
RETURNS public.contracts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result public.contracts;
BEGIN
  IF _signed_name IS NULL OR length(trim(_signed_name)) = 0 THEN
    RAISE EXCEPTION 'A signed name is required';
  END IF;

  UPDATE public.contracts
     SET status = 'signed',
         signed_name = trim(_signed_name),
         signature_image_url = _signature_image_url,
         signature_ip = _signature_ip,
         signed_at = now(),
         viewed_at = COALESCE(viewed_at, now())
   WHERE id = _contract_id
     AND recipient_user_id = auth.uid()
     AND status IN ('sent','viewed')
  RETURNING * INTO result;

  IF result.id IS NULL THEN
    RAISE EXCEPTION 'Contract not found, not yours, or already finalised';
  END IF;

  RETURN result;
END;
$$;

-- ---------- decline a contract (recipient only) ----------
CREATE OR REPLACE FUNCTION public.decline_contract(
  _contract_id uuid,
  _reason text DEFAULT NULL
)
RETURNS public.contracts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result public.contracts;
BEGIN
  UPDATE public.contracts
     SET status = 'declined',
         decline_reason = _reason,
         declined_at = now(),
         viewed_at = COALESCE(viewed_at, now())
   WHERE id = _contract_id
     AND recipient_user_id = auth.uid()
     AND status IN ('sent','viewed')
  RETURNING * INTO result;

  IF result.id IS NULL THEN
    RAISE EXCEPTION 'Contract not found, not yours, or already finalised';
  END IF;

  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_contract_viewed(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sign_contract(uuid, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.decline_contract(uuid, text) TO authenticated;

-- ---------- signature image storage bucket ----------
INSERT INTO storage.buckets (id, name, public)
VALUES ('contract-signatures', 'contract-signatures', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Public read contract signatures" ON storage.objects;
CREATE POLICY "Public read contract signatures"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'contract-signatures');

DROP POLICY IF EXISTS "Authenticated upload contract signatures" ON storage.objects;
CREATE POLICY "Authenticated upload contract signatures"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'contract-signatures');
