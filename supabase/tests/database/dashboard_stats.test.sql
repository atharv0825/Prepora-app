-- Dashboard overview: get_my_dashboard() per-module counts and bands, and the last 14 days in
-- the student's time zone. Run: supabase test db
begin;
select plan(17);

insert into auth.users (id, email) values
  ('6d000000-0000-0000-0000-000000000001', 'busy@prepora.test'),
  ('6d000000-0000-0000-0000-000000000002', 'new@prepora.test'),
  ('6d000000-0000-0000-0000-000000000003', 'kolkata@prepora.test');
update public.profiles set timezone = 'Asia/Kolkata' where id = '6d000000-0000-0000-0000-000000000003';

create function pg_temp.sign_in(p_id uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_id, 'role', 'authenticated')::text, true);
$$;
-- Noon, `days_ago` days before today, in time zone `tz`; minus `minutes` to order rows within a day.
create function pg_temp.noon(tz text, days_ago integer, minutes integer default 0) returns timestamptz language sql as $$
  select (((now() at time zone tz)::date - days_ago) + time '12:00') at time zone tz - make_interval(mins => minutes);
$$;
create function pg_temp.attempt(p_user uuid, p_module public.test_module, p_band numeric, p_at timestamptz) returns void language sql as $$
  insert into public.test_attempts (user_id, module, test_id, raw_score, band, created_at)
  values (p_user, p_module, gen_random_uuid(), 30, p_band, p_at);
$$;

insert into public.writing_tasks (id, task_no, test_type, title, prompt) values
  ('6d100000-0000-0000-0000-000000000001', 2, null, 'Remote work', 'Some people think…');
insert into public.speaking_topics (id, part, title, cue_card_points) values
  ('6d100000-0000-0000-0000-000000000002', 2, 'Describe a place', array['where it is', 'why you like it']);
insert into public.speaking_sessions (id, user_id, mode) values
  ('6d200000-0000-0000-0000-000000000001', '6d000000-0000-0000-0000-000000000001', 'part2');

-- Student 1 (UTC). Reading: 6 attempts, oldest → newest bands 4, 5, 6, 6, 7, 7.5 (the oldest is
-- 20 days ago, outside the 14 days; the others are today and 8 days ago).
select pg_temp.attempt('6d000000-0000-0000-0000-000000000001', 'reading', 4, pg_temp.noon('UTC', 20));
select pg_temp.attempt('6d000000-0000-0000-0000-000000000001', 'reading', b, pg_temp.noon('UTC', 8, m))
  from (values (5, 3), (6, 2), (6, 1)) v(b, m);
select pg_temp.attempt('6d000000-0000-0000-0000-000000000001', 'reading', b, pg_temp.noon('UTC', 0, m))
  from (values (7, 2), (7.5, 1)) v(b, m);
-- Writing: one answer yesterday (6.5). Listening: none.
insert into public.writing_submissions (user_id, task_id, input_mode, text, word_count, scores, band, created_at)
values ('6d000000-0000-0000-0000-000000000001', '6d100000-0000-0000-0000-000000000001', 'typed', 'An essay.', 2,
        '{"ta": 6, "cc": 6, "lr": 7, "gra": 7}', 6.5, pg_temp.noon('UTC', 1));
-- Speaking: one part today (6).
insert into public.speaking_responses (session_id, user_id, topic_id, part, transcript, scores, band, created_at)
values ('6d200000-0000-0000-0000-000000000001', '6d000000-0000-0000-0000-000000000001', '6d100000-0000-0000-0000-000000000002', 2,
        'I like the beach.', '{"fc": 6, "lr": 6, "gra": 6, "pron": 6}', 6, pg_temp.noon('UTC', 0, 30));

-- Student 3 (Kolkata): one Listening test at 00:30 today in Kolkata (still yesterday in UTC).
select pg_temp.attempt('6d000000-0000-0000-0000-000000000003', 'listening', 6,
  (((now() at time zone 'Asia/Kolkata')::date) + time '00:30') at time zone 'Asia/Kolkata');

