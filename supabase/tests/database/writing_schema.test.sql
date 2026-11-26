-- M6-C1 Writing schema + RLS + writing-photos bucket. Run: supabase test db
begin;
select plan(46);

insert into auth.users (id, email) values
  ('6c000000-0000-0000-0000-000000000001', 'free@prepora.test'),
  ('6c000000-0000-0000-0000-000000000002', 'gold@prepora.test'),
  ('6c000000-0000-0000-0000-000000000003', 'editor@prepora.test'),
  ('6c000000-0000-0000-0000-000000000004', 'gold2@prepora.test');
insert into public.profiles (id, role, plan) values
  ('6c000000-0000-0000-0000-000000000001', 'user', 'free'),
  ('6c000000-0000-0000-0000-000000000002', 'user', 'gold'),
  ('6c000000-0000-0000-0000-000000000003', 'content_editor', 'free'),
  ('6c000000-0000-0000-0000-000000000004', 'user', 'platinum')
on conflict (id) do update set role = excluded.role, plan = excluded.plan;

-- ── Structure ───────────────────────────────────────────────────────────────────────────────
select has_table('public', t, t || ' exists') from unnest(array['writing_tasks', 'writing_submissions']) t;
select is((select bool_and(relrowsecurity) from pg_class where oid in
  ('public.writing_tasks'::regclass, 'public.writing_submissions'::regclass)), true, 'RLS on both');
select ok(not has_table_privilege('authenticated', 'public.writing_submissions', 'insert'), 'users can''t insert submissions');
select ok(not has_table_privilege('authenticated', 'public.writing_submissions', 'update'), 'nor update them');
select ok(not has_table_privilege('anon', 'public.writing_submissions', 'select'), 'anon can''t read submissions');
select results_eq($$ select public, file_size_limit, allowed_mime_types from storage.buckets where id = 'writing-photos' $$,
  $$ values (false, 10485760::bigint, array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']) $$,
  'private photo bucket, 10 MB, phone image types');

create function pg_temp.sign_in(p_id uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_id, 'role', 'authenticated')::text, true);
$$;

-- ── The editor writes tasks ─────────────────────────────────────────────────────────────────
set local role authenticated;
select pg_temp.sign_in('6c000000-0000-0000-0000-000000000003');

select lives_ok($$
  insert into public.writing_tasks (id, task_no, test_type, title, prompt, image_url) values
    ('6c100000-0000-0000-0000-000000000001', 1, 'academic', 'Rainfall chart', 'The chart shows rainfall…', null),
    ('6c100000-0000-0000-0000-000000000002', 1, 'general', 'Letter to a neighbour', 'Write a letter…', null),
    ('6c100000-0000-0000-0000-000000000003', 2, null, 'Remote work', 'Some people think…', null),
    ('6c100000-0000-0000-0000-000000000004', 2, 'general', 'Draft essay', 'Draft…', null)
$$, 'an editor creates Task 1 Academic, Task 1 General and Task 2 prompts');
select throws_ok($$ insert into public.writing_tasks (task_no, title, prompt) values (1, 'No type', 'x') $$,
  '23514', null, 'Task 1 must say Academic or General');
select throws_ok($$ insert into public.writing_tasks (task_no, title, prompt) values (3, 'Task 3', 'x') $$,
  '23514', null, 'there''s no Task 3');
select throws_ok($$ insert into public.writing_tasks (task_no, title, prompt, image_url) values (2, 'Essay', 'x', 'https://cdn.example.com/c.png') $$,
  '23514', null, 'only Task 1 Academic has an image');
select throws_ok($$ update public.writing_tasks set image_url = 'javascript:alert(1)' where id = '6c100000-0000-0000-0000-000000000001' $$,
  '23514', null, 'the image must be an http(s) URL');

select throws_ok($$ update public.writing_tasks set status = 'published' where id = '6c100000-0000-0000-0000-000000000001' $$,
  '23514', 'a published Task 1 Academic prompt needs its chart image', 'a report can''t be published without its chart');
select lives_ok($$
  update public.writing_tasks set image_url = 'https://cdn.example.com/rain.png' where id = '6c100000-0000-0000-0000-000000000001';
  update public.writing_tasks set status = 'published'
  where id in ('6c100000-0000-0000-0000-000000000001', '6c100000-0000-0000-0000-000000000002', '6c100000-0000-0000-0000-000000000003')
$$, 'with it, it publishes (and the letter and essay)');
select is((select count(*)::int from public.writing_tasks where status = 'published' and published_at is not null), 3,
  'published_at is set');
