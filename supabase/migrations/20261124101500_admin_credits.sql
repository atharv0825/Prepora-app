-- M3-A1 + M3-A2: admins edit plans and credit costs, and look after one user's credits (balance,
-- ledger, grant, refund). Every change is written to the new audit_log.
--
-- Same pattern as the admin users RPCs (M2-A1): SECURITY DEFINER functions that raise 42501
-- unless is_admin(), called by the admin panel with the admin's own session and the public key.
-- RPCs rather than admin write policies because each change and its audit_log row must happen
-- together, in one transaction, and be validated in one place.
--
-- Admins only (not content editors): prices and students' credits.

-- ── 1. audit_log ────────────────────────────────────────────────────────────────────────────
-- Who changed what, and when (Implementation Plan §4; the viewer is M11-A1). Append-only: no
-- client may insert, update or delete; rows are written only by the admin_* functions below,
-- and read through admin_audit_entries().
create table public.audit_log (
  id bigint generated always as identity primary key,
  -- Kept (admin set to null) if the admin's account is deleted.
  admin_id uuid references auth.users (id) on delete set null,
  -- "<entity>.<verb>", e.g. plan.update, credits.grant.
  action text not null check (action ~ '^[a-z_]{1,40}\.[a-z_]{1,40}$'),
  entity text not null check (entity ~ '^[a-z_]{1,40}$'),
  -- Text, not a foreign key: the row outlives what it describes (a deleted user, a retired action).
  entity_id text check (char_length(entity_id) <= 100),
  -- What changed: before/after values, amounts, the admin's note.
  details jsonb not null default '{}'::jsonb check (jsonb_typeof(details) = 'object'),
  at timestamptz not null default now()
);

comment on table public.audit_log is
  'Admin changes (M3-A1/A2; viewer in M11-A1): who, what, when. Written only by admin_* functions.';

create index audit_log_entity_idx on public.audit_log (entity, entity_id, at desc);
create index audit_log_admin_idx on public.audit_log (admin_id, at desc);

alter table public.audit_log enable row level security;
revoke all on table public.audit_log from anon, authenticated;
-- No policies, no grants: only the functions below (running as the owner) touch it.

create function public.write_audit(p_action text, p_entity text, p_entity_id text, p_details jsonb)
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  insert into public.audit_log (admin_id, action, entity, entity_id, details)
  values ((select auth.uid()), p_action, p_entity, p_entity_id, coalesce(p_details, '{}'::jsonb));
$$;

comment on function public.write_audit(text, text, text, jsonb) is
  'Appends an audit_log row for the signed-in admin. Internal: only other functions call it.';

