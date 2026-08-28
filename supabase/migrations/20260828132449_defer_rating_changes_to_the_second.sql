-- Rating changes stop landing the moment they are made.
--
-- A rating that changes the day after a difficult conversation reads as a
-- reaction to that conversation. The same rating, applied on the 2nd of the
-- following month once payroll has run, reads as what it is meant to be: an
-- assessment of the month just finished.
--
-- So a change is now recorded here first and applied later. Until it is
-- applied, hr_profiles.performance_rating is untouched — which means every
-- downstream reader (the bonus pot, the badge, the staff member's own profile)
-- keeps showing the old rating with no changes of their own. Nobody is emailed
-- until it lands either.

create table if not exists public.pending_rating_changes (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null,
  previous_rating  text,
  new_rating       text not null,
  reason           text not null,
  effective_date   date not null,
  created_by       uuid,
  created_at       timestamptz not null default now(),
  applied_at       timestamptz,
  cancelled_at     timestamptz,
  cancelled_by     uuid
);

-- One change in flight per person: setting a new one supersedes the old rather
-- than queueing two rating moves for the same morning.
create unique index if not exists pending_rating_changes_one_open_per_user
  on public.pending_rating_changes (user_id)
  where applied_at is null and cancelled_at is null;

create index if not exists pending_rating_changes_due
  on public.pending_rating_changes (effective_date)
  where applied_at is null and cancelled_at is null;

alter table public.pending_rating_changes enable row level security;

-- Deliberately no policy for the staff member themselves. A pending change is
-- not something they should be able to read early — that is the whole point.
create policy "Admins manage pending rating changes"
  on public.pending_rating_changes for all
  using (get_current_user_role() = 'admin')
  with check (get_current_user_role() = 'admin');

create policy "HR manage pending rating changes"
  on public.pending_rating_changes for all
  using (is_hr_or_admin())
  with check (is_hr_or_admin());

/**
 * When a rating decided today should take effect: the next 2nd of a month,
 * strictly after today.
 *
 * Strictly, so that a rating entered on the 2nd itself waits for the following
 * month rather than landing the same morning it was decided. A rating entered
 * on the 1st still lands on the 2nd — it is assessing the month that has just
 * ended, and waiting another four weeks would make it stale.
 */
create or replace function public.next_rating_effective_date(p_from date default current_date)
returns date
language sql
immutable
as $$
  select case
    when extract(day from p_from) < 2
      then make_date(extract(year from p_from)::int, extract(month from p_from)::int, 2)
    else make_date(
      extract(year from (p_from + interval '1 month'))::int,
      extract(month from (p_from + interval '1 month'))::int,
      2)
  end;
$$;

comment on table public.pending_rating_changes is
  'Rating changes waiting for the 2nd of the month. Applied by the apply-pending-ratings function, which also sends the email.';

-- The daily job that applies due changes is scheduled separately, because the
-- cron command carries a bearer token that does not belong in version control.
-- It was created by copying an existing job's command and retargeting the URL:
--
--   select cron.schedule('apply-pending-ratings', '30 6 * * *',
--     replace((select command from cron.job where jobname = 'shift-ack-reminders'),
--             'shift-ack-reminders', 'apply-pending-ratings'));
--
-- Daily rather than monthly on purpose: apply-pending-ratings takes everything
-- with effective_date <= today, so a missed morning costs a day, not a month.
