-- M7-C1 Speaking schema + RLS + speaking-audio bucket. Run: supabase test db
begin;
select plan(51);

insert into auth.users (id, email) values
  ('7c000000-0000-0000-0000-000000000001', 'free@prepora.test'),
  ('7c000000-0000-0000-0000-000000000002', 'other@prepora.test'),
  ('7c000000-0000-0000-0000-000000000003', 'editor@prepora.test');
insert into public.profiles (id, role, plan) values
  ('7c000000-0000-0000-0000-000000000001', 'user', 'free'),
  ('7c000000-0000-0000-0000-000000000002', 'user', 'gold'),
  ('7c000000-0000-0000-0000-000000000003', 'content_editor', 'free')
on conflict (id) do update set role = excluded.role, plan = excluded.plan;

-- ── Structure ───────────────────────────────────────────────────────────────────────────────
select has_table('public', t, t || ' exists') from unnest(array['speaking_topics', 'speaking_sessions', 'speaking_responses']) t;
select is((select bool_and(relrowsecurity) from pg_class where oid in
  ('public.speaking_topics'::regclass, 'public.speaking_sessions'::regclass, 'public.speaking_responses'::regclass)), true, 'RLS on all three');
select ok(not has_table_privilege('authenticated', 'public.speaking_responses', 'insert'), 'users can''t write responses');
select ok(has_column_privilege('authenticated', 'public.speaking_sessions', 'mode', 'insert'), 'users can start a session (mode)');
select ok(not has_column_privilege('authenticated', 'public.speaking_sessions', 'overall_band', 'insert'), 'but not set its band');
select ok(not has_table_privilege('authenticated', 'public.speaking_sessions', 'update'), 'nor update sessions');
select results_eq($$ select public, file_size_limit from storage.buckets where id = 'speaking-audio' $$,
  $$ values (false, 15728640::bigint) $$, 'private audio bucket, 15 MB');
select ok((select 'audio/webm' = any (allowed_mime_types) and 'audio/mp4' = any (allowed_mime_types) and not 'image/png' = any (allowed_mime_types)
  from storage.buckets where id = 'speaking-audio'), 'WebM (Chrome) and MP4 (Safari) recordings, no other types');

create function pg_temp.sign_in(p_id uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_id, 'role', 'authenticated')::text, true);
$$;

-- ── Topics (editor) ─────────────────────────────────────────────────────────────────────────
set local role authenticated;
select pg_temp.sign_in('7c000000-0000-0000-0000-000000000003');
select lives_ok($$
  insert into public.speaking_topics (id, part, title, cue_card_points) values
    ('7c100000-0000-0000-0000-000000000002', 2, 'Describe a place you like to visit',
     array['where it is', 'how often you go there', 'what you do there', 'and explain why you like it'])
$$, 'an editor writes a Part 2 cue card');
select lives_ok($$
  insert into public.speaking_topics (id, part, title, questions) values
    ('7c100000-0000-0000-0000-000000000001', 1, 'Hometown', array['Where is your hometown?', 'What do you like about it?']),
    ('7c100000-0000-0000-0000-000000000004', 1, 'Draft set', array['Do you like music?'])
$$, 'Part 1 question sets');
select lives_ok($$
  insert into public.speaking_topics (id, part, title, questions, parent_topic_id) values
    ('7c100000-0000-0000-0000-000000000003', 3, 'Tourism', array['Why do people travel?', 'Is tourism good for local people?'],
     '7c100000-0000-0000-0000-000000000002')
$$, 'a Part 3 discussion linked to the cue card');

select throws_ok($$ insert into public.speaking_topics (part, title, cue_card_points) values (2, 'One point', array['only this']) $$,
  '23514', null, 'a cue card needs 2–5 points');
select throws_ok($$ insert into public.speaking_topics (part, title, questions) values (2, 'Card with questions', array['x?']) $$,
  '23514', null, 'Part 2 has points, not questions');
select throws_ok($$ insert into public.speaking_topics (part, title, questions) values (3, 'Orphan', array['Why?']) $$,
  '23514', null, 'Part 3 must follow a cue card');
select throws_ok($$ insert into public.speaking_topics (part, title, questions, parent_topic_id)
  values (3, 'Wrong parent', array['Why?'], '7c100000-0000-0000-0000-000000000001') $$,
  '23514', 'a Part 3 discussion must follow a Part 2 cue card', 'and only a Part 2 card');
select throws_ok($$ insert into public.speaking_topics (part, title, questions) values (1, 'Blank', array['Why?', '']) $$,
  '23514', null, 'no blank questions');
select throws_ok($$ insert into public.speaking_topics (part, title, questions) values (4, 'Part 4', array['x?']) $$,
  '23514', null, 'there''s no Part 4');

select throws_ok($$ update public.speaking_topics set status = 'published' where id = '7c100000-0000-0000-0000-000000000003' $$,
  '23514', 'publish its Part 2 cue card first', 'Part 3 waits for its cue card');
