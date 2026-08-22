-- Access password for each client's public "all info" page. Separate from
-- client_passwords (the per-client software credentials vault): this is the
-- password a visitor must enter before the page renders at all.
--
-- Readable and writable by super admins only. The public page never reads this
-- table — verification happens in an edge function with the service role — so
-- the password is not exposed to the anonymous role that public pages use.
create table public.client_page_access (
  client_name text primary key,
  password text not null,
  updated_at timestamptz not null default now(),
  updated_by uuid
);

alter table public.client_page_access enable row level security;

create policy "Super admins manage page passwords"
  on public.client_page_access for all
  using (get_current_user_role() = 'admin')
  with check (get_current_user_role() = 'admin');

-- Default for every existing client. New clients created later fall back to
-- the same default inside the verification function until a custom password
-- is set.
--
-- NOTE: the seed value is redacted here. The migration as applied on
-- 13 Aug 2026 seeded a literal shared password, which is still live for every
-- client and must not live in version control. Set CLIENT_PAGE_SEED_PASSWORD
-- before running this against a fresh database; the live value is in the
-- client_page_access table on the existing project.
insert into public.client_page_access (client_name, password)
select name, 'CHANGE_ME_SEE_NOTE_ABOVE' from public.clients
on conflict (client_name) do nothing;
