-- M5-A1: what the admin Listening builder needs (as M4-A1 did for Reading).
--
--   admin_get_listening_test(id)            the whole test for staff: answer keys, explanations, transcripts
--   admin_order_listening_questions(id, …)  renumbers questions within their sections
--
-- Everything else is plain table writes under the M5-C1 staff policies. Students still can't
-- read keys or transcripts: the column grants are unchanged, and the read function checks
-- is_staff() itself.

create function public.admin_get_listening_test(p_test_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_test public.listening_tests%rowtype;
begin
  if not public.is_staff() then
    raise exception 'staff only' using errcode = '42501';
  end if;
  select * into v_test from public.listening_tests where id = p_test_id;
  if not found then
    raise exception 'test not found' using errcode = 'P0002';
  end if;

  return jsonb_build_object(
    'test', jsonb_build_object(
      'id', v_test.id, 'title', v_test.title, 'source', v_test.source, 'status', v_test.status,
      'min_plan', v_test.min_plan, 'published_at', v_test.published_at,
      'created_at', v_test.created_at, 'updated_at', v_test.updated_at),
    'sections', coalesce((
      select jsonb_agg(jsonb_build_object('id', s.id, 'order_no', s.order_no, 'title', s.title,
                                          'audio_url', s.audio_url, 'duration_sec', s.duration_sec,
                                          'transcript', s.transcript, 'updated_at', s.updated_at)
                       order by s.order_no)
      from public.listening_sections s where s.test_id = p_test_id
    ), '[]'::jsonb),
    'questions', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', q.id, 'section_id', q.section_id, 'q_no', q.q_no, 'q_type', q.q_type,
               'prompt', q.prompt, 'options', q.options, 'answer', q.answer, 'explanation', q.explanation)
             order by q.q_no)
      from public.listening_questions q where q.test_id = p_test_id
    ), '[]'::jsonb)
  );
end;
$$;

comment on function public.admin_get_listening_test(uuid) is
  'A Listening test with answer keys, explanations and transcripts, for the admin builder (M5-A1). Staff only (42501).';

revoke all on function public.admin_get_listening_test(uuid) from public, anon;
grant execute on function public.admin_get_listening_test(uuid) to authenticated;

-- Sets each question's number from its place in p_ids among its own section's questions:
-- section n's k-th question becomes 10(n−1) + k. p_ids must list every question of the test once.
-- Invoker rights (staff RLS); the (test_id, q_no) unique check is deferred to the end (M5-C1).
create function public.admin_order_listening_questions(p_test_id uuid, p_ids uuid[])
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

  select count(*) into v_total from public.listening_questions where test_id = p_test_id;
  if coalesce(cardinality(p_ids), 0) <> v_total
     or (select count(distinct x) from unnest(p_ids) x) <> v_total
     or exists (select 1 from unnest(p_ids) x
                where not exists (select 1 from public.listening_questions q where q.id = x and q.test_id = p_test_id)) then
    raise exception 'the order must list every question of the test once' using errcode = '22023';
  end if;

  set constraints public.listening_questions_test_id_q_no_key deferred;
  with ranked as (
    select q.id, (s.order_no - 1) * 10 + row_number() over (partition by q.section_id order by o.n) as q_no
    from unnest(p_ids) with ordinality o(id, n)
    join public.listening_questions q on q.id = o.id
    join public.listening_sections s on s.id = q.section_id
  )
  update public.listening_questions q
  set q_no = r.q_no
  from ranked r
  where q.id = r.id and q.q_no <> r.q_no;
end;
$$;

comment on function public.admin_order_listening_questions(uuid, uuid[]) is
  'Renumbers a Listening test''s questions within their sections (section n: 10n-9…) in the given order (M5-A1). Staff only.';

revoke all on function public.admin_order_listening_questions(uuid, uuid[]) from public, anon;
grant execute on function public.admin_order_listening_questions(uuid, uuid[]) to authenticated;
