-- Signed-out visitors can no longer read the client book.
--
-- "Everyone can view clients" was `using (true)` for every role, and anon held
-- full table privileges, so anyone with the publishable key — which ships in
-- the front-end bundle — could list every client with their fees, contacts,
-- addresses and notes without signing in. Nothing signed-out needs that: the
-- only signed-out reader was the public schedule page, fetching client names
-- for its shift editor. Signed-in users keep exactly the read access they had,
-- and the admin and HR management policies are unchanged.
drop policy if exists "Everyone can view clients" on public.clients;
create policy "Signed-in users can view clients"
  on public.clients for select
  to authenticated
  using (true);

-- With no privileges at all, a later policy written for "public" can't reopen
-- the table to signed-out visitors by accident.
revoke all on table public.clients from anon;
