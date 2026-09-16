-- Departure handovers used to work out the successor from the rota alone: a
-- pattern at the client starting strictly AFTER the leaver's last day. A
-- successor who starts shadowing BEFORE the last day — the usual way a
-- handover is done — was therefore never found, and the tracker read "cover
-- not assigned yet" even with every task assigned to them by name.
--
-- src/lib/handoverStatus.ts now falls back to the successor named on the
-- approved departure request. to_user_id is part of a handover's identity
-- (client_handovers_one_per_pair), so without this backfill the checklists
-- already recorded against the unassigned row would be orphaned as "stale"
-- and a new empty handover would appear beside them.
--
-- Only rows the new derivation will actually produce are filled: the rota
-- stays authoritative per client, so a client whose rota DOES name a
-- successor is left alone.
with named as (
  select distinct on (sr.user_id)
         sr.user_id as leaver,
         sr.swap_with_user_id as successor
  from staff_requests sr
  where sr.request_type = 'departure'
    and sr.status = 'approved'
    and sr.swap_with_user_id is not null
    and sr.swap_with_user_id <> sr.user_id
  order by sr.user_id, sr.created_at desc
)
update client_handovers ch
set to_user_id = named.successor
from named
join hr_profiles hp on hp.user_id = named.leaver
where ch.kind = 'departure'
  and ch.to_user_id is null
  and ch.from_user_id = named.leaver
  -- The same leavers departureWindows() builds a window for.
  and hp.departure_handover_required
  and hp.employment_end_date is not null
  -- The rota names nobody for this client, so the request's successor stands in.
  and not exists (
    select 1
    from recurring_shift_patterns p
    where p.client_name = ch.client_name
      and p.continues_pattern_id is null
      and p.user_id is not null
      and p.user_id <> ch.from_user_id
      and p.start_date > hp.employment_end_date
  )
  -- Never collide with a row that already names that successor.
  and not exists (
    select 1
    from client_handovers x
    where x.client_name = ch.client_name
      and x.kind = ch.kind
      and x.from_user_id = ch.from_user_id
      and x.holiday_id is not distinct from ch.holiday_id
      and x.to_user_id = named.successor
  );
