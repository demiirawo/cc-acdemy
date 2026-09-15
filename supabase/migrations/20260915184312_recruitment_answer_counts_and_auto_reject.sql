-- Recruitment results: answer counts from the database, and the automatic
-- rejections moved off the Results page into a paced daily job.
--
-- 1. recruitment_answer_counts(test)
--
-- The Results page labels a submitted attempt Completed once it has an answer
-- for every question. It asked for the answer rows with every attempt id in the
-- URL, which the API answered with a 400, so the counts were always empty.
-- Counting through the API instead is too slow for an admin: their read policy
-- looks the caller's role up again for every row, and across this test's
-- 416,816 answers that took about 6 s, against an 8 s statement timeout (HR's
-- policy looks it up once and takes 150 ms). Here they are counted as the
-- owner, also in about 150 ms once the answers are in cache (3 s or so when
-- they are not), for the same two roles the policies let read answers, and
-- returned as one object keyed by attempt id, so PostgREST's 1000-row cap does
-- not apply.

create or replace function public.recruitment_answer_counts(p_test_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if coalesce(get_current_user_role(), '') not in ('admin', 'human_resources') then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  return coalesce((
    select jsonb_object_agg(a.id, (select count(*) from recruitment_answers an where an.attempt_id = a.id))
    from recruitment_attempts a
    where a.test_id = p_test_id
  ), '{}'::jsonb);
end;
$$;

revoke all on function public.recruitment_answer_counts(uuid) from public, anon;
grant execute on function public.recruitment_answer_counts(uuid) to authenticated;

-- 2. auto_reject_recruitment_attempts()
--
-- The Results page used to reject candidates itself, from the browser of
-- whoever had it open, on every load and every 30-second refresh:
--   - submitted with an integrity score under 85, and
--   - submitted over 30 days ago with integrity 85 or more and a score under
--     60% (of max_score, or of the question weights when max_score is 0).
-- Each went through recruitment-set-stage, which queues the rejection email.
-- The page only ever read the 1000 highest-scoring attempts, which is why it
-- had stopped finding anyone. Reading every attempt would have fired about
-- 2,250 rejections, each queueing an email, from a single page load.
--
-- The rules now run here once a day, oldest submission first, and a run stops
-- when 40 rejection emails are waiting. process-pending-rejections sends at
-- most 50 on its 08:00 UTC run, so that leaves room for rejections made by
-- hand, and the backlog from the summer drains over about eight weeks instead
-- of queueing ahead of them.
--
-- A rejection does what recruitment-set-stage does: the status, a
-- stage_changed event (by null, auto naming the rule) and an email queued
-- twelve hours out. The email is left out when that address has already been
-- sent or queued one, or still has another application open (submitted,
-- interview or success), so someone with two stale attempts hears once, when
-- the last one goes. Attempts with no email address are left for a person.

create or replace function public.auto_reject_recruitment_attempts(p_queue_target integer default 40)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  room integer;
  target record;
  send_email boolean;
  rejected integer := 0;
begin
  select greatest(p_queue_target - count(*), 0)::integer into room
  from pending_rejection_emails
  where sent_at is null and cancelled_at is null and btrim(email) <> '';

  for target in
    with question_weights as (
      select test_id, sum(weight)::float8 as total_weight
      from recruitment_questions
      group by test_id
    ),
    submitted as (
      select a.id, a.candidate_name, a.email, a.integrity_score, a.submitted_at,
             a.total_score::float8 as score,
             case when a.max_score > 0 then a.max_score::float8 else w.total_weight end as out_of
      from recruitment_attempts a
      left join question_weights w on w.test_id = a.test_id
      where a.status = 'submitted'
        and btrim(a.email) <> ''
    )
    select s.id, s.candidate_name, s.email,
           case when s.integrity_score < 85 then 'low_integrity' else 'stale_low_score' end as reason
    from submitted s
    where s.integrity_score < 85
       or (s.submitted_at < now() - interval '30 days'
           and s.out_of > 0
           -- the page's Math.round(min(score, out_of) / out_of * 100) < 60
           and floor(least(s.score, s.out_of) / s.out_of * 100 + 0.5) < 60)
    order by (s.integrity_score < 85) desc, s.submitted_at, s.id
    limit room
  loop
    update recruitment_attempts set status = 'rejected'
    where id = target.id and status = 'submitted';
    continue when not found;

    send_email := not exists (
        select 1 from pending_rejection_emails e
        where lower(btrim(e.email)) = lower(btrim(target.email))
          and e.cancelled_at is null
      )
      and not exists (
        select 1 from recruitment_attempts o
        where lower(btrim(o.email)) = lower(btrim(target.email))
          and o.id <> target.id
          and o.status in ('submitted', 'interview', 'success')
      );

    if send_email then
      insert into pending_rejection_emails (attempt_id, candidate_name, email, send_after)
      values (target.id, target.candidate_name, target.email, now() + interval '12 hours');
    end if;

    insert into recruitment_events (attempt_id, event_type, metadata)
    values (target.id, 'stage_changed',
            jsonb_build_object('stage', 'rejected', 'by', null, 'auto', target.reason, 'emailed', send_email));

    rejected := rejected + 1;
  end loop;

  return rejected;
end;
$$;

revoke all on function public.auto_reject_recruitment_attempts(integer) from public, anon, authenticated;

-- An hour after process-pending-rejections, so each run tops the queue back up
-- to 40 once the day's emails have gone; what it queues goes out at 08:00 the
-- next day.
select cron.schedule('auto-reject-recruitment-attempts', '0 9 * * *', 'select public.auto_reject_recruitment_attempts()');
