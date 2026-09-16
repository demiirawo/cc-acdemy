-- Clearing "Uplift due" without a fee change.
--
-- The finance page flags a client's annual uplift a year after their last fee
-- change, or a year after their contract started if there has been none. That is
-- a reminder, and a rise isn't always the answer to it: a fee can be held for
-- another year, a rise waived to keep a client, or the uplift already sit on an
-- invoice raised in FreeAgent. Until now the only way to stand the flag down was
-- to record a fee change that never happened.
--
-- A clear is a commercial decision like the others this log holds, so it lives
-- here with its date and reason (admins write it; admins and HR can read it)
-- rather than on the clients row, which every signed-in user can read. It moves
-- no revenue — the revenue code reads 'status' rows only — and the flag comes
-- back a year after its date.
alter table public.client_change_log
  drop constraint if exists client_change_log_field_check;
alter table public.client_change_log
  add constraint client_change_log_field_check
  check (field in ('status', 'contract_end_date', 'uplift'));

comment on table public.client_change_log is
  'Audit of client sales-stage and contract-end changes, with the date each took effect (drives when a client stops counting toward revenue), plus annual-uplift flags cleared without a fee change (field = uplift), which restart the uplift clock and move no revenue.';
