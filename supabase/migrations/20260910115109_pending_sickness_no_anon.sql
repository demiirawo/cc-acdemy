-- pending_sickness is for signed-in staff only. Supabase's default privileges
-- grant EXECUTE on new public functions to anon directly, so the earlier
-- "revoke ... from public" left anon able to call it. It returned nothing to
-- anon (the role check inside fails without a user), but it should not be
-- callable at all.
revoke execute on function public.pending_sickness(date, date) from anon;
