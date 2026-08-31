-- Cut the check down to the five questions actually worth asking on a call.
--
-- The form had grown a seven-point etiquette checklist taken from the Admin
-- Phone Etiquette Guide. It was accurate but it was not a phone call: nobody
-- ringing a colleague can honestly tick seven boxes about a conversation they
-- were half of. One question - was this handled professionally - is the thing
-- the checker can actually answer, and the guide stays the definition of what
-- professional means.
--
-- The questions are now:
--   1. Did they pick up?
--   2. If not straight away, did they call back?
--   3. Did they answer in a professional manner?
--   4. Could you hear them clearly?
--   5. Anything else worth noting?
--
-- No checks have been recorded yet, so the per-point columns are dropped
-- rather than left behind as permanently null baggage.
alter table public.qa_checks
  drop column if exists etq_within_three_rings,
  drop column if exists etq_gave_name_and_company,
  drop column if exists etq_verified_caller,
  drop column if exists etq_specific_callback,
  drop column if exists etq_calm_and_professional,
  drop column if exists etq_no_false_promises,
  drop column if exists etq_confirmed_next_steps;

-- Question 2. A missed call that is returned promptly is a different thing
-- from a missed call that is never returned, and the old form could not tell
-- them apart - both landed as a flat "no answer".
alter table public.qa_checks
  add column if not exists called_back text not null default 'not_applicable';

alter table public.qa_checks drop constraint if exists qa_checks_called_back_check;
alter table public.qa_checks add constraint qa_checks_called_back_check
  check (called_back = any (array['yes','no','not_applicable']));

comment on column public.qa_checks.called_back is
  'Whether a missed call was returned. not_applicable when they picked up.';

comment on column public.qa_checks.etiquette is
  'Question 3 - whether the call was handled professionally, as defined by the Admin Phone Etiquette Guide.';
