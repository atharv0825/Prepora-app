-- M8.7: random practice picks and hidden study plans.
--
--   pick_next(kind, exclude[])  → a random published item of that kind the student hasn't done
--                                 (the one done longest ago once everything is done)
--   assign_my_study_plan(restart) → one active template picked AT RANDOM by the server
--   get_my_study_plan()         → today's items (carried-over ones first) resolved to real,
--                                 not-yet-done content, the week ahead, and progress
--
-- Students never read the templates: the template tables are staff-only and the RPCs never
-- return a template's id or name. Everything is computed for auth.uid().
--
-- Item kinds map to real content: Reading / Listening tests, Writing Task 1 / Task 2 topics,
-- Speaking Part 1 sets / Part 2 cue cards, and the Speaking full test (a cue card with a Part 3
-- discussion, plus a Part 1 set). There's no Writing full test, so there's no kind for one.

create type public.study_item_kind as enum (
  'reading_test', 'listening_test', 'writing_t1', 'writing_t2', 'speaking_p1', 'speaking_p2', 'speaking_full'
);

-- ── Templates (staff only) ──────────────────────────────────────────────────────────────────
create table public.study_plan_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 100),
  days smallint not null check (days between 1 and 60),
  -- null: for both Academic and General Training students.
  test_type public.ielts_test_type,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
comment on table public.study_plan_templates is
  'M8.7 study plan templates. Staff only: students get one assigned at random (assign_my_study_plan) and never see the list.';

create table public.study_plan_items (
  template_id uuid not null references public.study_plan_templates (id) on delete cascade,
  day smallint not null check (day between 1 and 60),
  order_no smallint not null check (order_no between 1 and 10),
  kind public.study_item_kind not null,
  primary key (template_id, day, order_no)
);
comment on table public.study_plan_items is 'M8.7 what a template asks for on each day: a kind of practice, resolved to real content per student.';

-- ── Students' plans (reached only through the RPCs) ────────────────────────────────────────
create table public.user_study_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  template_id uuid not null references public.study_plan_templates (id) on delete restrict,
  started_on date not null,
  started_at timestamptz not null default now(),
  status text not null default 'active' check (status in ('active', 'finished', 'restarted'))
);
create unique index user_study_plans_one_active on public.user_study_plans (user_id) where status = 'active';
create index user_study_plans_user_idx on public.user_study_plans (user_id, started_at desc);

