-- M6-A1: what the Writing task manager needs.
--
--   * writing_tasks.image_alt: a description of the Task 1 Academic visual for screen readers
--     (students see the image; the description is its text alternative).
--   * writing-images: public bucket for Task 1 Academic charts, like listening-images (M5-B3).
--     Public, because the editor shows the image to anyone who opens a published task and
--     score-writing fetches it by URL. Staff upload; PNG, JPEG or WebP only (no SVG: it can
--     carry script), 5 MB at most.

alter table public.writing_tasks
  add column image_alt text check (char_length(image_alt) <= 300);

comment on column public.writing_tasks.image_alt is
  'Text alternative for the Task 1 Academic visual (screen readers), written by staff (M6-A1).';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('writing-images', 'writing-images', true, 5242880, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update
set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy "writing-images: staff read"
on storage.objects for select to authenticated
using (bucket_id = 'writing-images' and (select public.is_staff()));

create policy "writing-images: staff upload"
on storage.objects for insert to authenticated
with check (bucket_id = 'writing-images' and (select public.is_staff()));

create policy "writing-images: staff update"
on storage.objects for update to authenticated
using (bucket_id = 'writing-images' and (select public.is_staff()))
with check (bucket_id = 'writing-images' and (select public.is_staff()));

create policy "writing-images: staff delete"
on storage.objects for delete to authenticated
using (bucket_id = 'writing-images' and (select public.is_staff()));
