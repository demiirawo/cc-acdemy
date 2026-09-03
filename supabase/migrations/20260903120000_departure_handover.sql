-- A handover when somebody leaves - offered, never imposed.
--
-- Setting an employment end date is how a departure is recorded, but not every
-- departure is a resignation. Where somebody is being dismissed, the last thing
-- the company wants is for the software to hand them a departure checklist and
-- tell them their leaving date before a manager has. So this is opt-in per
-- person, defaults to off, and nothing is created or shown to the leaver until
-- an admin deliberately turns it on.
alter table public.hr_profiles
  add column if not exists departure_handover_required boolean not null default false,
  add column if not exists departure_handover_requested_at timestamptz,
  add column if not exists departure_handover_requested_by uuid;

comment on column public.hr_profiles.departure_handover_required is
  'Opt-in. False means no departure handover exists and the leaver is told nothing - the default, because a dismissal must not be announced by the software.';

-- Scope a handover task to one person's departure.
--
-- NULL is the existing shared per-client tracker used for holiday cover, and
-- every query that reads that tracker now excludes leaver rows, so a departure
-- checklist cannot appear inside somebody else's holiday handover or drag its
-- progress down.
alter table public.client_handover_tasks
  add column if not exists leaver_user_id uuid;

comment on column public.client_handover_tasks.leaver_user_id is
  'NULL = the shared client tracker (holiday cover). Set = part of that person''s departure handover.';

create index if not exists client_handover_tasks_leaver_idx
  on public.client_handover_tasks (leaver_user_id) where leaver_user_id is not null;

-- A leaver may read and update their own departure tasks, and nothing else.
-- Without this they could see the task rows but not tick them off.
drop policy if exists "Leavers manage their own departure handover" on public.client_handover_tasks;
create policy "Leavers manage their own departure handover"
  on public.client_handover_tasks for select
  using (leaver_user_id = auth.uid());

drop policy if exists "Leavers update their own departure handover" on public.client_handover_tasks;
create policy "Leavers update their own departure handover"
  on public.client_handover_tasks for update
  using (leaver_user_id = auth.uid())
  with check (leaver_user_id = auth.uid());
