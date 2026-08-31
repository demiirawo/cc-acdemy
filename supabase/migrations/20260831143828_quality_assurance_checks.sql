-- Spot checks on the people covering monitoring shifts.
--
-- The standards already exist — answer within three rings, introduce yourself,
-- work somewhere quiet — in the phone etiquette guide and now in the contract.
-- Nothing measured them, so they were standards in name only, and the first
-- anybody heard about a missed call was when a client complained.
--
-- A check is one person ringing the admin on shift and recording what happened.
-- Deliberately narrow to begin with: whether they answered, whether the call
-- was handled properly, and whether the line was clean. check_type is here so
-- the same page can carry other kinds of check later without this table
-- becoming a call-shaped thing that other checks have to pretend to be.

create table if not exists public.qa_checks (
  id                uuid primary key default gen_random_uuid(),
  staff_user_id     uuid not null,
  check_type        text not null default 'call_monitoring',
  client_name       text,
  checked_at        timestamptz not null default now(),
  checked_by        uuid,

  -- Did they pick up at all. The first question, and on its own the one that
  -- matters most: everything below is moot if nobody answered.
  answered          text not null,
  rings_to_answer   integer,

  -- Only meaningful when they answered, hence 'not_applicable'.
  etiquette         text not null default 'not_applicable',
  background_noise  text not null default 'not_applicable',

  notes             text,
  outcome           text not null,
  -- Set when a finding is raised on the person's HR record, so a check and the
  -- feedback that came out of it can be read together.
  raised_warning_id uuid,
  created_at        timestamptz not null default now(),

  constraint qa_checks_answered_check
    check (answered in ('answered', 'no_answer', 'voicemail', 'engaged')),
  constraint qa_checks_etiquette_check
    check (etiquette in ('followed', 'partly', 'not_followed', 'not_applicable')),
  constraint qa_checks_noise_check
    check (background_noise in ('none', 'some', 'disruptive', 'not_applicable')),
  constraint qa_checks_outcome_check
    check (outcome in ('pass', 'concerns', 'fail')),
  constraint qa_checks_type_check
    check (check_type in ('call_monitoring'))
);

create index if not exists qa_checks_by_staff on public.qa_checks (staff_user_id, checked_at desc);
create index if not exists qa_checks_recent on public.qa_checks (checked_at desc);

alter table public.qa_checks enable row level security;

-- Deliberately no policy for the staff member. A spot check they can read is a
-- spot check they can predict. What reaches them is the feedback raised from
-- it, which they see and acknowledge in the ordinary way.
create policy "Admins manage QA checks"
  on public.qa_checks for all
  using (get_current_user_role() = 'admin')
  with check (get_current_user_role() = 'admin');

create policy "HR manage QA checks"
  on public.qa_checks for all
  using (is_hr_or_admin())
  with check (is_hr_or_admin());

comment on table public.qa_checks is
  'Quality assurance spot checks. One row per check made on a staff member during a monitoring shift.';