select throws_ok($$ update public.writing_tasks set image_url = null where id = '6c100000-0000-0000-0000-000000000001' $$,
  '23514', null, 'a published report keeps its chart');
select is_empty($$ delete from public.writing_tasks where id = '6c100000-0000-0000-0000-000000000003' returning id $$,
  'published tasks aren''t deleted');
select lives_ok($$ delete from public.writing_tasks where id = '6c100000-0000-0000-0000-000000000004' $$, 'drafts are');

-- ── Students ────────────────────────────────────────────────────────────────────────────────
select pg_temp.sign_in('6c000000-0000-0000-0000-000000000001');
select is((select count(*)::int from public.writing_tasks), 3, 'a student sees the 3 published tasks, not drafts');
select throws_ok($$ insert into public.writing_tasks (task_no, title, prompt) values (2, 'Mine', 'x') $$,
  '42501', null, 'a student can''t write a task');
select is_empty($$ update public.writing_tasks set title = 'Hacked' returning id $$, 'nor change one');
select throws_ok($$
  insert into public.writing_submissions (user_id, task_id, input_mode, text, word_count, scores, band)
  values ('6c000000-0000-0000-0000-000000000001', '6c100000-0000-0000-0000-000000000003', 'typed', 'My essay', 2,
          '{"ta": 9, "cc": 9, "lr": 9, "gra": 9}', 9)
$$, '42501', null, 'a student can''t write their own band');

reset role;
set local role anon;
select is((select count(*)::int from public.writing_tasks), 3, 'signed out: the published tasks too');
select is((select count(*)::int from public.writing_tasks where status <> 'published'), 0, 'never the drafts');
reset role;

-- ── Submissions (as score-writing writes them, service role) ────────────────────────────────
select lives_ok($$
  insert into public.writing_submissions (id, user_id, task_id, input_mode, photo_paths, text, word_count, scores, band, feedback, prompt_version)
  values
    ('6c200000-0000-0000-0000-000000000001', '6c000000-0000-0000-0000-000000000001', '6c100000-0000-0000-0000-000000000003', 'typed', null,
     'Remote work has…', 260, '{"ta": 6, "cc": 6.5, "lr": 6, "gra": 5.5}', 6, '{"summary": "Clear position."}', 't2-v1'),
    ('6c200000-0000-0000-0000-000000000002', '6c000000-0000-0000-0000-000000000002', '6c100000-0000-0000-0000-000000000001', 'photo',
     array['6c000000-0000-0000-0000-000000000002/page1.jpg', '6c000000-0000-0000-0000-000000000002/page2.jpg'],
     'The chart shows…', 172, '{"ta": 7, "cc": 7, "lr": 6.5, "gra": 7}', 7, '{}', 't1a-v1')
$$, 'the service role stores a typed and a photo answer');
select throws_ok($$
  insert into public.writing_submissions (user_id, task_id, input_mode, text, word_count, scores, band)
  values ('6c000000-0000-0000-0000-000000000001', '6c100000-0000-0000-0000-000000000003', 'photo', 'x', 1, '{"ta": 6, "cc": 6, "lr": 6, "gra": 6}', 6)
$$, '23514', null, 'a photo answer needs its photos');
select throws_ok($$
  insert into public.writing_submissions (user_id, task_id, input_mode, photo_paths, text, word_count, scores, band)
  values ('6c000000-0000-0000-0000-000000000002', '6c100000-0000-0000-0000-000000000003', 'photo', array['a/1.jpg', 'a/2.jpg', 'a/3.jpg'], 'x', 1,
          '{"ta": 6, "cc": 6, "lr": 6, "gra": 6}', 6)
$$, '23514', null, 'up to 2 pages');
select throws_ok($$
  insert into public.writing_submissions (user_id, task_id, input_mode, photo_paths, text, word_count, scores, band)
  values ('6c000000-0000-0000-0000-000000000001', '6c100000-0000-0000-0000-000000000003', 'typed', array['a/1.jpg'], 'x', 1,
          '{"ta": 6, "cc": 6, "lr": 6, "gra": 6}', 6)
$$, '23514', null, 'a typed answer has no photos');
select throws_ok($$
  insert into public.writing_submissions (user_id, task_id, input_mode, text, word_count, scores, band)
  values ('6c000000-0000-0000-0000-000000000001', '6c100000-0000-0000-0000-000000000003', 'typed', 'x', 1, '{"ta": 6, "cc": 6, "lr": 6}', 6)
$$, '23514', null, 'scores need all four criteria');
select throws_ok($$
  insert into public.writing_submissions (user_id, task_id, input_mode, text, word_count, scores, band)
  values ('6c000000-0000-0000-0000-000000000001', '6c100000-0000-0000-0000-000000000003', 'typed', 'x', 1, '{"ta": 6, "cc": 6, "lr": 6, "gra": 6}', 6.3)
$$, '23514', null, 'the band is whole or half');
select throws_ok($$
  insert into public.writing_submissions (user_id, task_id, input_mode, text, word_count, scores, band)
  values ('6c000000-0000-0000-0000-000000000001', '6c100000-0000-0000-0000-000000000003', 'typed', '   ', 0, '{"ta": 6, "cc": 6, "lr": 6, "gra": 6}', 6)
$$, '23514', null, 'the answer can''t be empty');

