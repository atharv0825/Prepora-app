-- M4-B1 get_reading_test, M4-B2 record_test_attempt. Run: supabase test db
begin;
select plan(21);

insert into auth.users (id, email) values
  ('4b000000-0000-0000-0000-000000000001', 'free@prepora.test'),
  ('4b000000-0000-0000-0000-000000000002', 'editor@prepora.test');
insert into public.profiles (id, role, plan) values
  ('4b000000-0000-0000-0000-000000000001', 'user', 'free'),
  ('4b000000-0000-0000-0000-000000000002', 'content_editor', 'free')
on conflict (id) do update set role = excluded.role, plan = excluded.plan;

-- A Gold test and a draft, next to the seeded Free samples.
insert into public.reading_tests (id, test_type, title, min_plan) values
  ('4b100000-0000-0000-0000-000000000001', 'academic', 'Gold test', 'gold'),
  ('4b100000-0000-0000-0000-000000000002', 'general', 'Draft test', 'free');
insert into public.reading_passages (id, test_id, order_no, title, body)
select gen_random_uuid(), '4b100000-0000-0000-0000-000000000001', n, 'P' || n, 'Body' from generate_series(1, 3) n;
insert into public.reading_questions (test_id, passage_id, q_no, q_type, prompt, answer)
select '4b100000-0000-0000-0000-000000000001', id, 1, 'tfng', 'Q', '{"value": "true"}'
from public.reading_passages where test_id = '4b100000-0000-0000-0000-000000000001' and order_no = 1;
update public.reading_tests set status = 'published' where id = '4b100000-0000-0000-0000-000000000001';

select function_privs_are('public', 'get_reading_test', array['uuid'], 'anon', array[]::text[], 'anon can''t call get_reading_test');
select function_privs_are('public', 'record_test_attempt', array['uuid', 'test_module', 'uuid', 'jsonb', 'integer', 'numeric', 'integer', 'jsonb'],
  'authenticated', array[]::text[], 'users can''t record their own attempts');
select is((select prosecdef from pg_proc where proname = 'get_reading_test'), false,
  'get_reading_test runs with the caller''s rights (column grants apply)');

create function pg_temp.sign_in(p_id uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_id, 'role', 'authenticated')::text, true);
$$;

set local role authenticated;
select pg_temp.sign_in('4b000000-0000-0000-0000-000000000001');

create temp table t as select public.get_reading_test('5eed0000-0000-4000-8000-00000000000a') as j;
select is((select j -> 'test' ->> 'title' from t), 'Sample Academic Test', 'a Free student opens the Academic sample');
select is((select jsonb_array_length(j -> 'passages') from t), 3, '3 passages');
select is((select jsonb_array_length(j -> 'questions') from t), 20, '20 questions');
select is((select array_agg((p ->> 'order_no')::int) from t, jsonb_array_elements(j -> 'passages') p), array[1, 2, 3], 'passages in order');
select is((select (j -> 'questions' -> 0 ->> 'q_no')::int from t), 1, 'questions in order');
select is((select count(*)::int from t, jsonb_array_elements(j -> 'questions') q where q ? 'answer' or q ? 'explanation'), 0,
  'no answers or explanations anywhere');
select ok((select j::text not like '%"accept"%' and j::text not like '%"labels"%' and j::text not like '%"value"%' from t),
  'no answer-key fields in the payload');

select throws_ok($$ select public.get_reading_test('4b100000-0000-0000-0000-000000000001') $$, 'PT403', 'this test needs the gold plan',
  'a Gold test is refused on Free');
select throws_ok($$ select public.get_reading_test('4b100000-0000-0000-0000-000000000002') $$, 'PT404', 'test not found',
  'a draft is not found for students');
select throws_ok($$ select public.get_reading_test('4b100000-0000-0000-0000-0000000000ff') $$, 'PT404', 'test not found',
  'nor is an unknown id');

select pg_temp.sign_in('4b000000-0000-0000-0000-000000000002');
select lives_ok($$ select public.get_reading_test('4b100000-0000-0000-0000-000000000002') $$, 'staff preview drafts');
select is(jsonb_array_length(public.get_reading_test('4b100000-0000-0000-0000-000000000001') -> 'questions'), 1,
  'and tests above their own plan');

-- record_test_attempt (service role): Free has 2 Reading tests a month.
reset role;
select is(public.record_test_attempt('4b000000-0000-0000-0000-000000000001', 'reading', '5eed0000-0000-4000-8000-00000000000a',
  '{"1": "true"}', 12, 6, 1800) - 'attempt_id',
  '{"ok": true, "allowance": {"type": "reading_tests", "used": 1, "limit": 2}}'::jsonb, 'first attempt saved, 1 of 2 used');
select public.record_test_attempt('4b000000-0000-0000-0000-000000000001', 'reading', '5eed0000-0000-4000-8000-00000000000b',
  '{}', 5, 4, null);
select is(public.record_test_attempt('4b000000-0000-0000-0000-000000000001', 'reading', '5eed0000-0000-4000-8000-00000000000a',
  '{}', 20, 9, 100),
  '{"ok": false, "code": "allowance_exceeded", "type": "reading_tests", "used": 2, "limit": 2}'::jsonb, 'the third is refused');
select is((select array_agg(raw_score order by created_at, raw_score) from public.test_attempts
           where user_id = '4b000000-0000-0000-0000-000000000001'), array[5, 12]::smallint[],
  'only the two allowed attempts were saved');

-- M4-F4: the results are kept with the attempt, and only its owner reads them.
insert into auth.users (id, email) values ('4b000000-0000-0000-0000-000000000003', 'gold@prepora.test');
insert into public.profiles (id, role, plan) values ('4b000000-0000-0000-0000-000000000003', 'user', 'gold')
on conflict (id) do update set plan = excluded.plan;
create temp table r as select public.record_test_attempt('4b000000-0000-0000-0000-000000000003', 'reading',
  '5eed0000-0000-4000-8000-00000000000a', '{"1": "true"}', 1, 9, 60,
  '[{"q_no": 1, "correct": true, "correct_answer": "true", "explanation": "Para A."}]') as j;
grant select on r to authenticated;
select throws_ok($$ select public.record_test_attempt('4b000000-0000-0000-0000-000000000003', 'reading',
  '5eed0000-0000-4000-8000-00000000000a', '{}', 0, 0, null, '{"not": "a list"}') $$, '23514', null,
  'results must be a list');
set local role authenticated;
select pg_temp.sign_in('4b000000-0000-0000-0000-000000000003');
select is((select results -> 0 ->> 'explanation' from public.test_attempts where id = (select (j ->> 'attempt_id')::uuid from r)),
  'Para A.', 'the owner reads the saved results');
select pg_temp.sign_in('4b000000-0000-0000-0000-000000000001');
select is((select count(*)::int from public.test_attempts where id = (select (j ->> 'attempt_id')::uuid from r)), 0,
  'another student can''t');
reset role;

select * from finish();
rollback;
