-- M5-C1 Listening schema + RLS. Run: supabase test db
begin;
select plan(42);

insert into auth.users (id, email) values
  ('5c000000-0000-0000-0000-000000000001', 'free@prepora.test'),
  ('5c000000-0000-0000-0000-000000000002', 'gold@prepora.test'),
  ('5c000000-0000-0000-0000-000000000003', 'editor@prepora.test');
insert into public.profiles (id, role, plan) values
  ('5c000000-0000-0000-0000-000000000001', 'user', 'free'),
  ('5c000000-0000-0000-0000-000000000002', 'user', 'gold'),
  ('5c000000-0000-0000-0000-000000000003', 'content_editor', 'free')
on conflict (id) do update set role = excluded.role, plan = excluded.plan;

-- ── Structure ───────────────────────────────────────────────────────────────────────────────
select has_table('public', t, t || ' exists') from unnest(array['listening_tests', 'listening_sections', 'listening_questions']) t;
select is((select bool_and(relrowsecurity) from pg_class where oid in
  ('public.listening_tests'::regclass, 'public.listening_sections'::regclass, 'public.listening_questions'::regclass)), true, 'RLS on all three');
select is((select count(*)::int from unnest(enum_range(null::public.listening_question_type))), 13, '13 question types');
select ok('map_labelling' = any(enum_range(null::public.listening_question_type)::text[])
  and 'diagram_labelling' = any(enum_range(null::public.listening_question_type)::text[]), 'including map and diagram labelling');
select ok(not has_column_privilege('authenticated', 'public.listening_questions', 'answer', 'select'), 'answer closed to users');
select ok(not has_column_privilege('authenticated', 'public.listening_questions', 'explanation', 'select'), 'explanation closed to users');
select ok(not has_column_privilege('authenticated', 'public.listening_sections', 'transcript', 'select'), 'transcript closed to users');
select ok(has_column_privilege('authenticated', 'public.listening_sections', 'audio_url', 'select'), 'audio URL readable');
select ok(not has_table_privilege('anon', 'public.listening_sections', 'select'), 'anon can''t read sections');

create function pg_temp.sign_in(p_id uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_id, 'role', 'authenticated')::text, true);
$$;

-- ── The editor builds two tests (one Free, one Gold) ────────────────────────────────────────
set local role authenticated;
select pg_temp.sign_in('5c000000-0000-0000-0000-000000000003');

select lives_ok($$
  insert into public.listening_tests (id, title, min_plan) values
    ('5c100000-0000-0000-0000-000000000001', 'Listening Test 1', 'free'),
    ('5c100000-0000-0000-0000-000000000002', 'Listening Test (Gold)', 'gold')
$$, 'an editor creates tests');
select lives_ok($$
  insert into public.listening_sections (id, test_id, order_no, title)
  select ('5c2' || t.n || '0000-0000-0000-0000-00000000000' || s)::uuid, ('5c100000-0000-0000-0000-00000000000' || t.n)::uuid, s, 'Part ' || s
  from (values (1), (2)) t(n), generate_series(1, 4) s
$$, 'an editor adds 4 sections to each (audio not uploaded yet)');
select throws_ok($$
  insert into public.listening_sections (test_id, order_no, title) values ('5c100000-0000-0000-0000-000000000001', 5, 'Fifth')
$$, '23514', null, 'a 5th section is refused');
select throws_ok($$
  update public.listening_sections set audio_url = 'javascript:alert(1)' where id = '5c210000-0000-0000-0000-000000000001'
$$, '23514', null, 'audio must be an http(s) URL');

select lives_ok($$
  insert into public.listening_questions (test_id, section_id, q_no, q_type, prompt, options, answer, explanation) values
    ('5c100000-0000-0000-0000-000000000001', '5c210000-0000-0000-0000-000000000001', 1, 'note_table_completion', 'Cost: £___',
     '{"max_words": 1, "number_allowed": true}', '{"accept": ["25"]}', 'The speaker says twenty-five pounds.'),
    ('5c100000-0000-0000-0000-000000000001', '5c210000-0000-0000-0000-000000000001', 2, 'map_labelling', 'Library',
     '{"image_url": "https://cdn.example.com/map.png", "image_alt": "Campus", "locations": [{"label": "A", "x": 1, "y": 2}, {"label": "B", "x": 3, "y": 4}]}',
     '{"label": "B"}', 'Next to the car park.'),
    ('5c100000-0000-0000-0000-000000000001', '5c210000-0000-0000-0000-000000000002', 11, 'tfng', 'The tour is free.', '{}', '{"value": "false"}', null),
    ('5c100000-0000-0000-0000-000000000002', '5c220000-0000-0000-0000-000000000001', 1, 'diagram_labelling', 'Pump',
     '{"image_url": "https://cdn.example.com/d.png", "image_alt": "Pump", "marker": {"x": 5, "y": 5}, "max_words": 2}', '{"accept": ["valve"]}', null)
$$, 'an editor adds questions, labelling included');
select throws_ok($$
  insert into public.listening_questions (test_id, section_id, q_no, q_type, prompt, answer)
  values ('5c100000-0000-0000-0000-000000000001', '5c210000-0000-0000-0000-000000000001', 12, 'tfng', 'Wrong part', '{}')
$$, '23514', 'question 12 doesn''t belong in section 1 (questions 1 to 10)', 'section 1 holds questions 1–10 only');
select throws_ok($$
  update public.listening_questions set q_no = 3 where test_id = '5c100000-0000-0000-0000-000000000001' and q_no = 11
$$, '23514', 'question 3 doesn''t belong in section 2 (questions 11 to 20)', 'renumbering out of its section is refused too');
select throws_ok($$
  insert into public.listening_questions (test_id, section_id, q_no, q_type, prompt, answer)
  values ('5c100000-0000-0000-0000-000000000001', '5c210000-0000-0000-0000-000000000003', 21, 'mcq', 'Dup? no: a free number', '{}'),
         ('5c100000-0000-0000-0000-000000000001', '5c210000-0000-0000-0000-000000000003', 21, 'mcq', 'Dup', '{}')
$$, '23505', null, 'question numbers are unique within a test');
select throws_ok($$
  insert into public.listening_questions (test_id, section_id, q_no, q_type, prompt, answer)
  values ('5c100000-0000-0000-0000-000000000001', '5c220000-0000-0000-0000-000000000001', 3, 'mcq', 'Other test', '{}')
$$, '23503', null, 'a question can''t join a section of another test');
select throws_ok($$
  insert into public.listening_questions (test_id, section_id, q_no, q_type, prompt, answer)
  values ('5c100000-0000-0000-0000-000000000001', '5c210000-0000-0000-0000-000000000004', 41, 'mcq', 'Too many', '{}')
$$, '23514', null, 'question 41 is refused');

