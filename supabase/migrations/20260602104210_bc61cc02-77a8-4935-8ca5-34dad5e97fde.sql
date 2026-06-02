
-- Backfill days_requested and days_taken for holiday records to match working-days calculation
-- Honors recurrence_interval (weekly/biweekly/monthly) and shift_pattern_exceptions
-- Only updates rows where the user has shift patterns covering the period (computed > 0)

WITH params AS (
  SELECT sr.id AS request_id, sr.user_id, sr.start_date, sr.end_date, sr.days_requested,
         sh.id AS holiday_id, sh.days_taken
  FROM staff_requests sr
  LEFT JOIN staff_holidays sh
    ON sh.user_id = sr.user_id AND sh.start_date = sr.start_date AND sh.end_date = sr.end_date
  WHERE sr.request_type IN ('holiday','holiday_paid','holiday_unpaid')
    AND sr.status IN ('approved','pending')
),
days AS (
  SELECT p.request_id, p.user_id, generate_series(p.start_date, p.end_date, '1 day')::date AS day
  FROM params p
),
matched AS (
  SELECT DISTINCT d.request_id, d.day FROM days d
  JOIN recurring_shift_patterns rsp ON rsp.user_id = d.user_id
  WHERE EXTRACT(DOW FROM d.day)::int = ANY(rsp.days_of_week)
    AND d.day >= rsp.start_date
    AND (rsp.end_date IS NULL OR d.day <= rsp.end_date)
    AND CASE rsp.recurrence_interval
          WHEN 'weekly'   THEN true
          WHEN 'biweekly' THEN ((d.day - rsp.start_date) / 7) % 2 = 0
          WHEN 'monthly'  THEN ((d.day - rsp.start_date) / 7) % 4 = 0
          ELSE true
        END
    AND NOT EXISTS (
      SELECT 1 FROM shift_pattern_exceptions spe
      WHERE spe.pattern_id = rsp.id AND spe.exception_date = d.day
    )
),
counts AS (
  SELECT p.request_id, p.holiday_id, p.days_requested, p.days_taken,
         COALESCE((SELECT COUNT(*) FROM matched m WHERE m.request_id = p.request_id), 0) AS computed
  FROM params p
)
UPDATE staff_requests sr
SET days_requested = c.computed
FROM counts c
WHERE sr.id = c.request_id
  AND c.computed > 0
  AND c.computed <> c.days_requested;

WITH params AS (
  SELECT sr.id AS request_id, sr.user_id, sr.start_date, sr.end_date,
         sh.id AS holiday_id, sh.days_taken
  FROM staff_requests sr
  JOIN staff_holidays sh
    ON sh.user_id = sr.user_id AND sh.start_date = sr.start_date AND sh.end_date = sr.end_date
  WHERE sr.request_type IN ('holiday','holiday_paid','holiday_unpaid')
    AND sr.status IN ('approved','pending')
),
days AS (
  SELECT p.holiday_id, p.user_id, generate_series(p.start_date, p.end_date, '1 day')::date AS day
  FROM params p
),
matched AS (
  SELECT DISTINCT d.holiday_id, d.day FROM days d
  JOIN recurring_shift_patterns rsp ON rsp.user_id = d.user_id
  WHERE EXTRACT(DOW FROM d.day)::int = ANY(rsp.days_of_week)
    AND d.day >= rsp.start_date
    AND (rsp.end_date IS NULL OR d.day <= rsp.end_date)
    AND CASE rsp.recurrence_interval
          WHEN 'weekly'   THEN true
          WHEN 'biweekly' THEN ((d.day - rsp.start_date) / 7) % 2 = 0
          WHEN 'monthly'  THEN ((d.day - rsp.start_date) / 7) % 4 = 0
          ELSE true
        END
    AND NOT EXISTS (
      SELECT 1 FROM shift_pattern_exceptions spe
      WHERE spe.pattern_id = rsp.id AND spe.exception_date = d.day
    )
),
counts AS (
  SELECT p.holiday_id, p.days_taken,
         COALESCE((SELECT COUNT(*) FROM matched m WHERE m.holiday_id = p.holiday_id), 0) AS computed
  FROM params p
)
UPDATE staff_holidays sh
SET days_taken = c.computed
FROM counts c
WHERE sh.id = c.holiday_id
  AND c.computed > 0
  AND c.computed <> c.days_taken;
