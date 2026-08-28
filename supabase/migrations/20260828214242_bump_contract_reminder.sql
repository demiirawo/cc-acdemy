-- Stamp a reminder in one statement.
--
-- Read-then-write from the sender would race with itself if two runs ever
-- overlapped, and the count is the only evidence of how hard somebody has been
-- chased — worth getting right rather than approximately right.
create or replace function public.bump_contract_reminder(_contract_id uuid)
returns void
language sql
security definer
set search_path to 'public'
as $$
  update public.contracts
     set last_reminded_at = now(),
         reminder_count = reminder_count + 1
   where id = _contract_id
     and signed_at is null;   -- never chase a signed contract, whatever asked
$$;
