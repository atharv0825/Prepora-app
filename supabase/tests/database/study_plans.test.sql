-- M8.7: random practice picks and hidden study plans. Run: supabase test db
begin;
select plan(29);

insert into auth.users (id, email) values
  ('5a000000-0000-0000-0000-000000000001', 'planner@prepora.test'),
  ('5a000000-0000-0000-0000-000000000002', 'other@prepora.test');
update public.profiles set test_type = 'academic', timezone = 'UTC', plan = 'free'
  where id in ('5a000000-0000-0000-0000-000000000001', '5a000000-0000-0000-0000-000000000002');

create function pg_temp.sign_in(p_id uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_id, 'role', 'authenticated')::text, true);
$$;

-- Content: only ours, so the picks are predictable (other published content is hidden for this
-- test). The content tables' publish checks (triggers) aren't what's tested here: off for setup.
alter table public.reading_tests disable trigger user;
alter table public.listening_tests disable trigger user;
alter table public.writing_tasks disable trigger user;
alter table public.speaking_topics disable trigger user;
update public.reading_tests set status = 'archived' where status = 'published';
update public.listening_tests set status = 'archived' where status = 'published';
update public.writing_tasks set status = 'archived' where status = 'published';
update public.speaking_topics set status = 'archived' where status = 'published';

-- Triggers are off here, so test_no (normally given by a trigger) is set by hand.
insert into public.reading_tests (id, title, test_type, min_plan, source, status, test_no) values
  ('5a100000-0000-0000-0000-000000000001', 'R academic A', 'academic', 'free', 'admin', 'draft', 901),
  ('5a100000-0000-0000-0000-000000000002', 'R academic B', 'academic', 'free', 'admin', 'draft', 902),
  ('5a100000-0000-0000-0000-000000000003', 'R general', 'general', 'free', 'admin', 'draft', 901),
  ('5a100000-0000-0000-0000-000000000004', 'R gold', 'academic', 'gold', 'admin', 'draft', 904);
update public.reading_tests set status = 'published', published_at = now() where id::text like '5a100000%';

insert into public.writing_tasks (id, task_no, test_type, title, prompt, status, published_at) values
  ('5a200000-0000-0000-0000-000000000001', 2, null, 'Essay one', 'Discuss.', 'published', now()),
  ('5a200000-0000-0000-0000-000000000002', 2, null, 'Essay two', 'Discuss.', 'published', now());
alter table public.reading_tests enable trigger user;
alter table public.listening_tests enable trigger user;
alter table public.writing_tasks enable trigger user;
alter table public.speaking_topics enable trigger user;

-- ── Access ──────────────────────────────────────────────────────────────────────────────────
select ok(not has_function_privilege('anon', 'public.pick_next(public.study_item_kind, uuid[])', 'execute'), 'anon cannot pick');
select ok(not has_function_privilege('authenticated', 'public.study_pick(uuid, public.study_item_kind, uuid[])', 'execute'), 'the internal pick is not callable');
select ok(not has_function_privilege('authenticated', 'public.study_candidates(uuid, public.study_item_kind)', 'execute'), 'the candidates are not callable');
select is((select count(*)::int from public.study_plan_templates), 6, 'six templates are seeded');
-- Every kind but the retired Speaking full test (no_speaking_full_test turned it into Part 2).
select is(
  (select count(*)::int from public.study_plan_templates t
   where public.study_template_kinds() <@ (select array_agg(i.kind) from public.study_plan_items i where i.template_id = t.id)
     and not exists (select 1 from public.study_plan_items i where i.template_id = t.id and i.kind = 'speaking_full')),
  6, 'every template covers every kind, and none asks for the full test');
select is(
  (select count(*)::int from public.study_plan_items i join public.study_plan_templates t on t.id = i.template_id where i.day > t.days),
  0, 'no item falls after its template''s last day');

set local role authenticated;
select pg_temp.sign_in('5a000000-0000-0000-0000-000000000001');
select is((select count(*)::int from public.study_plan_templates), 0, 'students cannot read the templates');
select is((select count(*)::int from public.study_plan_items), 0, '… nor their items');

-- ── pick_next ───────────────────────────────────────────────────────────────────────────────
select ok(
  (public.pick_next('reading_test') ->> 'item_id') in ('5a100000-0000-0000-0000-000000000001', '5a100000-0000-0000-0000-000000000002'),
  'reading: an Academic test (the student''s type), never General, never the Gold one');