-- {"key": {"from": old, "to": new}} for every key whose value differs (both objects flat).
create function public.jsonb_changes(p_before jsonb, p_after jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select coalesce(jsonb_object_agg(k, jsonb_build_object('from', p_before -> k, 'to', p_after -> k)), '{}'::jsonb)
  from (
    select jsonb_object_keys(p_before) as k
    union
    select jsonb_object_keys(p_after)
  ) keys
  where (p_before -> k) is distinct from (p_after -> k);
$$;

-- Admin notes: trimmed, required, short.
create function public.admin_note(p_note text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_note text := btrim(coalesce(p_note, ''));
begin
  if char_length(v_note) < 3 or char_length(v_note) > 500 then
    raise exception 'a note of 3 to 500 characters is required' using errcode = '22023';
  end if;
  return v_note;
end;
$$;

-- ── 2. M3-A1: plans ─────────────────────────────────────────────────────────────────────────
-- Replaces a plan's limits (all keys, plan_limits_valid). Changes apply at once to daily caps,
-- allowances and feature flags; monthly/welcome credits apply to the next grant.
create function public.admin_update_plan(p_id public.plan_tier, p_limits jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_before jsonb;
  v_changes jsonb;
begin
  if not public.is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;
  if p_limits is null or not public.plan_limits_valid(p_limits) then
    raise exception 'invalid plan limits' using errcode = '22023';
  end if;

  select limits into v_before from public.plans where id = p_id for update;
  if not found then
    raise exception 'plan not found' using errcode = 'P0002';
  end if;

  v_changes := public.jsonb_changes(v_before, p_limits);
  if v_changes <> '{}'::jsonb then
    update public.plans set limits = p_limits where id = p_id;
    perform public.write_audit('plan.update', 'plan', p_id::text, jsonb_build_object('changes', v_changes));
  end if;

  return jsonb_build_object('id', p_id, 'limits', p_limits, 'changed', (select count(*) from jsonb_object_keys(v_changes)));
end;
$$;

comment on function public.admin_update_plan(public.plan_tier, jsonb) is
  'Sets a plan''s limits (M3-A1) and audits the changed keys. Admins only.';

-- ── 3. M3-A1: credit costs ──────────────────────────────────────────────────────────────────
-- Only the price. Actions are added and retired by migrations (code refers to their keys), and
-- spend_credits refuses an inactive action outright, so turning one off isn't an editor switch.
create function public.admin_update_credit_cost(p_action_key text, p_credits integer)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_before integer;
begin
  if not public.is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;
  if p_credits is null or p_credits < 0 or p_credits > 1000 then
    raise exception 'credits must be between 0 and 1000' using errcode = '22023';
  end if;

  select credits into v_before from public.credit_costs where action_key = p_action_key for update;
  if not found then
    raise exception 'action not found' using errcode = 'P0002';
  end if;

  if v_before <> p_credits then
    update public.credit_costs set credits = p_credits where action_key = p_action_key;
    perform public.write_audit('credit_cost.update', 'credit_cost', p_action_key,
      jsonb_build_object('changes', jsonb_build_object('credits', jsonb_build_object('from', v_before, 'to', p_credits))));
  end if;

  return jsonb_build_object('action_key', p_action_key, 'credits', p_credits, 'changed', v_before <> p_credits);
end;
$$;

comment on function public.admin_update_credit_cost(text, integer) is
  'Sets the credits an action costs (M3-A1, 0–1000) and audits it. Admins only.';

-- ── 4. M3-A2: one user's credits ────────────────────────────────────────────────────────────
-- The CreditBalance JSON (packages/shared/src/api/credits.ts) for any user. get_my_credits
-- (M3-B5) now uses it too, so the student and the admin always see the same numbers.
create function public.credits_summary(p_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_plan public.plan_tier;
  v_limits jsonb;
  v_period date := public.allowance_period_start();
  v_usage public.usage_allowance%rowtype;
begin
  v_plan := coalesce((select p.plan from public.profiles p where p.id = p_user_id), 'free');
  v_limits := (select pl.limits from public.plans pl where pl.id = v_plan);
  select * into v_usage from public.usage_allowance a where a.user_id = p_user_id and a.period_start = v_period;

  return jsonb_build_object(
    'plan', v_plan,
    'balance', public.credit_balance(p_user_id),
    'buckets', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', b.id, 'source', b.source, 'granted', b.granted, 'remaining', b.remaining,
               'expires_at', b.expires_at)
             order by b.expires_at asc nulls last, b.created_at, b.id)
      from public.credit_buckets b
      where b.user_id = p_user_id and b.remaining > 0 and (b.expires_at is null or b.expires_at > now())
    ), '[]'::jsonb),
    'spent_today', public.credits_spent_today(p_user_id),
    'daily_cap', coalesce((v_limits ->> 'daily_credit_cap')::integer, 0),
    'period_start', v_period,
    'allowances', jsonb_build_array(
      jsonb_build_object('type', 'reading_tests', 'used', coalesce(v_usage.reading_tests_used, 0),
                         'limit', coalesce((v_limits ->> 'reading_tests')::integer, 0)),
      jsonb_build_object('type', 'listening_tests', 'used', coalesce(v_usage.listening_tests_used, 0),
                         'limit', coalesce((v_limits ->> 'listening_tests')::integer, 0)),
      jsonb_build_object('type', 'practice_sessions', 'used', coalesce(v_usage.practice_sessions_used, 0),
                         'limit', coalesce((v_limits ->> 'practice_sessions')::integer, 0)),
      jsonb_build_object('type', 'mock_tests', 'used', coalesce(v_usage.mock_tests_used, 0),
                         'limit', coalesce((v_limits ->> 'mock_tests')::integer, 0))
    )
  );
