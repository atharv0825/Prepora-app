-- Reading builder import: admin_import_reading_content() saves passages and questions in one
-- transaction (append / replace), staff only, renumbered in passage order. Run: supabase test db
begin;
select plan(15);

insert into auth.users (id, email) values
  ('1e000000-0000-0000-0000-000000000001', 'editor@prepora.test'),
  ('1e000000-0000-0000-0000-000000000002', 'student@prepora.test');
update public.profiles set role = 'content_editor' where id = '1e000000-0000-0000-0000-000000000001';

insert into public.reading_tests (id, title, test_type, min_plan, source, status)
values ('1e100000-0000-0000-0000-000000000001', 'Import test', 'academic', 'free', 'admin', 'draft');

create function pg_temp.sign_in(p_id uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_id, 'role', 'authenticated')::text, true);
$$;
create function pg_temp.tfng(p_passage integer, p_prompt text) returns jsonb language sql as $$
  select jsonb_build_object('passage_order_no', p_passage, 'q_type', 'tfng', 'prompt', p_prompt, 'options', '{}'::jsonb,
                            'answer', '{"value": "true"}'::jsonb, 'explanation', 'Because.');
$$;
create function pg_temp.numbered() returns text language sql as $$
  select string_agg(p.order_no || ':' || q.prompt, ' ' order by q.q_no)
  from public.reading_questions q join public.reading_passages p on p.id = q.passage_id
  where q.test_id = '1e100000-0000-0000-0000-000000000001';
$$;

set local role authenticated;

-- ── Only staff ──────────────────────────────────────────────────────────────────────────────
select pg_temp.sign_in('1e000000-0000-0000-0000-000000000002');
select throws_ok(
  $$ select public.admin_import_reading_content('1e100000-0000-0000-0000-000000000001', 'append', '[]', '[]') $$,
  '42501', 'only admins and content editors can import', 'a student can''t import');
select ok(not has_function_privilege('anon', 'public.admin_import_reading_content(uuid, text, jsonb, jsonb)', 'execute'), 'anon can''t call it');

select pg_temp.sign_in('1e000000-0000-0000-0000-000000000001');
select throws_ok(
  $$ select public.admin_import_reading_content('1e100000-0000-0000-0000-000000000001', 'merge', '[]', '[]') $$,
  '22023', 'choose append or replace', 'the mode must be append or replace');

-- ── First import: passages 1 and 2, questions for both ──────────────────────────────────────
select is(
  public.admin_import_reading_content('1e100000-0000-0000-0000-000000000001', 'append',
    '[{"order_no": 1, "title": "One", "body": "A  First."}, {"order_no": 2, "title": "Two", "body": "A  Second."}]',
    jsonb_build_array(pg_temp.tfng(1, 'p1 a'), pg_temp.tfng(1, 'p1 b'), pg_temp.tfng(2, 'p2 a'))) - 'questions_total',
  '{"passages_created": 2, "passages_replaced": 0, "passages_kept": 0, "questions_imported": 3}'::jsonb,
  'creates 2 passages and 3 questions');
select is(pg_temp.numbered(), '1:p1 a 1:p1 b 2:p2 a', 'numbered 1..3 in passage order');
-- Keys and explanations aren't readable directly, even by staff: through the builder's RPC.
select is(
  (select q ->> 'explanation' from jsonb_array_elements(public.admin_get_reading_test('1e100000-0000-0000-0000-000000000001') -> 'questions') q
   where q ->> 'prompt' = 'p1 a'),
  'Because.', 'the explanation is saved (read back as the builder does)');

-- ── Append: a new passage 3, more questions for passage 1; passage 1's text is kept ─────────
select is(
  public.admin_import_reading_content('1e100000-0000-0000-0000-000000000001', 'append',
    '[{"order_no": 1, "title": "Changed", "body": "A  Changed."}, {"order_no": 3, "title": "Three", "body": "A  Third."}]',
    jsonb_build_array(pg_temp.tfng(1, 'p1 c'), pg_temp.tfng(3, 'p3 a'))) ->> 'passages_kept',
  '1', 'append keeps an existing passage');
select is((select title from public.reading_passages where test_id = '1e100000-0000-0000-0000-000000000001' and order_no = 1), 'One', '… with its text unchanged');
select is(pg_temp.numbered(), '1:p1 a 1:p1 b 1:p1 c 2:p2 a 3:p3 a', 'appended questions go after their passage''s own; renumbered in passage order');

-- ── Replace: questions replaced, imported passage text replaces the slot ────────────────────
select is(
  public.admin_import_reading_content('1e100000-0000-0000-0000-000000000001', 'replace',
    '[{"order_no": 2, "title": "Two again", "body": "A  New second."}]',
    jsonb_build_array(pg_temp.tfng(2, 'new 1'), pg_temp.tfng(2, 'new 2'))) ->> 'questions_total',
  '2', 'replace removes the old questions');
select is(pg_temp.numbered(), '2:new 1 2:new 2', '… and numbers the new ones 1..2');
select is((select title from public.reading_passages where test_id = '1e100000-0000-0000-0000-000000000001' and order_no = 2), 'Two again', '… and replaces passage 2''s text');

-- ── Nothing is saved when one part fails ────────────────────────────────────────────────────
select throws_ok(
  $$ select public.admin_import_reading_content('1e100000-0000-0000-0000-000000000001', 'append', '[]',
       (select jsonb_agg(pg_temp.tfng(1, 'q' || n)) from generate_series(1, 39) n)) $$,
  '22023', 'a test has 40 questions at most (2 already, 39 imported)', 'more than 40 in total is refused');
select throws_ok(
  $$ select public.admin_import_reading_content('1e100000-0000-0000-0000-000000000001', 'append',
       '[{"order_no": 1, "title": "Fine", "body": "A  Fine."}]', jsonb_build_array(pg_temp.tfng(1, 'ok'), pg_temp.tfng(9, 'nowhere'))) $$,
  '22023', NULL, 'a question for a missing passage is refused');
select is(pg_temp.numbered(), '2:new 1 2:new 2', 'a failed import changes nothing');

select * from finish();
rollback;
