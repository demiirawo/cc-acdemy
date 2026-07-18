-- Regulatory inspection outcomes (CQC, local authority, Home Office, etc.)
create table if not exists public.inspections (
  id uuid primary key default gen_random_uuid(),
  inspection_date date,
  body text,
  inspection_type text,
  outcome text,
  client_name text,
  supporting_evidence text,
  inspector_feedback text,
  lessons_learned text,
  notes text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists inspections_date_idx on public.inspections (inspection_date desc);
alter table public.inspections enable row level security;
drop policy if exists "HR & admins manage inspections" on public.inspections;
create policy "HR & admins manage inspections" on public.inspections
  for all using (public.is_hr_or_admin()) with check (public.is_hr_or_admin());
create or replace function public.set_inspections_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;
drop trigger if exists inspections_set_updated_at on public.inspections;
create trigger inspections_set_updated_at before update on public.inspections
  for each row execute function public.set_inspections_updated_at();