-- The content chosen for each plan item, fixed once picked (refreshing doesn't reshuffle).
-- item_id is null while there's no content of that kind yet; it's retried on the next call.
create table public.user_study_plan_picks (
  plan_id uuid not null references public.user_study_plans (id) on delete cascade,
  day smallint not null,
  order_no smallint not null,
  kind public.study_item_kind not null,
  item_id uuid,
  picked_at timestamptz not null default now(),
  primary key (plan_id, day, order_no)
);

alter table public.study_plan_templates enable row level security;
alter table public.study_plan_items enable row level security;
alter table public.user_study_plans enable row level security;
alter table public.user_study_plan_picks enable row level security;

revoke all on table public.study_plan_templates, public.study_plan_items, public.user_study_plans, public.user_study_plan_picks from anon, authenticated;
grant select, insert, update, delete on table public.study_plan_templates, public.study_plan_items to authenticated;
grant select on table public.user_study_plans, public.user_study_plan_picks to authenticated;

create policy "study_plan_templates: staff" on public.study_plan_templates for all to authenticated
  using (public.is_staff()) with check (public.is_staff());
create policy "study_plan_items: staff" on public.study_plan_items for all to authenticated
  using (public.is_staff()) with check (public.is_staff());
create policy "user_study_plans: staff read" on public.user_study_plans for select to authenticated using (public.is_staff());
create policy "user_study_plan_picks: staff read" on public.user_study_plan_picks for select to authenticated using (public.is_staff());

-- ── Internal: what a student could practise for a kind, and when they last did each ───────────
-- Published content only; the student's test type (Academic / General) for Reading and Writing
-- Task 1; never a test their plan doesn't include. Not callable by clients.
create function public.study_candidates(p_user uuid, p_kind public.study_item_kind)
returns table (item_id uuid, title text, extra jsonb, last_done timestamptz)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_type public.ielts_test_type;
  v_rank integer;
begin
  select p.test_type, public.plan_rank(coalesce(p.plan, 'free')) into v_type, v_rank
  from public.profiles p where p.id = p_user;
  v_rank := coalesce(v_rank, 0);

  case p_kind
  when 'reading_test' then
    return query
    select t.id, t.title, '{}'::jsonb,
           (select max(a.created_at) from public.test_attempts a where a.user_id = p_user and a.module = 'reading' and a.test_id = t.id)
    from public.reading_tests t
    where t.status = 'published' and (v_type is null or t.test_type = v_type) and public.plan_rank(t.min_plan) <= v_rank;
  when 'listening_test' then
    return query
    select t.id, t.title, '{}'::jsonb,
           (select max(a.created_at) from public.test_attempts a where a.user_id = p_user and a.module = 'listening' and a.test_id = t.id)
    from public.listening_tests t
    where t.status = 'published' and public.plan_rank(t.min_plan) <= v_rank;
  when 'writing_t1', 'writing_t2' then
    return query
    select w.id, w.title, jsonb_build_object('task_no', w.task_no),
           (select max(s.created_at) from public.writing_submissions s where s.user_id = p_user and s.task_id = w.id)
    from public.writing_tasks w
    where w.status = 'published'
      and w.task_no = case p_kind when 'writing_t1' then 1 else 2 end
      and (w.test_type is null or v_type is null or w.test_type = v_type);
  when 'speaking_p1', 'speaking_p2' then
    return query
    select s.id, s.title, jsonb_build_object('part', s.part),
           (select max(r.created_at) from public.speaking_responses r where r.user_id = p_user and r.topic_id = s.id)
    from public.speaking_topics s
    where s.status = 'published' and s.part = case p_kind when 'speaking_p1' then 1 else 2 end;
  when 'speaking_full' then
    -- A cue card that has a published Part 3 discussion, with a random Part 1 set to go with it.
    return query
    select c.id, c.title,
           jsonb_build_object(
             'card', c.id,
             'p3', (select d.id from public.speaking_topics d where d.parent_topic_id = c.id and d.part = 3 and d.status = 'published' order by d.published_at desc limit 1),
             'p1', (select q.id from public.speaking_topics q where q.part = 1 and q.status = 'published' order by random() limit 1)
           ),
           (select max(r.created_at) from public.speaking_responses r where r.user_id = p_user and r.topic_id = c.id)
    from public.speaking_topics c
    where c.status = 'published' and c.part = 2
      and exists (select 1 from public.speaking_topics d where d.parent_topic_id = c.id and d.part = 3 and d.status = 'published')
      and exists (select 1 from public.speaking_topics q where q.part = 1 and q.status = 'published');
  end case;
end;
$$;

-- One pick: not done yet first (random among them), else the one done longest ago; never one of
-- p_exclude unless nothing else is left. Null when there's no content of that kind. Internal.
create function public.study_pick(p_user uuid, p_kind public.study_item_kind, p_exclude uuid[])
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v record;
begin
  select c.* into v
  from public.study_candidates(p_user, p_kind) c
  order by (c.item_id = any (coalesce(p_exclude, '{}'))), (c.last_done is not null), c.last_done, random()
  limit 1;
  if not found then
    return null;
  end if;
  return jsonb_build_object(
    'kind', p_kind,
    'item_id', v.item_id,
    'title', v.title,
    'extra', v.extra,
    'done_before', v.last_done is not null
  );
end;
$$;

-- Has the student practised this item since a moment? (Plan items count once done after the plan began.)
create function public.study_done_since(p_user uuid, p_kind public.study_item_kind, p_item uuid, p_since timestamptz)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p_item is null then false
    when p_kind in ('reading_test', 'listening_test') then exists (
      select 1 from public.test_attempts a where a.user_id = p_user and a.test_id = p_item and a.created_at >= p_since)
    when p_kind in ('writing_t1', 'writing_t2') then exists (
      select 1 from public.writing_submissions s where s.user_id = p_user and s.task_id = p_item and s.created_at >= p_since)
    else exists (
      select 1 from public.speaking_responses r where r.user_id = p_user and r.topic_id = p_item and r.created_at >= p_since)
  end;
$$;

revoke all on function public.study_candidates(uuid, public.study_item_kind) from public, anon, authenticated;
revoke all on function public.study_pick(uuid, public.study_item_kind, uuid[]) from public, anon, authenticated;
revoke all on function public.study_done_since(uuid, public.study_item_kind, uuid, timestamptz) from public, anon, authenticated;

-- ── pick_next: "Pick for me" ────────────────────────────────────────────────────────────────
create function public.pick_next(p_kind public.study_item_kind, p_exclude uuid[] default '{}')
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'sign in to get a pick' using errcode = '42501';
  end if;
  return public.study_pick(auth.uid(), p_kind, p_exclude);
end;
$$;
comment on function public.pick_next(public.study_item_kind, uuid[]) is
  'M8.7 a random published item of a kind the caller has not done (or the one done longest ago), avoiding p_exclude when possible. Null when there is no content.';

-- ── assign_my_study_plan: a random hidden template ──────────────────────────────────────────
create function public.assign_my_study_plan(p_restart boolean default false)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_type public.ielts_test_type;
  v_tz text;
  v_current public.user_study_plans;
  v_template uuid;
  v_days smallint;
  v_plan public.user_study_plans;
begin
  if v_user is null then
    raise exception 'sign in to get a study plan' using errcode = '42501';
  end if;
  -- One assignment at a time per student.
  perform pg_advisory_xact_lock(hashtextextended('study_plan:' || v_user::text, 0));
  select p.test_type, coalesce(p.timezone, 'UTC') into v_type, v_tz from public.profiles p where p.id = v_user;
  v_tz := coalesce(v_tz, 'UTC');

  select * into v_current from public.user_study_plans where user_id = v_user and status = 'active';
  if found and not p_restart then
    select days into v_days from public.study_plan_templates where id = v_current.template_id;
    return jsonb_build_object('started_on', v_current.started_on, 'days', v_days, 'new', false);
  end if;

  -- A random active template for the student's test type with at least one item; a different
  -- one from the current plan when restarting (if there is another).
  select t.id, t.days into v_template, v_days
  from public.study_plan_templates t
  where t.active and (t.test_type is null or v_type is null or t.test_type = v_type)
    and exists (select 1 from public.study_plan_items i where i.template_id = t.id)
  order by (t.id = v_current.template_id) nulls first, random()
  limit 1;
  if v_template is null then
    raise exception 'no study plans are available yet' using errcode = 'P0002';
  end if;

  if v_current.id is not null then
    update public.user_study_plans set status = 'restarted' where id = v_current.id;
  end if;
  insert into public.user_study_plans (user_id, template_id, started_on)
  values (v_user, v_template, (now() at time zone v_tz)::date)
  returning * into v_plan;
  return jsonb_build_object('started_on', v_plan.started_on, 'days', v_days, 'new', true);
end;
$$;
comment on function public.assign_my_study_plan(boolean) is
  'M8.7 gives the caller a study plan: one active template chosen at random on the server (never returned). Keeps the current plan unless p_restart, which picks a different template.';

-- ── get_my_study_plan: today, the week ahead, progress ──────────────────────────────────────
create function public.get_my_study_plan()
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_tz text;
  v_today date;
  v_plan public.user_study_plans;
  v_days smallint;
  v_day integer;
  v_item record;
  v_pick jsonb;
  v_used uuid[];
  v_today_items jsonb;
  v_week jsonb;
  v_total integer;
  v_done integer;
begin
  if v_user is null then
    raise exception 'sign in to see your study plan' using errcode = '42501';
  end if;
  select coalesce(p.timezone, 'UTC') into v_tz from public.profiles p where p.id = v_user;
  v_tz := coalesce(v_tz, 'UTC');
  v_today := (now() at time zone v_tz)::date;

  select * into v_plan from public.user_study_plans where user_id = v_user and status = 'active';
  if not found then
    return jsonb_build_object('active', false);
  end if;
  select days into v_days from public.study_plan_templates where id = v_plan.template_id;
  v_day := least(v_days, greatest(1, v_today - v_plan.started_on + 1));

  -- Resolve the items up to today that have no content yet. New content published later is
  -- picked up here; an item never gets content already used elsewhere in this plan.
  for v_item in
    select i.day, i.order_no, i.kind
    from public.study_plan_items i
    left join public.user_study_plan_picks k on k.plan_id = v_plan.id and k.day = i.day and k.order_no = i.order_no
    where i.template_id = v_plan.template_id and i.day <= v_day and k.item_id is null
    order by i.day, i.order_no
  loop
    select coalesce(array_agg(k.item_id) filter (where k.item_id is not null), '{}') into v_used
    from public.user_study_plan_picks k where k.plan_id = v_plan.id;
    v_pick := public.study_pick(v_user, v_item.kind, v_used);
    insert into public.user_study_plan_picks (plan_id, day, order_no, kind, item_id)
    values (v_plan.id, v_item.day, v_item.order_no, v_item.kind, (v_pick ->> 'item_id')::uuid)
    on conflict (plan_id, day, order_no) do update set item_id = excluded.item_id, picked_at = now()
      where public.user_study_plan_picks.item_id is null;
  end loop;

  -- Today: earlier days' unfinished items (carried over) first, then today's items.
  select coalesce(jsonb_agg(x.j order by x.carried desc, x.day, x.order_no), '[]'::jsonb) into v_today_items
  from (
    select k.day, k.order_no, k.day < v_day as carried,
           jsonb_build_object(
             'day', k.day, 'order', k.order_no, 'kind', k.kind, 'item_id', k.item_id,
             'title', c.title, 'extra', c.extra,
             'done', public.study_done_since(v_user, k.kind, k.item_id, v_plan.started_at),
             'carried', k.day < v_day
           ) as j
    from public.user_study_plan_picks k
    left join lateral (
      select cc.title, cc.extra from public.study_candidates(v_user, k.kind) cc where cc.item_id = k.item_id
    ) c on true
    where k.plan_id = v_plan.id
      and (k.day = v_day or (k.day < v_day and not public.study_done_since(v_user, k.kind, k.item_id, v_plan.started_at)))
  ) x;

  -- The week ahead: kinds only (the content is chosen on the day).
  select coalesce(jsonb_agg(jsonb_build_object('day', d.day, 'kinds', d.kinds) order by d.day), '[]'::jsonb) into v_week
  from (
    select i.day, jsonb_agg(i.kind order by i.order_no) as kinds
    from public.study_plan_items i
    where i.template_id = v_plan.template_id and i.day between v_day + 1 and least(v_days, v_day + 6)
    group by i.day
  ) d;

  select count(*) into v_total from public.study_plan_items where template_id = v_plan.template_id;
  select count(*) into v_done from public.user_study_plan_picks k
  where k.plan_id = v_plan.id and public.study_done_since(v_user, k.kind, k.item_id, v_plan.started_at);

  if v_total > 0 and v_done >= v_total then
    update public.user_study_plans set status = 'finished' where id = v_plan.id;
  end if;

  return jsonb_build_object(
    'active', true,
    'started_on', v_plan.started_on,
    'today', v_today,
    'day', v_day,
    'days', v_days,
    'items', v_today_items,
    'week', v_week,
    'progress', jsonb_build_object('done', v_done, 'total', v_total),
    'finished', v_total > 0 and v_done >= v_total
  );
end;
$$;
comment on function public.get_my_study_plan() is
  'M8.7 the caller''s study plan: today''s items (carried-over first) resolved to real not-yet-done content (fixed once picked), the week ahead (kinds), and progress. Never returns the template.';

revoke all on function public.pick_next(public.study_item_kind, uuid[]) from public, anon;
revoke all on function public.assign_my_study_plan(boolean) from public, anon;
revoke all on function public.get_my_study_plan() from public, anon;
grant execute on function public.pick_next(public.study_item_kind, uuid[]) to authenticated;
grant execute on function public.assign_my_study_plan(boolean) to authenticated;
grant execute on function public.get_my_study_plan() to authenticated;

-- ── M8.7-C2: seed 6 templates ───────────────────────────────────────────────────────────────
-- Each repeats a pattern that contains every kind, with a different length, pace and mix, so
-- every plan covers all four modules (and the Speaking full test).
do $$
declare
  v_t record;
  v_id uuid;
  v_n integer;
  v_i integer;
begin
  for v_t in
    select * from (values
      ('Balanced', 14, 2, array['reading_test', 'speaking_p1', 'writing_t2', 'listening_test', 'speaking_p2', 'writing_t1', 'speaking_full']),
      ('Steady', 21, 1, array['listening_test', 'writing_t1', 'speaking_p1', 'reading_test', 'speaking_p2', 'writing_t2', 'speaking_full']),
      ('Writing and Speaking focus', 10, 2, array['writing_t2', 'speaking_p2', 'writing_t1', 'speaking_p1', 'reading_test', 'writing_t2', 'speaking_full', 'listening_test']),
      ('Reading and Listening focus', 10, 2, array['reading_test', 'listening_test', 'speaking_p1', 'reading_test', 'listening_test', 'writing_t1', 'writing_t2', 'speaking_p2', 'speaking_full']),
      ('Exam week', 7, 3, array['reading_test', 'listening_test', 'writing_t2', 'speaking_full', 'writing_t1', 'speaking_p2', 'speaking_p1']),
      ('Full coverage', 28, 2, array['speaking_p1', 'reading_test', 'writing_t1', 'listening_test', 'speaking_p2', 'writing_t2', 'speaking_full', 'reading_test'])
    ) as t(name, days, per_day, pattern)
  loop
    insert into public.study_plan_templates (name, days) values (v_t.name, v_t.days) returning id into v_id;
    v_n := v_t.days * v_t.per_day;
    for v_i in 0 .. v_n - 1 loop
      insert into public.study_plan_items (template_id, day, order_no, kind)
      values (v_id, v_i / v_t.per_day + 1, v_i % v_t.per_day + 1,
              (v_t.pattern[(v_i % array_length(v_t.pattern, 1)) + 1])::public.study_item_kind);
    end loop;
  end loop;
end;
$$;
