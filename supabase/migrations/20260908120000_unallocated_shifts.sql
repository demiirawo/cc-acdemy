-- Let a shift exist before anybody is put on it.
--
-- A shift is a commitment to a client; who covers it is a separate decision,
-- often made later. Until now user_id was NOT NULL, so the rota could not hold
-- "Topaz needs someone on Tuesday mornings" — the shift could not be written
-- down until the answer was known, which is exactly backwards for planning.
--
-- NULL means unallocated: a real shift, on the rota, waiting for a name.
alter table public.recurring_shift_patterns
  alter column user_id drop not null;

comment on column public.recurring_shift_patterns.user_id is
  'Who covers this shift. NULL = unallocated placeholder: the shift is committed to the client but nobody is on it yet. Anything that pays, assesses or chases a person must exclude these.';

-- Most readers already filter by a specific user_id, so an unallocated row is
-- excluded from them for free. This index serves the ones that ask the opposite
-- question — what is still waiting for somebody.
create index if not exists recurring_shift_patterns_unallocated_idx
  on public.recurring_shift_patterns (client_name, start_date)
  where user_id is null;

-- The same for one-off dated shifts, so a placeholder works whichever way the
-- shift was put on the rota.
alter table public.staff_schedules
  alter column user_id drop not null;

comment on column public.staff_schedules.user_id is
  'Who covers this shift. NULL = unallocated placeholder, as on recurring_shift_patterns.';

create index if not exists staff_schedules_unallocated_idx
  on public.staff_schedules (client_name, start_datetime)
  where user_id is null;
