-- Which service a client actually buys.
--
-- Until now every client bought the same thing — admin and compliance support —
-- so the only grouping the finance page needed was who invoices them. That has
-- stopped being true: some clients take CCFORMS on its own, and their revenue
-- behaves differently enough that it needs reading on its own rather than
-- buried in one column of monthly recurring revenue.
--
-- Existing clients are all admin + compliance, which is why that is the default:
-- the CCFORMS ones are marked by hand on the finance page, and a client added
-- later without anyone thinking about it lands in the larger, older group.

alter table public.clients
  add column if not exists service_line text not null default 'admin_compliance';

-- Only the two real service lines. A typo here would silently create a third
-- group on the finance page, and the sum of the groups would stop being the
-- sum of the book.
alter table public.clients
  drop constraint if exists clients_service_line_check;
alter table public.clients
  add constraint clients_service_line_check
  check (service_line in ('admin_compliance', 'ccforms'));

comment on column public.clients.service_line is
  'What the client buys: admin_compliance (the default) or ccforms. Groups revenue on the finance page.';