end;
$$;

comment on function public.credits_summary(uuid) is
  'CreditBalance JSON for one user (M3-B5/M3-A2). Internal: get_my_credits and admin_user_credits call it.';

create or replace function public.get_my_credits()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'sign in to see your credits' using errcode = '42501';
  end if;
  return public.credits_summary(v_user);
end;
$$;

create function public.admin_user_credits(p_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;
  if not exists (select 1 from auth.users where id = p_user_id) then
    raise exception 'user not found' using errcode = 'P0002';
  end if;
  return public.credits_summary(p_user_id);
end;
$$;

comment on function public.admin_user_credits(uuid) is
  'One user''s credits for the admin panel (M3-A2): CreditBalance JSON. Admins only.';

-- Newest ledger entries, each with its bucket's source; spends say whether they were refunded.
create function public.admin_user_ledger(p_user_id uuid, p_limit integer default 200)
returns table (
  id bigint,
  delta integer,
  reason public.credit_ledger_reason,
  action_key text,
  reservation_id uuid,
  bucket_source public.credit_source,
  created_at timestamptz,
  refunded boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;

  return query
  select
    l.id,
    l.delta,
    l.reason,
    l.action_key,
    l.reservation_id,
    b.source,
    l.created_at,
    l.reason = 'spend' and exists (
      select 1 from public.credit_ledger r where r.reservation_id = l.reservation_id and r.reason = 'refund'
    )
  from public.credit_ledger l
  left join public.credit_buckets b on b.id = l.bucket_id
  where l.user_id = p_user_id
  order by l.id desc
  limit least(greatest(coalesce(p_limit, 200), 1), 500);
end;
$$;

comment on function public.admin_user_ledger(uuid, integer) is
  'One user''s credit ledger for the admin panel (M3-A2), newest first, 1–500 rows. Admins only.';

-- ── 5. M3-A2: grant and refund ──────────────────────────────────────────────────────────────
-- Support grant: a new 'admin' bucket. Spent like any other (soonest expiry first).
create function public.admin_grant_credits(
  p_user_id uuid,
  p_amount integer,
  p_expires_in_days integer,
  p_note text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_note text;
  v_expires timestamptz;
  v_bucket uuid;
  v_balance integer;
begin
  if not public.is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;
  if p_amount is null or p_amount < 1 or p_amount > 1000 then
    raise exception 'amount must be between 1 and 1000 credits' using errcode = '22023';
  end if;
  if p_expires_in_days is not null and (p_expires_in_days < 1 or p_expires_in_days > 730) then
    raise exception 'expiry must be 1 to 730 days, or never' using errcode = '22023';
  end if;
  v_note := public.admin_note(p_note);
  if not exists (select 1 from auth.users where id = p_user_id) then
    raise exception 'user not found' using errcode = 'P0002';
  end if;

  v_expires := case when p_expires_in_days is null then null else now() + make_interval(days => p_expires_in_days) end;
  v_bucket := public.grant_credits(p_user_id, 'admin', p_amount, v_expires);
  v_balance := public.credit_balance(p_user_id);

  perform public.write_audit('credits.grant', 'user', p_user_id::text, jsonb_build_object(
    'amount', p_amount, 'expires_at', v_expires, 'bucket_id', v_bucket, 'note', v_note, 'balance_after', v_balance));

  return jsonb_build_object('ok', true, 'bucket_id', v_bucket, 'amount', p_amount, 'expires_at', v_expires,
    'balance_after', v_balance);
end;
$$;

comment on function public.admin_grant_credits(uuid, integer, integer, text) is
  'Support grant (M3-A2): a new admin bucket of 1–1000 credits, expiring in 1–730 days or never; audited with a note. Admins only.';

-- Support refund of one spend (e.g. bad AI feedback): refund_credits for a reservation that
-- belongs to this user. Idempotent like refund_credits; only a real refund is audited.
create function public.admin_refund_credits(p_user_id uuid, p_reservation_id uuid, p_note text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_note text;
  v_result jsonb;
  v_action text;
begin
  if not public.is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;
  v_note := public.admin_note(p_note);

  select l.action_key into v_action
  from public.credit_ledger l
  where l.reservation_id = p_reservation_id and l.reason = 'spend' and l.user_id = p_user_id
  limit 1;
  if not found then
    return jsonb_build_object('ok', false, 'status', 'not_found', 'reservation_id', p_reservation_id, 'refunded', 0);
  end if;

  v_result := public.refund_credits(p_reservation_id);

  if v_result ->> 'status' = 'refunded' then
    perform public.write_audit('credits.refund', 'user', p_user_id::text, jsonb_build_object(
      'reservation_id', p_reservation_id, 'action_key', v_action, 'refunded', (v_result ->> 'refunded')::integer,
      'note', v_note, 'balance_after', (v_result ->> 'balance_after')::integer));
  end if;
  return v_result;
end;
$$;

comment on function public.admin_refund_credits(uuid, uuid, text) is
  'Support refund of one of the user''s spends (M3-A2), via refund_credits; audited with a note. RefundResult JSON. Admins only.';

-- ── 6. Reading the audit log ────────────────────────────────────────────────────────────────
-- Newest first, for some entities (and optionally one of them), with the admin's name/email.
create function public.admin_audit_entries(p_entities text[], p_entity_id text default null, p_limit integer default 20)
returns table (
  id bigint,
  action text,
  entity text,
  entity_id text,
  details jsonb,
  at timestamptz,
  admin_name text,
  admin_email text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;

  return query
  select a.id, a.action, a.entity, a.entity_id, a.details, a.at, p.full_name, u.email::text
  from public.audit_log a
  left join public.profiles p on p.id = a.admin_id
  left join auth.users u on u.id = a.admin_id
  where a.entity = any (p_entities)
    and (p_entity_id is null or a.entity_id = p_entity_id)
  order by a.at desc, a.id desc
  limit least(greatest(coalesce(p_limit, 20), 1), 200);
end;
$$;

comment on function public.admin_audit_entries(text[], text, integer) is
  'Recent audit_log rows for some entities (M3-A1/A2), newest first, 1–200, with the admin''s name and email. Admins only.';

-- ── Privileges ──────────────────────────────────────────────────────────────────────────────
-- Supabase grants new functions to anon directly, so revoke from anon as well as public.
revoke all on function public.write_audit(text, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.jsonb_changes(jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.admin_note(text) from public, anon, authenticated;
revoke all on function public.credits_summary(uuid) from public, anon, authenticated;

revoke all on function public.admin_update_plan(public.plan_tier, jsonb) from public, anon;
revoke all on function public.admin_update_credit_cost(text, integer) from public, anon;
revoke all on function public.admin_user_credits(uuid) from public, anon;
revoke all on function public.admin_user_ledger(uuid, integer) from public, anon;
revoke all on function public.admin_grant_credits(uuid, integer, integer, text) from public, anon;
revoke all on function public.admin_refund_credits(uuid, uuid, text) from public, anon;
revoke all on function public.admin_audit_entries(text[], text, integer) from public, anon;

grant execute on function public.admin_update_plan(public.plan_tier, jsonb) to authenticated;
grant execute on function public.admin_update_credit_cost(text, integer) to authenticated;
grant execute on function public.admin_user_credits(uuid) to authenticated;
grant execute on function public.admin_user_ledger(uuid, integer) to authenticated;
grant execute on function public.admin_grant_credits(uuid, integer, integer, text) to authenticated;
grant execute on function public.admin_refund_credits(uuid, uuid, text) to authenticated;
grant execute on function public.admin_audit_entries(text[], text, integer) to authenticated;
