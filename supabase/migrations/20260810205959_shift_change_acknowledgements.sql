-- Every schedule change a staff member is emailed about becomes a row here,
-- acknowledged either from the email (tokened link, no login) or in the portal.
-- Unacknowledged rows drive the red highlighting on the schedule, the daily
-- reminder email, and the admin escalation after three days — so "did they see
-- the rota change?" stops being a question anyone has to ask by hand.
create table public.shift_change_acknowledgements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  audit_log_id uuid,
  change_type text not null check (change_type in ('new_shift','cancelled','changed')),
  summary text not null,
  client_name text,
  table_name text not null,
  record_id uuid,
  -- For one-day exceptions: the pattern the day belongs to, and the day itself,
  -- so the schedule can mark exactly that cell red.
  pattern_id uuid,
  affected_date date,
  -- When the change stops mattering (a one-off's date, a shift's day). Null for
  -- ongoing pattern changes, which stay relevant until acknowledged.
  effective_until date,
  -- Shared by every row created in one email, so the email's single
  -- "Acknowledge" tap clears the whole batch.
  ack_token uuid not null default gen_random_uuid(),
  created_at timestamptz not null default now(),
  acknowledged_at timestamptz,
  acknowledged_via text check (acknowledged_via in ('email','portal')),
  last_reminded_at timestamptz,
  reminder_count int not null default 0
);

create index shift_change_ack_user_idx on public.shift_change_acknowledgements (user_id, acknowledged_at);
create index shift_change_ack_token_idx on public.shift_change_acknowledgements (ack_token);
create index shift_change_ack_open_idx on public.shift_change_acknowledgements (acknowledged_at) where acknowledged_at is null;

alter table public.shift_change_acknowledgements enable row level security;

create policy "Staff view their own schedule changes"
  on public.shift_change_acknowledgements for select
  using (auth.uid() = user_id);

create policy "Staff acknowledge their own schedule changes"
  on public.shift_change_acknowledgements for update
  using (auth.uid() = user_id);

create policy "Admins and HR view all schedule changes"
  on public.shift_change_acknowledgements for select
  using (get_current_user_role() = any (array['admin','human_resources']));

create policy "Admins manage schedule changes"
  on public.shift_change_acknowledgements for all
  using (get_current_user_role() = 'admin');

-- Daily reminder + 3-day admin escalation, mid-morning after the admin digest.
--
-- NOTE: the Authorization header is redacted here. The migration as applied
-- carries the project's publishable anon key inline (as three older migrations
-- in this directory also do). Substitute the project's anon key when running
-- this against a fresh database.
select cron.schedule(
  'shift-ack-reminders',
  '15 9 * * *',
  $$
  select net.http_post(
    url:='https://pavwwgfgpykakbqkxsal.supabase.co/functions/v1/shift-ack-reminders',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer <SUPABASE_ANON_KEY>"}'::jsonb,
    body:='{}'::jsonb
  ) as request_id;
  $$
);
