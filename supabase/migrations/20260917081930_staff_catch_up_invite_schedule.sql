-- The standing invitation to book a chat, every two months.
--
-- One row per send date, claimed before any email goes out: a cron retry or a
-- manual run after a failure then sends nothing rather than sending fifty-three
-- people the same invitation twice.
create table if not exists public.catch_up_invite_sends (
  sent_on date primary key,
  recipients integer,
  failures integer,
  sent_at timestamptz not null default now()
);

alter table public.catch_up_invite_sends enable row level security;

drop policy if exists "Admins can see when the catch-up invite went out" on public.catch_up_invite_sends;
create policy "Admins can see when the catch-up invite went out"
  on public.catch_up_invite_sends
  for select
  using (get_current_user_role() = 'admin');

revoke all on table public.catch_up_invite_sends from anon;

-- 17:00 UTC is 18:00 in Lagos, where the people reading it are: an evening
-- message, on the 17th of every other month. The function itself holds the
-- first send until 17 November, so scheduling it today sends nothing today.
do $$
declare
  cmd text;
begin
  select replace(command, 'apply-pending-ratings', 'staff-catch-up-invite')
    into cmd
    from cron.job
   where jobname = 'apply-pending-ratings';

  if cmd is null then
    raise notice 'No job to copy the invoke header from — schedule staff-catch-up-invite by hand.';
    return;
  end if;

  if exists (select 1 from cron.job where jobname = 'staff-catch-up-invite') then
    perform cron.unschedule('staff-catch-up-invite');
  end if;

  perform cron.schedule('staff-catch-up-invite', '0 17 17 */2 *', cmd);
end $$;
