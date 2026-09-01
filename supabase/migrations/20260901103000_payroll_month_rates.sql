-- Freeze the payroll exchange rate against the month it was used for.
--
-- Payroll is paid through LemFi, so the rate that matters is the one LemFi
-- gives on the day the money is sent - not the interbank mid-market rate the
-- app fetches from ExchangeRate-API, which nobody can actually transact at.
-- That part already worked: an admin can type LemFi's rate in and it takes
-- precedence over the API.
--
-- What did not work is that manual_currency_rates holds ONE row per currency
-- with no month on it. Change the naira rate today and every past payroll is
-- silently re-valued at today's rate: August's total moves because September's
-- rate moved. A payroll that has been paid should never change afterwards.
--
-- So the rate is now recorded per month. Each month keeps the rate that was
-- actually used to pay it, and history stops shifting under you.
create table if not exists public.payroll_month_rates (
  month date not null,
  currency_code text not null,
  rate_to_gbp numeric not null check (rate_to_gbp > 0),
  -- Where the number came from, so a figure can be defended later.
  source text not null default 'lemfi',
  updated_by uuid,
  updated_at timestamptz not null default now(),
  primary key (month, currency_code)
);

comment on table public.payroll_month_rates is
  'The exchange rate used for one month''s payroll, frozen so a paid month is never re-valued.';
comment on column public.payroll_month_rates.source is
  'lemfi = read from LemFi, the payroll processor. api = mid-market fallback.';

alter table public.payroll_month_rates enable row level security;

-- Mirrors manual_currency_rates: admins set it, any signed-in user may read it
-- (the payroll page converts for everyone who can see it).
create policy "Admins can manage payroll month rates"
  on public.payroll_month_rates for all
  using (get_current_user_role() = 'admin');

create policy "Authenticated users can view payroll month rates"
  on public.payroll_month_rates for select
  using (true);

-- Seed the months already run from the rate in force, so nothing moves the
-- first time this ships. 1861 is LemFi's GBP->NGN rate as at 1 September 2026,
-- which is what August was reconciled at.
insert into public.payroll_month_rates (month, currency_code, rate_to_gbp, source)
select m.month, r.currency_code, r.rate_to_gbp, 'lemfi'
from manual_currency_rates r
cross join (values (date '2026-07-01'), (date '2026-08-01'), (date '2026-09-01')) as m(month)
on conflict (month, currency_code) do nothing;
