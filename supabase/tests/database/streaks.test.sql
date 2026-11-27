-- Practice streaks: get_my_streak() counts days (in the student's time zone) with a scored
-- Reading/Listening test, Writing answer or Speaking part. Run: supabase test db
begin;
select plan(22);

insert into auth.users (id, email) values
  ('5e000000-0000-0000-0000-000000000001', 'streak@prepora.test'),
  ('5e000000-0000-0000-0000-000000000002', 'lapsed@prepora.test'),
  ('5e000000-0000-0000-0000-000000000003', 'new@prepora.test'),
  ('5e000000-0000-0000-0000-000000000004', 'midnight@prepora.test');
update public.profiles set timezone = 'Asia/Kolkata'
  where id in ('5e000000-0000-0000-0000-000000000001', '5e000000-0000-0000-0000-000000000004');

create function pg_temp.sign_in(p_id uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_id, 'role', 'authenticated')::text, true);
$$;
-- Noon, `days_ago` days before today, in time zone `tz`.
create function pg_temp.noon(tz text, days_ago integer) returns timestamptz language sql as $$
  select (((now() at time zone tz)::date - days_ago) + time '12:00') at time zone tz;
$$;
create function pg_temp.day(tz text, days_ago integer) returns text language sql as $$
  select to_char((now() at time zone tz)::date - days_ago, 'YYYY-MM-DD');
$$;
create function pg_temp.attempt(p_user uuid, p_at timestamptz) returns void language sql as $$
  insert into public.test_attempts (user_id, module, test_id, raw_score, band, created_at)
  values (p_user, 'reading', gen_random_uuid(), 30, 7, p_at);
$$;

-- Something to answer: a Writing task and a Speaking cue card.
insert into public.writing_tasks (id, task_no, test_type, title, prompt) values
  ('5e100000-0000-0000-0000-000000000001', 2, null, 'Remote work', 'Some people think…');
insert into public.speaking_topics (id, part, title, cue_card_points) values
  ('5e100000-0000-0000-0000-000000000002', 2, 'Describe a place', array['where it is', 'why you like it']);
insert into public.speaking_sessions (id, user_id, mode) values
  ('5e200000-0000-0000-0000-000000000001', '5e000000-0000-0000-0000-000000000001', 'part2');

-- Student 1 (Kolkata): today (2 tests: one day), yesterday (Writing), 2 days ago (Speaking) → 3;
-- an older run of 5 days (10–14 days ago) → longest 5.
select pg_temp.attempt('5e000000-0000-0000-0000-000000000001', pg_temp.noon('Asia/Kolkata', 0));
select pg_temp.attempt('5e000000-0000-0000-0000-000000000001', pg_temp.noon('Asia/Kolkata', 0) - interval '2 hours');
insert into public.writing_submissions (user_id, task_id, input_mode, text, word_count, scores, band, created_at)
values ('5e000000-0000-0000-0000-000000000001', '5e100000-0000-0000-0000-000000000001', 'typed', 'An essay.', 2,
        '{"ta": 6, "cc": 6, "lr": 6, "gra": 6}', 6, pg_temp.noon('Asia/Kolkata', 1));
insert into public.speaking_responses (session_id, user_id, topic_id, part, transcript, scores, band, created_at)
values ('5e200000-0000-0000-0000-000000000001', '5e000000-0000-0000-0000-000000000001', '5e100000-0000-0000-0000-000000000002', 2,
        'I like the beach.', '{"fc": 6, "lr": 6, "gra": 6, "pron": 6}', 6, pg_temp.noon('Asia/Kolkata', 2));
select pg_temp.attempt('5e000000-0000-0000-0000-000000000001', pg_temp.noon('Asia/Kolkata', d)) from generate_series(10, 14) d;

-- Student 2 (UTC): yesterday and the day before, not yet today → still 2. Plus one day long ago.
select pg_temp.attempt('5e000000-0000-0000-0000-000000000002', pg_temp.noon('UTC', d)) from unnest(array[1, 2, 40]) d;

-- Student 4 (Kolkata): one test at 00:30 today in Kolkata, which is still yesterday in UTC.
select pg_temp.attempt('5e000000-0000-0000-0000-000000000004',
  (((now() at time zone 'Asia/Kolkata')::date) + time '00:30') at time zone 'Asia/Kolkata');

-- ── Access ──────────────────────────────────────────────────────────────────────────────────
select ok(not has_function_privilege('anon', 'public.get_my_streak(integer)', 'execute'), 'anon cannot call get_my_streak');
select ok(has_function_privilege('authenticated', 'public.get_my_streak(integer)', 'execute'), 'signed-in users can');

