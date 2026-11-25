-- M4-A1 Reading builder: admin_get_reading_test, admin_order_reading_questions. Run: supabase test db
begin;
select plan(17);

insert into auth.users (id, email) values
  ('4c000000-0000-0000-0000-000000000001', 'student@prepora.test'),
  ('4c000000-0000-0000-0000-000000000002', 'editor@prepora.test');
insert into public.profiles (id, role, plan) values
  ('4c000000-0000-0000-0000-000000000001', 'user', 'platinum'),
  ('4c000000-0000-0000-0000-000000000002', 'content_editor', 'free')
on conflict (id) do update set role = excluded.role, plan = excluded.plan;

-- A draft with 3 passages: questions 1–2 in passage 1, 3 in passage 2.
insert into public.reading_tests (id, test_type, title) values ('4c100000-0000-0000-0000-000000000001', 'academic', 'Builder draft');
insert into public.reading_passages (id, test_id, order_no, title, body)
select ('4c20000' || n || '-0000-0000-0000-000000000000')::uuid, '4c100000-0000-0000-0000-000000000001', n, 'P' || n, 'Body ' || n
from generate_series(1, 3) n;
insert into public.reading_questions (id, test_id, passage_id, q_no, q_type, prompt, answer, explanation) values
  ('4c300000-0000-0000-0000-000000000001', '4c100000-0000-0000-0000-000000000001', '4c200001-0000-0000-0000-000000000000', 1, 'tfng', 'First', '{"value": "true"}', 'Para A.'),
  ('4c300000-0000-0000-0000-000000000002', '4c100000-0000-0000-0000-000000000001', '4c200001-0000-0000-0000-000000000000', 2, 'tfng', 'Second', '{"value": "false"}', null),
  ('4c300000-0000-0000-0000-000000000003', '4c100000-0000-0000-0000-000000000001', '4c200002-0000-0000-0000-000000000000', 3, 'tfng', 'Third', '{"value": "not_given"}', null);

select function_privs_are('public', 'admin_get_reading_test', array['uuid'], 'anon', array[]::text[], 'anon can''t call admin_get_reading_test');
select function_privs_are('public', 'admin_order_reading_questions', array['uuid', 'uuid[]'], 'anon', array[]::text[],
  'anon can''t call admin_order_reading_questions');
select is((select prosecdef from pg_proc where proname = 'admin_get_reading_test'), true, 'admin_get_reading_test reads keys as definer');
select is((select prosecdef from pg_proc where proname = 'admin_order_reading_questions'), false,
  'admin_order_reading_questions runs with the editor''s rights (staff RLS)');

create function pg_temp.sign_in(p_id uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_id, 'role', 'authenticated')::text, true);
$$;

-- A student (even Platinum) gets neither keys nor reordering.
set local role authenticated;
select pg_temp.sign_in('4c000000-0000-0000-0000-000000000001');
select throws_ok($$ select public.admin_get_reading_test('4c100000-0000-0000-0000-000000000001') $$, '42501', 'staff only',
  'a student can''t read answer keys through the builder RPC');
select throws_ok($$ select public.admin_order_reading_questions('4c100000-0000-0000-0000-000000000001',
  array['4c300000-0000-0000-0000-000000000002', '4c300000-0000-0000-0000-000000000001', '4c300000-0000-0000-0000-000000000003']::uuid[]) $$,
  '42501', 'staff only', 'a student can''t renumber');

-- The editor reads the draft with its keys.
select pg_temp.sign_in('4c000000-0000-0000-0000-000000000002');
select is((select public.admin_get_reading_test('4c100000-0000-0000-0000-000000000001') -> 'test' ->> 'status'), 'draft', 'editor opens a draft');
select is((select jsonb_array_length(public.admin_get_reading_test('4c100000-0000-0000-0000-000000000001') -> 'passages')), 3, 'with 3 passages');
select is((select public.admin_get_reading_test('4c100000-0000-0000-0000-000000000001') -> 'questions' -> 0 -> 'answer'),
  '{"value": "true"}'::jsonb, 'and the answer key');
select is((select public.admin_get_reading_test('4c100000-0000-0000-0000-000000000001') -> 'questions' -> 0 ->> 'explanation'),
  'Para A.', 'and the explanation');
select throws_ok($$ select public.admin_get_reading_test('4c1fffff-0000-0000-0000-000000000000') $$, 'P0002', 'test not found',
  'an unknown test is P0002');

-- Swapping 1 and 2 (would collide row by row; the unique check is deferred to commit).
select lives_ok($$ select public.admin_order_reading_questions('4c100000-0000-0000-0000-000000000001',
  array['4c300000-0000-0000-0000-000000000002', '4c300000-0000-0000-0000-000000000001', '4c300000-0000-0000-0000-000000000003']::uuid[]) $$,
  'the editor swaps questions 1 and 2');
select results_eq($$ select prompt from public.reading_questions where test_id = '4c100000-0000-0000-0000-000000000001' order by q_no $$,
  array['Second', 'First', 'Third'], 'numbers follow the new order');

select throws_ok($$ select public.admin_order_reading_questions('4c100000-0000-0000-0000-000000000001',
  array['4c300000-0000-0000-0000-000000000002', '4c300000-0000-0000-0000-000000000001']::uuid[]) $$,
  '22023', 'the order must list every question of the test once', 'a question left out is refused');
select throws_ok($$ select public.admin_order_reading_questions('4c100000-0000-0000-0000-000000000001',
  array['4c300000-0000-0000-0000-000000000001', '4c300000-0000-0000-0000-000000000001', '4c300000-0000-0000-0000-000000000003']::uuid[]) $$,
  '22023', 'the order must list every question of the test once', 'a repeated question is refused');
select throws_ok($$ select public.admin_order_reading_questions('4c100000-0000-0000-0000-000000000001',
  array['4c300000-0000-0000-0000-000000000003', '4c300000-0000-0000-0000-000000000001', '4c300000-0000-0000-0000-000000000002']::uuid[]) $$,
  '22023', 'questions must follow passage order', 'passage 2''s question can''t come before passage 1''s');

-- Numbers are still unique, checked immediately outside the renumbering. (This file is one
-- transaction, so end the renumbering's deferral first; each API request is its own transaction.)
set constraints public.reading_questions_test_id_q_no_key immediate;
select throws_ok($$
  insert into public.reading_questions (test_id, passage_id, q_no, q_type, prompt, answer)
  values ('4c100000-0000-0000-0000-000000000001', '4c200003-0000-0000-0000-000000000000', 3, 'tfng', 'Dup', '{"value": "true"}')
$$, '23505', null, 'a duplicate question number is still refused');

reset role;
select * from finish();
rollback;
