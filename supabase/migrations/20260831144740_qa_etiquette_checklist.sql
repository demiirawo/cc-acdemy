-- Break "was etiquette followed?" into the things you can actually hear.
--
-- Asking somebody to judge whether a call was handled properly assumes they
-- already know what proper looks like, which is exactly the knowledge this is
-- meant to stop depending on. A checklist teaches the standard while it
-- collects the answer: whoever is doing the checks this month reads the five
-- things as they listen, and nobody has to be briefed first.
--
-- The five come straight from the phone etiquette guide, in the order they
-- happen on a call.

alter table public.qa_checks
  add column if not exists etq_within_three_rings  boolean,
  add column if not exists etq_gave_name_and_company boolean,
  add column if not exists etq_verified_caller     boolean,
  add column if not exists etq_specific_callback   boolean,
  add column if not exists etq_calm_and_professional boolean;

comment on column public.qa_checks.etq_within_three_rings is 'Picked up within three rings.';
comment on column public.qa_checks.etq_gave_name_and_company is 'Said their own name and "Care Cuddle", not just "hello".';
comment on column public.qa_checks.etq_verified_caller is 'Checked who they were speaking to before discussing anything.';
comment on column public.qa_checks.etq_specific_callback is 'Gave a time for any callback rather than "shortly".';
comment on column public.qa_checks.etq_calm_and_professional is 'Sounded calm, unhurried and professional.';
