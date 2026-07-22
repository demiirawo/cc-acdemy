-- Which app roles receive each admin-side email alert (configurable per alert).
alter table public.notification_settings
  add column if not exists recipient_roles text[] not null default '{admin,human_resources}';

-- Settings row for the immediate "new request" email so its recipients (and
-- on/off state) are configurable like the rest.
insert into public.notification_settings (notification_type, is_enabled, recipient_roles)
select 'new_request', true, '{admin,human_resources}'
where not exists (select 1 from public.notification_settings where notification_type = 'new_request');
