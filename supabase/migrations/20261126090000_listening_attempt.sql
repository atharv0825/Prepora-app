-- Listening home (follow-up to M5-F3/B2): reopen a past Listening attempt with its transcripts.
--
-- test_attempts.results (M4-F4) already keeps every question's result, but the transcripts live
-- in listening_sections.transcript, which users can never select (M5-C1): before submission they
-- would give the answers away. Once a student has submitted a test, they've seen its
-- transcripts in the grade-test response; this lets them see them again for THAT attempt only.
--
-- get_listening_attempt(id) → { attempt, test (null if deleted), transcripts }
--   PT404 when the attempt doesn't exist, isn't Listening, or isn't the caller's.
-- SECURITY DEFINER to read the transcripts; it checks ownership itself.

create function public.get_listening_attempt(p_attempt_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_attempt public.test_attempts%rowtype;
  v_title text;
begin
  select * into v_attempt from public.test_attempts
  where id = p_attempt_id and module = 'listening' and user_id = (select auth.uid());
  if not found then
    raise exception 'attempt not found' using errcode = 'PT404';
  end if;
  select title into v_title from public.listening_tests where id = v_attempt.test_id;

  return jsonb_build_object(
    'attempt', jsonb_build_object(
      'id', v_attempt.id, 'test_id', v_attempt.test_id, 'mode', v_attempt.mode,
      'raw_score', v_attempt.raw_score, 'band', v_attempt.band, 'time_taken_sec', v_attempt.time_taken_sec,
      'created_at', v_attempt.created_at, 'results', v_attempt.results),
    'test', case when v_title is null then null else jsonb_build_object('id', v_attempt.test_id, 'title', v_title) end,
    'transcripts', coalesce((
      select jsonb_agg(jsonb_build_object('order_no', s.order_no, 'title', s.title, 'transcript', coalesce(s.transcript, ''))
                       order by s.order_no)
      from public.listening_sections s where s.test_id = v_attempt.test_id
    ), '[]'::jsonb)
  );
end;
$$;

comment on function public.get_listening_attempt(uuid) is
  'One of the caller''s Listening attempts with the test''s transcripts (seen at submission). Owner only; PT404 otherwise.';

revoke all on function public.get_listening_attempt(uuid) from public, anon;
grant execute on function public.get_listening_attempt(uuid) to authenticated;
