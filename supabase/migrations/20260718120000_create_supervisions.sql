-- Quarterly staff supervisions: one record per supervision session for a staff member.
create table if not exists public.supervisions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,                       -- staff member being supervised
  supervisor_id uuid,                          -- who conducted it
  supervision_date date not null default current_date,
  status text not null default 'draft',        -- 'draft' | 'completed'
  -- Discussion sections
  manager_feedback text,
  client_feedback text,
  training_notes text,
  knowledge_notes text,                        -- care sector / CQC / policy & procedure knowledge
  knowledge_score integer,                     -- 1-5 assessed understanding (nullable)
  incidents_notes text,
  rating_notes text,                           -- rating discussion + how to improve
  wellbeing_notes text,                        -- wellbeing & support needs
  development_notes text,                      -- career development / goals / aspirations
  action_points text,                          -- agreed actions before next supervision
  additional_notes text,
  next_due_date date,                          -- optional explicit next-due (else date + 3 months)
  staff_acknowledged boolean not null default false,
  acknowledged_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint supervisions_knowledge_score_range check (knowledge_score is null or (knowledge_score between 1 and 5))
);

create index if not exists supervisions_user_id_idx on public.supervisions (user_id);
create index if not exists supervisions_date_idx on public.supervisions (supervision_date desc);

alter table public.supervisions enable row level security;

-- Admins manage everything (mirrors incidents/staff_warnings pattern).
drop policy if exists "Admins manage supervisions" on public.supervisions;
create policy "Admins manage supervisions" on public.supervisions
  for all
  using (get_current_user_role() = 'admin')
  with check (get_current_user_role() = 'admin');

-- Staff may read their own supervisions.
drop policy if exists "Staff read own supervisions" on public.supervisions;
create policy "Staff read own supervisions" on public.supervisions
  for select
  using ((get_current_user_role() = 'admin') or (user_id = auth.uid()));

-- keep updated_at fresh
create or replace function public.set_supervisions_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists supervisions_set_updated_at on public.supervisions;
create trigger supervisions_set_updated_at
  before update on public.supervisions
  for each row execute function public.set_supervisions_updated_at();
