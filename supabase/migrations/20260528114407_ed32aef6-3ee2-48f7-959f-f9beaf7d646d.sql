DO $$
DECLARE
  orphan_ids uuid[];
BEGIN
  SELECT array_agg(hp.user_id) INTO orphan_ids
  FROM public.hr_profiles hp
  LEFT JOIN auth.users au ON au.id = hp.user_id
  LEFT JOIN public.profiles p ON p.user_id = hp.user_id
  WHERE au.id IS NULL AND p.user_id IS NULL;

  IF orphan_ids IS NULL THEN
    RETURN;
  END IF;

  DELETE FROM public.payroll_ready_status WHERE user_id = ANY(orphan_ids);
  DELETE FROM public.staff_pay_records WHERE user_id = ANY(orphan_ids);
  DELETE FROM public.recurring_bonuses WHERE user_id = ANY(orphan_ids);
  DELETE FROM public.staff_holidays WHERE user_id = ANY(orphan_ids);
  DELETE FROM public.staff_requests WHERE user_id = ANY(orphan_ids);
  DELETE FROM public.shift_pattern_exceptions
    WHERE pattern_id IN (SELECT id FROM public.recurring_shift_patterns WHERE user_id = ANY(orphan_ids));
  DELETE FROM public.recurring_shift_patterns WHERE user_id = ANY(orphan_ids);
  DELETE FROM public.staff_schedules WHERE user_id = ANY(orphan_ids);
  DELETE FROM public.hr_profiles WHERE user_id = ANY(orphan_ids);
END $$;