set local role authenticated;
select pg_temp.sign_in('6c000000-0000-0000-0000-000000000001');
select results_eq($$ select id from public.writing_submissions $$,
  $$ values ('6c200000-0000-0000-0000-000000000001'::uuid) $$, 'a student reads only their own submission');
select throws_ok($$ delete from public.writing_submissions $$, '42501', null, 'and can''t delete it');
select pg_temp.sign_in('6c000000-0000-0000-0000-000000000003');
select is((select count(*)::int from public.writing_submissions), 0, 'staff don''t read students'' answers either');
select is_empty($$ delete from public.writing_tasks where id = '6c100000-0000-0000-0000-000000000001' returning id $$,
  'the editor can''t delete a published task');
reset role;
select throws_ok($$ delete from public.writing_tasks where id = '6c100000-0000-0000-0000-000000000003' $$,
  '23503', null, 'a task with submissions can''t be deleted at all (archive it)');

-- ── writing-photos: own folder; uploads need Gold ───────────────────────────────────────────
-- The Storage API sets this before a delete (storage.protect_delete); RLS still decides.
select set_config('storage.allow_delete_query', 'true', true);
set local role authenticated;
select pg_temp.sign_in('6c000000-0000-0000-0000-000000000002');
select lives_ok($$ insert into storage.objects (bucket_id, name, owner) values
  ('writing-photos', '6c000000-0000-0000-0000-000000000002/page1.jpg', '6c000000-0000-0000-0000-000000000002') $$,
  'a Gold student uploads to their folder');
select throws_ok($$ insert into storage.objects (bucket_id, name, owner) values
  ('writing-photos', '6c000000-0000-0000-0000-000000000004/page1.jpg', '6c000000-0000-0000-0000-000000000002') $$,
  '42501', null, 'not into someone else''s');
select throws_ok($$ insert into storage.objects (bucket_id, name, owner) values
  ('writing-photos', 'page1.jpg', '6c000000-0000-0000-0000-000000000002') $$,
  '42501', null, 'nor the bucket root');
select is((select count(*)::int from storage.objects where bucket_id = 'writing-photos'), 1, 'they see their photo');

select pg_temp.sign_in('6c000000-0000-0000-0000-000000000004');
select lives_ok($$ insert into storage.objects (bucket_id, name, owner) values
  ('writing-photos', '6c000000-0000-0000-0000-000000000004/essay.heic', '6c000000-0000-0000-0000-000000000004') $$,
  'Platinum uploads too');
select is((select array_agg(name) from storage.objects where bucket_id = 'writing-photos'),
  array['6c000000-0000-0000-0000-000000000004/essay.heic'], 'and sees only their own photo');
select is_empty($$ delete from storage.objects where bucket_id = 'writing-photos' and name like '6c000000-0000-0000-0000-000000000002/%' returning name $$,
  'nor deletes anyone else''s');

select pg_temp.sign_in('6c000000-0000-0000-0000-000000000001');
select throws_ok($$ insert into storage.objects (bucket_id, name, owner) values
  ('writing-photos', '6c000000-0000-0000-0000-000000000001/page1.jpg', '6c000000-0000-0000-0000-000000000001') $$,
  '42501', null, 'a Free student can''t upload (photo upload is Gold)');

select pg_temp.sign_in('6c000000-0000-0000-0000-000000000002');
select isnt_empty($$ delete from storage.objects where bucket_id = 'writing-photos' and name = '6c000000-0000-0000-0000-000000000002/page1.jpg' returning name $$,
  'a student deletes their own photo');
reset role;
select is((select count(*)::int from storage.objects where bucket_id = 'writing-photos'), 1, 'the other photo is still there');

select * from finish();
rollback;
