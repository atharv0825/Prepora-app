-- M6-C1: Writing content, submissions and handwritten photos (Implementation Plan §2.2, §4, §5.3).
--
--   writing_tasks        a Writing prompt: Task 1 Academic (report on a chart), Task 1 General
--                        (letter) or Task 2 (essay), draft → published
--   writing_submissions  a student's scored answer to a task (written by score-writing, M6-B3)
--   writing-photos       private storage bucket for photos of handwritten answers (M6-F2/B4),
--                        one folder per user: {user_id}/{file}
--
-- Security model:
--   * Prompts aren't secret: the published tasks are readable by everyone (as the Reading and
--     Listening lists). Staff (admin, content_editor) write them directly (RLS).
--   * Writing is paid for with credits, not plan-gated content, so there's no min_plan.
--   * A student reads only their own submissions; only the service role writes them (the AI
--     scores them, so a client can't write its own band). score-writing stores only what the
--     student's plan includes: for Free that's the summary shape (M6-C2), so the full feedback
--     can't be read from the table either.
--   * Photos: a student reads, uploads and deletes only files in their own folder. Uploading
--     needs Gold or Platinum (photo upload is a Gold feature, §2.6; ocr-writing also checks it
--     when spending the credit), so Free accounts can't use the bucket as free storage.

create type public.writing_input_mode as enum ('typed', 'photo');
comment on type public.writing_input_mode is 'How a Writing answer was given: typed in the editor, or a photo of handwriting (OCR).';

-- ── 1. writing_tasks ────────────────────────────────────────────────────────────────────────
create table public.writing_tasks (
  id uuid primary key default gen_random_uuid(),
  task_no smallint not null check (task_no in (1, 2)),
  -- Task 1 differs by test (Academic report / General letter), so it must say which. Task 2 is
  -- an essay in both: null means it suits both; a value targets one.
  test_type public.ielts_test_type,
  title text not null check (char_length(btrim(title)) between 1 and 200),
  prompt text not null check (char_length(btrim(prompt)) between 1 and 4000),
  -- Public URL of the chart, graph, table, map or diagram (Task 1 Academic only; upload: M6-A1).
  image_url text check (image_url ~ '^https?://[^\s]+$' and char_length(image_url) <= 2000),
  source public.content_source not null default 'admin',
  status public.content_status not null default 'draft',
  created_by uuid references auth.users (id) on delete set null,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint writing_tasks_task1_test_type check (task_no = 2 or test_type is not null),
  constraint writing_tasks_image_academic_task1 check (image_url is null or (task_no = 1 and test_type = 'academic'))
);

comment on table public.writing_tasks is
  'IELTS Writing prompts (M6-C1): Task 1 Academic (chart), Task 1 General (letter), Task 2 (essay). Everyone reads published ones.';
comment on column public.writing_tasks.test_type is
  'Required for Task 1 (academic = report, general = letter). For Task 2, null = suits both tests.';
comment on column public.writing_tasks.image_url is
  'The visual a Task 1 Academic report describes; required to publish one.';

create index writing_tasks_published_idx on public.writing_tasks (task_no, published_at desc) where status = 'published';

create trigger writing_tasks_touch
before update on public.writing_tasks
for each row execute function public.touch_updated_at();

-- Publishing: a Task 1 Academic report needs its visual, also while it stays published (the
-- image can't be removed from a published one). published_at is set the first time.
create function public.writing_tasks_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'published' then
    if new.task_no = 1 and new.test_type = 'academic' and new.image_url is null then
      raise exception 'a published Task 1 Academic prompt needs its chart image' using errcode = '23514';
    end if;
    new.published_at := coalesce(new.published_at, now());
  end if;
  return new;
end;
$$;

create trigger writing_tasks_publish
before insert or update of status, image_url, task_no, test_type on public.writing_tasks
for each row execute function public.writing_tasks_before_write();

-- ── 2. writing_submissions ──────────────────────────────────────────────────────────────────
-- One scored answer. Written by score-writing (service role, M6-B3) once the AI has scored it,
-- so every row has its scores. Kept when the task is archived; a task with submissions can't
-- be deleted (archive it instead).
create table public.writing_submissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  task_id uuid not null references public.writing_tasks (id) on delete restrict,
  input_mode public.writing_input_mode not null,
  -- Storage paths in writing-photos ({user_id}/…), up to 2 pages; only for photo answers.
  photo_paths text[],
  -- The answer as scored: typed, or the OCR text after the student checked and edited it.
  text text not null check (char_length(btrim(text)) between 1 and 20000),
  word_count integer not null check (word_count between 0 and 5000),
  -- Band per criterion: { ta, cc, lr, gra } (ta = Task Achievement / Task Response).
  scores jsonb not null check (jsonb_typeof(scores) = 'object' and scores ?& array['ta', 'cc', 'lr', 'gra']),
  -- IELTS bands are whole or half: 0, 0.5, …, 9.
  band numeric(2, 1) not null check (band between 0 and 9 and band * 2 = trunc(band * 2)),
  -- corrections, strengths, improvements, model_answer (shape: M6-C2). Summary only for Free.
  feedback jsonb not null default '{}'::jsonb check (jsonb_typeof(feedback) = 'object'),
  time_taken_sec integer check (time_taken_sec between 0 and 86400),
  -- Which rubric prompt scored it (versioned prompt files, M6-B2), to compare prompt versions.
  prompt_version text check (char_length(prompt_version) between 1 and 50),
  created_at timestamptz not null default now(),
  constraint writing_submissions_photos check (
    case input_mode
      when 'photo' then photo_paths is not null and cardinality(photo_paths) between 1 and 2
                        and array_position(photo_paths, null) is null
      else photo_paths is null
    end
  )
);

comment on table public.writing_submissions is
  'Scored Writing answers (M6-C1). Users read their own; score-writing (service role) writes. Free rows hold the summary only.';
comment on column public.writing_submissions.photo_paths is
  'writing-photos object paths ({user_id}/…), 1–2 pages, for photo answers only.';
comment on column public.writing_submissions.feedback is
  'What the student''s plan includes when scored: full feedback (Gold/Platinum) or the summary (Free).';

create index writing_submissions_user_idx on public.writing_submissions (user_id, created_at desc);
create index writing_submissions_user_task_idx on public.writing_submissions (user_id, task_id);
create index writing_submissions_task_idx on public.writing_submissions (task_id);

-- ── Privileges & RLS ────────────────────────────────────────────────────────────────────────
alter table public.writing_tasks enable row level security;
alter table public.writing_submissions enable row level security;

revoke all on table public.writing_tasks, public.writing_submissions from anon, authenticated;

-- Tasks: published ones are public; staff see and write all.
grant select on table public.writing_tasks to anon, authenticated;
grant insert, update, delete on table public.writing_tasks to authenticated;

create policy "writing_tasks: anyone reads published"
on public.writing_tasks for select to anon, authenticated
using (status = 'published');

create policy "writing_tasks: staff read all"
on public.writing_tasks for select to authenticated
using ((select public.is_staff()));

create policy "writing_tasks: staff insert"
on public.writing_tasks for insert to authenticated
with check ((select public.is_staff()));

create policy "writing_tasks: staff update"
on public.writing_tasks for update to authenticated
using ((select public.is_staff())) with check ((select public.is_staff()));

-- Published tasks are archived, not deleted.
create policy "writing_tasks: staff delete drafts"
on public.writing_tasks for delete to authenticated
using ((select public.is_staff()) and status <> 'published');

-- Submissions: read own; no client writes.
grant select on table public.writing_submissions to authenticated;

create policy "writing_submissions: read own"
on public.writing_submissions for select to authenticated
using ((select auth.uid()) = user_id);

revoke all on function public.writing_tasks_before_write() from public, anon, authenticated;

-- ── 3. writing-photos bucket ────────────────────────────────────────────────────────────────
-- Private: files are read through the student's session or signed URLs, and by ocr-writing
-- (service role). Phone photos: JPEG, PNG, WebP or HEIC/HEIF (iPhone), 10 MB at most.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('writing-photos', 'writing-photos', false, 10485760,
        array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'])
on conflict (id) do update
set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy "writing-photos: read own folder"
on storage.objects for select to authenticated
using (bucket_id = 'writing-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "writing-photos: Gold uploads to own folder"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'writing-photos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and (select public.has_plan('gold'))
);

create policy "writing-photos: Gold replaces in own folder"
on storage.objects for update to authenticated
using (bucket_id = 'writing-photos' and (storage.foldername(name))[1] = (select auth.uid())::text)
with check (
  bucket_id = 'writing-photos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and (select public.has_plan('gold'))
);

create policy "writing-photos: delete own"
on storage.objects for delete to authenticated
using (bucket_id = 'writing-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
