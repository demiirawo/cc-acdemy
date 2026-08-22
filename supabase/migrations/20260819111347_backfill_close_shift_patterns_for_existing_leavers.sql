-- Catches up the people whose leaving date was recorded before the trigger
-- existed. The audit trigger is switched off for the duration: these patterns
-- are being corrected to dates that were decided weeks ago, and leaving it on
-- would send "your shift has changed — please acknowledge" to someone who has
-- already left, and six of them to someone who knows exactly when he finishes.
-- The whole thing is one transaction, so the trigger is restored even if the
-- update fails.

alter table public.recurring_shift_patterns disable trigger audit_recurring_shift_patterns;

insert into public.shift_pattern_leaving_caps (pattern_id, user_id, previous_end_date, capped_to)
select rp.id, rp.user_id, rp.end_date, h.employment_end_date
from public.recurring_shift_patterns rp
join public.hr_profiles h on h.user_id = rp.user_id
where h.employment_end_date is not null
  and (rp.end_date is null or rp.end_date > h.employment_end_date);

update public.recurring_shift_patterns rp
set end_date = h.employment_end_date
from public.hr_profiles h
where h.user_id = rp.user_id
  and h.employment_end_date is not null
  and (rp.end_date is null or rp.end_date > h.employment_end_date);

alter table public.recurring_shift_patterns enable trigger audit_recurring_shift_patterns;
