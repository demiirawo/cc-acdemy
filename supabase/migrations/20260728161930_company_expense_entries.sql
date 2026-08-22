-- Explained bank entries from FreeAgent — the source behind "what do we actually
-- spend each month". Keyed on the FreeAgent URL so re-syncing updates in place.
create table if not exists public.company_expense_entries (
  id uuid primary key default gen_random_uuid(),
  source_url text not null unique,
  entry_date date not null,
  gross_value numeric not null,          -- negative = money out, as FreeAgent reports it
  description text,
  category_name text,
  category_url text,
  bank_account_name text,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists company_expense_entries_date_idx on public.company_expense_entries (entry_date);
create index if not exists company_expense_entries_cat_idx on public.company_expense_entries (category_name);

alter table public.company_expense_entries enable row level security;

drop policy if exists "Admins manage expense entries" on public.company_expense_entries;
create policy "Admins manage expense entries"
  on public.company_expense_entries for all
  using (public.get_current_user_role() = 'admin')
  with check (public.get_current_user_role() = 'admin');

-- Categories that aren't operating spend: own-account transfers, tax remittances,
-- and owner/payroll costs the P&L already carries as beneficial costs. Kept in the
-- database so the exclusion list is visible and editable rather than buried in code.
create table if not exists public.expense_category_exclusions (
  category_name text primary key,
  reason text
);
alter table public.expense_category_exclusions enable row level security;
drop policy if exists "Admins manage exclusions" on public.expense_category_exclusions;
create policy "Admins manage exclusions" on public.expense_category_exclusions for all
  using (public.get_current_user_role() = 'admin')
  with check (public.get_current_user_role() = 'admin');
drop policy if exists "Authenticated read exclusions" on public.expense_category_exclusions;
create policy "Authenticated read exclusions" on public.expense_category_exclusions for select
  using (auth.uid() is not null);

insert into public.expense_category_exclusions (category_name, reason) values
  ('Transfer to Another Account','Own money moving between accounts, not spend'),
  ('VAT','Tax remittance, lumpy and not an operating cost'),
  ('Corporation Tax','Tax remittance, lumpy and not an operating cost'),
  ('Dividend','Owner drawing — counted as a beneficial cost in the P&L'),
  ('Net Salary and Bonuses','Payroll — counted separately in the P&L'),
  ('Pension (Personal/Stakeholder)','Owner benefit — counted as a beneficial cost'),
  ('Payment from Director Loan Account','Financing, not spend'),
  ('Credit Note Refund','Revenue adjustment, not spend'),
  ('Sales','Income')
on conflict (category_name) do nothing;
