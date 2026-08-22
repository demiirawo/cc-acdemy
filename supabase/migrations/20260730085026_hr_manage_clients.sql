-- HR managers work the client book too — assignments, handovers, cover — so give
-- them the same rights over client records that admins have. Reading was already
-- open to any signed-in user; this adds the write side, so the Clients page's
-- inline editing actually saves for them instead of silently failing under RLS.
drop policy if exists "HR can manage clients" on public.clients;
create policy "HR can manage clients"
  on public.clients for all
  using (public.get_current_user_role() = 'human_resources')
  with check (public.get_current_user_role() = 'human_resources');
