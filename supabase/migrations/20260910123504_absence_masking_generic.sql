-- Make the masked absence read non-identifying, and scope pending sickness.
--
-- public_staff_absences() first renamed only 'sick' to 'absent' and passed
-- every other type through by name. So 'absent' could only ever mean sickness:
-- a rename, not a mask. Now it returns just two values — 'holiday', or 'absent'
-- for every other type (unpaid, sick, personal, maternity, paternity, other) —
-- with notes only on holiday rows. Clients and colleagues learn that someone is
-- away, not why; sickness blends in with unpaid and other leave. This also
-- stops the notes on unpaid rows (some of which describe illness, from before
-- sickness had its own request type) going out through this function.
--
-- pending_sickness() gave scheduling editors every pending sickness, while the
-- staff_holidays policy shows them confirmed sickness only for staff on clients
-- they can view. Same scope for both now. HR keeps it: HR is already emailed
-- every new request.
--
-- Still open until the new frontend is live (it reads absences through this
-- function; the one deployed before it reads the table directly): anonymous
-- and ordinary signed-in readers can still select staff_holidays and approved
-- requests themselves, and compare. Closing that is a follow-up migration.

create or replace function public.public_staff_absences()
returns table (
  id uuid,
  user_id uuid,
  absence_type text,
  start_date date,
  end_date date,
  days_taken numeric,
  status text,
  notes text,
  no_cover_required boolean,
  no_cover_dates text[]
)
language sql
stable
security definer
set search_path = ''
as $$
  select h.id,
         h.user_id,
         case when h.absence_type = 'holiday' then 'holiday' else 'absent' end,
         h.start_date,
         h.end_date,
         h.days_taken,
         h.status,
         case when h.absence_type = 'holiday' then h.notes else null end,
         h.no_cover_required,
         h.no_cover_dates
  from public.staff_holidays h
  where h.status = 'approved';
$$;

create or replace function public.pending_sickness(p_from date, p_to date)
returns table (user_id uuid, start_date date, end_date date)
language sql
stable
security definer
set search_path = ''
as $$
  select r.user_id, r.start_date, r.end_date
  from public.staff_requests r
  where r.request_type = 'sickness'
    and r.status = 'pending'
    and r.start_date <= p_to
    and r.end_date >= p_from
    and (
      public.get_current_user_role() in ('admin', 'human_resources')
      or (
        public.is_scheduling_editor(auth.uid())
        and exists (
          select 1 from public.staff_client_assignments sca
          where sca.staff_user_id = r.user_id
            and public.can_view_schedule_for_client(auth.uid(), sca.client_name)
        )
      )
    );
$$;
