-- Real invoice history from FreeAgent, so Finance can report what was actually
-- charged rather than reconstructing it from a present-day MRR figure. A single
-- MRR number can't express the things the accounting data actually contains:
-- the 5% annual uplift on each client's anniversary, £18/mo add-ons billed as
-- their own line, time-limited discounts that later roll off, ad-hoc one-offs,
-- and payment terms that put cash in a different month from the invoice.
--
-- Refreshed by re-importing a FreeAgent company export; the natural key below
-- makes that idempotent, so re-uploading an overlapping export updates rows
-- rather than duplicating them.
create table if not exists public.client_invoices (
  id uuid primary key default gen_random_uuid(),
  reference text not null,
  contact_organisation text not null,
  -- Resolved against public.clients by name where we can; left null when the
  -- FreeAgent contact has no counterpart in the portal.
  client_id uuid references public.clients(id) on delete set null,
  invoice_date date not null,
  payment_terms_days integer not null default 0,
  status text,
  paid_date date,
  paid_amount numeric,
  net_amount numeric,
  sales_tax_amount numeric,
  total_value numeric not null,
  currency text not null default 'GBP',
  -- Line items as exported: [{type, description, quantity, price}]. Discounts and
  -- add-ons live here, which is where the nuance is.
  lines jsonb not null default '[]'::jsonb,
  source_export text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint client_invoices_natural_key unique (contact_organisation, reference, invoice_date)
);

create index if not exists client_invoices_date_idx on public.client_invoices (invoice_date);
create index if not exists client_invoices_client_idx on public.client_invoices (client_id);
create index if not exists client_invoices_org_idx on public.client_invoices (lower(contact_organisation));

alter table public.client_invoices enable row level security;

-- Finance is admin-only, and these rows carry client billing detail.
drop policy if exists "Admins manage client invoices" on public.client_invoices;
create policy "Admins manage client invoices"
  on public.client_invoices for all
  using (public.get_current_user_role() = 'admin')
  with check (public.get_current_user_role() = 'admin');

drop trigger if exists update_client_invoices_updated_at on public.client_invoices;
create trigger update_client_invoices_updated_at
  before update on public.client_invoices
  for each row execute function public.update_updated_at_column();

comment on table public.client_invoices is
  'Invoice history imported from a FreeAgent company export. Idempotent on (contact_organisation, reference, invoice_date) so exports can be re-uploaded to refresh.';
