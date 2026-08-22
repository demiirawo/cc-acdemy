-- Staff see an incident only when they are a party to it.
--
-- The previous policy let any staff member read any incident flagged
-- shared_with_staff. That put client incidents they had no part in on their
-- Incidents tab, where a Critical/Safeguarding badge against an unfamiliar
-- client reads as an accusation. Statements keyed off the same flag, so
-- colleagues could also read each other's personal accounts of an incident.
--
-- is_incident_participant() is SECURITY DEFINER, so it still resolves the
-- statement rows that decide membership even though staff can no longer
-- read anyone else's.

drop policy if exists "Read shared/invited incidents; HR/admins read all" on public.incidents;

create policy "Staff read incidents they are party to; HR/admins read all"
on public.incidents for select
using (is_hr_or_admin() or is_incident_participant(id, auth.uid()));

drop policy if exists "Read own/shared statements; HR/admins read all" on public.incident_statements;

create policy "Staff read their own statement; HR/admins read all"
on public.incident_statements for select
using (is_hr_or_admin() or user_id = auth.uid());
