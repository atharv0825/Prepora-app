-- M5-B2 get_listening_test + attempt mode, M5-B3 listening-images bucket. Run: supabase test db
begin;
select plan(22);

insert into auth.users (id, email) values
  ('5b000000-0000-0000-0000-000000000001', 'free@prepora.test'),
  ('5b000000-0000-0000-0000-000000000002', 'editor@prepora.test');
insert into public.profiles (id, role, plan) values
  ('5b000000-0000-0000-0000-000000000001', 'user', 'free'),
  ('5b000000-0000-0000-0000-000000000002', 'content_editor', 'free')
on conflict (id) do update set role = excluded.role, plan = excluded.plan;

-- A published Free test, a published Gold test, a draft.
insert into public.listening_tests (id, title, min_plan) values
  ('5b100000-0000-0000-0000-000000000001', 'Free listening', 'free'),
  ('5b100000-0000-0000-0000-000000000002', 'Gold listening', 'gold'),
  ('5b100000-0000-0000-0000-000000000003', 'Draft listening', 'free');
insert into public.listening_sections (id, test_id, order_no, title, audio_url, duration_sec, transcript)
select ('5b2' || t || '0000-0000-0000-0000-00000000000' || s)::uuid, ('5b100000-0000-0000-0000-00000000000' || t)::uuid, s, 'Part ' || s,
       'https://audio.prepora.test/' || t || '/' || s || '.mp3', 300, 'SECRET transcript ' || s
from generate_series(1, 3) t, generate_series(1, 4) s;
insert into public.listening_questions (test_id, section_id, q_no, q_type, prompt, options, answer, explanation)
select ('5b100000-0000-0000-0000-00000000000' || t)::uuid, ('5b2' || t || '0000-0000-0000-0000-000000000001')::uuid, q, 'tfng',
       'Statement ' || q, '{}', '{"value": "true"}', 'SECRET explanation'
from generate_series(1, 3) t, generate_series(1, 2) q;
update public.listening_tests set status = 'published' where id in ('5b100000-0000-0000-0000-000000000001', '5b100000-0000-0000-0000-000000000002');

-- ── Privileges ──────────────────────────────────────────────────────────────────────────────
select function_privs_are('public', 'get_listening_test', array['uuid'], 'anon', array[]::text[], 'anon can''t call get_listening_test');
select is((select prosecdef from pg_proc where proname = 'get_listening_test'), false, 'get_listening_test runs with the caller''s rights');
select function_privs_are('public', 'record_test_attempt', array['uuid', 'test_module', 'uuid', 'jsonb', 'integer', 'numeric', 'integer', 'jsonb', 'text'],
  'authenticated', array[]::text[], 'users can''t record attempts');

create function pg_temp.sign_in(p_id uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_id, 'role', 'authenticated')::text, true);
$$;

-- ── get_listening_test ──────────────────────────────────────────────────────────────────────
set local role authenticated;
select pg_temp.sign_in('5b000000-0000-0000-0000-000000000001');
create temp table t as select public.get_listening_test('5b100000-0000-0000-0000-000000000001') as j;
select is((select jsonb_array_length(j -> 'sections') from t), 4, 'a Free student gets the 4 sections');
select is((select j -> 'sections' -> 1 ->> 'audio_url' from t), 'https://audio.prepora.test/1/2.mp3', 'in order, with their audio');
select is((select jsonb_array_length(j -> 'questions') from t), 2, 'and the questions');
select ok((select not (j::text like '%SECRET%' or j::text like '%"answer"%' or j::text like '%transcript%') from t),
  'with no answers, explanations or transcripts');
select throws_ok($$ select public.get_listening_test('5b100000-0000-0000-0000-000000000002') $$, 'PT403', 'this test needs the gold plan',
  'Gold test on Free → PT403');
select throws_ok($$ select public.get_listening_test('5b100000-0000-0000-0000-000000000003') $$, 'PT404', 'test not found', 'a draft → PT404');
select throws_ok($$ select public.get_listening_test('5b1fffff-0000-0000-0000-000000000000') $$, 'PT404', 'test not found', 'unknown → PT404');
select pg_temp.sign_in('5b000000-0000-0000-0000-000000000002');
select is((select public.get_listening_test('5b100000-0000-0000-0000-000000000003') -> 'test' ->> 'status'), 'draft',
  'staff preview drafts');
reset role;

-- ── record_test_attempt with mode (service role) ────────────────────────────────────────────
select is((public.record_test_attempt('5b000000-0000-0000-0000-000000000001', 'listening', '5b100000-0000-0000-0000-000000000001',
  '{"1": "true"}', 1, 4.5, 600, '[]', 'exam') ->> 'ok')::boolean, true, 'a Listening attempt is recorded');
select is((select mode from public.test_attempts where user_id = '5b000000-0000-0000-0000-000000000001' and module = 'listening'), 'exam',
  'with its mode');
select is((select (public.use_allowance('5b000000-0000-0000-0000-000000000001', 'listening_tests') ->> 'used')::int), 2,
  'and it used a Listening allowance (this check used the second)');
select throws_ok($$ select public.record_test_attempt('5b000000-0000-0000-0000-000000000002', 'reading', '5eed0000-0000-4000-8000-00000000000a',
  '{}', 0, 0, null, null, 'exam') $$, '23514', null, 'Reading attempts have no mode');
select throws_ok($$ select public.record_test_attempt('5b000000-0000-0000-0000-000000000002', 'listening', '5b100000-0000-0000-0000-000000000001',
  '{}', 0, 0, null, null, 'turbo') $$, '23514', null, 'mode is exam or practice');

-- ── M5-B3 listening-images bucket ───────────────────────────────────────────────────────────
select results_eq($$ select public, file_size_limit, allowed_mime_types from storage.buckets where id = 'listening-images' $$,
  $$ values (true, 5242880::bigint, array['image/png', 'image/jpeg', 'image/webp']) $$, 'public bucket, 5 MB, PNG/JPEG/WebP only');

set local role authenticated;
select pg_temp.sign_in('5b000000-0000-0000-0000-000000000002');
select lives_ok($$ insert into storage.objects (bucket_id, name, owner) values ('listening-images', 'maps/campus.png', '5b000000-0000-0000-0000-000000000002') $$,
  'staff upload an image');
select is((select count(*)::int from storage.objects where bucket_id = 'listening-images'), 1, 'and see it');
select pg_temp.sign_in('5b000000-0000-0000-0000-000000000001');
select throws_ok($$ insert into storage.objects (bucket_id, name, owner) values ('listening-images', 'maps/mine.png', '5b000000-0000-0000-0000-000000000001') $$,
  '42501', null, 'a student can''t upload');
select is((select count(*)::int from storage.objects where bucket_id = 'listening-images'), 0, 'nor list the bucket (RLS hides the objects)');
reset role;
select is((select count(*)::int from storage.objects where bucket_id = 'listening-images'), 1, 'the image is still there');

select * from finish();
rollback;
