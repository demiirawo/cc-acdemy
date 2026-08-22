-- Change control for the two other fields that move revenue: the sales stage and
-- the contract end date.
--
-- The stage in particular carries a date the record itself can't express. A client
-- marked inactive today may have stopped billing months ago, and without knowing
-- when, the revenue history has to either drop them from every month (understating
-- the past) or keep them in every month (overstating the present). Recording the
-- date it took effect resolves that.
create table if not exists public.client_change_log (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  field text not null check (field in ('status', 'contract_end_date')),
  previous_value text,
  new_value text,
  effective_date date not null,
  reason text,
  created_by uuid,
  created_at timestamptz not null default now()
);

create index if not exists client_change_log_client_idx on public.client_change_log (client_id);
create index if not exists client_change_log_effective_idx on public.client_change_log (effective_date);
create index if not exists client_change_log_field_idx on public.client_change_log (field);

alter table public.client_change_log enable row level security;

drop policy if exists "Admins manage client change log" on public.client_change_log;
create policy "Admins manage client change log" on public.client_change_log for all
  using (public.get_current_user_role() = 'admin')
  with check (public.get_current_user_role() = 'admin');

drop policy if exists "HR can view client change log" on public.client_change_log;
create policy "HR can view client change log" on public.client_change_log for select
  using (public.get_current_user_role() in ('admin','human_resources'));

comment on table public.client_change_log is
  'Audit of client sales-stage and contract-end changes, with the date each took effect. Drives when a client stops counting toward revenue.';

-- The two clients already marked inactive have no recorded date, so revenue can't
-- tell when they stopped. Seed from the contract end date where we have one; the
-- other stays unrecorded rather than inventing a date.
insert into public.client_change_log (client_id, field, previous_value, new_value, effective_date, reason)
select c.id, 'status', 'active', 'inactive', c.contract_end_date,
       'Backfilled from contract end date'
from public.clients c
where coalesce(c.status,'active') <> 'active'
  and c.contract_end_date is not null
  and not exists (select 1 from public.client_change_log l where l.client_id = c.id and l.field = 'status');
