-- M5-C1: Listening content (Implementation Plan §4). Same model as Reading (M4-C1).
--
--   listening_tests      one practice test (one test for Academic and General Training), draft → published
--   listening_sections   its 4 sections (parts), each with a recording and a transcript
--   listening_questions  up to 40 questions, 10 per section (1–10, 11–20, 21–30, 31–40), with the key
--
-- Attempts go in test_attempts (M4-C1) with module = 'listening' (graded by grade-test, M5-B2).
--
-- Security model, as for Reading:
--   * Students see only PUBLISHED tests. The list (title, min_plan) is public, so a locked Gold
--     test can be shown with an upgrade prompt; sections and questions need a signed-in user
--     whose plan includes the test.
--   * The answer key and the explanation are never readable by users (column privileges), and
--     neither is the transcript: it would give the answers away, so it's sent with the results
--     after submission (grade-test, service role).
--   * Staff (admin, content_editor) write content directly (RLS); the builder (M5-A1) reads keys
--     and transcripts through a staff-only SECURITY DEFINER function, as Reading's does.

-- The 11 Reading types plus the two labelling types (shapes: packages/shared ielts/listening.ts).
create type public.listening_question_type as enum (
  'mcq',
  'tfng',
  'ynng',
  'matching_headings',
  'matching_information',
  'matching_features',
  'sentence_completion',
  'summary_completion',
  'note_table_completion',
  'flowchart_completion',
  'short_answer',
  'map_labelling',
  'diagram_labelling'
);
comment on type public.listening_question_type is
  'IELTS Listening question types (M5-C1): the 11 Reading types plus map and diagram labelling.';

-- ── 1. listening_tests ──────────────────────────────────────────────────────────────────────
create table public.listening_tests (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(btrim(title)) between 1 and 200),
  source public.content_source not null default 'admin',
  status public.content_status not null default 'draft',
  min_plan public.plan_tier not null default 'free',
  created_by uuid references auth.users (id) on delete set null,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.listening_tests is
  'IELTS Listening practice tests (M5-C1): 4 sections, up to 40 questions. Students see published ones.';
comment on column public.listening_tests.min_plan is
  'Lowest plan that can take the test. Everyone sees it in the list; sections/questions need the plan.';

create index listening_tests_published_idx on public.listening_tests (published_at desc) where status = 'published';

create trigger listening_tests_touch
before update on public.listening_tests
for each row execute function public.touch_updated_at();

