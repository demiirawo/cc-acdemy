-- Bank transactions as the bank statement words them ("Airtable", "GOOGLE
-- IRELAND"), which is the wording the owner actually recognises — unlike the
-- accountant-phrased explanation descriptions. Keyed on the FreeAgent URL so
-- re-syncs update in place.
create table if not exists public.company_bank_transactions (
  id uuid primary key default gen_random_uuid(),
  source_url text not null unique,
  fit_id text,
  entry_date date not null,
  amount numeric not null,               -- negative = money out
  merchant text not null,                -- bank-statement wording, trimmed
  full_description text,
  bank_account_name text,
  category_name text,                    -- from its explanation, when explained
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists company_bank_transactions_date_idx on public.company_bank_transactions (entry_date);
create index if not exists company_bank_transactions_merchant_idx on public.company_bank_transactions (lower(merchant));

alter table public.company_bank_transactions enable row level security;
drop policy if exists "Admins manage bank transactions" on public.company_bank_transactions;
create policy "Admins manage bank transactions"
  on public.company_bank_transactions for all
  using (public.get_current_user_role() = 'admin')
  with check (public.get_current_user_role() = 'admin');

-- Which bank-statement merchants feed each expense row. Defaults to matching on
-- the row's own name; extra terms cover cases like "G Suite" being billed as
-- "GOOGLE" on the statement.
alter table public.expenses add column if not exists match_merchants text[];
