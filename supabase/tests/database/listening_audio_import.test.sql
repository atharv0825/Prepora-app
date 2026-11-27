-- Listening audio from the transcript (section audio fields, generation jobs) and "Import
-- questions" (admin_import_listening_questions). Run: supabase test db
begin;
select plan(28);

insert into auth.users (id, email) values
  ('4f200000-0000-0000-0000-000000000001', 'audio-editor@prepora.test'),
  ('4f200000-0000-0000-0000-000000000002', 'audio-student@prepora.test');
insert into public.profiles (id, full_name, role) values
  ('4f200000-0000-0000-0000-000000000001', 'Audio Editor', 'content_editor'),
  ('4f200000-0000-0000-0000-000000000002', 'Audio Student', 'user')
on conflict (id) do update set role = excluded.role;

insert into public.listening_tests (id, title) values ('4f200000-0000-0000-0000-0000000000a1', 'Audio test');
insert into public.listening_sections (id, test_id, order_no, title, transcript) values
  ('4f200000-0000-0000-0000-0000000000b1', '4f200000-0000-0000-0000-0000000000a1', 1, 'Booking', 'Man: Hello.'),
  ('4f200000-0000-0000-0000-0000000000b2', '4f200000-0000-0000-0000-0000000000a1', 2, 'Talk', 'Welcome.');

-- ── Structure and privileges ──
select has_column('public', 'listening_sections', c, 'listening_sections.' || c)
from unnest(array['audio_source', 'audio_hash', 'audio_chars', 'audio_generated_at', 'tts_voices']) c;
select ok(not has_column_privilege('authenticated', 'public.listening_sections', 'audio_hash', 'SELECT'), 'users can''t read the audio hash');
select ok(not has_column_privilege('authenticated', 'public.listening_sections', 'tts_voices', 'SELECT'), 'nor the voices');
select table_privs_are('public', 'listening_audio_jobs', 'authenticated', array['SELECT'], 'signed-in users can only read jobs (RLS: staff)');
select table_privs_are('public', 'listening_audio_jobs', 'anon', array[]::text[], 'anon: nothing on jobs');

-- ── The audio source follows the audio ──
update public.listening_sections set audio_url = 'https://audio.test/s1-upload.mp3' where id = '4f200000-0000-0000-0000-0000000000b1';
select is((select audio_source from public.listening_sections where id = '4f200000-0000-0000-0000-0000000000b1'), 'uploaded', 'a URL without a hash is an upload');

update public.listening_sections
set audio_url = 'https://audio.test/s1-gen.mp3', audio_source = 'generated', audio_hash = repeat('a', 64), audio_chars = 120, audio_generated_at = now()
where id = '4f200000-0000-0000-0000-0000000000b1';
select results_eq(
  $$ select audio_source, audio_hash, audio_chars from public.listening_sections where id = '4f200000-0000-0000-0000-0000000000b1' $$,
  $$ values ('generated'::text, repeat('a', 64), 120) $$,
  'generated audio keeps its hash and characters');

update public.listening_sections set audio_url = 'https://audio.test/s1-upload-2.mp3' where id = '4f200000-0000-0000-0000-0000000000b1';
select results_eq(
  $$ select audio_source, audio_hash, audio_chars from public.listening_sections where id = '4f200000-0000-0000-0000-0000000000b1' $$,
  $$ values ('uploaded'::text, null::text, null::integer) $$,
  'an upload replacing generated audio drops the hash');

update public.listening_sections set audio_url = null where id = '4f200000-0000-0000-0000-0000000000b1';
select is((select audio_source from public.listening_sections where id = '4f200000-0000-0000-0000-0000000000b1'), null, 'no audio, no source');

select throws_ok(
  $$ update public.listening_sections set audio_url = 'https://audio.test/x.mp3', audio_source = 'generated', audio_hash = 'nope' where id = '4f200000-0000-0000-0000-0000000000b2' $$,
  '23514', null, 'a hash is a SHA-256 hex');
select throws_ok(
  $$ update public.listening_sections set tts_voices = '["en-GB-Standard-A"]' where id = '4f200000-0000-0000-0000-0000000000b2' $$,
  '23514', null, 'voices are an object');

-- ── Jobs: one running per section; staff read, users don't ──
insert into public.listening_audio_jobs (test_id, section_id, order_no, chars, requests, audio_hash)
values ('4f200000-0000-0000-0000-0000000000a1', '4f200000-0000-0000-0000-0000000000b1', 1, 500, 4, repeat('b', 64));
select throws_ok(
  $$ insert into public.listening_audio_jobs (test_id, section_id, order_no, chars, requests, audio_hash)
     values ('4f200000-0000-0000-0000-0000000000a1', '4f200000-0000-0000-0000-0000000000b1', 1, 10, 1, repeat('c', 64)) $$,
  '23505', null, 'one running generation per section');
