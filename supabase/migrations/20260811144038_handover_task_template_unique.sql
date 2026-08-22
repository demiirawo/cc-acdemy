-- Hard backstop against the duplication burst of 11 Aug: the same template task
-- can only exist once per client. The UI guards this too, but its guard reads
-- from a list that refreshes after a round-trip — every click in that gap got
-- through, 34 times in one case. The database doesn't have gaps.
create unique index client_handover_tasks_template_once_per_client
  on public.client_handover_tasks (client_name, template_id)
  where template_id is not null;
