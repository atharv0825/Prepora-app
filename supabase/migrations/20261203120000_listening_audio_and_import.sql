-- Listening builder: audio generated from the transcript, and questions imported from a draft.
--
-- 1. listening_sections gets where its audio came from and what it was made of:
--      audio_source        'uploaded' | 'generated' (null without audio)
--      audio_hash          SHA-256 of what was sent to text-to-speech (transcript turns + voices +
--                          pauses): the same hash on the next "Generate" skips the TTS call
--      audio_chars         characters sent to TTS for this audio
--      audio_generated_at
--      tts_voices          the admin's voice per speaker {"man": "en-GB-Standard-B", …}
--    Users can't read any of these (the M5-C1 column grants list what they can). A trigger keeps
--    them consistent: no audio → no source; a new URL without a new hash is an upload.
--
-- 2. listening_audio_jobs: one row per generation that called TTS (generate-listening-audio
--    runs it in the background; the builder polls the row). Staff read; only the function (service
--    role) writes. Its chars add up to the test's TTS budget.
--
-- 3. admin_get_listening_test returns the new section fields and the test's TTS characters used.
--
-- 4. admin_import_listening_questions: saves a previewed import into one section in ONE
--    transaction (append or replace), like admin_import_reading_content.

-- ── 1. Section audio fields ──────────────────────────────────────────────────────────────────
alter table public.listening_sections
  add column audio_source text check (audio_source in ('uploaded', 'generated')),
  add column audio_hash text check (audio_hash ~ '^[0-9a-f]{64}$'),
  add column audio_chars integer check (audio_chars >= 0),
  add column audio_generated_at timestamptz,
  add column tts_voices jsonb not null default '{}'::jsonb check (jsonb_typeof(tts_voices) = 'object');

update public.listening_sections set audio_source = 'uploaded' where audio_url is not null;

alter table public.listening_sections
  add constraint listening_sections_audio_source_present check ((audio_url is null) = (audio_source is null)),
  add constraint listening_sections_generated_hash check (audio_source is distinct from 'generated' or audio_hash is not null);

comment on column public.listening_sections.audio_source is 'Where the recording came from: uploaded by an admin, or generated from the transcript (text-to-speech).';
comment on column public.listening_sections.audio_hash is 'Generated audio: SHA-256 of the TTS requests (transcript turns, voices, pauses). Same hash → no new TTS call.';
comment on column public.listening_sections.tts_voices is 'The admin''s Standard voice per speaker key for generated audio, e.g. {"man": "en-GB-Standard-B"}.';

create function public.listening_sections_before_audio()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.audio_url is null then
    new.audio_source := null;
    new.audio_hash := null;
    new.audio_chars := null;
    new.audio_generated_at := null;
  elsif tg_op = 'INSERT' then
    new.audio_source := coalesce(new.audio_source, 'uploaded');
  elsif new.audio_url is distinct from old.audio_url and new.audio_hash is not distinct from old.audio_hash then
    -- A new recording that didn't come with a new hash: an upload (the builder's manual upload
    -- only sends the URL and length).
    new.audio_source := 'uploaded';
    new.audio_hash := null;
    new.audio_chars := null;
    new.audio_generated_at := null;
  end if;
  if new.audio_source = 'uploaded' then
    new.audio_hash := null;
    new.audio_chars := null;
    new.audio_generated_at := null;
  end if;
  return new;
end;
$$;

create trigger listening_sections_audio
before insert or update on public.listening_sections
for each row execute function public.listening_sections_before_audio();

revoke all on function public.listening_sections_before_audio() from public, anon, authenticated;

-- ── 2. Generation jobs ───────────────────────────────────────────────────────────────────────
create table public.listening_audio_jobs (
  id uuid primary key default gen_random_uuid(),
  test_id uuid not null references public.listening_tests (id) on delete cascade,
  section_id uuid not null references public.listening_sections (id) on delete cascade,
  order_no smallint not null check (order_no between 1 and 4),
  status text not null default 'running' check (status in ('running', 'succeeded', 'failed')),
  -- Characters sent (or being sent) to TTS: counted against the test's budget even if it failed.
  chars integer not null check (chars >= 0),
  requests integer not null check (requests >= 0),
  audio_hash text not null check (audio_hash ~ '^[0-9a-f]{64}$'),
  audio_url text,
  error text check (char_length(error) <= 500),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);

comment on table public.listening_audio_jobs is
  'Text-to-speech generations of Listening section audio (generate-listening-audio). Staff read; the function writes.';

-- One generation at a time per section.
create unique index listening_audio_jobs_one_running on public.listening_audio_jobs (section_id) where status = 'running';
create index listening_audio_jobs_test_idx on public.listening_audio_jobs (test_id, created_at desc);

alter table public.listening_audio_jobs enable row level security;
revoke all on table public.listening_audio_jobs from anon, authenticated;
grant select on table public.listening_audio_jobs to authenticated;

