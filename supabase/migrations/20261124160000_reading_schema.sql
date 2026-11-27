-- M4-C1: Reading content and test attempts (Implementation Plan §4).
--
--   reading_tests      one practice test (Academic or General), draft → review → published
--   reading_passages   its 3 passages
--   reading_questions  up to 40 questions across the passages, with the answer key
--   test_attempts      a student's submitted Reading (later Listening) test, graded
--
-- Security model:
--   * Students see only PUBLISHED tests. The test list (title, type, min_plan) is public, so a
--     locked Gold test can still be shown with an upgrade prompt; passages and questions are
--     readable only by signed-in users whose plan includes the test (min_plan).
--   * The answer key never reaches a student: reading_questions.answer and .explanation (which
--     gives the answer away) have no SELECT grant for anon/authenticated at all (column
--     privileges), whatever the row policies say. Grading runs in an Edge Function with the
--     service role (M4-B2), which also returns the answers after submission.
--   * Staff (admin, content_editor) create and edit content. Because the answer columns are
--     closed to the `authenticated` role for everyone, staff read answer keys through a
--     SECURITY DEFINER RPC (added with the builder, M4-A1); they can write them directly.
--   * test_attempts: a student reads their own; only the service role writes (grade-test).

-- ── Enums ───────────────────────────────────────────────────────────────────────────────────
-- Shared by every content module (Writing, Speaking and Listening reuse them).
create type public.content_status as enum ('draft', 'review', 'published', 'archived');
comment on type public.content_status is 'Content workflow: draft → review → published; archived = withdrawn.';

create type public.content_source as enum ('admin', 'ai');
comment on type public.content_source is 'Who made the content: written in the admin panel, or AI-generated and reviewed (M10).';

-- The 11 Reading question types (Implementation Plan §2.3). Shapes per type: M4-C2.
create type public.reading_question_type as enum (
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
  'short_answer'
);
comment on type public.reading_question_type is 'The 11 IELTS Reading question types (M4-C1).';

create type public.test_module as enum ('reading', 'listening');

-- ── Helpers ─────────────────────────────────────────────────────────────────────────────────
-- Staff = admin or content editor (the admin panel's two roles, M1-A1).
create function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role in ('admin', 'content_editor')
  );
$$;

comment on function public.is_staff() is
  'True when the signed-in user is an admin or content editor (M4-C1). For content RLS.';

-- free < gold < platinum.
create function public.plan_rank(p_plan public.plan_tier)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case p_plan when 'free' then 0 when 'gold' then 1 when 'platinum' then 2 end;
$$;

-- Does the signed-in user's plan include content that needs p_min_plan? (No profile = Free.)
create function public.has_plan(p_min_plan public.plan_tier)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.plan_rank(coalesce(
    (select p.plan from public.profiles p where p.id = (select auth.uid())), 'free'
  )) >= public.plan_rank(p_min_plan);
$$;

comment on function public.has_plan(public.plan_tier) is
  'True when the signed-in user''s plan is at least p_min_plan (M4-C1). For content RLS.';

