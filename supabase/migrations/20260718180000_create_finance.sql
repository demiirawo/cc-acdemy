-- Monthly business expenses (payroll + client revenue are computed live).
create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  amount_gbp numeric not null default 0,
  category text not null default 'Business Cost',
  vat_able boolean,
  recurring boolean not null default true,
  notes text,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.expenses enable row level security;
drop policy if exists "Admins manage expenses" on public.expenses;
create policy "Admins manage expenses" on public.expenses
  for all using (get_current_user_role() = 'admin') with check (get_current_user_role() = 'admin');

create table if not exists public.finance_settings (
  id boolean primary key default true,
  vat_rate numeric not null default 0.20,
  corporation_tax_rate numeric not null default 0.19,
  monthly_growth_pct numeric not null default 0,
  projection_months integer not null default 6,
  updated_at timestamptz not null default now(),
  constraint finance_settings_singleton check (id = true)
);
alter table public.finance_settings enable row level security;
drop policy if exists "Admins manage finance settings" on public.finance_settings;
create policy "Admins manage finance settings" on public.finance_settings
  for all using (get_current_user_role() = 'admin') with check (get_current_user_role() = 'admin');
insert into public.finance_settings (id) values (true) on conflict (id) do nothing;

create or replace function public.set_finance_updated_at()
returns trigger language plpgsql as $$ begin new.updated_at = now(); return new; end; $$;
drop trigger if exists expenses_set_updated_at on public.expenses;
create trigger expenses_set_updated_at before update on public.expenses for each row execute function public.set_finance_updated_at();
