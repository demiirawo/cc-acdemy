-- Supporting evidence becomes file attachments.
alter table public.inspections add column if not exists evidence_files jsonb not null default '[]'::jsonb;

-- Private bucket for inspection evidence files.
insert into storage.buckets (id, name, public)
values ('inspection-evidence', 'inspection-evidence', false)
on conflict (id) do nothing;

-- HR & admins (the only roles that can see inspections) can read/write/delete evidence.
drop policy if exists "HR read inspection evidence" on storage.objects;
create policy "HR read inspection evidence" on storage.objects
  for select using (bucket_id = 'inspection-evidence' and public.is_hr_or_admin());

drop policy if exists "HR upload inspection evidence" on storage.objects;
create policy "HR upload inspection evidence" on storage.objects
  for insert with check (bucket_id = 'inspection-evidence' and public.is_hr_or_admin());

drop policy if exists "HR delete inspection evidence" on storage.objects;
create policy "HR delete inspection evidence" on storage.objects
  for delete using (bucket_id = 'inspection-evidence' and public.is_hr_or_admin());
