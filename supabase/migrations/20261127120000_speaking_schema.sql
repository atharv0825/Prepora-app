-- M7-C1: Speaking content, sessions, scored responses and recordings (Implementation Plan §2.1, §4, §5.1).
--
--   speaking_topics     Part 1 question sets, Part 2 cue cards, Part 3 discussions (each linked to
--                       a Part 2 card), draft → published
--   speaking_sessions   one practice session: a single part (M7: a Part 2 cue card) or a full test
--                       (M8: Parts 1 → 2 → 3); its part bands and the IELTS-rounded overall band
--   speaking_responses  one scored part of a session (written by score-speaking, M7-B3)
--   speaking-audio      private storage bucket for the recordings, one folder per user:
--                       {user_id}/{file}
--
-- Security model:
--   * Published topics are readable by everyone (as the other modules' lists). Staff write them.
--   * Sessions: a student starts their own (only `mode` is theirs to set; RLS checks user_id);
--     bands, status and completion are written by the service role (score-speaking, M8).
--   * Responses: a student reads their own; only the service role writes them (the AI scores
--     them). Free rows hold the summary only (the feedback the plan includes), as Writing (M6-C1).
--   * Recordings: a student uploads, reads and deletes only in their own folder. Every plan can
--     record (Free gets 2 scored Part 2 answers a month from its credits). Audio is kept 30 days
--     (plan §2.6): a clean-up job (later) deletes the files and clears audio_paths; transcripts
--     and feedback stay.

create type public.speaking_session_mode as enum ('part1', 'part2', 'part3', 'full_test');
comment on type public.speaking_session_mode is 'One part on its own (practice), or the full test (Parts 1 → 2 → 3, M8).';

create type public.speaking_session_status as enum ('in_progress', 'completed', 'abandoned');

-- ── 1. speaking_topics ──────────────────────────────────────────────────────────────────────
create table public.speaking_topics (
  id uuid primary key default gen_random_uuid(),
  part smallint not null check (part in (1, 2, 3)),
  -- Part 1: the theme ("Hometown"); Part 2: the cue card's task ("Describe a place you like to
  -- visit"); Part 3: the discussion's theme.
  title text not null check (char_length(btrim(title)) between 1 and 200),
  -- Part 2 only: "You should say:" points (2–5) shown under the title.
  cue_card_points text[] check (cue_card_points is null or cardinality(cue_card_points) between 2 and 5),
  -- Part 1 and Part 3: the examiner's questions, in order (1–12).
  questions text[] check (questions is null or cardinality(questions) between 1 and 12),
  -- Part 3 only: the Part 2 card it follows on from.
  parent_topic_id uuid references public.speaking_topics (id) on delete restrict,
  source public.content_source not null default 'admin',
  status public.content_status not null default 'draft',
  created_by uuid references auth.users (id) on delete set null,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint speaking_topics_shape check (
    case part
      when 2 then cue_card_points is not null and questions is null and parent_topic_id is null
      when 1 then questions is not null and cue_card_points is null and parent_topic_id is null
      else questions is not null and cue_card_points is null and parent_topic_id is not null
    end
  ),
  constraint speaking_topics_items_not_blank check (
    array_position(cue_card_points, null) is null and array_position(questions, null) is null
    and not ('' = any (coalesce(cue_card_points, '{}') || coalesce(questions, '{}')))
  )
);

comment on table public.speaking_topics is
  'IELTS Speaking content (M7-C1): Part 1 question sets, Part 2 cue cards, Part 3 discussions linked to a Part 2 card.';
comment on column public.speaking_topics.parent_topic_id is 'Part 3: the Part 2 cue card this discussion follows (plan §2.1).';

create index speaking_topics_published_idx on public.speaking_topics (part, published_at desc) where status = 'published';
create index speaking_topics_parent_idx on public.speaking_topics (parent_topic_id) where parent_topic_id is not null;

create trigger speaking_topics_touch
before update on public.speaking_topics
for each row execute function public.touch_updated_at();

-- A Part 3 discussion follows a Part 2 card, and is published only after it; published_at is set
-- the first time.
create function public.speaking_topics_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_parent record;
begin
  if new.parent_topic_id is not null then
    select part, status into v_parent from public.speaking_topics where id = new.parent_topic_id;
    if v_parent.part is distinct from 2 then
      raise exception 'a Part 3 discussion must follow a Part 2 cue card' using errcode = '23514';
    end if;
    if new.status = 'published' and v_parent.status <> 'published' then
      raise exception 'publish its Part 2 cue card first' using errcode = '23514';
    end if;
  end if;
  if new.status = 'published' then
    new.published_at := coalesce(new.published_at, now());
  end if;
  return new;
end;
$$;

create trigger speaking_topics_write
before insert or update of status, parent_topic_id on public.speaking_topics
for each row execute function public.speaking_topics_before_write();

-- ── 2. speaking_sessions ────────────────────────────────────────────────────────────────────
create table public.speaking_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  mode public.speaking_session_mode not null,
  status public.speaking_session_status not null default 'in_progress',
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  -- Each part's band (from its speaking_responses row) and the overall band: the IELTS-rounded
  -- average of the three parts (M8-B3). Whole or half bands.
  part1_band numeric(2, 1) check (part1_band between 0 and 9 and part1_band * 2 = trunc(part1_band * 2)),
  part2_band numeric(2, 1) check (part2_band between 0 and 9 and part2_band * 2 = trunc(part2_band * 2)),
  part3_band numeric(2, 1) check (part3_band between 0 and 9 and part3_band * 2 = trunc(part3_band * 2)),
  overall_band numeric(2, 1) check (overall_band between 0 and 9 and overall_band * 2 = trunc(overall_band * 2)),
  constraint speaking_sessions_completed check ((status = 'completed') = (completed_at is not null))
);

