-- Price changes with an effective date, rather than silently overwriting clients.mrr.
--
-- A fee change is a commercial decision someone needs to be able to explain later:
-- when it was agreed, when it starts, and why. Holding only the current number
-- loses all three, and makes a rise scheduled for next month indistinguishable
-- from one that already happened.
create table if not exists public.client_price_changes (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  previous_mrr numeric,
  new_mrr numeric not null,
  -- The month this price starts applying. May be in the future: the revenue
  -- projection picks it up from that month rather than assuming today's fee.
  effective_date date not null,
  reason text,
  created_by uuid,
  created_at timestamptz not null default now()
);

create index if not exists client_price_changes_client_idx on public.client_price_changes (client_id);
create index if not exists client_price_changes_effective_idx on public.client_price_changes (effective_date);

alter table public.client_price_changes enable row level security;

drop policy if exists "Admins manage price changes" on public.client_price_changes;
create policy "Admins manage price changes" on public.client_price_changes for all
  using (public.get_current_user_role() = 'admin')
  with check (public.get_current_user_role() = 'admin');

drop policy if exists "HR can view price changes" on public.client_price_changes;
create policy "HR can view price changes" on public.client_price_changes for select
  using (public.get_current_user_role() in ('admin','human_resources'));

comment on table public.client_price_changes is
  'Audit of client fee changes with the date each takes effect. Future-dated rows drive the revenue projection; past rows mark the revenue chart.';
