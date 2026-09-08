-- Close a backup table that was readable and writable by anyone.
--
-- _contracts_backup_20260828 was taken before the contract rewrite in August
-- and never removed. It has no RLS, and anon and authenticated both hold
-- SELECT, INSERT, UPDATE, DELETE and TRUNCATE on it — so anybody with the
-- publishable key, which ships in the JavaScript of a public website, could
-- read all 16 employment contracts and could have emptied the table.
--
-- What was exposed is not trivial: contract bodies, recipient names and email
-- addresses, signature images, signed names and the IP address each person
-- signed from.
--
-- RLS on with no policies denies every role except service_role. That closes
-- it immediately without touching the data, so the backup can still be
-- compared against the live table before anyone decides to drop it.
alter table public._contracts_backup_20260828 enable row level security;

-- The grants themselves are revoked too. RLS alone is enough, but a table that
-- exists only as a snapshot has no reason to be reachable by a client role at
-- all, and leaving the grants invites the same hole if RLS is ever toggled.
revoke all on public._contracts_backup_20260828 from anon, authenticated;

comment on table public._contracts_backup_20260828 is
  'Snapshot taken 28 Aug 2026 before the contract rewrite. Locked 8 Sep 2026 after Supabase flagged it as publicly readable. Safe to drop once verified against public.contracts.';
