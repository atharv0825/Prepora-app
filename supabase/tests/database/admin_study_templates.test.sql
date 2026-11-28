-- M8.7-A1: staff manage the study plan templates. Run: supabase test db
begin;
select plan(16);

insert into auth.users (id, email) values
  ('5b000000-0000-0000-0000-000000000001', 'staff@prepora.test'),
  ('5b000000-0000-0000-0000-000000000002', 'learner@prepora.test');
update public.profiles set role = 'admin' where id = '5b000000-0000-0000-0000-000000000001';

create function pg_temp.sign_in(p_id uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_id, 'role', 'authenticated')::text, true);
$$;

-- Every kind once over two days; and the same without Speaking Part 2.
create function pg_temp.full_items() returns jsonb language sql as $$
  select '[{"day":1,"order":1,"kind":"reading_test"},{"day":1,"order":2,"kind":"listening_test"},{"day":1,"order":3,"kind":"writing_t1"},
           {"day":2,"order":1,"kind":"writing_t2"},{"day":2,"order":2,"kind":"speaking_p1"},{"day":2,"order":3,"kind":"speaking_p2"}]'::jsonb;
$$;
create function pg_temp.partial_items() returns jsonb language sql as $$
  select '[{"day":1,"order":1,"kind":"reading_test"},{"day":1,"order":2,"kind":"listening_test"},{"day":1,"order":3,"kind":"writing_t1"},
           {"day":2,"order":1,"kind":"writing_t2"},{"day":2,"order":2,"kind":"speaking_p1"}]'::jsonb;
$$;

set local role authenticated;

-- A student can't manage templates.
select pg_temp.sign_in('5b000000-0000-0000-0000-000000000002');
select throws_ok($$ select public.admin_save_study_template(null, 'Nope', 7::smallint, null, '[]'::jsonb) $$, '42501', null, 'a student can''t create a template');

select pg_temp.sign_in('5b000000-0000-0000-0000-000000000001');

-- Create: inactive, with its items.
create temp table t (id uuid) on commit drop;
grant all on t to authenticated;
insert into t select public.admin_save_study_template(null, 'Test plan A1', 2::smallint, null, pg_temp.partial_items());
select is((select active from public.study_plan_templates where id = (select id from t)), false, 'a new template starts inactive');
select is((select count(*)::int from public.study_plan_items where template_id = (select id from t)), 5, 'its items are saved');

-- Activating needs full coverage.
select throws_ok($$ select public.admin_set_study_template_active((select id from t), true) $$, '22023', null, 'can''t activate without every kind');

-- Edit in place (nobody follows it yet): same id, items replaced.
select is(public.admin_save_study_template((select id from t), 'Test plan A1', 2::smallint, null, pg_temp.full_items()), (select id from t), 'editing an unused template keeps its id');
select is((select count(*)::int from public.study_plan_items where template_id = (select id from t)), 6, 'its items are replaced');
select lives_ok($$ select public.admin_set_study_template_active((select id from t), true) $$, 'with every kind it can be activated');

-- Rules on items.
select throws_ok($$ select public.admin_save_study_template((select id from t), 'Test plan A1', 1::smallint, null, pg_temp.full_items()) $$, '22023', null, 'items must be within the plan''s days');
select throws_ok($$ select public.admin_save_study_template(null, 'X', 3::smallint, null, '[{"day":1,"order":1,"kind":"speaking_full"}]'::jsonb) $$, '22023', null, 'the Speaking full test can''t be added');

-- A student follows it (written as the owner: students get plans through assign_my_study_plan).
reset role;
insert into public.user_study_plans (user_id, template_id, started_on) values ('5b000000-0000-0000-0000-000000000002', (select id from t), current_date);
set local role authenticated;
select pg_temp.sign_in('5b000000-0000-0000-0000-000000000001');

-- Editing it now makes a new version; the student's plan keeps the old one, unchanged.
create temp table v (id uuid) on commit drop;
grant all on v to authenticated;
insert into v select public.admin_save_study_template((select id from t), 'Test plan A1 v2', 3::smallint, null,
  pg_temp.full_items() || '[{"day":3,"order":1,"kind":"reading_test"}]'::jsonb);
select isnt((select id from v), (select id from t), 'editing a template in use creates a new version');
select is((select active from public.study_plan_templates where id = (select id from v)), true, 'the new version takes over as active');
select is((select active from public.study_plan_templates where id = (select id from t)), false, 'the old version is no longer offered');
select is((select replaced_by from public.study_plan_templates where id = (select id from t)), (select id from v), 'the old version points to the new one');
select is((select count(*)::int from public.study_plan_items where template_id = (select id from t)), 6, 'the old version''s items are unchanged');
select is((select template_id from public.user_study_plans where user_id = '5b000000-0000-0000-0000-000000000002' and status = 'active'), (select id from t), 'the student''s plan keeps its template');
select throws_ok($$ select public.admin_set_study_template_active((select id from t), true) $$, '22023', null, 'an earlier version can''t be reactivated');

select * from finish();
rollback;
