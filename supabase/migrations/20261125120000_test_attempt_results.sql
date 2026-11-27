-- M4-F4 (attempt history): keep each attempt's graded results, so a student can open a past
-- attempt and see every question with the correct answer and explanation again.
--
-- The answer key itself stays closed (reading_questions.answer/explanation have no user grants):
-- grade-test, which reads it with the service role, writes the results it already returns to
-- the student once they submit. test_attempts rows are readable only by their owner (M4-C1).
-- Attempts saved before this migration have results = null (the page says so).

alter table public.test_attempts
  add column results jsonb check (results is null or jsonb_typeof(results) = 'array');

comment on column public.test_attempts.results is
  'Per-question results as grade-test returned them (QuestionResult[], packages/shared/src/api/grade-test.ts). Null for attempts before M4-F4.';

-- record_test_attempt gains p_results (last, optional). Dropped and recreated rather than
-- overloaded, so there's one signature to call and to grant.
drop function public.record_test_attempt(uuid, public.test_module, uuid, jsonb, integer, numeric, integer);

create function public.record_test_attempt(
  p_user_id uuid,
  p_module public.test_module,
  p_test_id uuid,
  p_answers jsonb,
  p_raw_score integer,
  p_band numeric,
  p_time_taken_sec integer default null,
  p_results jsonb default null
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

  insert into public.test_attempts (user_id, module, test_id, answers, raw_score, band, time_taken_sec, results)
  values (p_user_id, p_module, p_test_id, coalesce(p_answers, '{}'::jsonb), p_raw_score, p_band, p_time_taken_sec, p_results)
  returning id into v_attempt;

  return jsonb_build_object('ok', true, 'attempt_id', v_attempt,
    'allowance', v_allowance - 'ok');
end;
$$;

comment on function public.record_test_attempt(uuid, public.test_module, uuid, jsonb, integer, numeric, integer, jsonb) is
  'Uses one Reading/Listening allowance and saves a graded attempt with its results, atomically (M4-B2, M4-F4). Service role only.';

revoke all on function public.record_test_attempt(uuid, public.test_module, uuid, jsonb, integer, numeric, integer, jsonb)
  from public, anon, authenticated;
grant execute on function public.record_test_attempt(uuid, public.test_module, uuid, jsonb, integer, numeric, integer, jsonb)
  to service_role;