update public.listening_audio_jobs set status = 'succeeded' where section_id = '4f200000-0000-0000-0000-0000000000b1';
insert into public.listening_audio_jobs (test_id, section_id, order_no, chars, requests, audio_hash, status)
values ('4f200000-0000-0000-0000-0000000000a1', '4f200000-0000-0000-0000-0000000000b2', 2, 300, 1, repeat('d', 64), 'failed');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"4f200000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select is((select count(*) from public.listening_audio_jobs)::integer, 0, 'a student sees no jobs');
select throws_ok($$ insert into public.listening_audio_jobs (test_id, section_id, order_no, chars, requests, audio_hash)
  values ('4f200000-0000-0000-0000-0000000000a1', '4f200000-0000-0000-0000-0000000000b1', 1, 1, 1, repeat('e', 64)) $$,
  '42501', null, 'users can''t write jobs');
select throws_ok($$ select public.admin_import_listening_questions('4f200000-0000-0000-0000-0000000000a1', 1, 'append', '[]') $$,
  '42501', null, 'students can''t import');

select set_config('request.jwt.claims', '{"sub":"4f200000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select is((select count(*) from public.listening_audio_jobs where test_id = '4f200000-0000-0000-0000-0000000000a1')::integer, 2, 'staff read the jobs');
select is((public.admin_get_listening_test('4f200000-0000-0000-0000-0000000000a1') ->> 'tts_chars_used')::integer, 800, 'the loader adds up the test''s TTS characters (failed ones too)');
select ok((public.admin_get_listening_test('4f200000-0000-0000-0000-0000000000a1') -> 'sections' -> 0) ?& array['audio_source', 'audio_hash', 'tts_voices'], 'and returns the sections'' audio fields');

-- ── Import questions into a section ──
select is(
  public.admin_import_listening_questions('4f200000-0000-0000-0000-0000000000a1', 2, 'append', $$[
    {"q_type": "note_table_completion", "prompt": "Opens at ___", "options": {"max_words": 2, "number_allowed": true}, "answer": {"accept": ["9.30"]}, "explanation": ""},
    {"q_type": "map_labelling", "prompt": "Car park", "options": {}, "answer": {"label": "E"}, "explanation": "Next to the gate."}
  ]$$::jsonb),
  '{"questions_imported": 2, "section_total": 2, "test_total": 2}'::jsonb,
  'questions are imported into the section');
reset role; -- explanations are never readable by users (column grants): check as the owner
select results_eq(
  $$ select q_no, q_type::text, explanation, options from public.listening_questions where test_id = '4f200000-0000-0000-0000-0000000000a1' order by q_no $$,
  $$ values (11::smallint, 'note_table_completion', null::text, '{"max_words": 2, "number_allowed": true}'::jsonb), (12::smallint, 'map_labelling', 'Next to the gate.', '{}'::jsonb) $$,
  'numbered in the section (11, 12…), a map question saved without its picture');
set local role authenticated;

select is(
  (public.admin_import_listening_questions('4f200000-0000-0000-0000-0000000000a1', 2, 'append', $$[
    {"q_type": "short_answer", "prompt": "Who?", "options": {"max_words": 1, "number_allowed": false}, "answer": {"accept": ["Sam"]}}
  ]$$::jsonb) ->> 'section_total')::integer,
  3, 'append adds after the section''s own');
select is(
  (public.admin_import_listening_questions('4f200000-0000-0000-0000-0000000000a1', 2, 'replace', $$[
    {"q_type": "short_answer", "prompt": "Where?", "options": {"max_words": 1, "number_allowed": false}, "answer": {"accept": ["Leeds"]}}
  ]$$::jsonb) ->> 'section_total')::integer,
  1, 'replace keeps only the imported ones');
select throws_ok(
  $$ select public.admin_import_listening_questions('4f200000-0000-0000-0000-0000000000a1', 2, 'append',
       (select jsonb_agg(jsonb_build_object('q_type', 'short_answer', 'prompt', 'Q' || n, 'options', '{"max_words": 1}'::jsonb, 'answer', '{"accept": ["x"]}'::jsonb))
        from generate_series(1, 10) n)) $$,
  '22023', null, 'a section holds 10 questions at most');
select throws_ok(
  $$ select public.admin_import_listening_questions('4f200000-0000-0000-0000-0000000000a1', 3, 'append', '[]') $$,
  '22023', null, 'the section must exist');

reset role;
select * from finish();
rollback;
