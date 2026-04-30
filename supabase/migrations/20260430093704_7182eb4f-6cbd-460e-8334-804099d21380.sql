
insert into storage.buckets (id, name, public)
values ('invoice-pdfs', 'invoice-pdfs', false)
on conflict (id) do nothing;

create policy "Authenticated users can upload invoice PDFs"
on storage.objects for insert
to authenticated
with check (bucket_id = 'invoice-pdfs');

create policy "Authenticated users can read invoice PDFs"
on storage.objects for select
to authenticated
using (bucket_id = 'invoice-pdfs');
