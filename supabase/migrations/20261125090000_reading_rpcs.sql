-- M4-B1: get_reading_test(id) → the test, its passages and its questions WITHOUT answers.
-- M4-B2: record_test_attempt(...) → uses one monthly allowance and saves the graded attempt,
--        in one transaction (called by the grade-test Edge Function).

-- ── get_reading_test ────────────────────────────────────────────────────────────────────────
-- SECURITY INVOKER on purpose: it reads with the caller's rights, so RLS decides what's visible
-- (published, or staff) and the column privileges make it impossible for this function, or any
-- later edit of it, to return reading_questions.answer or .explanation to a user.
--
-- Errors (PostgREST turns SQLSTATE PTxxx into HTTP status xxx):
--   PT404  no such test, or not published (staff can open drafts, for the builder's preview)
--   PT403  the caller's plan doesn't include it (detail: the min_plan); staff are let through
create function public.get_reading_test(p_test_id uuid)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_test public.reading_tests%rowtype;
begin
  select * into v_test from public.reading_tests where id = p_test_id;
  if not found then
    raise exception 'test not found' using errcode = 'PT404';
  end if;
  if not public.has_plan(v_test.min_plan) and not public.is_staff() then
    raise exception 'this test needs the % plan', v_test.min_plan using errcode = 'PT403', detail = v_test.min_plan::text;
  end if;

  return jsonb_build_object(
    'test', jsonb_build_object(
      'id', v_test.id, 'test_type', v_test.test_type, 'title', v_test.title,
      'min_plan', v_test.min_plan, 'status', v_test.status),
    'passages', coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'order_no', p.order_no, 'title', p.title, 'body', p.body)
                       order by p.order_no)
      from public.reading_passages p where p.test_id = p_test_id
    ), '[]'::jsonb),
    -- Only columns users may read; naming answer/explanation here would fail with 42501.
    'questions', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', q.id, 'passage_id', q.passage_id, 'q_no', q.q_no, 'q_type', q.q_type,
               'prompt', q.prompt, 'options', q.options)
             order by q.q_no)
      from public.reading_questions q where q.test_id = p_test_id
    ), '[]'::jsonb)
  );
end;
$$;

comment on function public.get_reading_test(uuid) is
  'A Reading test with passages and questions, never answers (M4-B1). Invoker rights: RLS and column grants apply. '
  'PT404 not found/unpublished, PT403 plan too low.';

revoke all on function public.get_reading_test(uuid) from public, anon;
grant execute on function public.get_reading_test(uuid) to authenticated;

-- ── record_test_attempt ─────────────────────────────────────────────────────────────────────
-- Uses the module's monthly allowance and inserts the attempt atomically: no attempt is saved
-- without counting, and nothing is counted if the insert fails. Returns
--   { ok: true, attempt_id, allowance: { type, used, limit } }
--   { ok: false, code: 'allowance_exceeded', type, used, limit }    (nothing saved)
-- Service role only: the score is computed by grade-test, never taken from the client.
create function public.record_test_attempt(
  p_user_id uuid,
  p_module public.test_module,
  p_test_id uuid,
  p_answers jsonb,
  p_raw_score integer,
  p_band numeric,
  p_time_taken_sec integer default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_allowance jsonb;
  v_attempt uuid;
begin
  v_allowance := public.use_allowance(p_user_id, p_module::text || '_tests');
  if not (v_allowance ->> 'ok')::boolean then
    return v_allowance;
  end if;

  insert into public.test_attempts (user_id, module, test_id, answers, raw_score, band, time_taken_sec)
  values (p_user_id, p_module, p_test_id, coalesce(p_answers, '{}'::jsonb), p_raw_score, p_band, p_time_taken_sec)
  returning id into v_attempt;

  return jsonb_build_object('ok', true, 'attempt_id', v_attempt,
    'allowance', v_allowance - 'ok');
end;
$$;

comment on function public.record_test_attempt(uuid, public.test_module, uuid, jsonb, integer, numeric, integer) is
  'Uses one Reading/Listening allowance and saves a graded attempt, atomically (M4-B2). Service role only.';

revoke all on function public.record_test_attempt(uuid, public.test_module, uuid, jsonb, integer, numeric, integer)
  from public, anon, authenticated;
grant execute on function public.record_test_attempt(uuid, public.test_module, uuid, jsonb, integer, numeric, integer)
  to service_role;
