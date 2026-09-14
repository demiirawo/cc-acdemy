-- Editing a shift series no longer rewrites the days already worked.
--
-- A series was one row in recurring_shift_patterns, and every edit rewrote that
-- row in place. Unticking overtime on 15 September also unticked it for the
-- Saturdays already worked on the 5th and the 12th, and moving a start date
-- wiped cover overtime a colleague had already earned against it. Since
-- January about fifty edits to series already under way changed pay for days
-- that had happened, one of them in the middle of March's payroll.
--
-- An edit now takes effect from a date. edit_shift_series() ends the row the day
-- before and carries the series on in a new row from that date with the change
-- applied, in one transaction, so the days before keep the terms they were
-- worked on. Payroll, the pay forecast and the bonus-shift count go date by date
-- through every row, so a series spread over several rows pays the same.
--
-- A series is now a chain of rows: continues_pattern_id points a row at the one
-- it carries on for the same person, and shift_series_lineage() returns the
-- chain. edit_shift_series() and end_shift_series() work on the whole chain, so
-- an end date, or a change from a date, is the series' and not only the row a
-- shift happened to be opened from. Cover arranged against a shift, and a change
-- to it still waiting to be acknowledged, follow the shift into its new row.
--
-- change_group ties together the audit rows one edit writes, and the edit adds a
-- summary row (is_summary) with the series before and after as a whole, so the
-- change notification sends one email about it, not one per row.

alter table public.recurring_shift_patterns
  add column continues_pattern_id uuid references public.recurring_shift_patterns(id) on delete set null;

-- A row is carried on at most once, so a series is a single chain.
create unique index recurring_shift_patterns_continues_idx
  on public.recurring_shift_patterns (continues_pattern_id)
  where continues_pattern_id is not null;

comment on column public.recurring_shift_patterns.continues_pattern_id is
  'The row this one carries on for the same person from a later date (edit_shift_series). A row that continues another is not a new series, and the row it continues has not ended.';

alter table public.shift_audit_log
  add column change_group uuid,
  add column change_reason text,
  add column effective_from date,
  add column is_summary boolean not null default false;

comment on column public.shift_audit_log.change_group is
  'Shared by every row one edit writes, so the change notification treats them as one change.';
comment on column public.shift_audit_log.change_reason is
  'Why shifts that had already happened were corrected, when they were.';
comment on column public.shift_audit_log.effective_from is
  'On a summary row: the first day a change applies from, when the days of the series before it keep their old terms.';
comment on column public.shift_audit_log.is_summary is
  'Written by edit_shift_series: the series before and after the edit, as a whole. The other rows in its change_group are the detail.';

-- The audit triggers pick the group and reason up from the transaction.
create or replace function public.log_shift_change()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_group uuid := nullif(current_setting('app.change_group', true), '')::uuid;
  v_reason text := nullif(current_setting('app.change_reason', true), '');
begin
  if tg_op = 'INSERT' then
    insert into shift_audit_log (table_name, record_id, action, changed_by, new_data, change_group, change_reason)
    values (tg_table_name, new.id, 'INSERT', auth.uid(), to_jsonb(new), v_group, v_reason);
    return new;
  elsif tg_op = 'UPDATE' then
    insert into shift_audit_log (table_name, record_id, action, changed_by, old_data, new_data, change_group, change_reason)
    values (tg_table_name, new.id, 'UPDATE', auth.uid(), to_jsonb(old), to_jsonb(new), v_group, v_reason);
    return new;
  elsif tg_op = 'DELETE' then
    insert into shift_audit_log (table_name, record_id, action, changed_by, old_data, change_group, change_reason)
    values (tg_table_name, old.id, 'DELETE', auth.uid(), to_jsonb(old), v_group, v_reason);
    return old;
  end if;
  return null;
end;
$$;

create or replace function public.log_shift_exception_change()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_pattern_id uuid := coalesce(new.pattern_id, old.pattern_id);
  v_user_id uuid;
  v_client_name text;
  v_payload jsonb;