select lives_ok($$
  update public.speaking_topics set status = 'published' where id in ('7c100000-0000-0000-0000-000000000001', '7c100000-0000-0000-0000-000000000002');
  update public.speaking_topics set status = 'published' where id = '7c100000-0000-0000-0000-000000000003'
$$, 'cue card first, then its discussion');
select is((select count(*)::int from public.speaking_topics where published_at is not null), 3, 'published_at set');
select is_empty($$ delete from public.speaking_topics where id = '7c100000-0000-0000-0000-000000000002' returning id $$,
  'published topics aren''t deleted');

-- ── Students: topics and sessions ───────────────────────────────────────────────────────────
select pg_temp.sign_in('7c000000-0000-0000-0000-000000000001');
select is((select count(*)::int from public.speaking_topics), 3, 'a student sees the 3 published topics, not the draft');
select throws_ok($$ insert into public.speaking_topics (part, title, questions) values (1, 'Mine', array['x?']) $$,
  '42501', null, 'a student can''t write topics');
select lives_ok($$ insert into public.speaking_sessions (id, user_id, mode) values
  ('7c200000-0000-0000-0000-000000000001', '7c000000-0000-0000-0000-000000000001', 'part2') $$, 'a student starts a Part 2 session');
select throws_ok($$ insert into public.speaking_sessions (user_id, mode) values ('7c000000-0000-0000-0000-000000000002', 'part2') $$,
  '42501', null, 'not for someone else');
select throws_ok($$ insert into public.speaking_sessions (user_id, mode, overall_band) values ('7c000000-0000-0000-0000-000000000001', 'part2', 9) $$,
  '42501', null, 'nor with a band');
select throws_ok($$ update public.speaking_sessions set part2_band = 9 $$, '42501', null, 'nor give themselves one later');
select is((select status::text from public.speaking_sessions where id = '7c200000-0000-0000-0000-000000000001'), 'in_progress', 'it starts in progress');
select throws_ok($$
  insert into public.speaking_responses (session_id, user_id, topic_id, part, transcript, scores, band)
  values ('7c200000-0000-0000-0000-000000000001', '7c000000-0000-0000-0000-000000000001', '7c100000-0000-0000-0000-000000000002', 2,
          'I like the beach.', '{"fc": 9, "lr": 9, "gra": 9, "pron": 9}', 9)
$$, '42501', null, 'a student can''t write their own band');
reset role;

-- ── Responses (as score-speaking writes them, service role) ─────────────────────────────────
insert into public.speaking_sessions (id, user_id, mode) values
  ('7c200000-0000-0000-0000-000000000002', '7c000000-0000-0000-0000-000000000002', 'full_test'),
  ('7c200000-0000-0000-0000-000000000003', '7c000000-0000-0000-0000-000000000002', 'part1');
