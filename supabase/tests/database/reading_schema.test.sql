-- M4-C1: Reading tables, test_attempts, RLS and the hidden answer key. Run: supabase test db
begin;
select plan(49);

insert into auth.users (id, email) values
  ('4e000000-0000-0000-0000-000000000001', 'editor@prepora.test'),
  ('4e000000-0000-0000-0000-000000000002', 'free@prepora.test'),
  ('4e000000-0000-0000-0000-000000000003', 'gold@prepora.test'),
  ('4e000000-0000-0000-0000-000000000004', 'admin@prepora.test');
insert into public.profiles (id, full_name, role, plan) values
  ('4e000000-0000-0000-0000-000000000001', 'Ed Itor', 'content_editor', 'free'),
  ('4e000000-0000-0000-0000-000000000002', 'Free Student', 'user', 'free'),
  ('4e000000-0000-0000-0000-000000000003', 'Gold Student', 'user', 'gold'),
  ('4e000000-0000-0000-0000-000000000004', 'Admin Boss', 'admin', 'free')
on conflict (id) do update set role = excluded.role, plan = excluded.plan;

-- ── Structure and privileges ──
select has_table('public', t, t || ' exists')
from unnest(array['reading_tests', 'reading_passages', 'reading_questions', 'test_attempts']) t;
select enum_has_labels('public', 'reading_question_type', array['mcq', 'tfng', 'ynng', 'matching_headings',
  'matching_information', 'matching_features', 'sentence_completion', 'summary_completion',
  'note_table_completion', 'flowchart_completion', 'short_answer'], 'the 11 Reading question types');
select column_privs_are('public', 'reading_questions', 'answer', 'authenticated', array['INSERT', 'UPDATE'],
  'signed-in users can never SELECT the answer key (staff write it)');
select column_privs_are('public', 'reading_questions', 'explanation', 'authenticated', array['INSERT', 'UPDATE'],
  'nor the explanation');
select column_privs_are('public', 'reading_questions', 'answer', 'anon', array[]::text[], 'anon: nothing on the answer key');
select table_privs_are('public', 'reading_passages', 'anon', array[]::text[], 'anon can''t read passages');
select table_privs_are('public', 'test_attempts', 'authenticated', array['SELECT'], 'users only read attempts');
select table_privs_are('public', 'test_attempts', 'anon', array[]::text[], 'anon: nothing on attempts');

create function pg_temp.sign_in(p_id uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_id, 'role', 'authenticated')::text, true);
$$;

-- Rows changed by a statement, run as the current role (RLS hides rows rather than erroring).
create function pg_temp.affected(p_sql text) returns integer language plpgsql as $$
declare n integer;
begin
  execute p_sql;
  get diagnostics n = row_count;
  return n;
end;
$$;

-- ── A content editor builds a test ──
set local role authenticated;
select pg_temp.sign_in('4e000000-0000-0000-0000-000000000001');

select lives_ok($$
  insert into public.reading_tests (id, test_type, title, min_plan)
  values ('4e100000-0000-0000-0000-000000000001', 'academic', 'Academic Test 1', 'free'),
         ('4e100000-0000-0000-0000-000000000002', 'general', 'General Test (Gold)', 'gold'),
         ('4e100000-0000-0000-0000-000000000003', 'academic', 'Unfinished draft', 'free')
$$, 'an editor creates draft tests');

select throws_ok($$
  update public.reading_tests set status = 'published' where id = '4e100000-0000-0000-0000-000000000001'
$$, '23514', 'a Reading test needs 3 passages to be published (it has 0)', 'an empty test can''t be published');

select lives_ok($$
  insert into public.reading_passages (id, test_id, order_no, title, body)
  select ('4e2' || t.n || '0000-0000-0000-0000-00000000000' || p)::uuid, ('4e100000-0000-0000-0000-00000000000' || t.n)::uuid,
         p, 'Passage ' || p, 'Text of passage ' || p
  from (values (1), (2)) t(n), generate_series(1, 3) p
$$, 'an editor adds 3 passages to two tests');

