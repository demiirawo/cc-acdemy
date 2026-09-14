-- A change to a pay setting lands on the 2nd, like a salary or a rating.
--
-- Payroll is run on the 1st for the month just finished. Four settings in
-- Edit Settings change what somebody is paid, and each used to take effect the
-- moment it was saved: disable public holiday pay on 29 December and the
-- uplift for bank holidays already worked that month disappeared; untick
-- bonus-pot eligibility on the 20th and that month's pot was re-split at once.
-- A change decided part-way through a month now waits for the 2nd, the day
-- after payday, as salary and rating changes already do.
--
-- hr_profiles keeps the setting in force until then, so payroll, the pot and
-- the person's own pay view are right on the day without knowing this table
-- exists. The applied rows double as history: payroll reads a month's settings
-- as they were in force for it, so a month paid late, or reopened by reverting
-- a payment, is not reached by a change that landed after it.

create table public.pending_pay_setting_changes (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null,
  setting         text not null,
  previous_value  text,
  new_value       text not null,
  effective_date  date not null,
  created_by      uuid,
  created_at      timestamptz not null default now(),
  applied_at      timestamptz,
  cancelled_at    timestamptz,
  cancelled_by    uuid,
  constraint pending_pay_setting_changes_known_value check (
    (setting in ('unlimited_holiday', 'public_holiday_pay_disabled', 'bonus_pot_eligible')
      and new_value in ('true', 'false'))
    or (setting = 'pay_frequency'
      and new_value in ('weekly', 'bi-weekly', 'monthly', 'annually'))
  ),
  constraint pending_pay_setting_changes_on_the_second
    check (extract(day from effective_date) = 2)
);

comment on table public.pending_pay_setting_changes is
  'Pay settings waiting for the 2nd of the month, after payroll has run. Applied by apply_pending_pay_setting_changes(); the applied rows are the history payroll reads a month''s settings from.';

-- One change in flight per person per setting: a second thought during the
-- month replaces the first rather than queueing two for the same morning.
create unique index pending_pay_setting_changes_one_open
  on public.pending_pay_setting_changes (user_id, setting)
  where applied_at is null and cancelled_at is null;

create index pending_pay_setting_changes_due
  on public.pending_pay_setting_changes (effective_date)
  where applied_at is null and cancelled_at is null;

alter table public.pending_pay_setting_changes enable row level security;

-- The people who can change these settings today: admins and HR both write
-- hr_profiles. Staff don't read their own. Like a rating, losing bonus-pot
-- eligibility is for a manager to tell somebody, not for the app to show early.
create policy "Admins manage pending pay setting changes"
  on public.pending_pay_setting_changes for all
  using (get_current_user_role() = 'admin')
  with check (get_current_user_role() = 'admin');

create policy "HR manage pending pay setting changes"
  on public.pending_pay_setting_changes for all
  using (is_hr_or_admin())
  with check (is_hr_or_admin());

revoke all on public.pending_pay_setting_changes from anon;

-- Moves due settings onto hr_profiles. One transaction: if any update fails,
-- nothing is marked applied and tomorrow's run tries them all again. Daily
-- rather than only on the 2nd, taking everything due, so a missed morning
-- costs a day rather than a month.
create or replace function public.apply_pending_pay_setting_changes()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  change record;
  applied integer := 0;
begin
  for change in
    update public.pending_pay_setting_changes
       set applied_at = now()
     where applied_at is null
       and cancelled_at is null
       and effective_date <= current_date
    returning user_id, setting, new_value
  loop
    case change.setting
      when 'unlimited_holiday' then
        update public.hr_profiles set unlimited_holiday = (change.new_value = 'true') where user_id = change.user_id;
      when 'public_holiday_pay_disabled' then
        update public.hr_profiles set public_holiday_pay_disabled = (change.new_value = 'true') where user_id = change.user_id;
      when 'bonus_pot_eligible' then
        update public.hr_profiles set bonus_pot_eligible = (change.new_value = 'true') where user_id = change.user_id;
      when 'pay_frequency' then
        update public.hr_profiles set pay_frequency = change.new_value where user_id = change.user_id;
    end case;
    applied := applied + 1;
  end loop;
  return applied;
end;
$$;

revoke all on function public.apply_pending_pay_setting_changes() from public, anon, authenticated;

-- Between the rating job (06:30 UTC) and the salary job (06:40). Plain SQL with
-- no bearer token, unlike those two edge-function jobs, so it can live here.
select cron.schedule('apply-pending-pay-settings', '35 6 * * *', 'select public.apply_pending_pay_setting_changes()');