set local role authenticated;
select set_config('request.jwt.claims', '', true);
select throws_ok('select public.get_my_streak()', '42501', 'sign in to see your streak', 'signed out: refused');

-- ── Student 1 ───────────────────────────────────────────────────────────────────────────────
select pg_temp.sign_in('5e000000-0000-0000-0000-000000000001');
select is((public.get_my_streak() ->> 'current')::int, 3, 'today + yesterday + the day before: 3 (tests, Writing and Speaking all count)');
select is((public.get_my_streak() ->> 'longest')::int, 5, 'the longest run ever: 5');
select is((public.get_my_streak() ->> 'practised_today')::boolean, true, 'practised today');
select is(public.get_my_streak() -> 'recent',
  jsonb_build_array(pg_temp.day('Asia/Kolkata', 2), pg_temp.day('Asia/Kolkata', 1), pg_temp.day('Asia/Kolkata', 0)),
  'recent: practice days of the last 7, oldest first, one per day');
select is((public.get_my_streak() ->> 'total_days')::int, 8, 'total_days: every practice day ever (3 + 5)');
select is(jsonb_array_length(public.get_my_streak(15) -> 'recent'), 8, 'get_my_streak(15): the older run (10–14 days ago) is inside the last 15 days');
select throws_ok('select public.get_my_streak(0)', '22023', 'p_days must be between 1 and 120', 'p_days 0: refused');
select throws_ok('select public.get_my_streak(121)', '22023', 'p_days must be between 1 and 120', 'p_days 121: refused');
select is(public.get_my_streak() ->> 'timezone', 'Asia/Kolkata', 'in the student''s time zone');
select is(public.get_my_streak() ->> 'today', pg_temp.day('Asia/Kolkata', 0), 'today is the student''s today');

-- ── Student 2: not yet today ────────────────────────────────────────────────────────────────
select pg_temp.sign_in('5e000000-0000-0000-0000-000000000002');
select results_eq(
  $$ select (s ->> 'current')::int, (s ->> 'longest')::int, (s ->> 'practised_today')::boolean, s ->> 'timezone'
     from public.get_my_streak() s $$,
  $$ values (2, 2, false, 'UTC') $$,
  'not practised yet today: the streak from yesterday still counts; no time zone → UTC'
);
select is(public.get_my_streak(84) -> 'recent', jsonb_build_array(pg_temp.day('UTC', 2), pg_temp.day('UTC', 1)),
  'get_my_streak(84): the 12-week calendar leaves out the day 40 days ago');
select is(jsonb_array_length(public.get_my_streak(120) -> 'recent'), 3, 'get_my_streak(120): includes it');

-- ── Student 3: nothing yet ──────────────────────────────────────────────────────────────────
select pg_temp.sign_in('5e000000-0000-0000-0000-000000000003');
select results_eq(
  $$ select (s ->> 'current')::int, (s ->> 'longest')::int, (s ->> 'total_days')::int, (s ->> 'practised_today')::boolean, s -> 'recent'
     from public.get_my_streak() s $$,
  $$ values (0, 0, 0, false, '[]'::jsonb) $$,
  'no practice: 0, 0, 0 days, nothing recent'
);

-- ── Student 4: days follow the time zone ────────────────────────────────────────────────────
select pg_temp.sign_in('5e000000-0000-0000-0000-000000000004');
select is(public.get_my_streak() -> 'recent', jsonb_build_array(pg_temp.day('Asia/Kolkata', 0)), '00:30 in Kolkata is today there');
reset role;
update public.profiles set timezone = 'UTC' where id = '5e000000-0000-0000-0000-000000000004';
set local role authenticated;
select is(public.get_my_streak() -> 'recent',
  jsonb_build_array(to_char((((now() at time zone 'Asia/Kolkata')::date) + time '00:30') at time zone 'Asia/Kolkata' at time zone 'UTC', 'YYYY-MM-DD')),
  'the same test counts on its UTC day once the student is on UTC');

-- ── A broken run ────────────────────────────────────────────────────────────────────────────
reset role;
-- Student 2's two-day run ends yesterday; move it back a day so it ended the day before yesterday.
update public.test_attempts set created_at = created_at - interval '1 day' where user_id = '5e000000-0000-0000-0000-000000000002';
set local role authenticated;
select pg_temp.sign_in('5e000000-0000-0000-0000-000000000002');
select is((public.get_my_streak() ->> 'current')::int, 0, 'a missed day (yesterday) ends the streak');
select is((public.get_my_streak() ->> 'longest')::int, 2, 'but the longest run is kept');

-- Someone else's practice never counts.
select pg_temp.sign_in('5e000000-0000-0000-0000-000000000003');
select is((public.get_my_streak() ->> 'longest')::int, 0, 'only the caller''s own practice counts');

select * from finish();
rollback;