select lives_ok($$
  insert into public.speaking_responses (id, session_id, user_id, topic_id, part, audio_paths, duration_sec, transcript, signals, scores, band, feedback, prompt_version)
  values ('7c300000-0000-0000-0000-000000000001', '7c200000-0000-0000-0000-000000000001', '7c000000-0000-0000-0000-000000000001',
          '7c100000-0000-0000-0000-000000000002', 2, array['7c000000-0000-0000-0000-000000000001/p2.webm'], 104,
          'Um, I really like the beach near my town.', '{"wpm": 118, "fillers": 1}', '{"fc": 6, "lr": 5.5, "gra": 6, "pron": 6.5}', 6,
          '{"detail": "summary", "summary": "Clear."}', 's2-v1')
$$, 'the service role saves a scored Part 2');
select throws_ok($$
  insert into public.speaking_responses (session_id, user_id, topic_id, part, transcript, scores, band)
  values ('7c200000-0000-0000-0000-000000000001', '7c000000-0000-0000-0000-000000000001', '7c100000-0000-0000-0000-000000000002', 2,
          'Again', '{"fc": 6, "lr": 6, "gra": 6, "pron": 6}', 6)
$$, '23505', null, 'one response per part of a session');
select throws_ok($$
  insert into public.speaking_responses (session_id, user_id, topic_id, part, transcript, scores, band)
  values ('7c200000-0000-0000-0000-000000000002', '7c000000-0000-0000-0000-000000000001', '7c100000-0000-0000-0000-000000000002', 2,
          'x', '{"fc": 6, "lr": 6, "gra": 6, "pron": 6}', 6)
$$, '23514', 'the response must belong to the session''s student', 'the response belongs to the session''s student');
select throws_ok($$
  insert into public.speaking_responses (session_id, user_id, topic_id, part, transcript, scores, band)
  values ('7c200000-0000-0000-0000-000000000003', '7c000000-0000-0000-0000-000000000002', '7c100000-0000-0000-0000-000000000002', 2,
          'x', '{"fc": 6, "lr": 6, "gra": 6, "pron": 6}', 6)
$$, '23514', 'a part1 session has no Part 2', 'a Part 1 session has no Part 2');
select throws_ok($$
  insert into public.speaking_responses (session_id, user_id, topic_id, part, transcript, scores, band)
  values ('7c200000-0000-0000-0000-000000000002', '7c000000-0000-0000-0000-000000000002', '7c100000-0000-0000-0000-000000000001', 2,
          'x', '{"fc": 6, "lr": 6, "gra": 6, "pron": 6}', 6)
$$, '23514', 'the topic is for Part 1, not Part 2', 'the topic must be for that part');
select lives_ok($$
  insert into public.speaking_responses (session_id, user_id, topic_id, part, audio_paths, transcript, scores, band)
  values ('7c200000-0000-0000-0000-000000000002', '7c000000-0000-0000-0000-000000000002', '7c100000-0000-0000-0000-000000000001', 1,
          array['7c000000-0000-0000-0000-000000000002/q1.m4a', '7c000000-0000-0000-0000-000000000002/q2.m4a'],
          'Q1… Q2…', '{"fc": 7, "lr": 7, "gra": 6.5, "pron": 7}', 7)
$$, 'a full test takes any part; Parts 1 and 3 have a recording per answer');
select throws_ok($$
  insert into public.speaking_responses (session_id, user_id, topic_id, part, transcript, scores, band)
  values ('7c200000-0000-0000-0000-000000000002', '7c000000-0000-0000-0000-000000000002', '7c100000-0000-0000-0000-000000000003', 3,
          'x', '{"fc": 6, "lr": 6, "gra": 6}', 6)
$$, '23514', null, 'scores need all four criteria');
select throws_ok($$
  insert into public.speaking_responses (session_id, user_id, topic_id, part, transcript, scores, band)
  values ('7c200000-0000-0000-0000-000000000002', '7c000000-0000-0000-0000-000000000002', '7c100000-0000-0000-0000-000000000003', 3,
          'x', '{"fc": 6, "lr": 6, "gra": 6, "pron": 6}', 6.2)
$$, '23514', null, 'the band is whole or half');
select throws_ok($$ update public.speaking_sessions set status = 'completed' where id = '7c200000-0000-0000-0000-000000000003' $$,
  '23514', null, 'a completed session has its completion time');
select lives_ok($$ update public.speaking_sessions set status = 'completed', completed_at = now(), part2_band = 6, overall_band = 6
  where id = '7c200000-0000-0000-0000-000000000001' $$, 'the service role completes a session with its bands');
select throws_ok($$ delete from public.speaking_topics where id = '7c100000-0000-0000-0000-000000000002' $$,
  '23503', null, 'a topic with responses (or a linked Part 3) can''t be deleted');

set local role authenticated;
select pg_temp.sign_in('7c000000-0000-0000-0000-000000000001');
select results_eq($$ select id from public.speaking_responses $$, $$ values ('7c300000-0000-0000-0000-000000000001'::uuid) $$,
  'a student reads only their own response');
select results_eq($$ select id from public.speaking_sessions $$, $$ values ('7c200000-0000-0000-0000-000000000001'::uuid) $$,
  'and only their own sessions');
select pg_temp.sign_in('7c000000-0000-0000-0000-000000000003');
select is((select count(*)::int from public.speaking_responses), 0, 'staff don''t read students'' answers');

-- ── speaking-audio: own folder, every plan ──────────────────────────────────────────────────
select set_config('storage.allow_delete_query', 'true', true);
select pg_temp.sign_in('7c000000-0000-0000-0000-000000000001');
select lives_ok($$ insert into storage.objects (bucket_id, name, owner) values
  ('speaking-audio', '7c000000-0000-0000-0000-000000000001/p2.webm', '7c000000-0000-0000-0000-000000000001') $$,
  'a Free student records into their folder');
select throws_ok($$ insert into storage.objects (bucket_id, name, owner) values
  ('speaking-audio', '7c000000-0000-0000-0000-000000000002/p2.webm', '7c000000-0000-0000-0000-000000000001') $$,
  '42501', null, 'not into someone else''s');
select is((select count(*)::int from storage.objects where bucket_id = 'speaking-audio'), 1, 'they see their recording');
select pg_temp.sign_in('7c000000-0000-0000-0000-000000000002');
select is((select count(*)::int from storage.objects where bucket_id = 'speaking-audio'), 0, 'another student sees none of it');
select is_empty($$ delete from storage.objects where bucket_id = 'speaking-audio' returning name $$, 'nor deletes it');
select pg_temp.sign_in('7c000000-0000-0000-0000-000000000001');
select isnt_empty($$ delete from storage.objects where bucket_id = 'speaking-audio' returning name $$, 'the owner deletes it');
reset role;

select * from finish();
rollback;
