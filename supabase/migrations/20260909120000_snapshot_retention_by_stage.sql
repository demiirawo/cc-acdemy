-- Candidate snapshot retention, keyed on the candidate's stage rather than age.
--
-- The previous rule deleted anything older than thirty days. That looked
-- proportionate and was wrong, because it assumed applications are reviewed
-- within thirty days. They are not: 580 candidates sit in Pending Review and the
-- oldest are from July. The rule therefore destroyed the proctoring evidence for
-- decisions that had not been made yet, and — because it did not look at stage
-- at all — for 19 of 22 candidates at interview and 7 of the 8 people actually
-- hired. Those are precisely the decisions a snapshot exists to defend.
--
-- A snapshot's worth is decided by where the candidate is, not by how long ago
-- they applied:
--
--   pending review / interview / hired  ->  keep, however old
--   rejected (settled)                  ->  delete
--   started but never submitted         ->  delete after a week
--   attempt no longer exists            ->  delete
--
-- Space is reclaimed by thinning rather than by deleting: past THIN_AFTER_DAYS a
-- kept attempt is reduced to KEEP_PER_ATTEMPT evenly spaced photographs, first
-- and last always among them. A thirty-five minute assessment at one frame a
-- minute goes from ~35 images to 10 — one every three or four minutes, enough to
-- show who sat it and to catch a substitution — for about an eighth of the space.
--
-- Returned rather than executed: the caller deletes the storage object first and
-- the row second, so a crash leaves a re-findable row rather than an orphaned
-- file. SECURITY DEFINER because it reads storage-adjacent bookkeeping, and
-- callable only by service_role — no client has any reason to ask for it.

create or replace function public.snapshots_to_prune(p_limit integer default 20000)
returns table (id uuid, storage_path text, reason text)
language sql
security definer
set search_path = public
as $$
  with
  -- Rejections that have settled. The rejection email is queued for twelve
  -- hours and cancelled if the stage moves back, so a rejection is reversible
  -- for half a day; dated from the stage change, never from the application.
  settled_rejection as (
    select distinct e.attempt_id
    from recruitment_events e
    where e.event_type = 'stage_changed'
      and e.metadata->>'stage' = 'rejected'
      and e.occurred_at < now() - interval '24 hours'
  ),
  rejected as (
    select s.id, s.storage_path, 'rejected' as reason
    from recruitment_snapshots s
    join recruitment_attempts a on a.id = s.attempt_id
    join settled_rejection r on r.attempt_id = s.attempt_id
    where a.status = 'rejected'          -- ...and still rejected now
  ),
  -- Opened the assessment and never finished it. There is no decision to
  -- defend, so a week is generous.
  abandoned as (
    select s.id, s.storage_path, 'abandoned' as reason
    from recruitment_snapshots s
    join recruitment_attempts a on a.id = s.attempt_id
    where a.status = 'in_progress'
      and a.submitted_at is null
      and a.created_at < now() - interval '7 days'
  ),
  orphaned as (
    select s.id, s.storage_path, 'orphaned' as reason
    from recruitment_snapshots s
    where not exists (select 1 from recruitment_attempts a where a.id = s.attempt_id)
  ),
  -- Everything kept indefinitely, numbered oldest first within its attempt.
  ranked as (
    select s.id, s.storage_path,
           row_number() over (partition by s.attempt_id order by s.taken_at) - 1 as rn,
           count(*)     over (partition by s.attempt_id) as n
    from recruitment_snapshots s
    join recruitment_attempts a on a.id = s.attempt_id
    where a.status in ('submitted', 'interview', 'success')
      and a.created_at < now() - interval '30 days'
  ),
  -- Keep positions round(i*(n-1)/(k-1)) for i in 0..k-1: that is first, last and
  -- k-2 spread between. Anything not landing on one of those goes.
  thinned as (
    select r.id, r.storage_path, 'thinned' as reason
    from ranked r
    where r.n > 10
      and not exists (
        select 1 from generate_series(0, 9) as i
        where round(i * (r.n - 1)::numeric / 9) = r.rn
      )
  )
  select id, storage_path, reason from (
    select * from rejected
    union
    select * from abandoned
    union
    select * from orphaned
    union
    select * from thinned
  ) all_rules
  limit greatest(p_limit, 0);
$$;

comment on function public.snapshots_to_prune(integer) is
  'Candidate snapshots that may be deleted, with the rule that condemned each. Retention follows the candidate''s stage; kept attempts are thinned to 10 evenly spaced frames past 30 days rather than deleted outright.';

revoke all on function public.snapshots_to_prune(integer) from public, anon, authenticated;
grant execute on function public.snapshots_to_prune(integer) to service_role;