select throws_ok($$
  insert into public.reading_passages (test_id, order_no, title, body)
  values ('4e100000-0000-0000-0000-000000000001', 4, 'Fourth', 'x')
$$, '23514', null, 'a 4th passage is refused');

select lives_ok($$
  insert into public.reading_questions (test_id, passage_id, q_no, q_type, prompt, options, answer, explanation)
  values
    ('4e100000-0000-0000-0000-000000000001', '4e210000-0000-0000-0000-000000000001', 1, 'tfng', 'The sky is green.', '{}', '"false"', 'Para 1 says blue.'),
    ('4e100000-0000-0000-0000-000000000001', '4e210000-0000-0000-0000-000000000002', 2, 'mcq', 'Pick one', '{"choices": ["A", "B"]}', '"B"', 'Para 2.'),
    ('4e100000-0000-0000-0000-000000000002', '4e220000-0000-0000-0000-000000000001', 1, 'short_answer', 'Who?', '{"max_words": 2}', '["the mayor"]', null)
$$, 'an editor adds questions with answer keys');

select throws_ok($$
  insert into public.reading_questions (test_id, passage_id, q_no, q_type, prompt, answer)
  values ('4e100000-0000-0000-0000-000000000001', '4e210000-0000-0000-0000-000000000003', 2, 'mcq', 'Dup', '"A"')
$$, '23505', null, 'question numbers are unique across a test''s passages');
select throws_ok($$
  insert into public.reading_questions (test_id, passage_id, q_no, q_type, prompt, answer)
  values ('4e100000-0000-0000-0000-000000000001', '4e220000-0000-0000-0000-000000000001', 9, 'mcq', 'Wrong test', '"A"')
$$, '23503', null, 'a question can''t join a passage of another test');
select throws_ok($$
  insert into public.reading_questions (test_id, passage_id, q_no, q_type, prompt, answer)
  values ('4e100000-0000-0000-0000-000000000001', '4e210000-0000-0000-0000-000000000003', 41, 'mcq', 'Too many', '"A"')
$$, '23514', null, 'question 41 is refused');

-- Publishing: gaps refused, then complete.
select lives_ok($$
  insert into public.reading_questions (test_id, passage_id, q_no, q_type, prompt, answer)
  values ('4e100000-0000-0000-0000-000000000001', '4e210000-0000-0000-0000-000000000003', 4, 'short_answer', 'Gap', '["x"]')
$$, 'question 4 without a 3');
select throws_ok($$
  update public.reading_tests set status = 'published' where id = '4e100000-0000-0000-0000-000000000001'
$$, '23514', 'questions must be numbered 1 to N without gaps to publish (3 questions, highest 4)', 'a gap blocks publishing');
select lives_ok($$
  update public.reading_questions set q_no = 3 where test_id = '4e100000-0000-0000-0000-000000000001' and q_no = 4
$$, 'the editor renumbers (an update without reading the answer)');
select lives_ok($$
  update public.reading_tests set status = 'published' where id in ('4e100000-0000-0000-0000-000000000001', '4e100000-0000-0000-0000-000000000002')
$$, 'complete tests are published');
select isnt((select published_at from public.reading_tests where id = '4e100000-0000-0000-0000-000000000001'), null,
  'published_at is set');

select throws_ok($$ select answer from public.reading_questions $$, '42501', null, 'even staff can''t select answers directly');
select is((select count(*)::int from public.reading_tests where id::text like '4e1%'), 3, 'staff see drafts too');

select is(pg_temp.affected($$delete from public.reading_tests where id = '4e100000-0000-0000-0000-000000000001'$$),
  0, 'a published test can''t be deleted');
select is(pg_temp.affected($$delete from public.reading_tests where id = '4e100000-0000-0000-0000-000000000003'$$),
  1, 'a draft can');

-- ── A Free student ──
select pg_temp.sign_in('4e000000-0000-0000-0000-000000000002');
select is((select array_agg(title order by title) from public.reading_tests where id::text like '4e1%'),
  array['Academic Test 1', 'General Test (Gold)'], 'the list shows published tests, Gold included (to upsell)');
select is((select count(*)::int from public.reading_passages where test_id = '4e100000-0000-0000-0000-000000000001'), 3,
  'passages of a Free test');