-- ── Publishing ──────────────────────────────────────────────────────────────────────────────
select throws_ok($$
  update public.listening_tests set status = 'published' where id = '5c100000-0000-0000-0000-000000000001'
$$, '23514', 'every section needs its audio and transcript to publish (4 missing)', 'no audio yet: not publishable');
select lives_ok($$
  update public.listening_sections
  set audio_url = 'https://audio.prepora.test/' || id || '.mp3', duration_sec = 300, transcript = 'Transcript of ' || title
$$, 'the editor uploads audio and writes transcripts');
select throws_ok($$
  update public.listening_tests set status = 'published' where id = '5c100000-0000-0000-0000-000000000001'
$$, '23514', 'questions must be numbered 1 to N without gaps to publish (3 questions, highest 11)', 'a gap blocks publishing');
select lives_ok($$
  delete from public.listening_questions where test_id = '5c100000-0000-0000-0000-000000000001' and q_no = 11
$$, 'the editor removes the gap');
select lives_ok($$
  update public.listening_tests set status = 'published' where id in ('5c100000-0000-0000-0000-000000000001', '5c100000-0000-0000-0000-000000000002')
$$, 'complete tests are published');
select isnt((select published_at from public.listening_tests where id = '5c100000-0000-0000-0000-000000000001'), null, 'published_at is set');
delete from public.listening_tests where id = '5c100000-0000-0000-0000-000000000001';
select is((select count(*)::int from public.listening_tests where id = '5c100000-0000-0000-0000-000000000001'), 1,
  'a published test can''t be deleted');

-- ── A Free student ──────────────────────────────────────────────────────────────────────────
select pg_temp.sign_in('5c000000-0000-0000-0000-000000000001');
select results_eq($$ select title from public.listening_tests where id::text like '5c1%' order by title $$,
  array['Listening Test (Gold)', 'Listening Test 1'], 'the list shows published tests, Gold included (to upsell)');
select is((select count(*)::int from public.listening_sections where test_id = '5c100000-0000-0000-0000-000000000001'), 4,
  'reads the Free test''s sections');
select ok((select audio_url from public.listening_sections where id = '5c210000-0000-0000-0000-000000000001') like 'https://%',
  'with their audio');
select throws_ok($$ select transcript from public.listening_sections $$, '42501', null, 'but not the transcript');
select throws_ok($$ select * from public.listening_sections $$, '42501', null, 'nor select *');
select is((select options ->> 'image_alt' from public.listening_questions where test_id = '5c100000-0000-0000-0000-000000000001' and q_no = 2),
  'Campus', 'reads a question with its map');
select throws_ok($$ select answer from public.listening_questions $$, '42501', null, 'not the answer');
select throws_ok($$ select explanation from public.listening_questions $$, '42501', null, 'not the explanation');
select is((select count(*)::int from public.listening_sections where test_id = '5c100000-0000-0000-0000-000000000002'), 0,
  'Gold sections are hidden from Free');
update public.listening_tests set title = 'Hacked';
select is((select count(*)::int from public.listening_tests where title = 'Hacked'), 0, 'students can''t edit tests');

-- A Gold student reads the Gold test; archiving hides it.
select pg_temp.sign_in('5c000000-0000-0000-0000-000000000002');
select is((select count(*)::int from public.listening_questions where test_id = '5c100000-0000-0000-0000-000000000002'), 1,
  'Gold reads the Gold test');
reset role;
update public.listening_tests set status = 'archived' where id = '5c100000-0000-0000-0000-000000000002';
set local role authenticated;
select pg_temp.sign_in('5c000000-0000-0000-0000-000000000002');
select is((select count(*)::int from public.listening_questions where test_id = '5c100000-0000-0000-0000-000000000002'), 0,
  'an archived test disappears');

-- Signed out: the list only.
reset role;
set local role anon;
select is((select count(*)::int from public.listening_tests where id::text like '5c1%'), 1, 'anon sees the published list');
select throws_ok($$ select id from public.listening_questions $$, '42501', null, 'anon can''t read questions');

reset role;
select * from finish();
rollback;
