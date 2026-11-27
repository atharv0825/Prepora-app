-- Reading builder import (admin "Import" → Paste content / Upload document).
--
-- admin_import_reading_content(test, mode, passages, questions): saves a previewed import in ONE
-- transaction, so a failure leaves the test exactly as it was.
--
--   p_mode       'append'  keep everything; new passages fill empty slots (an existing passage
--                          keeps its text and gets the imported questions after its own);
--                'replace' delete the test's questions first; imported passages replace the
--                          text of the same slot (other passages are kept).
--   p_passages   [{order_no 1–3, title, body}]
--   p_questions  [{passage_order_no, q_type, prompt, options, answer, explanation}] in draft order
--
-- The admin's Server Function validates every passage and question with the same contracts as
-- the manual form (ReadingPassageInput, ReadingQuestionInput) before calling this; the tables'
-- own checks and the staff RLS policies (M4-C1) apply here too: SECURITY INVOKER, so the import
-- can do exactly what the editor could do by hand. Questions are then renumbered in passage
-- order with admin_order_reading_questions, as after every manual change.

create function public.admin_import_reading_content(p_test_id uuid, p_mode text, p_passages jsonb, p_questions jsonb)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_existing integer;
  v_new integer := coalesce(jsonb_array_length(p_questions), 0);
  v_passage record;
  v_question record;
  v_passage_id uuid;
  v_created integer := 0;
  v_replaced integer := 0;
  v_kept integer := 0;
  v_ids uuid[];
begin
  if not public.is_staff() then
    raise exception 'only admins and content editors can import' using errcode = '42501';
  end if;
  if p_mode is null or p_mode not in ('append', 'replace') then
    raise exception 'choose append or replace' using errcode = '22023';
  end if;
  if jsonb_typeof(p_passages) is distinct from 'array' or jsonb_typeof(p_questions) is distinct from 'array' then
    raise exception 'passages and questions must be lists' using errcode = '22023';
  end if;
  perform 1 from public.reading_tests where id = p_test_id for update;
  if not found then
    raise exception 'reading test not found' using errcode = 'P0002';
  end if;

  if p_mode = 'replace' then
    delete from public.reading_questions where test_id = p_test_id;
  end if;
  select count(*) into v_existing from public.reading_questions where test_id = p_test_id;
  if v_existing + v_new > 40 then
    raise exception 'a test has 40 questions at most (% already, % imported)', v_existing, v_new using errcode = '22023';
  end if;

  -- Passages.
  for v_passage in
    select * from jsonb_to_recordset(p_passages) as x(order_no integer, title text, body text)
  loop
    select id into v_passage_id from public.reading_passages where test_id = p_test_id and order_no = v_passage.order_no;
    if v_passage_id is null then
      insert into public.reading_passages (test_id, order_no, title, body)
      values (p_test_id, v_passage.order_no, v_passage.title, v_passage.body);
      v_created := v_created + 1;
    elsif p_mode = 'replace' then
      update public.reading_passages set title = v_passage.title, body = v_passage.body where id = v_passage_id;
      v_replaced := v_replaced + 1;
    else
      v_kept := v_kept + 1;
    end if;
  end loop;

  -- Existing questions first get 1..N (no gaps), so the new ones can take N+1… under the 40 limit.
  if v_existing > 0 then
    select array_agg(q.id order by p.order_no, q.q_no) into v_ids
    from public.reading_questions q join public.reading_passages p on p.id = q.passage_id
    where q.test_id = p_test_id;
    perform public.admin_order_reading_questions(p_test_id, v_ids);
  end if;

  -- Questions, after the test's own (in their passage), in draft order.
  for v_question in
    select e.value as q, e.ordinality as n from jsonb_array_elements(p_questions) with ordinality e
  loop
    select id into v_passage_id
    from public.reading_passages
    where test_id = p_test_id and order_no = (v_question.q ->> 'passage_order_no')::integer;
    if v_passage_id is null then
      raise exception 'question % belongs to passage %, which isn''t in the test', v_question.n, v_question.q ->> 'passage_order_no'
        using errcode = '22023';
    end if;
    insert into public.reading_questions (test_id, passage_id, q_no, q_type, prompt, options, answer, explanation)
    values (
      p_test_id,
      v_passage_id,
      v_existing + v_question.n,
      (v_question.q ->> 'q_type')::public.reading_question_type,
      v_question.q ->> 'prompt',
      coalesce(v_question.q -> 'options', '{}'::jsonb),
      v_question.q -> 'answer',
      nullif(v_question.q ->> 'explanation', '')
    );
  end loop;

  -- Number everything in passage order (then the order above), as the builder does.
  select array_agg(q.id order by p.order_no, q.q_no) into v_ids
  from public.reading_questions q join public.reading_passages p on p.id = q.passage_id
  where q.test_id = p_test_id;
  if v_ids is not null then
    perform public.admin_order_reading_questions(p_test_id, v_ids);
  end if;

  return jsonb_build_object(
    'passages_created', v_created,
    'passages_replaced', v_replaced,
    'passages_kept', v_kept,
    'questions_imported', v_new,
    'questions_total', coalesce(cardinality(v_ids), 0)
  );
end;
$$;

comment on function public.admin_import_reading_content(uuid, text, jsonb, jsonb) is
  'Reading builder import: saves previewed passages and questions in one transaction (append or replace), renumbered in passage order. Staff only; SECURITY INVOKER so the staff RLS policies apply.';

revoke all on function public.admin_import_reading_content(uuid, text, jsonb, jsonb) from public, anon;
grant execute on function public.admin_import_reading_content(uuid, text, jsonb, jsonb) to authenticated;
