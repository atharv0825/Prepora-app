-- get_listening_attempt: reopen your own Listening attempt with its transcripts. Run: supabase test db
begin;
select plan(9);

insert into auth.users (id, email) values
  ('5e000000-0000-0000-0000-000000000001', 'owner@prepora.test'),
  ('5e000000-0000-0000-0000-000000000002', 'other@prepora.test');
insert into public.profiles (id, role, plan) values
  ('5e000000-0000-0000-0000-000000000001', 'user', 'free'),
  ('5e000000-0000-0000-0000-000000000002', 'user', 'free')
on conflict (id) do update set role = excluded.role, plan = excluded.plan;

insert into public.listening_tests (id, title) values ('5e100000-0000-0000-0000-000000000001', 'Home test');
insert into public.listening_sections (test_id, order_no, title, audio_url, transcript)
select '5e100000-0000-0000-0000-000000000001', n, 'Part ' || n, 'https://audio.prepora.test/' || n || '.mp3', 'SECRET transcript ' || n
from generate_series(1, 4) n;
insert into public.test_attempts (id, user_id, module, test_id, raw_score, band, mode, results) values
  ('5e200000-0000-0000-0000-000000000001', '5e000000-0000-0000-0000-000000000001', 'listening', '5e100000-0000-0000-0000-000000000001',
   1, 4.5, 'exam', '[{"q_no": 1, "correct": true}]'),
  ('5e200000-0000-0000-0000-000000000002', '5e000000-0000-0000-0000-000000000001', 'reading', '5eed0000-0000-4000-8000-00000000000a',
   10, 5, null, null);

select function_privs_are('public', 'get_listening_attempt', array['uuid'], 'anon', array[]::text[], 'anon can''t call it');
select is((select prosecdef from pg_proc where proname = 'get_listening_attempt'), true, 'definer, to read the transcripts');

create function pg_temp.sign_in(p_id uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_id, 'role', 'authenticated')::text, true);
$$;

set local role authenticated;
select pg_temp.sign_in('5e000000-0000-0000-0000-000000000001');
create temp table a as select public.get_listening_attempt('5e200000-0000-0000-0000-000000000001') as j;
select is((select j -> 'attempt' ->> 'mode' from a), 'exam', 'the owner gets the attempt with its mode');
select is((select j -> 'test' ->> 'title' from a), 'Home test', 'the test''s title');
select is((select j -> 'transcripts' -> 2 ->> 'transcript' from a), 'SECRET transcript 3', 'and the transcripts, in order');
select throws_ok($$ select public.get_listening_attempt('5e200000-0000-0000-0000-000000000002') $$, 'PT404', 'attempt not found',
  'a Reading attempt isn''t one');
-- Still no direct access to transcripts.
select throws_ok($$ select transcript from public.listening_sections $$, '42501', null, 'transcripts stay closed otherwise');

select pg_temp.sign_in('5e000000-0000-0000-0000-000000000002');
select throws_ok($$ select public.get_listening_attempt('5e200000-0000-0000-0000-000000000001') $$, 'PT404', 'attempt not found',
  'another student gets 404, not the transcripts');

-- A deleted test: the attempt still opens, without a title or transcripts.
reset role;
delete from public.listening_tests where id = '5e100000-0000-0000-0000-000000000001';
set local role authenticated;
select pg_temp.sign_in('5e000000-0000-0000-0000-000000000001');
select is((select public.get_listening_attempt('5e200000-0000-0000-0000-000000000001') - 'attempt'),
  '{"test": null, "transcripts": []}'::jsonb, 'after the test is deleted: the attempt, no test, no transcripts');

reset role;
select * from finish();
rollback;
