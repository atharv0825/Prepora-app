-- M6-A1: writing_tasks.image_alt and the writing-images bucket. Run: supabase test db
begin;
select plan(9);

insert into auth.users (id, email) values
  ('6a000000-0000-0000-0000-000000000001', 'student@prepora.test'),
  ('6a000000-0000-0000-0000-000000000002', 'editor@prepora.test');
insert into public.profiles (id, role, plan) values
  ('6a000000-0000-0000-0000-000000000001', 'user', 'gold'),
  ('6a000000-0000-0000-0000-000000000002', 'content_editor', 'free')
on conflict (id) do update set role = excluded.role, plan = excluded.plan;

select has_column('public', 'writing_tasks', 'image_alt', 'writing_tasks.image_alt exists');
select results_eq($$ select public, file_size_limit, allowed_mime_types from storage.buckets where id = 'writing-images' $$,
  $$ values (true, 5242880::bigint, array['image/png', 'image/jpeg', 'image/webp']) $$, 'public bucket, 5 MB, PNG/JPEG/WebP only');

create function pg_temp.sign_in(p_id uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_id, 'role', 'authenticated')::text, true);
$$;
select set_config('storage.allow_delete_query', 'true', true);

set local role authenticated;
select pg_temp.sign_in('6a000000-0000-0000-0000-000000000002');
select lives_ok($$
  insert into public.writing_tasks (task_no, test_type, title, prompt, image_url, image_alt)
  values (1, 'academic', 'Rainfall', 'The chart shows…', 'https://cdn.example.com/r.png', 'Bar chart of monthly rainfall in three cities')
$$, 'an editor saves a chart with its description');
select throws_ok($$ insert into public.writing_tasks (task_no, test_type, title, prompt, image_alt) values (1, 'academic', 'x', 'x', repeat('a', 301)) $$,
  '23514', null, 'descriptions are 300 characters at most');
select lives_ok($$ insert into storage.objects (bucket_id, name, owner) values ('writing-images', 'charts/rain.png', '6a000000-0000-0000-0000-000000000002') $$,
  'staff upload a chart');
select is((select count(*)::int from storage.objects where bucket_id = 'writing-images'), 1, 'and list it');

select pg_temp.sign_in('6a000000-0000-0000-0000-000000000001');
select throws_ok($$ insert into storage.objects (bucket_id, name, owner) values ('writing-images', 'charts/mine.png', '6a000000-0000-0000-0000-000000000001') $$,
  '42501', null, 'a student can''t upload');
select is_empty($$ delete from storage.objects where bucket_id = 'writing-images' returning name $$, 'nor delete');
reset role;
select is((select count(*)::int from storage.objects where bucket_id = 'writing-images'), 1, 'the chart is still there');

select * from finish();
rollback;