-- ── Access ──────────────────────────────────────────────────────────────────────────────────
select ok(not has_function_privilege('anon', 'public.get_my_dashboard()', 'execute'), 'anon cannot call get_my_dashboard');
select ok(has_function_privilege('authenticated', 'public.get_my_dashboard()', 'execute'), 'signed-in users can');
set local role authenticated;
select set_config('request.jwt.claims', '', true);
select throws_ok('select public.get_my_dashboard()', '42501', 'sign in to see your dashboard', 'signed out: refused');

-- ── Student 1: modules ──────────────────────────────────────────────────────────────────────
select pg_temp.sign_in('6d000000-0000-0000-0000-000000000001');
select is(
  (select jsonb_agg(m ->> 'module') from jsonb_array_elements(public.get_my_dashboard() -> 'modules') m),
  '["reading", "listening", "writing", "speaking"]'::jsonb,
  'all four modules, in exam order');
select results_eq(
  $$ select m ->> 'module', (m ->> 'count')::int, (m ->> 'latest_band')::numeric, (m ->> 'recent_band')::numeric
     from jsonb_array_elements(public.get_my_dashboard() -> 'modules') m $$,
  $$ values ('reading', 6, 7.5, 6.3), ('listening', 0, null, null), ('writing', 1, 6.5, 6.5), ('speaking', 1, 6.0, 6.0) $$,
  'counts every scored piece; latest band; recent = average of the last 5 (5, 6, 6, 7, 7.5 → 6.3)');

-- ── Student 1: days ─────────────────────────────────────────────────────────────────────────
select is(jsonb_array_length(public.get_my_dashboard() -> 'days'), 14, '14 days');
select is(public.get_my_dashboard() -> 'days' -> 0 ->> 'date', to_char(current_date - 13, 'YYYY-MM-DD'), 'oldest first: 13 days ago');
select is(public.get_my_dashboard() -> 'days' -> 13 ->> 'date', to_char(current_date, 'YYYY-MM-DD'), 'ends today');
select is((public.get_my_dashboard() -> 'days' -> 13 ->> 'count')::int, 3, 'today: 2 Reading tests + 1 Speaking part');
select is((public.get_my_dashboard() -> 'days' -> 13 ->> 'average_band')::numeric, 6.83, 'today''s average band (7, 7.5, 6)');
select is((public.get_my_dashboard() -> 'days' -> 12 ->> 'count')::int, 1, 'yesterday: the Writing answer');
select is((public.get_my_dashboard() -> 'days' -> 5 ->> 'count')::int, 3, '8 days ago: 3 Reading tests');
select is((public.get_my_dashboard() -> 'days' -> 6 ->> 'average_band'), null, 'a day without practice has no average band');
select is(
  (select sum((d ->> 'count')::int)::int from jsonb_array_elements(public.get_my_dashboard() -> 'days') d), 7,
  'the test 20 days ago is outside the 14 days');

-- ── Student 2: nothing yet ──────────────────────────────────────────────────────────────────
select pg_temp.sign_in('6d000000-0000-0000-0000-000000000002');
select is(
  (select sum((m ->> 'count')::int)::int from jsonb_array_elements(public.get_my_dashboard() -> 'modules') m), 0,
  'no practice: every module 0, and only the caller''s own practice counts');
select is(
  (select sum((d ->> 'count')::int)::int from jsonb_array_elements(public.get_my_dashboard() -> 'days') d), 0,
  'no practice: 14 empty days');

-- ── Student 3: the time zone ────────────────────────────────────────────────────────────────
select pg_temp.sign_in('6d000000-0000-0000-0000-000000000003');
select is((public.get_my_dashboard() -> 'days' -> 13 ->> 'count')::int, 1, '00:30 in Kolkata counts on today there');

select * from finish();
rollback;