create policy "listening_audio_jobs: staff read"
on public.listening_audio_jobs for select to authenticated
using (public.is_staff());

-- ── 3. The builder's loader ──────────────────────────────────────────────────────────────────
create or replace function public.admin_get_listening_test(p_test_id uuid)
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
                                          'transcript', s.transcript, 'updated_at', s.updated_at,
                                          'audio_source', s.audio_source, 'audio_hash', s.audio_hash,
                                          'audio_chars', s.audio_chars, 'audio_generated_at', s.audio_generated_at,
                                          'tts_voices', s.tts_voices)
                       order by s.order_no)
      from public.listening_sections s where s.test_id = p_test_id
    ), '[]'::jsonb),
    'questions', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', q.id, 'section_id', q.section_id, 'q_no', q.q_no, 'q_type', q.q_type,
               'prompt', q.prompt, 'options', q.options, 'answer', q.answer, 'explanation', q.explanation)
             order by q.q_no)
      from public.listening_questions q where q.test_id = p_test_id
    ), '[]'::jsonb),
    'tts_chars_used', coalesce((select sum(j.chars) from public.listening_audio_jobs j where j.test_id = p_test_id), 0)
  );
end;
$$;

-- ── 4. Import into a section ─────────────────────────────────────────────────────────────────
-- p_mode 'append' adds after the section's own questions; 'replace' deletes the section's
-- questions first. p_questions: [{q_type, prompt, options, answer, explanation}] in draft order.
-- The admin's Server Function validates every question first (the manual form's contract; a map
-- or diagram question may come without its picture, for the admin to add, and then can't be
-- published until it has one). SECURITY INVOKER: the staff RLS policies apply, as by hand.
create function public.admin_import_listening_questions(p_test_id uuid, p_order_no integer, p_mode text, p_questions jsonb)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_section_id uuid;
  v_existing integer;
  v_new integer := coalesce(jsonb_array_length(p_questions), 0);
  v_base integer := (p_order_no - 1) * 10;
  v_ids uuid[];
  v_question record;
begin
  if not public.is_staff() then
    raise exception 'only admins and content editors can import' using errcode = '42501';
  end if;
  if p_mode is null or p_mode not in ('append', 'replace') then
    raise exception 'choose append or replace' using errcode = '22023';
  end if;
  if jsonb_typeof(p_questions) is distinct from 'array' then
    raise exception 'questions must be a list' using errcode = '22023';
  end if;
  perform 1 from public.listening_tests where id = p_test_id for update;
  if not found then
    raise exception 'listening test not found' using errcode = 'P0002';
  end if;
  select id into v_section_id from public.listening_sections where test_id = p_test_id and order_no = p_order_no;
  if v_section_id is null then
    raise exception 'save section % first', p_order_no using errcode = '22023';
  end if;

  if p_mode = 'replace' then
    delete from public.listening_questions where section_id = v_section_id;
  end if;
  select count(*) into v_existing from public.listening_questions where section_id = v_section_id;
  if v_existing + v_new > 10 then
    raise exception 'a section has 10 questions at most (% already, % imported)', v_existing, v_new using errcode = '22023';
  end if;

  -- The test's questions numbered without gaps first, so the new ones can follow the section's own.
  select array_agg(q.id order by s.order_no, q.q_no) into v_ids
  from public.listening_questions q join public.listening_sections s on s.id = q.section_id
  where q.test_id = p_test_id;
  if v_ids is not null then
    perform public.admin_order_listening_questions(p_test_id, v_ids);
  end if;

  for v_question in
    select e.value as q, e.ordinality as n from jsonb_array_elements(p_questions) with ordinality e
  loop
    insert into public.listening_questions (test_id, section_id, q_no, q_type, prompt, options, answer, explanation)
    values (
      p_test_id,
      v_section_id,
      v_base + v_existing + v_question.n,
      (v_question.q ->> 'q_type')::public.listening_question_type,
      v_question.q ->> 'prompt',
      coalesce(v_question.q -> 'options', '{}'::jsonb),
      v_question.q -> 'answer',
      nullif(v_question.q ->> 'explanation', '')
    );
  end loop;

  return jsonb_build_object(
    'questions_imported', v_new,
    'section_total', v_existing + v_new,
    'test_total', (select count(*) from public.listening_questions where test_id = p_test_id)
  );
end;
$$;

comment on function public.admin_import_listening_questions(uuid, integer, text, jsonb) is
  'Listening builder import: saves previewed questions into one section in one transaction (append or replace). Staff only; SECURITY INVOKER so the staff RLS policies apply.';

revoke all on function public.admin_import_listening_questions(uuid, integer, text, jsonb) from public, anon;
grant execute on function public.admin_import_listening_questions(uuid, integer, text, jsonb) to authenticated;
