-- M5-B2: what grade-test needs for Listening, and the player's loader.
--   * test_attempts.mode: how a Listening test was taken (exam: play once; practice: replay).
--   * record_test_attempt gains p_mode.
--   * get_listening_test(id): the test, its sections (with audio) and questions, WITHOUT answers,
--     explanations or transcripts (like get_reading_test, M4-B1).
-- M5-B3: the public Storage bucket for map and diagram images (staff upload, anyone reads).

-- ── test_attempts.mode ──────────────────────────────────────────────────────────────────────
alter table public.test_attempts
  add column mode text check (mode in ('exam', 'practice')),
  add constraint test_attempts_mode_listening check (mode is null or module = 'listening');

comment on column public.test_attempts.mode is
  'Listening only: exam (each recording plays once) or practice (replay, seek). Null for Reading.';

-- ── record_test_attempt(…, p_mode) ──────────────────────────────────────────────────────────
-- Dropped and recreated (not overloaded): one signature to call and to grant.
drop function public.record_test_attempt(uuid, public.test_module, uuid, jsonb, integer, numeric, integer, jsonb);

create function public.record_test_attempt(
  p_user_id uuid,
  p_module public.test_module,
  p_test_id uuid,
  p_answers jsonb,
  p_raw_score integer,
  p_band numeric,
  p_time_taken_sec integer default null,
  p_results jsonb default null,
  p_mode text default null
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

  insert into public.test_attempts (user_id, module, test_id, answers, raw_score, band, time_taken_sec, results, mode)
  values (p_user_id, p_module, p_test_id, coalesce(p_answers, '{}'::jsonb), p_raw_score, p_band, p_time_taken_sec, p_results, p_mode)
  returning id into v_attempt;

  return jsonb_build_object('ok', true, 'attempt_id', v_attempt,
    'allowance', v_allowance - 'ok');
end;
$$;

comment on function public.record_test_attempt(uuid, public.test_module, uuid, jsonb, integer, numeric, integer, jsonb, text) is
  'Uses one Reading/Listening allowance and saves a graded attempt with its results (and Listening mode), atomically (M4-B2, M5-B2). Service role only.';

revoke all on function public.record_test_attempt(uuid, public.test_module, uuid, jsonb, integer, numeric, integer, jsonb, text)
  from public, anon, authenticated;
grant execute on function public.record_test_attempt(uuid, public.test_module, uuid, jsonb, integer, numeric, integer, jsonb, text)
  to service_role;

-- ── get_listening_test ──────────────────────────────────────────────────────────────────────
-- SECURITY INVOKER on purpose, as get_reading_test: RLS (published, or staff) and the M5-C1
-- column grants apply, so this can't return answer, explanation or transcript to a user.
-- Errors: PT404 not found / not published (staff may open drafts); PT403 plan too low.
create function public.get_listening_test(p_test_id uuid)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_test public.listening_tests%rowtype;
begin
  select * into v_test from public.listening_tests where id = p_test_id;
  if not found then
    raise exception 'test not found' using errcode = 'PT404';
  end if;
  if not public.has_plan(v_test.min_plan) and not public.is_staff() then
    raise exception 'this test needs the % plan', v_test.min_plan using errcode = 'PT403', detail = v_test.min_plan::text;
  end if;

  return jsonb_build_object(
    'test', jsonb_build_object('id', v_test.id, 'title', v_test.title, 'min_plan', v_test.min_plan, 'status', v_test.status),
    -- Only columns users may read; naming transcript here would fail with 42501.
    'sections', coalesce((
      select jsonb_agg(jsonb_build_object('id', s.id, 'order_no', s.order_no, 'title', s.title,
                                          'audio_url', s.audio_url, 'duration_sec', s.duration_sec)
                       order by s.order_no)
      from public.listening_sections s where s.test_id = p_test_id
    ), '[]'::jsonb),
    'questions', coalesce((
      select jsonb_agg(jsonb_build_object('id', q.id, 'section_id', q.section_id, 'q_no', q.q_no, 'q_type', q.q_type,
                                          'prompt', q.prompt, 'options', q.options)
                       order by q.q_no)
      from public.listening_questions q where q.test_id = p_test_id
    ), '[]'::jsonb)
  );
end;
$$;

comment on function public.get_listening_test(uuid) is
  'A Listening test with sections (audio) and questions, never answers or transcripts (M5-B2). Invoker rights. PT404/PT403.';

revoke all on function public.get_listening_test(uuid) from public, anon;
grant execute on function public.get_listening_test(uuid) to authenticated;

-- ── M5-B3: images for map and diagram labelling ─────────────────────────────────────────────
-- Public bucket: the player shows the image to anyone with the test (the URL is in the
-- question's options, which only students with the plan can read). Staff upload; PNG, JPEG or
-- WebP only (no SVG: it can carry script), 5 MB at most.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('listening-images', 'listening-images', true, 5242880, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update
set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy "listening-images: staff read"
on storage.objects for select to authenticated
using (bucket_id = 'listening-images' and (select public.is_staff()));

create policy "listening-images: staff upload"
on storage.objects for insert to authenticated
with check (bucket_id = 'listening-images' and (select public.is_staff()));

create policy "listening-images: staff update"
on storage.objects for update to authenticated
using (bucket_id = 'listening-images' and (select public.is_staff()))
with check (bucket_id = 'listening-images' and (select public.is_staff()));

create policy "listening-images: staff delete"
on storage.objects for delete to authenticated
using (bucket_id = 'listening-images' and (select public.is_staff()));
