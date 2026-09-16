-- The 15 September call-monitoring quality assurance round was carried out
-- wrongly, so everything that came out of it is being withdrawn: the checks
-- themselves, the development points raised off the back of them, and the
-- rating downgrades decided on the strength of those points.
--
-- Nothing here is a judgement that the staff involved did well. It is that the
-- checks do not say anything either way, so neither should their records.
--
-- The rows are copied into a locked-down backup first. A withdrawn check is
-- still evidence of what was withdrawn, and if any of this turns out to have
-- been right after all it can be put back rather than reconstructed.

create table if not exists public._qa_undo_backup_20260916 (
  source_table text not null,
  row_data jsonb not null,
  backed_up_at timestamptz not null default now()
);

-- Same posture as the other backup tables: RLS on with no policies denies
-- everyone but the service role, and the grants go too so PostgREST will not
-- expose it. This holds staff performance records.
alter table public._qa_undo_backup_20260916 enable row level security;
revoke all on public._qa_undo_backup_20260916 from anon, authenticated;

insert into public._qa_undo_backup_20260916 (source_table, row_data)
select 'qa_checks', to_jsonb(c) from public.qa_checks c
where c.checked_at::date = date '2026-09-15';

insert into public._qa_undo_backup_20260916 (source_table, row_data)
select 'staff_warnings', to_jsonb(w) from public.staff_warnings w
where w.category = 'quality_assurance' and w.issued_at::date = date '2026-09-15';

insert into public._qa_undo_backup_20260916 (source_table, row_data)
select 'pending_rating_changes', to_jsonb(r) from public.pending_rating_changes r
where r.applied_at is null and r.cancelled_at is null
  and r.reason ilike '%quality assurance%';

-- Fail loudly rather than quietly clearing the wrong thing: these are the
-- counts the round was verified to have produced. Anything else means the data
-- moved since, and a human should look before this runs.
do $$
declare
  n_checks int;
  n_warnings int;
  n_ratings int;
begin
  select count(*) into n_checks from public._qa_undo_backup_20260916 where source_table = 'qa_checks';
  select count(*) into n_warnings from public._qa_undo_backup_20260916 where source_table = 'staff_warnings';
  select count(*) into n_ratings from public._qa_undo_backup_20260916 where source_table = 'pending_rating_changes';
  if n_checks <> 5 or n_warnings <> 4 or n_ratings <> 3 then
    raise exception 'Expected 5 checks, 4 warnings and 3 pending ratings; found %, % and %.', n_checks, n_warnings, n_ratings;
  end if;
end $$;

delete from public.staff_warnings
where category = 'quality_assurance' and issued_at::date = date '2026-09-15';

delete from public.qa_checks
where checked_at::date = date '2026-09-15';

-- Cancelled rather than deleted: pending_rating_changes already has a way to
-- call a change off, the apply job reads it, and a cancelled row is the honest
-- record that the downgrade was decided and then withdrawn before it landed.
update public.pending_rating_changes
set cancelled_at = now(),
    cancelled_by = created_by
where applied_at is null and cancelled_at is null
  and reason ilike '%quality assurance%';
