-- CRITICAL: two backup tables were sitting in the public schema with row-level
-- security disabled. Supabase grants anon and authenticated full privileges on
-- public tables by default, and RLS is the only thing that then restrains them,
-- so both tables were readable — and writable — by anyone holding the anon key,
-- which ships in the browser bundle and is therefore public.
--
-- _maria_merge_backup_20260728 is the serious one: it contains a snapshot of
-- auth.users including password hashes and live recovery, confirmation and
-- email-change tokens, alongside staff salaries and pay records.
--
-- pages_backup_before_process_maps holds Essential Reading page content.
--
-- Enabling RLS with no policies denies everyone except the service role and the
-- table owner, which is the correct posture for a backup: nothing in the
-- application should be reading these at all. The grants are revoked as well so
-- the tables are not exposed through PostgREST even if RLS were later disabled.

alter table public._maria_merge_backup_20260728 enable row level security;
alter table public.pages_backup_before_process_maps enable row level security;

revoke all on public._maria_merge_backup_20260728 from anon, authenticated;
revoke all on public.pages_backup_before_process_maps from anon, authenticated;