select is((select count(*)::int from public.reading_questions where test_id = '4e100000-0000-0000-0000-000000000001'), 3,
  'its questions');
select is((select prompt from public.reading_questions where test_id = '4e100000-0000-0000-0000-000000000001' and q_no = 2), 'Pick one',
  'prompt and options are readable');
select throws_ok($$ select answer from public.reading_questions $$, '42501', null, 'the answer key is not');
select throws_ok($$ select explanation from public.reading_questions $$, '42501', null, 'nor the explanation');
select throws_ok($$ select * from public.reading_questions $$, '42501', null, 'select * fails rather than leaking it');
select is((select count(*)::int from public.reading_passages where test_id = '4e100000-0000-0000-0000-000000000002'), 0,
  'no passages of a Gold test on Free');
select is((select count(*)::int from public.reading_questions where test_id = '4e100000-0000-0000-0000-000000000002'), 0,
  'nor its questions');

select throws_ok($$ insert into public.reading_tests (test_type, title) values ('academic', 'Mine') $$, '42501', null,
  'a student can''t create tests');
select is(pg_temp.affected($$update public.reading_tests set title = 'Hacked'$$), 0,
  'nor change them');
select is(pg_temp.affected($$update public.reading_questions set prompt = 'Hacked'$$), 0,
  'nor questions');
select throws_ok($$
  insert into public.test_attempts (user_id, module, test_id, raw_score, band)
  values ('4e000000-0000-0000-0000-000000000002', 'reading', '4e100000-0000-0000-0000-000000000001', 40, 9)
$$, '42501', null, 'a student can''t write their own score');

-- ── A Gold student ──
select pg_temp.sign_in('4e000000-0000-0000-0000-000000000003');
select is((select count(*)::int from public.reading_passages where test_id = '4e100000-0000-0000-0000-000000000002'), 3,
  'Gold reads the Gold test');
select is((select count(*)::int from public.reading_passages where test_id = '4e100000-0000-0000-0000-000000000001'), 3,
  'and Free tests');

-- An unpublished test disappears for students again.
select pg_temp.sign_in('4e000000-0000-0000-0000-000000000004');
update public.reading_tests set status = 'archived' where id = '4e100000-0000-0000-0000-000000000002';
select pg_temp.sign_in('4e000000-0000-0000-0000-000000000003');
select is((select count(*)::int from public.reading_passages where test_id = '4e100000-0000-0000-0000-000000000002'), 0,
  'an archived test''s passages are hidden');

-- ── Signed out ──
reset role;
set local role anon;
select is((select count(*)::int from public.reading_tests where id::text like '4e1%'), 1, 'anon sees the published list');
select throws_ok($$ select id from public.reading_questions $$, '42501', null, 'anon can''t read questions');

-- ── test_attempts (written by the service role) ──
reset role;
insert into public.test_attempts (user_id, module, test_id, answers, raw_score, band, time_taken_sec) values
  ('4e000000-0000-0000-0000-000000000002', 'reading', '4e100000-0000-0000-0000-000000000001', '{"1": "false"}', 30, 7, 3500),
  ('4e000000-0000-0000-0000-000000000003', 'reading', '4e100000-0000-0000-0000-000000000001', '{}', 20, 5.5, 3600);
select throws_ok($$
  insert into public.test_attempts (user_id, module, test_id, raw_score, band)
  values ('4e000000-0000-0000-0000-000000000002', 'reading', '4e100000-0000-0000-0000-000000000001', 20, 6.3)
$$, '23514', null, 'bands are whole or half');
select throws_ok($$
  insert into public.test_attempts (user_id, module, test_id, raw_score, band)
  values ('4e000000-0000-0000-0000-000000000002', 'reading', '4e100000-0000-0000-0000-000000000001', 41, 9)
$$, '23514', null, 'raw score is at most 40');

set local role authenticated;
select pg_temp.sign_in('4e000000-0000-0000-0000-000000000002');
select is((select array_agg(band) from public.test_attempts), array[7.0::numeric], 'a student reads only their own attempts');

select * from finish();
rollback;