-- ── 1. reading_tests ────────────────────────────────────────────────────────────────────────
create table public.reading_tests (
  id uuid primary key default gen_random_uuid(),
  test_type public.ielts_test_type not null,
  title text not null check (char_length(btrim(title)) between 1 and 200),
  source public.content_source not null default 'admin',
  status public.content_status not null default 'draft',
  min_plan public.plan_tier not null default 'free',
  created_by uuid references auth.users (id) on delete set null,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.reading_tests is
  'IELTS Reading practice tests (M4-C1): 3 passages, up to 40 questions. Students see published ones.';
comment on column public.reading_tests.min_plan is
  'Lowest plan that can take the test. Everyone sees it in the list; passages/questions need the plan.';

create index reading_tests_published_idx on public.reading_tests (test_type, published_at desc)
  where status = 'published';

create trigger reading_tests_touch
before update on public.reading_tests
for each row execute function public.touch_updated_at();

-- ── 2. reading_passages ─────────────────────────────────────────────────────────────────────
create table public.reading_passages (
  id uuid primary key default gen_random_uuid(),
  test_id uuid not null references public.reading_tests (id) on delete cascade,
  order_no smallint not null check (order_no between 1 and 3),
  title text not null check (char_length(btrim(title)) between 1 and 200),
  -- Rich text from the builder (format and sanitising: M4-A1).
  body text not null check (char_length(body) between 1 and 30000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (test_id, order_no),
  -- Target of reading_questions' (passage_id, test_id) foreign key.
  unique (id, test_id)
);

comment on table public.reading_passages is 'The 3 passages of a Reading test (M4-C1).';

create trigger reading_passages_touch
before update on public.reading_passages
for each row execute function public.touch_updated_at();

-- ── 3. reading_questions ────────────────────────────────────────────────────────────────────
create table public.reading_questions (
  id uuid primary key default gen_random_uuid(),
  -- test_id is stored (and must match the passage's) so question numbers are unique per test.
  test_id uuid not null,
  passage_id uuid not null,
  q_no smallint not null check (q_no between 1 and 40),
  q_type public.reading_question_type not null,
  prompt text not null check (char_length(btrim(prompt)) between 1 and 2000),
  -- Choices, headings, word limit, …: shape per q_type (M4-C2). Never contains the answer.
  options jsonb not null default '{}'::jsonb check (jsonb_typeof(options) in ('object', 'array')),
  -- The answer key: NOT readable by anon/authenticated (column privileges below).
  answer jsonb not null,
  -- Shown with the results after submission; also closed before it (it gives the answer away).
  explanation text check (char_length(explanation) <= 4000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (test_id, q_no),
  foreign key (passage_id, test_id) references public.reading_passages (id, test_id) on delete cascade
);

comment on table public.reading_questions is
  'Reading questions (M4-C1). answer and explanation are never readable by users (column grants).';
comment on column public.reading_questions.answer is
  'Answer key, shape per q_type (M4-C2). Read only by the service role (grade-test) and staff RPCs.';

create index reading_questions_passage_idx on public.reading_questions (passage_id, q_no);

create trigger reading_questions_touch
before update on public.reading_questions
for each row execute function public.touch_updated_at();

-- ── 4. Publishing ───────────────────────────────────────────────────────────────────────────
-- A test can only be published complete: 3 passages and questions numbered 1..N with no gaps.
-- published_at is set the first time it's published.
create function public.reading_tests_before_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_passages integer;
  v_questions integer;
  v_max integer;
begin
  if new.status = 'published' and (tg_op = 'INSERT' or old.status is distinct from 'published') then
    select count(*) into v_passages from public.reading_passages where test_id = new.id;
    select count(*), coalesce(max(q_no), 0) into v_questions, v_max from public.reading_questions where test_id = new.id;
    if v_passages <> 3 then
      raise exception 'a Reading test needs 3 passages to be published (it has %)', v_passages using errcode = '23514';
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

create trigger reading_tests_status
before insert or update of status on public.reading_tests
for each row execute function public.reading_tests_before_status();

-- ── 5. test_attempts ────────────────────────────────────────────────────────────────────────
-- One submitted, graded test. Written by grade-test (service role, M4-B2) only.
-- test_id points at reading_tests or listening_tests (by module), so there's no foreign key:
-- a student's history is kept even if a test is later deleted.
create table public.test_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  module public.test_module not null,
  test_id uuid not null,
  -- The student's answers by question number: { "1": …, "2": … }.
  answers jsonb not null default '{}'::jsonb check (jsonb_typeof(answers) = 'object'),
  raw_score smallint not null check (raw_score between 0 and 40),
  -- IELTS bands are whole or half: 0, 0.5, …, 9.
  band numeric(2, 1) not null check (band between 0 and 9 and band * 2 = trunc(band * 2)),
  time_taken_sec integer check (time_taken_sec between 0 and 86400),
  created_at timestamptz not null default now()
);

comment on table public.test_attempts is
  'Submitted Reading/Listening tests with raw score and band (M4-C1). Users read their own; grade-test writes.';

create index test_attempts_user_idx on public.test_attempts (user_id, created_at desc);
create index test_attempts_user_test_idx on public.test_attempts (user_id, module, test_id);

-- ── Privileges & RLS ────────────────────────────────────────────────────────────────────────
alter table public.reading_tests enable row level security;
alter table public.reading_passages enable row level security;
alter table public.reading_questions enable row level security;
alter table public.test_attempts enable row level security;

revoke all on table public.reading_tests, public.reading_passages, public.reading_questions, public.test_attempts
  from anon, authenticated;

-- Tests: the published list is public (also signed out, e.g. a landing page); staff see all.
grant select on table public.reading_tests to anon, authenticated;
grant insert, update, delete on table public.reading_tests to authenticated;

create policy "reading_tests: anyone reads published"
on public.reading_tests for select to anon, authenticated
using (status = 'published');

create policy "reading_tests: staff read all"
on public.reading_tests for select to authenticated
using ((select public.is_staff()));

create policy "reading_tests: staff insert"
on public.reading_tests for insert to authenticated
with check ((select public.is_staff()));

create policy "reading_tests: staff update"
on public.reading_tests for update to authenticated
using ((select public.is_staff())) with check ((select public.is_staff()));

-- Published tests are archived, not deleted (attempts point at them).
create policy "reading_tests: staff delete drafts"
on public.reading_tests for delete to authenticated
using ((select public.is_staff()) and status <> 'published');

-- Passages: signed-in users whose plan includes the published test; staff everything.
grant select, insert, update, delete on table public.reading_passages to authenticated;

create policy "reading_passages: users read published tests in their plan"
on public.reading_passages for select to authenticated
using (exists (
  select 1 from public.reading_tests t
  where t.id = test_id and t.status = 'published' and public.has_plan(t.min_plan)
));

create policy "reading_passages: staff read all"
on public.reading_passages for select to authenticated
using ((select public.is_staff()));

create policy "reading_passages: staff write"
on public.reading_passages for all to authenticated
using ((select public.is_staff())) with check ((select public.is_staff()));

-- Questions: the same rows as passages, but never the answer or explanation columns.
grant select (id, test_id, passage_id, q_no, q_type, prompt, options, created_at, updated_at)
  on table public.reading_questions to authenticated;
grant insert, update, delete on table public.reading_questions to authenticated;

create policy "reading_questions: users read published tests in their plan"
on public.reading_questions for select to authenticated
using (exists (
  select 1 from public.reading_tests t
  where t.id = test_id and t.status = 'published' and public.has_plan(t.min_plan)
));

create policy "reading_questions: staff read all"
on public.reading_questions for select to authenticated
using ((select public.is_staff()));

create policy "reading_questions: staff write"
on public.reading_questions for all to authenticated
using ((select public.is_staff())) with check ((select public.is_staff()));

-- Attempts: read own; no client writes.
grant select on table public.test_attempts to authenticated;

create policy "test_attempts: read own"
on public.test_attempts for select to authenticated
using ((select auth.uid()) = user_id);

-- Supabase grants new functions to anon directly: revoke from anon as well as public.
revoke all on function public.is_staff() from public, anon;
grant execute on function public.is_staff() to authenticated;
revoke all on function public.has_plan(public.plan_tier) from public, anon;
grant execute on function public.has_plan(public.plan_tier) to authenticated;
revoke all on function public.reading_tests_before_status() from public, anon, authenticated;
