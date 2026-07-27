-- Feedback can originate from a client (e.g. a family or care manager praising a
-- carer), not just from internal HR. Record which client it came from so the staff
-- member's profile can show client feedback separately from internal feedback.
alter table public.staff_warnings
  add column if not exists client_id uuid references public.clients(id) on delete set null;

create index if not exists staff_warnings_client_id_idx
  on public.staff_warnings (client_id);

comment on column public.staff_warnings.client_id is
  'Client this feedback came from. Null means internal feedback raised by HR or management rather than a client.';