select is(public.pick_next('listening_test'), null, 'no content of a kind → null');
select is(
  public.pick_next('reading_test', array['5a100000-0000-0000-0000-000000000001'::uuid]) ->> 'item_id',
  '5a100000-0000-0000-0000-000000000002', 'the excluded (previous) pick is avoided');

-- Test A done: B is the only one not done.
reset role;
insert into public.test_attempts (user_id, module, test_id, raw_score, band)
values ('5a000000-0000-0000-0000-000000000001', 'reading', '5a100000-0000-0000-0000-000000000001', 30, 7);
set local role authenticated;
select is(public.pick_next('reading_test') ->> 'item_id', '5a100000-0000-0000-0000-000000000002', 'never a done test while another is not done');
select is((public.pick_next('reading_test') ->> 'done_before')::boolean, false, '… and it says so');

-- Both done: the one done longest ago (A), unless it's excluded.
reset role;
insert into public.test_attempts (user_id, module, test_id, raw_score, band, created_at)
values ('5a000000-0000-0000-0000-000000000001', 'reading', '5a100000-0000-0000-0000-000000000002', 30, 7, now() + interval '1 minute');
set local role authenticated;
select is(public.pick_next('reading_test') ->> 'item_id', '5a100000-0000-0000-0000-000000000001', 'all done: the one done longest ago');
select is(
  public.pick_next('reading_test', array['5a100000-0000-0000-0000-000000000001'::uuid]) ->> 'item_id',
  '5a100000-0000-0000-0000-000000000002', 'all done: still not the same twice in a row');

-- Gold unlocks the Gold test.
reset role;
update public.profiles set plan = 'gold' where id = '5a000000-0000-0000-0000-000000000001';
set local role authenticated;
select is(public.pick_next('reading_test') ->> 'item_id', '5a100000-0000-0000-0000-000000000004', 'Gold: the Gold test (not done yet) is now picked');

-- ── assign_my_study_plan ────────────────────────────────────────────────────────────────────
select is(public.get_my_study_plan() ->> 'active', 'false', 'no plan yet');
select is((public.assign_my_study_plan() ->> 'new')::boolean, true, 'a plan is assigned');
select ok(not (public.assign_my_study_plan() ? 'template_id') and not (public.assign_my_study_plan() ? 'name'), 'the template is never returned');
select is((public.assign_my_study_plan() ->> 'new')::boolean, false, 'asking again keeps the same plan');

reset role;
create temp table first_plan as
  select template_id from public.user_study_plans where user_id = '5a000000-0000-0000-0000-000000000001' and status = 'active';
grant select on first_plan to authenticated;
set local role authenticated;
select is((public.assign_my_study_plan(true) ->> 'new')::boolean, true, 'restart: a new plan');
reset role;
select isnt(
  (select template_id from public.user_study_plans where user_id = '5a000000-0000-0000-0000-000000000001' and status = 'active'),
  (select template_id from first_plan), 'restart picks a different template');
select is(
  (select count(*)::int from public.user_study_plans where user_id = '5a000000-0000-0000-0000-000000000001' and status = 'restarted'),
  1, 'the old plan is kept as restarted');

-- ── get_my_study_plan ───────────────────────────────────────────────────────────────────────
set local role authenticated;
select is((public.get_my_study_plan() ->> 'day')::int, 1, 'day 1');
select ok(jsonb_array_length(public.get_my_study_plan() -> 'items') >= 1, 'today has items');
select is(
  (select jsonb_agg(i -> 'item_id') from jsonb_array_elements(public.get_my_study_plan() -> 'items') i),
  (select jsonb_agg(i -> 'item_id') from jsonb_array_elements(public.get_my_study_plan() -> 'items') i),
  'refreshing doesn''t reshuffle today''s picks');
select ok(not (public.get_my_study_plan() ? 'template_id') and not (public.get_my_study_plan() ? 'name'), 'the plan never names its template');

-- Carry-over: move the plan back 2 days; day 1's unfinished items show first, marked carried.
reset role;
update public.user_study_plans set started_on = started_on - 2, started_at = started_at - interval '2 days'
where user_id = '5a000000-0000-0000-0000-000000000001' and status = 'active';
set local role authenticated;
select is((public.get_my_study_plan() ->> 'day')::int, 3, 'two days later: day 3');
select is(
  (public.get_my_study_plan() -> 'items' -> 0 ->> 'carried')::boolean, true,
  'unfinished items from earlier days come first, marked carried');

select * from finish();
rollback;
