-- The invoice and expense syncs were both writing last_sync_* on the same row, so
-- whichever ran last claimed the timestamp and each card could report the other's
-- run as its own. Give invoices their own columns; expenses keep the originals.
alter table public.freeagent_oauth
  add column if not exists last_invoice_sync_at timestamptz,
  add column if not exists last_invoice_sync_status text,
  add column if not exists last_invoice_sync_detail text;
