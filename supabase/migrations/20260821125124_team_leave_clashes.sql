-- Warns that someone from the same team is already off over the same dates.
--
-- "Team" is the people you share a client with — which is what the twos and
-- threes on call monitoring actually are. Client work is recorded in two
-- places, a standing assignment and a shift pattern, so both count.
--
-- The bench ("Care Cuddle") is deliberately excluded. Everyone unallocated
-- shares it, so it would flag a clash between people who never work together,
-- and a warning that cries wolf is a warning nobody reads.
--
-- Defined once, in the database, because the request form and the email to the
-- reviewer both need the same answer. Security definer so a staff member can be
-- told a colleague is away without being given read access to everyone's
-- requests — it returns a name and dates, nothing more.

create or replace function public.team_leave_clashes(
  p_user_id uuid,
  p_start date,
  p_end date,
  p_exclude_request_id uuid default null
)
returns table (
  user_id uuid,
  display_name text,
  start_date date,
  end_date date,
  status text,
  request_type text,
  shared_clients text[]
)
language sql
stable
security definer
set search_path = public
as $$
  with my_clients as (
    select client_name from public.staff_client_assignments
    where staff_user_id = p_user_id and client_name is not null
    union
    select client_name from public.recurring_shift_patterns
    where user_id = p_user_id and client_name is not null and is_overtime = false
      and (end_date is null or end_date >= current_date)
  ),
  their_clients as (
    select staff_user_id as uid, client_name from public.staff_client_assignments
    where client_name is not null
    union
    select rp.user_id, rp.client_name from public.recurring_shift_patterns rp
    where rp.client_name is not null and rp.is_overtime = false
      and (rp.end_date is null or rp.end_date >= current_date)
  ),
  teammates as (
    select t.uid, array_agg(distinct t.client_name order by t.client_name) as shared
    from their_clients t
    join my_clients m on m.client_name = t.client_name
    where t.uid <> p_user_id
      and lower(btrim(t.client_name)) <> 'care cuddle'   -- the bench is not a team
    group by t.uid
  )
  select r.user_id,
         coalesce(p.display_name, p.email, 'A colleague') as display_name,
         r.start_date,
         r.end_date,
         r.status::text,
         r.request_type::text,
         tm.shared
  from public.staff_requests r
  join teammates tm on tm.uid = r.user_id
  join public.profiles p on p.user_id = r.user_id
  left join public.hr_profiles h on h.user_id = r.user_id
  where r.request_type in ('holiday', 'holiday_paid', 'holiday_unpaid')
    and r.status in ('pending', 'approved')
    and r.start_date <= p_end
    and r.end_date >= p_start
    and (p_exclude_request_id is null or r.id <> p_exclude_request_id)
    -- someone who has left is not competing for cover
    and (h.employment_end_date is null or h.employment_end_date >= p_start)
  order by r.start_date;
$$;

grant execute on function public.team_leave_clashes(uuid, date, date, uuid) to authenticated, anon;