comment on table public.speaking_sessions is
  'Speaking practice sessions (M7-C1). A student starts their own (mode only); bands and status are server-written.';

create index speaking_sessions_user_idx on public.speaking_sessions (user_id, started_at desc);

-- ── 3. speaking_responses ───────────────────────────────────────────────────────────────────
-- One scored part. Written by score-speaking (service role) once the AI has scored it.
create table public.speaking_responses (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.speaking_sessions (id) on delete cascade,
  -- The session's owner, stored so RLS and history don't need a join (checked by a trigger).
  user_id uuid not null references auth.users (id) on delete cascade,
  topic_id uuid not null references public.speaking_topics (id) on delete restrict,
  part smallint not null check (part in (1, 2, 3)),
  -- speaking-audio paths ({user_id}/…): one recording for Part 2, one per answer for Parts 1 and 3.
  -- Emptied when the 30-day clean-up deletes the files.
  audio_paths text[] not null default '{}' check (cardinality(audio_paths) <= 12 and array_position(audio_paths, null) is null),
  duration_sec integer check (duration_sec between 0 and 1800),
  -- What was said (speech-to-text, M7-B1).
  transcript text not null check (char_length(transcript) <= 30000),
  -- Measured from the audio and transcript (M7-B2): words per minute, pauses, fillers.
  signals jsonb not null default '{}'::jsonb check (jsonb_typeof(signals) = 'object'),
  -- Band per criterion: { fc, lr, gra, pron }.
  scores jsonb not null check (jsonb_typeof(scores) = 'object' and scores ?& array['fc', 'lr', 'gra', 'pron']),
  band numeric(2, 1) not null check (band between 0 and 9 and band * 2 = trunc(band * 2)),
  -- What the plan includes (M7-C2): full feedback, or the Free summary.
  feedback jsonb not null default '{}'::jsonb check (jsonb_typeof(feedback) = 'object'),
  prompt_version text check (char_length(prompt_version) between 1 and 50),
  created_at timestamptz not null default now(),
  -- One scored response per part of a session (a retake is a new session).
  unique (session_id, part)
);

comment on table public.speaking_responses is
  'Scored Speaking parts (M7-C1). Users read their own; score-speaking (service role) writes. Free rows hold the summary only.';
comment on column public.speaking_responses.audio_paths is
  'speaking-audio object paths ({user_id}/…). Audio is kept 30 days (plan §2.6); the clean-up empties this.';

create index speaking_responses_user_idx on public.speaking_responses (user_id, created_at desc);
create index speaking_responses_topic_idx on public.speaking_responses (topic_id);

