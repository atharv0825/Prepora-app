-- M4-A1: what the admin Reading builder needs from the database.
--
--   admin_get_reading_test(id)            the whole test for staff, answer keys and explanations included
--   admin_order_reading_questions(id, …)  renumbers a test's questions 1..N in a given order
--
-- Everything else the builder does is plain table writes, which the M4-C1 staff policies allow.
-- Students still can't read answer keys: the column privileges are unchanged, and the new read
-- function checks is_staff() itself.

-- ── admin_get_reading_test ──────────────────────────────────────────────────────────────────
-- SECURITY DEFINER: `authenticated` has no SELECT on reading_questions.answer/.explanation (not
-- even staff), so the builder reads keys through here. Staff only (42501 otherwise).
create function public.admin_get_reading_test(p_test_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_test public.reading_tests%rowtype;
begin
  if not public.is_staff() then
    raise exception 'staff only' using errcode = '42501';
  end if;
  select * into v_test from public.reading_tests where id = p_test_id;
  if not found then
    raise exception 'test not found' using errcode = 'P0002';
  end if;

  return jsonb_build_object(
    'test', jsonb_build_object(
      'id', v_test.id, 'test_type', v_test.test_type, 'title', v_test.title, 'source', v_test.source,
      'status', v_test.status, 'min_plan', v_test.min_plan, 'published_at', v_test.published_at,
      'created_at', v_test.created_at, 'updated_at', v_test.updated_at),
    'passages', coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'order_no', p.order_no, 'title', p.title, 'body', p.body,
                                          'updated_at', p.updated_at)
                       order by p.order_no)
      from public.reading_passages p where p.test_id = p_test_id
    ), '[]'::jsonb),
    'questions', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', q.id, 'passage_id', q.passage_id, 'q_no', q.q_no, 'q_type', q.q_type,
               'prompt', q.prompt, 'options', q.options, 'answer', q.answer, 'explanation', q.explanation)
             order by q.q_no)
      from public.reading_questions q where q.test_id = p_test_id
    ), '[]'::jsonb)
  );
end;
$$;

comment on function public.admin_get_reading_test(uuid) is
  'A Reading test with answer keys and explanations, for the admin builder (M4-A1). Staff only (42501).';

revoke all on function public.admin_get_reading_test(uuid) from public, anon;
grant execute on function public.admin_get_reading_test(uuid) to authenticated;

-- ── Renumbering ─────────────────────────────────────────────────────────────────────────────
-- Moving a question, or adding one to an earlier passage, renumbers others. Swapping numbers row
-- by row would trip the (test_id, q_no) unique check halfway, so it's checked at commit instead.
-- (ON CONFLICT can't name a deferrable constraint; the only one that did, the M4-C3 seed, ran
-- before this migration.)
alter table public.reading_questions
  drop constraint reading_questions_test_id_q_no_key,
  add constraint reading_questions_test_id_q_no_key unique (test_id, q_no) deferrable initially immediate;

-- Sets q_no = position in p_ids. p_ids must list every question of the test exactly once, and
-- keep each passage's questions together in passage order (1, then 2, then 3), as in the test.
-- SECURITY INVOKER: the staff write policies apply; the staff check gives a clear error.
create function public.admin_order_reading_questions(p_test_id uuid, p_ids uuid[])
returns void
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_total integer;
begin
  if not public.is_staff() then
    raise exception 'staff only' using errcode = '42501';
  end if;

  select count(*) into v_total from public.reading_questions where test_id = p_test_id;
  if coalesce(cardinality(p_ids), 0) <> v_total
     or (select count(distinct x) from unnest(p_ids) x) <> v_total
     or exists (select 1 from unnest(p_ids) x
                where not exists (select 1 from public.reading_questions q where q.id = x and q.test_id = p_test_id)) then
    raise exception 'the order must list every question of the test once' using errcode = '22023';
  end if;

  if exists (
    select 1
    from unnest(p_ids) with ordinality a(id, n)
    join unnest(p_ids) with ordinality b(id, n) on b.n = a.n + 1
    join public.reading_questions qa on qa.id = a.id
    join public.reading_questions qb on qb.id = b.id
    join public.reading_passages pa on pa.id = qa.passage_id
    join public.reading_passages pb on pb.id = qb.passage_id
    where pb.order_no < pa.order_no
  ) then
    raise exception 'questions must follow passage order' using errcode = '22023';
  end if;

  set constraints public.reading_questions_test_id_q_no_key deferred;
  update public.reading_questions q
  set q_no = o.n
  from unnest(p_ids) with ordinality o(id, n)
  where q.id = o.id and q.q_no <> o.n;
end;
$$;

comment on function public.admin_order_reading_questions(uuid, uuid[]) is
  'Renumbers a Reading test''s questions 1..N in the given order, kept in passage order (M4-A1). Staff only.';

revoke all on function public.admin_order_reading_questions(uuid, uuid[]) from public, anon;
grant execute on function public.admin_order_reading_questions(uuid, uuid[]) to authenticated;
