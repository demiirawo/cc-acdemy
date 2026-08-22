-- Feedback now has to be acknowledged by the person it is about. The
-- acknowledgement belongs on the feedback itself — it is one per entry, and
-- keeping it here means a record can never drift from its acknowledgement.
--
-- The token is the credential for acknowledging from an email without signing
-- in, exactly as shift changes already work. It is generated for every row,
-- including the ones already on file, so historic feedback can be chased too.

alter table public.staff_warnings
  add column if not exists ack_token uuid not null default gen_random_uuid(),
  add column if not exists acknowledged_at timestamptz,
  add column if not exists acknowledgement_comment text,
  add column if not exists acknowledged_via text;

create unique index if not exists staff_warnings_ack_token_key
  on public.staff_warnings (ack_token);

-- Finding what is still outstanding is the common read.
create index if not exists staff_warnings_unacknowledged_idx
  on public.staff_warnings (user_id) where acknowledged_at is null;
