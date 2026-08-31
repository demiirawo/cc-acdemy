-- Rate checks the way the sector rates everything else.
--
-- Pass/concerns/fail was a made-up scale sitting inside a business whose whole
-- job is CQC compliance. Outstanding / Good / Requires Improvement / Inadequate
-- is the language the clients already think in, the admins already read in
-- inspection reports, and the one nobody has to have explained.
--
-- It also says something the old scale could not. "Pass" covered both meeting
-- the standard and exceeding it; Good and Outstanding separate them, which
-- gives a spot check somewhere positive to land rather than only ever being an
-- absence of problems.

alter table public.qa_checks drop constraint if exists qa_checks_outcome_check;

update public.qa_checks set outcome = case outcome
  when 'pass' then 'good'
  when 'concerns' then 'requires_improvement'
  when 'fail' then 'inadequate'
  else outcome
end
where outcome in ('pass', 'concerns', 'fail');

alter table public.qa_checks
  add constraint qa_checks_outcome_check
  check (outcome in ('outstanding', 'good', 'requires_improvement', 'inadequate'));
