-- Track reminders so they can be daily without being duplicated.
--
-- A job that runs once a day and emails everyone unsigned is only correct while
-- it runs exactly once. Retry it, run it twice, or have it half-fail, and the
-- same person gets two nudges in a morning. Recording when each contract was
-- last chased makes the rule "at most one a day" a property of the data rather
-- than of the schedule being perfect.

alter table public.contracts
  add column if not exists last_reminded_at timestamptz,
  add column if not exists reminder_count integer not null default 0;

comment on column public.contracts.last_reminded_at is
  'When the recipient was last chased about signing. Null means never.';
comment on column public.contracts.reminder_count is
  'How many reminders have gone out. Useful for spotting a contract nobody is ever going to sign.';

create index if not exists contracts_needing_reminder
  on public.contracts (last_reminded_at)
  where signed_at is null;
