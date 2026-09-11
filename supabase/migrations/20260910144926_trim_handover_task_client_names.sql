-- Six tasks were filed under 'Three Little Angels ' (trailing space). The
-- tracker matched on the exact text and found them; the status lookups
-- matched on the trimmed name and did not, so Dunsin's September leave read
-- "not started" with six tasks on file. Handovers now carry trimmed names by
-- constraint; tasks follow suit.
update public.client_handover_tasks
   set client_name = btrim(client_name)
 where client_name <> btrim(client_name);
