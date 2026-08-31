-- Bring the quality-assurance check into line with the Admin Phone Etiquette
-- Guide, which is the standard the calls are actually being judged against.
--
-- The guide opens with eight Golden Rules. The checklist covered five of them.
-- Two of the three it missed are things you can hear on a call, so they are
-- added here as their own columns rather than left to the free-text note:
--
--   Rule 4  Never make promises you can't keep   (guide s2.6 - never guess)
--   s2.8    Confirm next steps before ending
--
-- The eighth, "log every call with a clear note", is deliberately absent: it is
-- not audible on the call, and a checkbox nobody can honestly answer is worse
-- than no checkbox. The page says where it is checked instead.
alter table public.qa_checks
  add column if not exists etq_no_false_promises boolean,
  add column if not exists etq_confirmed_next_steps boolean;

comment on column public.qa_checks.etq_no_false_promises is
  'Golden Rule 4 / s2.6 - said they would check rather than guessing an answer.';
comment on column public.qa_checks.etq_confirmed_next_steps is
  's2.8 - restated the agreed action and callback time before ending the call.';

-- Rule 7, "do not take calls whilst driving", is banned outright by the guide:
-- unsafe, illegal on a mobile, and poor call quality. It belongs with the noise
-- question because that is how a checker detects it - road noise, hands-free
-- echo - and it is a fail on its own rather than a shade of background sound.
alter table public.qa_checks drop constraint if exists qa_checks_background_noise_check;
alter table public.qa_checks add constraint qa_checks_background_noise_check
  check (background_noise = any (array['none','some','disruptive','driving','not_applicable']));

-- A check is on one client's line, not on a person in general. Somebody who
-- covers two clients is reachable on one and not the other, and a single
-- "last checked" against their name hides exactly that. Nothing is enforced
-- here - client_name stays nullable for the checks already recorded - but the
-- index is what makes "when was this client's line last checked" cheap.
create index if not exists qa_checks_staff_client_idx
  on public.qa_checks (staff_user_id, client_name, checked_at desc);
