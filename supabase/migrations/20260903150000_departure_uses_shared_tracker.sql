-- Drop the parallel mechanism. A departure handover is a handover.
--
-- The first cut gave leavers their own tagged copies of every task, their own
-- seeding step and their own section of the app. That was a second way of doing
-- something the software already did: a holiday handover has no per-person
-- tasks at all. The tracker belongs to the CLIENT, and going on leave simply
-- surfaces it. A departure now does the same, so the tag has nothing to hold.
--
-- Nothing is lost - no rows were ever tagged, because the seeding step only
-- ever ran for one person and produced nothing.
drop policy if exists "Leavers manage their own departure handover" on public.client_handover_tasks;
drop policy if exists "Leavers update their own departure handover" on public.client_handover_tasks;
drop index if exists client_handover_tasks_leaver_idx;
alter table public.client_handover_tasks drop column if exists leaver_user_id;

-- The opt-in stays. It is the one thing that genuinely differs from a holiday:
-- a holiday is announced by the person taking it, and a departure is not always
-- announced at all, so surfacing one has to be a deliberate choice.
comment on column public.hr_profiles.departure_handover_required is
  'Opt-in. When true the person appears on the handover tracker for the clients they still cover, exactly as a holiday does. Off by default so a dismissal is never announced by the software.';