-- ── 2. listening_sections ───────────────────────────────────────────────────────────────────
create table public.listening_sections (
  id uuid primary key default gen_random_uuid(),
  test_id uuid not null references public.listening_tests (id) on delete cascade,
  order_no smallint not null check (order_no between 1 and 4),
  title text not null check (char_length(btrim(title)) between 1 and 200),
  -- Public CDN URL of the recording (R2, M5-B1). Empty while the builder is still uploading;
  -- a test can't be published without it.
  audio_url text check (audio_url ~ '^https?://[^\s]+$' and char_length(audio_url) <= 2000),
  duration_sec integer check (duration_sec between 1 and 3600),
  -- What is said, shown after submission. Closed to users before that (column privileges).
  transcript text check (char_length(transcript) <= 30000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (test_id, order_no),
  -- Target of listening_questions' (section_id, test_id) foreign key.
  unique (id, test_id)
);

comment on table public.listening_sections is 'The 4 sections (parts) of a Listening test, each with audio and transcript (M5-C1).';
comment on column public.listening_sections.transcript is
  'Never readable by users before submission (column grants); grade-test returns it with the results.';

create trigger listening_sections_touch
before update on public.listening_sections
for each row execute function public.touch_updated_at();

-- ── 3. listening_questions ──────────────────────────────────────────────────────────────────
create table public.listening_questions (
  id uuid primary key default gen_random_uuid(),
  test_id uuid not null,
  section_id uuid not null,
  q_no smallint not null check (q_no between 1 and 40),
  q_type public.listening_question_type not null,
  prompt text not null check (char_length(btrim(prompt)) between 1 and 2000),
  -- Shape per q_type (M5-C2); labelling questions carry the image URL and points here. Never the answer.
  options jsonb not null default '{}'::jsonb check (jsonb_typeof(options) in ('object', 'array')),
  -- The answer key: NOT readable by anon/authenticated (column privileges below).
  answer jsonb not null,
  explanation text check (char_length(explanation) <= 4000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Deferrable so the builder can renumber in one statement (as reading_questions, M4-A1).
  constraint listening_questions_test_id_q_no_key unique (test_id, q_no) deferrable initially immediate,
  foreign key (section_id, test_id) references public.listening_sections (id, test_id) on delete cascade
);

comment on table public.listening_questions is
  'Listening questions (M5-C1). answer and explanation are never readable by users (column grants).';
comment on column public.listening_questions.answer is
  'Answer key, shape per q_type (M5-C2). Read only by the service role (grade-test) and staff RPCs.';

create index listening_questions_section_idx on public.listening_questions (section_id, q_no);

create trigger listening_questions_touch
before update on public.listening_questions
for each row execute function public.touch_updated_at();

-- Section n holds questions 10n−9 … 10n, as in the test (section 2 = questions 11–20).
create function public.listening_questions_check_section()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order smallint;
begin
  select order_no into v_order from public.listening_sections where id = new.section_id;
  if v_order is not null and new.q_no not between (v_order - 1) * 10 + 1 and v_order * 10 then
    raise exception 'question % doesn''t belong in section % (questions % to %)', new.q_no, v_order, (v_order - 1) * 10 + 1, v_order * 10
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger listening_questions_section
before insert or update of q_no, section_id on public.listening_questions
for each row execute function public.listening_questions_check_section();

-- ── 4. Publishing ───────────────────────────────────────────────────────────────────────────
-- A test can only be published complete: 4 sections, each with audio and a transcript, and
-- questions numbered 1..N with no gaps. published_at is set the first time.
create function public.listening_tests_before_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sections integer;
  v_unready integer;
  v_questions integer;
  v_max integer;
begin
  if new.status = 'published' and (tg_op = 'INSERT' or old.status is distinct from 'published') then
    select count(*), count(*) filter (where audio_url is null or coalesce(btrim(transcript), '') = '')
      into v_sections, v_unready
      from public.listening_sections where test_id = new.id;
    select count(*), coalesce(max(q_no), 0) into v_questions, v_max from public.listening_questions where test_id = new.id;
    if v_sections <> 4 then
      raise exception 'a Listening test needs 4 sections to be published (it has %)', v_sections using errcode = '23514';
    end if;
    if v_unready > 0 then
      raise exception 'every section needs its audio and transcript to publish (% missing)', v_unready using errcode = '23514';
    end if;
    if v_questions = 0 or v_max <> v_questions then
      raise exception 'questions must be numbered 1 to N without gaps to publish (% questions, highest %)', v_questions, v_max
        using errcode = '23514';
    end if;
    new.published_at := coalesce(new.published_at, now());
  end if;
  return new;
end;
$$;

create trigger listening_tests_status
before insert or update of status on public.listening_tests
for each row execute function public.listening_tests_before_status();

-- ── Privileges & RLS ────────────────────────────────────────────────────────────────────────
alter table public.listening_tests enable row level security;
alter table public.listening_sections enable row level security;
alter table public.listening_questions enable row level security;

revoke all on table public.listening_tests, public.listening_sections, public.listening_questions from anon, authenticated;

-- Tests: the published list is public; staff see and write all.
grant select on table public.listening_tests to anon, authenticated;
grant insert, update, delete on table public.listening_tests to authenticated;

create policy "listening_tests: anyone reads published"
on public.listening_tests for select to anon, authenticated
using (status = 'published');

create policy "listening_tests: staff read all"
on public.listening_tests for select to authenticated
using ((select public.is_staff()));

create policy "listening_tests: staff insert"
on public.listening_tests for insert to authenticated
with check ((select public.is_staff()));

create policy "listening_tests: staff update"
on public.listening_tests for update to authenticated
using ((select public.is_staff())) with check ((select public.is_staff()));

-- Published tests are archived, not deleted (attempts point at them).
create policy "listening_tests: staff delete drafts"
on public.listening_tests for delete to authenticated
using ((select public.is_staff()) and status <> 'published');

-- Sections: everything but the transcript, for signed-in users whose plan includes the test.
grant select (id, test_id, order_no, title, audio_url, duration_sec, created_at, updated_at)
  on table public.listening_sections to authenticated;
grant insert, update, delete on table public.listening_sections to authenticated;

create policy "listening_sections: users read published tests in their plan"
on public.listening_sections for select to authenticated
using (exists (
  select 1 from public.listening_tests t
  where t.id = test_id and t.status = 'published' and public.has_plan(t.min_plan)
));

create policy "listening_sections: staff read all"
on public.listening_sections for select to authenticated
using ((select public.is_staff()));

create policy "listening_sections: staff write"
on public.listening_sections for all to authenticated
using ((select public.is_staff())) with check ((select public.is_staff()));

-- Questions: the same rows, never the answer or explanation columns.
grant select (id, test_id, section_id, q_no, q_type, prompt, options, created_at, updated_at)
  on table public.listening_questions to authenticated;
grant insert, update, delete on table public.listening_questions to authenticated;

create policy "listening_questions: users read published tests in their plan"
on public.listening_questions for select to authenticated
using (exists (
  select 1 from public.listening_tests t
  where t.id = test_id and t.status = 'published' and public.has_plan(t.min_plan)
));

create policy "listening_questions: staff read all"
on public.listening_questions for select to authenticated
using ((select public.is_staff()));

create policy "listening_questions: staff write"
on public.listening_questions for all to authenticated
using ((select public.is_staff())) with check ((select public.is_staff()));

revoke all on function public.listening_questions_check_section() from public, anon, authenticated;
revoke all on function public.listening_tests_before_status() from public, anon, authenticated;
