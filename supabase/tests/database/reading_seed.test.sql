-- M4-C3: the two seeded sample Reading tests. Run: supabase test db
-- (Their options/answers are checked against the shared Zod contract in e2e reading-rls.spec.ts.)
begin;
select plan(12);

select results_eq($$
  select test_type::text, title, status::text, min_plan::text
  from public.reading_tests where id in ('5eed0000-0000-4000-8000-00000000000a', '5eed0000-0000-4000-8000-00000000000b')
  order by test_type
$$, $$ values ('academic', 'Sample Academic Test', 'published', 'free'),
              ('general', 'Sample General Training Test', 'published', 'free') $$,
  'both samples are published and free');

select isnt((select published_at from public.reading_tests where id = '5eed0000-0000-4000-8000-00000000000a'), null, 'published_at set');

select is((select array_agg(order_no order by order_no) from public.reading_passages where test_id = '5eed0000-0000-4000-8000-00000000000a'),
  array[1, 2, 3]::smallint[], 'Academic: 3 passages');
select is((select array_agg(order_no order by order_no) from public.reading_passages where test_id = '5eed0000-0000-4000-8000-00000000000b'),
  array[1, 2, 3]::smallint[], 'General: 3 passages');

select is((select array_agg(q_no order by q_no) from public.reading_questions where test_id = '5eed0000-0000-4000-8000-00000000000a'),
  (select array_agg(n::smallint) from generate_series(1, 20) n), 'Academic: questions 1–20');
select is((select array_agg(q_no order by q_no) from public.reading_questions where test_id = '5eed0000-0000-4000-8000-00000000000b'),
  (select array_agg(n::smallint) from generate_series(1, 14) n), 'General: questions 1–14');

select is((select count(distinct q_type)::int from public.reading_questions where test_id = '5eed0000-0000-4000-8000-00000000000a'),
  11, 'Academic covers all 11 question types');

-- Every question sits on a passage of its own test, in passage order.
select is((
  select count(*)::int from public.reading_questions q
  join public.reading_passages p on p.id = q.passage_id
  where q.test_id in ('5eed0000-0000-4000-8000-00000000000a', '5eed0000-0000-4000-8000-00000000000b')
    and exists (
      select 1 from public.reading_questions q2 join public.reading_passages p2 on p2.id = q2.passage_id
      where q2.test_id = q.test_id and q2.q_no > q.q_no and p2.order_no < p.order_no)
), 0, 'question numbers follow passage order');

select is((select count(*)::int from public.reading_questions
           where test_id in ('5eed0000-0000-4000-8000-00000000000a', '5eed0000-0000-4000-8000-00000000000b') and explanation is null),
  0, 'every sample question has an explanation');

-- A Free student can open them (no answers, of course).
insert into auth.users (id, email) values ('5eed9999-0000-4000-8000-000000000001', 'sample-reader@prepora.test');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"5eed9999-0000-4000-8000-000000000001","role":"authenticated"}', true);
select is((select count(*)::int from public.reading_questions where test_id = '5eed0000-0000-4000-8000-00000000000a'), 20,
  'a Free student reads the Academic questions');
select is((select count(*)::int from public.reading_passages where test_id = '5eed0000-0000-4000-8000-00000000000b'), 3,
  'and the General passages');
select throws_ok($$ select answer from public.reading_questions where test_id = '5eed0000-0000-4000-8000-00000000000a' $$,
  '42501', null, 'but not the answers');

select * from finish();
rollback;