begin
  select user_id, client_name into v_user_id, v_client_name
  from public.recurring_shift_patterns
  where id = v_pattern_id;

  if v_user_id is null then
    return coalesce(new, old);
  end if;

  v_payload := jsonb_build_object(
    'user_id',          v_user_id,
    'client_name',      v_client_name,
    'pattern_id',       v_pattern_id,
    'exception_date',   coalesce(new.exception_date, old.exception_date),
    'exception_type',   coalesce(new.exception_type, old.exception_type),
    'overtime_subtype', coalesce(new.overtime_subtype, old.overtime_subtype)
  );

  insert into public.shift_audit_log (table_name, record_id, action, changed_by, old_data, new_data, change_group, change_reason)
  values (
    'shift_pattern_exceptions',
    coalesce(new.id, old.id),
    tg_op,
    coalesce(new.created_by, old.created_by, auth.uid()),
    case when tg_op = 'DELETE' then v_payload else null end,
    case when tg_op = 'DELETE' then null else v_payload end,
    nullif(current_setting('app.change_group', true), '')::uuid,
    nullif(current_setting('app.change_reason', true), '')
  );

  return coalesce(new, old);
end;
$$;

-- The first date on or after p_from that keeps a series in step. A fortnightly
-- series counts its weeks from its start date's Monday, and a monthly one runs
-- in the week of the month its start date falls in, so a series carried on
-- from any other date would flip its on-weeks. Mirrors resumeDate() in
-- src/lib/shiftSeriesSplit.ts.
create or replace function public.shift_series_resume_date(p_start date, p_interval text, p_from date)
returns date
language plpgsql
immutable
set search_path = public
as $$
declare
  d date := p_from;
  i integer := 0;
begin
  if p_from <= p_start then
    return p_start;
  end if;
  if p_interval = 'biweekly' then
    if ((date_trunc('week', p_from::timestamp)::date - date_trunc('week', p_start::timestamp)::date) / 7) % 2 = 0 then
      return p_from;
    end if;
    return date_trunc('week', p_from::timestamp)::date + 7;
  elsif p_interval = 'monthly' then
    while ceil(extract(day from d) / 7.0) <> ceil(extract(day from p_start) / 7.0) and i < 62 loop
      d := d + 1;
      i := i + 1;
    end loop;
    return d;
  end if;
  return p_from;
end;
$$;

-- Every row of the series a row belongs to, first row first: back along
-- continues_pattern_id to the first row, then forward. Runs as the caller, so
-- it returns only rows the caller can read.
create or replace function public.shift_series_lineage(p_pattern_id uuid)
returns setof public.recurring_shift_patterns
language sql
stable
set search_path = public
as $$
  with recursive back as (
    select r.id, r.continues_pattern_id, 0 as depth
    from public.recurring_shift_patterns r
    where r.id = p_pattern_id
    union all
    select r.id, r.continues_pattern_id, b.depth + 1
    from public.recurring_shift_patterns r
    join back b on r.id = b.continues_pattern_id
    where b.depth < 500
  ),
  first_row as (
    select id from back order by depth desc limit 1
  ),
  forward as (
    select f.id, 0 as depth from first_row f
    union all
    select r.id, fw.depth + 1
    from public.recurring_shift_patterns r
    join forward fw on r.continues_pattern_id = fw.id
    where fw.depth < 500
  )
  select r.*
  from forward fw
  join public.recurring_shift_patterns r on r.id = fw.id
  order by fw.depth;
$$;

