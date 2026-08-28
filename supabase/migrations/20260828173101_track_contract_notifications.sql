-- Record when a contract's recipient was actually told about it.
--
-- Sending was fire-and-forget: the email either went or it didn't, and nothing
-- on the contract said which. That is fine for one contract sent by hand and
-- useless for forty-seven sent at once — when a provider rate-limits half of
-- them there is no way to work out who heard and who didn't, and the only safe
-- move left is to email everybody again.
--
-- With this, sending is resumable and idempotent: the sender only picks up
-- contracts nobody has been told about, so a failure costs a retry rather than
-- a second email to everyone who already got one.

alter table public.contracts
  add column if not exists notified_at timestamptz;

comment on column public.contracts.notified_at is
  'When the recipient was emailed that this contract is waiting. Null means they have not been told.';

create index if not exists contracts_awaiting_notification
  on public.contracts (status)
  where notified_at is null;
