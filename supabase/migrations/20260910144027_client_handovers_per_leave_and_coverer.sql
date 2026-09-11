-- A handover is one person handing one client to one colleague for one leave.
--
-- client_handover_tasks was keyed by client alone. That could show one leave
-- and one coverer per client, so a person with two upcoming holidays, or a
-- holiday split between two coverers, had nowhere to record the second
-- handover — and the only way to stop last month's checklist standing in for
-- next month's was a trigger that wiped the client's tasks whenever a new
-- leave was approved.
--
-- Now each handover is a row here, and tasks hang off it. A holiday covered by
-- Amaka and Sam is two handovers, each with its own checklist, progress and
-- "not required" decision. A departure is the same shape: the leaver, the
-- client, and whoever takes the client on.
create table public.client_handovers (
  id uuid primary key default gen_random_uuid(),
  client_name text not null check (client_name = btrim(client_name)),
  kind text not null default 'leave' check (kind in ('leave', 'departure')),
  -- The person handing over: on leave, or leaving.
  from_user_id uuid not null,
  -- The leave this handover is for. A departure has none.
  holiday_id uuid references public.staff_holidays(id) on delete cascade,
  -- Who it is handed to. NULL = no cover assigned yet; the checklist can still
  -- be prepared and is moved to the coverer once one is approved.
  to_user_id uuid,
  status text not null default 'required' check (status in ('required', 'not_required')),
  not_required_reason text,
  status_changed_by uuid,
  status_changed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint client_handovers_leave_has_holiday check ((kind = 'leave') = (holiday_id is not null))
);

comment on table public.client_handovers is
  'One handover: a person hands one client to one colleague for one leave (or departure). Tasks in client_handover_tasks belong to a handover through handover_id.';

-- One row per (client, leave, coverer). NULLS NOT DISTINCT so "cover not
-- assigned yet" is also one row, and a departure (no holiday) too.
create unique index client_handovers_one_per_pair
  on public.client_handovers (client_name, kind, from_user_id, holiday_id, to_user_id)
  nulls not distinct;
create index client_handovers_holiday_idx on public.client_handovers (holiday_id);
create index client_handovers_client_idx on public.client_handovers (client_name);

create trigger client_handovers_updated_at
  before update on public.client_handovers
  for each row execute function public.update_updated_at_column();

-- Same access as the tasks themselves: the tracker lives on the client's
-- public page, which staff open from the reminder link without signing in.
alter table public.client_handovers enable row level security;
create policy "Public can view handovers" on public.client_handovers for select to anon, authenticated using (true);
create policy "Public can insert handovers" on public.client_handovers for insert to anon, authenticated with check (true);
create policy "Public can update handovers" on public.client_handovers for update to anon, authenticated using (true) with check (true);
create policy "Public can delete handovers" on public.client_handovers for delete to anon, authenticated using (true);

alter table public.client_handover_tasks
  add column handover_id uuid references public.client_handovers(id) on delete cascade;
comment on column public.client_handover_tasks.handover_id is
  'The handover this task belongs to. NULL only on tasks from before handovers were kept per leave; they are shown as unlinked.';
create index client_handover_tasks_handover_idx on public.client_handover_tasks (handover_id);

-- A template task once per HANDOVER, not once per client: Funmi's handover to
-- Amaka and her handover to Sam both need "Review care visit notes".
drop index if exists public.client_handover_tasks_template_once_per_client;
create unique index client_handover_tasks_template_once_per_handover
  on public.client_handover_tasks (handover_id, template_id)
  where template_id is not null and handover_id is not null;
create unique index client_handover_tasks_template_once_unlinked
  on public.client_handover_tasks (client_name, template_id)
  where template_id is not null and handover_id is null;

-- The wipe-on-approval trigger existed only because tasks could not be told
-- apart by leave. Each leave now has its own checklist, so approving a new
-- leave has nothing to reset.
drop trigger if exists reset_client_handovers_on_new_leave on public.staff_holidays;
drop function if exists public.reset_client_handovers_on_new_leave();

-- Attach the checklists that belong to a leave still ahead or under way, as
-- the tracker was showing them on 10 Sep 2026: the client's soonest leave and
-- the coverer the tasks were already addressed to. Roseberry Kare is left
-- unlinked on purpose — its finished tasks were July's handover to a different
-- coverer, not Dunsin's September leave. Everything else with tasks has no
-- upcoming leave and stays unlinked as history. Guarded so the migration
-- replays cleanly where these rows do not exist.
with seeds (client_name, holiday_id, to_user_id) as (
  values
    ('Springs of Joy',       '96acd202-b6bd-40cf-943c-f35b7f1f4632'::uuid, '731973b8-2df2-4d3c-9a16-770a1039da01'::uuid),
    ('Three Little Angels',  '55464e72-402e-411b-9ebc-2000e92fe92a'::uuid, 'c889d5ee-f3e7-4468-932d-f3cebf30c9c1'::uuid),
    ('Calvary Care',         '766bd226-20df-4cdf-8970-8cec336613d0'::uuid, '732458a2-8b08-47dc-8318-5215f1713784'::uuid),
    ('Rising Care Services', '4082eb62-6827-4bd6-abf1-252b8cc20c62'::uuid, 'c889d5ee-f3e7-4468-932d-f3cebf30c9c1'::uuid),
    ('Nurse Next Door',      'e1208db6-7517-4d3b-b269-110464fefb04'::uuid, null::uuid),
    ('OICE',                 'e1208db6-7517-4d3b-b269-110464fefb04'::uuid, null::uuid)
),
made as (
  insert into public.client_handovers (client_name, kind, from_user_id, holiday_id, to_user_id)
  select s.client_name, 'leave', h.user_id, h.id, s.to_user_id
  from seeds s
  join public.staff_holidays h on h.id = s.holiday_id
  on conflict do nothing
  returning id, client_name, holiday_id, to_user_id
)
update public.client_handover_tasks t
   set handover_id = m.id
  from made m
 where btrim(t.client_name) = m.client_name
   and t.handover_id is null;
