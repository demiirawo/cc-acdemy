-- One shift bonus at a time per admin.
--
-- Pay adds up every shift bonus active in a month, and the editor could only
-- see the month on screen: a bonus set while viewing October and then again
-- from September left two open-ended rows, paid double from October on. The
-- ranges are whole months (from the 1st, to a month end or open-ended), so "no
-- two ranges overlap" is exactly "at most one shift bonus in any month".
-- Stopping one and setting the next from the following month stays legal: the
-- ranges meet but do not overlap.
create extension if not exists btree_gist with schema extensions;

alter table public.shift_bonuses
  add constraint shift_bonuses_one_at_a_time
  exclude using gist (
    user_id extensions.gist_uuid_ops with =,
    daterange(start_date, end_date, '[]') with &&
  );