-- Change a series from a date, leaving the days before it as they were.
--
-- p_changes holds the fields to change, as the editor sends them. Terms (who,
-- where, when, how it's paid) apply from p_from to every later row of the
-- series: the row running on p_from is ended the day before and carried on in
-- a new row. end_date is the series' last day, whichever row that falls in, and
-- notes belong to the whole series. From today onwards anybody who may edit the
-- series may call this. p_correct_past lets an admin, with a reason, change
-- days before today, but never in a month already paid.
create or replace function public.edit_shift_series(
  p_pattern_id uuid,
  p_from date,
  p_changes jsonb default '{}'::jsonb,
  p_reason text default null,
  p_correct_past boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today date := (now() at time zone 'Europe/London')::date;
  v_uid uuid := auth.uid();
  v_is_admin boolean;
  v_term_keys constant text[] := array['user_id', 'client_name', 'days_of_week', 'start_time', 'end_time',
    'hourly_rate', 'currency', 'is_overtime', 'overtime_subtype', 'recurrence_interval', 'shift_type'];
  v_key text;
  v_rows public.recurring_shift_patterns[];
  r public.recurring_shift_patterns%rowtype;
  v_first public.recurring_shift_patterns%rowtype;
  v_last public.recurring_shift_patterns%rowtype;
  v_target public.recurring_shift_patterns%rowtype;
  v_new public.recurring_shift_patterns%rowtype;
  v_terms jsonb;
  v_has_terms boolean;
  v_has_end boolean;
  v_old_end date;
  v_new_end date;
  v_end_from date;
  v_from date;
  v_earliest date;
  v_resume date;
  v_new_id uuid;
  v_next_id uuid;
  v_same_person boolean;
  v_prev_end date;
  v_capped boolean;
  v_kept_id uuid;
  v_record uuid;
  v_effective date;
  v_deleted integer := 0;
  v_mode text;
  v_group uuid := gen_random_uuid();
  v_before jsonb;
  v_after jsonb;
begin
  -- Server-side callers (SQL run by an operator, or the service role) have no
  -- signed-in user and are trusted like an admin. Somebody with no role is not
  -- an admin: without the coalesce a null would wave them past every check.
  v_is_admin := coalesce(get_current_user_role() = 'admin', false)
    or (v_uid is null and (session_user in ('postgres', 'supabase_admin') or coalesce(auth.role(), '') = 'service_role'));

  if p_from is null then
    raise exception 'Choose the date the change applies from.' using errcode = 'invalid_parameter_value';
  end if;

  p_changes := coalesce(p_changes, '{}'::jsonb);
  for v_key in select jsonb_object_keys(p_changes) loop
    if not (v_key = any (v_term_keys) or v_key in ('notes', 'end_date')) then
      raise exception '"%" can''t be changed this way.', v_key using errcode = 'invalid_parameter_value';
    end if;
  end loop;

  -- The whole series, locked, first row first.
  perform 1 from public.recurring_shift_patterns x
  where x.id in (select l.id from public.shift_series_lineage(p_pattern_id) l)
  for update;
  v_rows := array(
    select x from public.recurring_shift_patterns x
    where x.id in (select l.id from public.shift_series_lineage(p_pattern_id) l)
    order by x.start_date
  );
  if coalesce(array_length(v_rows, 1), 0) = 0 then
    raise exception 'That shift series no longer exists.' using errcode = 'no_data_found';
  end if;
  v_first := v_rows[1];
  v_last := v_rows[array_length(v_rows, 1)];
  v_old_end := v_last.end_date;

  select coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb) into v_terms
  from jsonb_each(p_changes) e
  where e.key = any (v_term_keys);
  v_has_terms := v_terms <> '{}'::jsonb;
  v_has_end := p_changes ? 'end_date';
  v_new_end := case when v_has_end then (p_changes->>'end_date')::date else v_old_end end;

  -- The same permission as editing the rows: an admin, or a scheduling editor
  -- for every client the series is at and the client it moves to.
  if not v_is_admin and not coalesce(
    is_scheduling_editor(v_uid)
    and not exists (select 1 from unnest(v_rows) x where not can_view_schedule_for_client(v_uid, x.client_name))
    and (not (v_terms ? 'client_name') or can_view_schedule_for_client(v_uid, v_terms->>'client_name')), false
  ) then
    raise exception 'You don''t have permission to change this series.' using errcode = 'insufficient_privilege';
  end if;

  if p_changes = '{}'::jsonb then
    return jsonb_build_object('mode', 'unchanged', 'pattern_id', p_pattern_id);
  end if;

  -- The row a change of terms starts in: the one running on p_from, or else
  -- the first one after it.
  v_target := v_last;
  if v_has_terms then
    select x.* into v_target from unnest(v_rows) x
    where x.start_date <= p_from and (x.end_date is null or x.end_date >= p_from)
    order by x.start_date
    limit 1;
    if not found then
      select x.* into v_target from unnest(v_rows) x
      where x.start_date > p_from
      order by x.start_date
      limit 1;
      if not found then
        raise exception 'This series finished on %, before the date the change would apply from.',
          to_char(v_old_end, 'FMDD FMMonth YYYY') using errcode = 'check_violation';
      end if;
    end if;
  end if;

  v_new := v_target;
  if v_terms ? 'user_id' then v_new.user_id := nullif(v_terms->>'user_id', '')::uuid; end if;
  if v_terms ? 'client_name' then v_new.client_name := v_terms->>'client_name'; end if;
  if v_terms ? 'days_of_week' and jsonb_typeof(v_terms->'days_of_week') = 'array' then
    v_new.days_of_week := array(select jsonb_array_elements_text(v_terms->'days_of_week')::int);
  end if;
  if v_terms ? 'start_time' then v_new.start_time := (v_terms->>'start_time')::time; end if;
  if v_terms ? 'end_time' then v_new.end_time := (v_terms->>'end_time')::time; end if;
  if v_terms ? 'hourly_rate' then v_new.hourly_rate := (v_terms->>'hourly_rate')::numeric; end if;
  if v_terms ? 'currency' then v_new.currency := v_terms->>'currency'; end if;
  if v_terms ? 'is_overtime' then v_new.is_overtime := (v_terms->>'is_overtime')::boolean; end if;
  if v_terms ? 'overtime_subtype' then v_new.overtime_subtype := v_terms->>'overtime_subtype'; end if;
  if v_terms ? 'recurrence_interval' then v_new.recurrence_interval := v_terms->>'recurrence_interval'; end if;
  if v_terms ? 'shift_type' then v_new.shift_type := v_terms->>'shift_type'; end if;

  -- A later row runs in step with its own start date, which a new interval
  -- would put out of step.
  if v_has_terms and v_new.recurrence_interval is distinct from v_target.recurrence_interval
     and exists (select 1 from unnest(v_rows) x where x.start_date > v_target.start_date) then
    raise exception 'This series changes again from %. Change how often it repeats from that date instead.',
      to_char((select min(x.start_date) from unnest(v_rows) x where x.start_date > v_target.start_date), 'FMDD FMMonth YYYY')
      using errcode = 'check_violation';
  end if;

  if v_has_terms and v_has_end and v_new_end is not null and v_new_end < greatest(p_from, v_target.start_date) then
    raise exception 'The end date is before %, the date the change applies from. Change the end date on its own first.',
      to_char(greatest(p_from, v_target.start_date), 'FMDD FMMonth YYYY') using errcode = 'check_violation';
  end if;

  -- The first day the edit touches: where new terms start, or the day after the
  -- earlier of the old and new end dates.
  v_end_from := case
    when not v_has_end or v_new_end is not distinct from v_old_end then null
    else least(coalesce(v_old_end, 'infinity'::date), coalesce(v_new_end, 'infinity'::date)) + 1
  end;
  v_from := least(case when v_has_terms then greatest(p_from, v_target.start_date) end, v_end_from);

  if p_correct_past then
    if not v_is_admin then
      raise exception 'Only an admin can correct shifts that have already happened.' using errcode = 'insufficient_privilege';
    end if;
    if coalesce(btrim(p_reason), '') = '' then
      raise exception 'Say why shifts that have already happened are being corrected.' using errcode = 'invalid_parameter_value';
    end if;
    -- A paid month keeps what it was paid on, rota included.
    if v_from is not null then
      select (max(pr.pay_period_start) + interval '1 month')::date into v_earliest
      from public.staff_pay_records pr
      where pr.record_type = 'salary'
        and pr.user_id in (select x.user_id from unnest(v_rows) x union select v_new.user_id);
      if v_earliest is not null and v_from < v_earliest then
        raise exception '% is already paid, so its shifts can''t be changed. The earliest a correction can apply from is %.',
          to_char(v_earliest - 1, 'FMMonth YYYY'), to_char(v_earliest, 'FMDD FMMonth YYYY')
          using errcode = 'check_violation';
      end if;
    end if;
  elsif v_from < v_today then
    if v_has_terms and greatest(p_from, v_target.start_date) < v_today then
      raise exception 'A change can apply from today onwards. Shifts that have already happened keep what they were worked as.'
        using errcode = 'check_violation';
    end if;
    raise exception 'That end date would remove or add shifts before today. A series can be ended from today onwards; only an admin can correct shifts that have already happened.'
      using errcode = 'check_violation';
  end if;

  perform set_config('app.change_group', v_group::text, true);
  perform set_config('app.change_reason', coalesce(btrim(p_reason), ''), true);
  -- Lets this edit's own writes past the guard on started series. Cleared again
  -- below, so nothing else in the caller's transaction gets through with it.
  perform set_config('app.shift_history_edit', 'on', true);

  v_before := to_jsonb(v_target) || jsonb_build_object('start_date', v_first.start_date, 'end_date', v_old_end);
  v_mode := case when v_has_end then 'end_date' else 'notes' end;

  if v_has_terms then
    v_same_person := v_new.user_id is not distinct from v_target.user_id;

    if p_from <= v_target.start_date then
      -- Nothing of this row falls before the date: change the row itself.
      update public.recurring_shift_patterns set
        user_id = v_new.user_id,
        client_name = v_new.client_name,
        days_of_week = v_new.days_of_week,
        start_time = v_new.start_time,
        end_time = v_new.end_time,
        hourly_rate = v_new.hourly_rate,
        currency = v_new.currency,
        is_overtime = v_new.is_overtime,
        overtime_subtype = v_new.overtime_subtype,
        recurrence_interval = v_new.recurrence_interval,
        shift_type = v_new.shift_type,
        -- Somebody else's shifts don't carry on the previous person's.
        continues_pattern_id = case when v_same_person then continues_pattern_id end
      where id = v_target.id;
      v_record := v_target.id;
      v_mode := 'in_place';
    else
      v_resume := case
        when v_new.recurrence_interval = v_target.recurrence_interval
          then public.shift_series_resume_date(v_target.start_date, v_target.recurrence_interval, p_from)
        else p_from
      end;

      update public.recurring_shift_patterns set end_date = p_from - 1 where id = v_target.id;

      if v_resume > coalesce(v_target.end_date, 'infinity'::date) then
        -- No shift of this row falls between the date and its end.
        v_record := coalesce(
          (select x.id from unnest(v_rows) x where x.start_date > v_target.start_date order by x.start_date limit 1),
          v_target.id);
        v_mode := 'ended';
      else
        v_new.end_date := v_target.end_date;
        -- Handed to somebody else while a leaving date caps it: the person
        -- carrying it on isn't leaving, so it runs to where it ran before the cap.
        if not v_same_person and not v_has_end then
          select c.previous_end_date, true into v_prev_end, v_capped
          from public.shift_pattern_leaving_caps c
          where c.pattern_id = v_target.id and c.capped_to = v_target.end_date
          order by c.created_at desc
          limit 1;
          if coalesce(v_capped, false) then
            v_new.end_date := v_prev_end;
          end if;
        end if;

        -- Whatever carried this row on now carries on the new one.
        update public.recurring_shift_patterns set continues_pattern_id = null
        where continues_pattern_id = v_target.id
        returning id into v_next_id;

        insert into public.recurring_shift_patterns (
          user_id, client_name, days_of_week, start_time, end_time, hourly_rate, currency, is_overtime,
          overtime_subtype, notes, start_date, end_date, created_by, recurrence_interval, shift_type, continues_pattern_id
        ) values (
          v_new.user_id, v_new.client_name, v_new.days_of_week, v_new.start_time, v_new.end_time,
          v_new.hourly_rate, v_new.currency, v_new.is_overtime, v_new.overtime_subtype, v_target.notes,
          v_resume, v_new.end_date, coalesce(v_uid, v_target.created_by), v_new.recurrence_interval,
          v_new.shift_type, case when v_same_person then v_target.id end
        )
        returning id into v_new_id;

        if v_next_id is not null then
          update public.recurring_shift_patterns set continues_pattern_id = v_new_id where id = v_next_id;
        end if;

        -- One-day changes from the date onwards belong to the new row.
        update public.shift_pattern_exceptions
        set pattern_id = v_new_id
        where pattern_id = v_target.id and exception_date >= p_from;

        if v_same_person then
          update public.shift_pattern_leaving_caps set pattern_id = v_new_id where pattern_id = v_target.id;

          -- Cover arranged against these shifts, and changes to them still
          -- waiting to be acknowledged, follow the shifts into the new row.
          update public.staff_requests sr
          set coverage_metadata = jsonb_set(sr.coverage_metadata, '{shifts}', (
            select jsonb_agg(
              case when (e.elem->>'id') like ('pattern-' || v_target.id::text || '-%')
                        and right(e.elem->>'id', 10) >= p_from::text
                   then jsonb_set(e.elem, '{id}', to_jsonb('pattern-' || v_new_id::text || '-' || right(e.elem->>'id', 10)))
                   else e.elem
              end order by e.ord)
            from jsonb_array_elements(sr.coverage_metadata->'shifts') with ordinality e(elem, ord)))
          where sr.coverage_metadata->>'type' = 'individual_shifts'
            and jsonb_typeof(sr.coverage_metadata->'shifts') = 'array'
            and jsonb_array_length(sr.coverage_metadata->'shifts') > 0
            and sr.coverage_metadata::text like ('%pattern-' || v_target.id::text || '-%');

          update public.shift_change_acknowledgements a
          set pattern_id = v_new_id,
              record_id = case
                when a.table_name = 'recurring_shift_patterns' and a.record_id = v_target.id then v_new_id
                else a.record_id
              end
          where a.acknowledged_at is null
            and a.pattern_id = v_target.id
            and (a.affected_date is null or a.affected_date >= p_from);
        else
          delete from public.shift_pattern_leaving_caps where pattern_id = v_target.id;
        end if;

        v_record := v_new_id;
        v_mode := 'split';
      end if;
    end if;

    -- The same change to every later row of the series.
    for r in select x.* from unnest(v_rows) x where x.start_date > v_target.start_date order by x.start_date loop
      update public.recurring_shift_patterns set
        user_id = case when v_terms ? 'user_id' then v_new.user_id else user_id end,
        client_name = case when v_terms ? 'client_name' then v_new.client_name else client_name end,
        days_of_week = case when v_terms ? 'days_of_week' then v_new.days_of_week else days_of_week end,
        start_time = case when v_terms ? 'start_time' then v_new.start_time else start_time end,
        end_time = case when v_terms ? 'end_time' then v_new.end_time else end_time end,
        hourly_rate = case when v_terms ? 'hourly_rate' then v_new.hourly_rate else hourly_rate end,
        currency = case when v_terms ? 'currency' then v_new.currency else currency end,
        is_overtime = case when v_terms ? 'is_overtime' then v_new.is_overtime else is_overtime end,
        overtime_subtype = case when v_terms ? 'overtime_subtype' then v_new.overtime_subtype else overtime_subtype end,
        shift_type = case when v_terms ? 'shift_type' then v_new.shift_type else shift_type end
      where id = r.id;
      if (v_terms ? 'user_id') and v_new.user_id is distinct from r.user_id then
        if not v_has_end then
          update public.recurring_shift_patterns p set end_date = c.previous_end_date
          from public.shift_pattern_leaving_caps c
          where p.id = r.id and c.pattern_id = r.id and p.end_date = c.capped_to;
        end if;
        delete from public.shift_pattern_leaving_caps where pattern_id = r.id;
      end if;
    end loop;
  end if;

  -- The series' end: rows that would start after it go, and the last row left
  -- ends on it.
  if v_has_end and v_new_end is distinct from v_old_end then
    for r in
      select x.* from public.recurring_shift_patterns x
      where x.id in (select l.id from public.shift_series_lineage(coalesce(v_record, p_pattern_id)) l)
      order by x.start_date desc
    loop
      if v_new_end is not null and r.start_date > v_new_end then
        delete from public.shift_pattern_leaving_caps where pattern_id = r.id;
        delete from public.recurring_shift_patterns where id = r.id;
        v_deleted := v_deleted + 1;
      else
        update public.recurring_shift_patterns set end_date = v_new_end where id = r.id;
        v_kept_id := r.id;
        exit;
      end if;
    end loop;
    -- The row the summary describes: the one the change of terms made, while it
    -- is still there, or else the last row left.
    if v_record is null or not exists (select 1 from public.recurring_shift_patterns x where x.id = v_record) then
      v_record := v_kept_id;
    end if;
  elsif not v_has_terms then
    v_record := v_last.id;
  end if;

  if p_changes ? 'notes' and v_record is not null then
    update public.recurring_shift_patterns set notes = p_changes->>'notes'
    where id in (select l.id from public.shift_series_lineage(v_record) l);
  end if;

  -- What changed for the series as a whole, for the change notification.
  if v_record is null then
    v_mode := 'deleted';
    insert into public.shift_audit_log (
      table_name, record_id, action, changed_by, old_data, new_data, change_group, change_reason, effective_from, is_summary
    ) values (
      'recurring_shift_patterns', v_first.id, 'DELETE', v_uid, v_before, null, v_group, nullif(btrim(p_reason), ''), null, true
    );
  else
    if v_has_terms then
      select to_jsonb(x) into v_after from public.recurring_shift_patterns x where x.id = v_record;
      if greatest(p_from, v_target.start_date) > v_first.start_date then
        select x.start_date into v_effective from public.recurring_shift_patterns x where x.id = v_record;
      end if;
    else
      v_after := v_before;
    end if;
    v_after := v_after || jsonb_build_object(
      'start_date', v_first.start_date,
      'end_date', (select l.end_date from public.shift_series_lineage(v_record) l order by l.start_date desc limit 1),
      'notes', (select x.notes from public.recurring_shift_patterns x where x.id = v_record));
    insert into public.shift_audit_log (
      table_name, record_id, action, changed_by, old_data, new_data, change_group, change_reason, effective_from, is_summary
    ) values (
      'recurring_shift_patterns', v_record, 'UPDATE', v_uid, v_before, v_after, v_group, nullif(btrim(p_reason), ''), v_effective, true
    );
  end if;

  perform set_config('app.shift_history_edit', '', true);
  perform set_config('app.change_group', '', true);
  perform set_config('app.change_reason', '', true);
  return jsonb_build_object('mode', v_mode, 'pattern_id', v_record, 'effective_from', v_effective, 'deleted_rows', v_deleted);
end;
$$;

-- End a series from a date, so it has no shift on or after it, whichever row a
-- shift was opened from. A series that hasn't started by then goes altogether.
-- Returns mode 'unchanged' when the series already ends before the date.
create or replace function public.end_shift_series(
  p_pattern_id uuid,
  p_from date,
  p_reason text default null,
  p_correct_past boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_is_admin boolean;
  v_found boolean;
  v_end date;
begin
  if p_from is null then
    raise exception 'Choose the date the series ends from.' using errcode = 'invalid_parameter_value';
  end if;

  v_is_admin := coalesce(get_current_user_role() = 'admin', false)
    or (v_uid is null and (session_user in ('postgres', 'supabase_admin') or coalesce(auth.role(), '') = 'service_role'));
  if not v_is_admin and not coalesce(
    is_scheduling_editor(v_uid)
    and not exists (
      select 1 from public.shift_series_lineage(p_pattern_id) l
      where not can_view_schedule_for_client(v_uid, l.client_name)
    ), false
  ) then
    raise exception 'You don''t have permission to change this series.' using errcode = 'insufficient_privilege';
  end if;

  select true, l.end_date into v_found, v_end
  from public.shift_series_lineage(p_pattern_id) l
  order by l.start_date desc
  limit 1;
  if not coalesce(v_found, false) then
    raise exception 'That shift series no longer exists.' using errcode = 'no_data_found';
  end if;
  if v_end is not null and v_end < p_from then
    return jsonb_build_object('mode', 'unchanged', 'pattern_id', p_pattern_id, 'ends_on', v_end);
  end if;

  return public.edit_shift_series(p_pattern_id, p_from, jsonb_build_object('end_date', p_from - 1), p_reason, p_correct_past);
end;
$$;

revoke all on function public.edit_shift_series(uuid, date, jsonb, text, boolean) from public, anon;
grant execute on function public.edit_shift_series(uuid, date, jsonb, text, boolean) to authenticated, service_role;
revoke all on function public.end_shift_series(uuid, date, text, boolean) from public, anon;
grant execute on function public.end_shift_series(uuid, date, text, boolean) to authenticated, service_role;
revoke all on function public.shift_series_lineage(uuid) from public, anon;
grant execute on function public.shift_series_lineage(uuid) to authenticated, service_role;
revoke all on function public.shift_series_resume_date(date, text, date) from public, anon;
grant execute on function public.shift_series_resume_date(date, text, date) to authenticated, service_role;