-- The response belongs to the session's owner, and its part fits the session's mode.
create function public.speaking_responses_check()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session record;
  v_topic_part smallint;
begin
  select user_id, mode into v_session from public.speaking_sessions where id = new.session_id;
  if v_session.user_id is distinct from new.user_id then
    raise exception 'the response must belong to the session''s student' using errcode = '23514';
  end if;
  if v_session.mode <> 'full_test' and v_session.mode::text <> 'part' || new.part then
    raise exception 'a % session has no Part %', v_session.mode, new.part using errcode = '23514';
  end if;
  select part into v_topic_part from public.speaking_topics where id = new.topic_id;
  if v_topic_part is distinct from new.part then
    raise exception 'the topic is for Part %, not Part %', v_topic_part, new.part using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger speaking_responses_check
before insert or update of session_id, user_id, part, topic_id on public.speaking_responses
for each row execute function public.speaking_responses_check();

-- ── Privileges & RLS ────────────────────────────────────────────────────────────────────────
alter table public.speaking_topics enable row level security;
alter table public.speaking_sessions enable row level security;
alter table public.speaking_responses enable row level security;

revoke all on table public.speaking_topics, public.speaking_sessions, public.speaking_responses from anon, authenticated;

-- Topics: published ones are public; staff see and write all.
grant select on table public.speaking_topics to anon, authenticated;
grant insert, update, delete on table public.speaking_topics to authenticated;

create policy "speaking_topics: anyone reads published"
on public.speaking_topics for select to anon, authenticated
using (status = 'published');

create policy "speaking_topics: staff read all"
on public.speaking_topics for select to authenticated
using ((select public.is_staff()));

create policy "speaking_topics: staff insert"
on public.speaking_topics for insert to authenticated
with check ((select public.is_staff()));

create policy "speaking_topics: staff update"
on public.speaking_topics for update to authenticated
using ((select public.is_staff())) with check ((select public.is_staff()));

create policy "speaking_topics: staff delete drafts"
on public.speaking_topics for delete to authenticated
using ((select public.is_staff()) and status <> 'published');

-- Sessions: read own; start own (the id and mode are the only columns a student sets).
grant select on table public.speaking_sessions to authenticated;
grant insert (id, user_id, mode) on table public.speaking_sessions to authenticated;

create policy "speaking_sessions: read own"
on public.speaking_sessions for select to authenticated
using ((select auth.uid()) = user_id);

create policy "speaking_sessions: start own"
on public.speaking_sessions for insert to authenticated
with check ((select auth.uid()) = user_id);

-- Responses: read own; no client writes.
grant select on table public.speaking_responses to authenticated;

create policy "speaking_responses: read own"
on public.speaking_responses for select to authenticated
using ((select auth.uid()) = user_id);

revoke all on function public.speaking_topics_before_write() from public, anon, authenticated;
revoke all on function public.speaking_responses_check() from public, anon, authenticated;

-- ── 4. speaking-audio bucket ────────────────────────────────────────────────────────────────
-- Private. MediaRecorder gives WebM/Opus (Chrome, Edge, Android) or MP4/AAC (Safari, iOS);
-- WAV/MPEG/OGG for other recorders. A 2-minute answer is 1–3 MB; 15 MB at most. Upload with the
-- bare type ("audio/webm", not "audio/webm;codecs=opus").
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('speaking-audio', 'speaking-audio', false, 15728640,
        array['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/x-m4a', 'audio/aac', 'audio/mpeg', 'audio/wav', 'audio/x-wav'])
on conflict (id) do update
set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy "speaking-audio: read own folder"
on storage.objects for select to authenticated
using (bucket_id = 'speaking-audio' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "speaking-audio: upload to own folder"
on storage.objects for insert to authenticated
with check (bucket_id = 'speaking-audio' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "speaking-audio: replace in own folder"
on storage.objects for update to authenticated
using (bucket_id = 'speaking-audio' and (storage.foldername(name))[1] = (select auth.uid())::text)
with check (bucket_id = 'speaking-audio' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "speaking-audio: delete own"
on storage.objects for delete to authenticated
using (bucket_id = 'speaking-audio' and (storage.foldername(name))[1] = (select auth.uid())::text);
