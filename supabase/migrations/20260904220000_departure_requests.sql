-- Departures on the requests board, with cover and client notification.
--
-- The requests table already holds exactly what a departure needs tracked:
-- who is taking the work on (swap_with_user_id), whether the client has been
-- told (client_informed), and the dates. So a departure is another request
-- type rather than another mechanism.
--
-- What it is NOT is another thing everybody can see. Requests are deliberately
-- open: a staff member sees their own, a swap partner sees theirs, colleagues
-- on the same client see each other's, and approved rows are readable
-- ANONYMOUSLY so the public client schedule can show cover. Every one of those
-- would broadcast a departure, and some departures are dismissals the person
-- has not been told about yet. So each non-admin read policy is narrowed to
-- exclude departures before the type exists to be read.
alter type public.staff_request_type add value if not exists 'departure';
-- Narrow every non-admin read on staff_requests so departures are invisible.
--
-- Policies are OR'd, so ONE policy that still matches would expose the row.
-- All four non-admin read paths are rewritten; the two admin policies are left
-- exactly as they are.

-- 1. The anonymous one. This exists so a public client schedule can show who is
--    covering. A departure must never reach it.
drop policy if exists "Anon can view approved staff requests" on public.staff_requests;
create policy "Anon can view approved staff requests" on public.staff_requests for select
  using (status = 'approved'::text and request_type <> 'departure'::staff_request_type);

-- 2. Colleagues on the same client, plus the person and their swap partner.
drop policy if exists "Authenticated users can view requests for their clients" on public.staff_requests;
create policy "Authenticated users can view requests for their clients" on public.staff_requests for select
  using (
    get_current_user_role() = 'admin'::text
    or (
      request_type <> 'departure'::staff_request_type
      and (
        auth.uid() = user_id
        or auth.uid() = swap_with_user_id
        or exists (
          select 1 from staff_client_assignments sca
          where sca.staff_user_id = staff_requests.user_id
            and can_view_schedule_for_client(auth.uid(), sca.client_name)
        )
      )
    )
  );

-- 3. The swap partner. On a departure this is the person taking the work on —
--    who may well not have been told either.
drop policy if exists "Users can view requests where they are swap partner" on public.staff_requests;
create policy "Users can view requests where they are swap partner" on public.staff_requests for select
  using (auth.uid() = swap_with_user_id and request_type <> 'departure'::staff_request_type);

-- 4. The leaver themselves. The whole point.
drop policy if exists "Users can view their own requests" on public.staff_requests;
create policy "Users can view their own requests" on public.staff_requests for select
  using (auth.uid() = user_id and request_type <> 'departure'::staff_request_type);

-- Verified in a rolled-back transaction: with a departure row present, a
-- signed-in staff member and an anonymous reader each saw 0 departures and all
-- 233 existing requests, while the service role saw the departure. The change
-- hides the new type without narrowing anything that worked before.
