-- M3-B4: credit grants. Welcome + first monthly credits on sign-up; an hourly pg_cron job gives
-- Free users their monthly credits and expires old buckets.
--
-- Monthly periods are rolling per user: a Free user gets a new monthly bucket (valid 1 month)
-- whenever they have no unexpired one. The first is granted at sign-up, so a new Free user
-- starts with 8 + 10 welcome = 18 credits (M3 exit criterion). Credits don't roll over: the old
-- bucket expires, a new one is granted. Paid plans get their monthly credits from billing (M9).
-- Welcome credits never expire and are spent last (spend order: soonest expiry first).
--
-- Grants only insert new buckets and expiry only touches buckets that are already unusable, so
-- neither needs the per-user lock that spend/refund take. The job takes one global lock so two
-- runs can't overlap (and double-grant).

-- ── One grant (also used by admin grants, M3-A2) ────────────────────────────────────────────
create function public.grant_credits(
  p_user_id uuid,
  p_source public.credit_source,
  p_amount integer,
  p_expires_at timestamptz default null
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_bucket uuid;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'grant amount must be positive' using errcode = '22023';
  end if;
  if p_expires_at is not null and p_expires_at <= now() then
    raise exception 'grant would already be expired' using errcode = '22023';
  end if;

  insert into public.credit_buckets (user_id, source, granted, remaining, expires_at)
  values (p_user_id, p_source, p_amount, p_amount, p_expires_at)
  returning id into v_bucket;

  insert into public.credit_ledger (user_id, bucket_id, delta, reason)
  values (p_user_id, v_bucket, p_amount, 'grant');

  return v_bucket;
end;
$$;

comment on function public.grant_credits(uuid, public.credit_source, integer, timestamptz) is
  'Grants credits as a new bucket + ledger entry (M3-B4). expires_at null = never. Service role only.';

-- ── Sign-up grant ───────────────────────────────────────────────────────────────────────────
create function public.grant_signup_credits(p_user_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_free jsonb := (select limits from public.plans where id = 'free');
  v_welcome integer := coalesce((v_free ->> 'welcome_credits')::integer, 0);
  v_monthly integer := coalesce((v_free ->> 'monthly_credits')::integer, 0);
begin
  -- Once per user: the welcome bucket (or the first monthly one) marks it as done.
  if exists (select 1 from public.credit_buckets where user_id = p_user_id and source in ('welcome', 'monthly')) then
    return;
  end if;
  if v_welcome > 0 then
    perform public.grant_credits(p_user_id, 'welcome', v_welcome, null);
  end if;
  if v_monthly > 0 then
    perform public.grant_credits(p_user_id, 'monthly', v_monthly, now() + interval '1 month');
  end if;
end;
$$;

comment on function public.grant_signup_credits(uuid) is
  'Welcome + first monthly Free credits for a new user (M3-B4). Idempotent. Service role only.';

create function public.on_auth_user_created_grant_credits()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  begin
    perform public.grant_signup_credits(new.id);
  exception when others then
    -- Never block sign-up over credits; the hourly job still grants the monthly credits.
    raise warning 'sign-up credit grant failed for %: %', new.id, sqlerrm;
  end;
  return new;
end;
$$;

create trigger grant_credits_on_signup
after insert on auth.users
for each row execute function public.on_auth_user_created_grant_credits();

-- ── Hourly maintenance ──────────────────────────────────────────────────────────────────────
-- Expires buckets past their date: remaining → 0, one 'expire' ledger entry each.
create function public.expire_credit_buckets()
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  with due as (
    select b.id, b.remaining
    from public.credit_buckets b
    where b.expires_at <= now() and b.remaining > 0
    for update skip locked
  ),
  expired as (
    update public.credit_buckets b set remaining = 0
    from due
    where b.id = due.id
    returning b.id, b.user_id, due.remaining
  )
  insert into public.credit_ledger (user_id, bucket_id, delta, reason)
  select e.user_id, e.id, -e.remaining, 'expire' from expired e;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Monthly credits for Free users without an unexpired monthly bucket (users without a profile
-- row count as Free until M1-B2 creates it).
create function public.grant_free_monthly_credits()
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_amount integer := coalesce(((select limits from public.plans where id = 'free') ->> 'monthly_credits')::integer, 0);
  v_count integer;
begin
  if v_amount <= 0 then
    return 0;
  end if;
  with eligible as (
    select u.id
    from auth.users u
    left join public.profiles p on p.id = u.id
    where coalesce(p.plan, 'free') = 'free'
      and not exists (
        select 1 from public.credit_buckets b
        where b.user_id = u.id and b.source = 'monthly' and b.expires_at > now()
      )
  ),
  buckets as (
    insert into public.credit_buckets (user_id, source, granted, remaining, expires_at)
    select e.id, 'monthly', v_amount, v_amount, now() + interval '1 month' from eligible e
    returning id, user_id, granted
  )
  insert into public.credit_ledger (user_id, bucket_id, delta, reason)
  select b.user_id, b.id, b.granted, 'grant' from buckets b;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create function public.run_credit_maintenance()
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_expired integer;
  v_granted integer;
begin
  if not pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtextextended('prepora.credit_maintenance', 0)) then
    return jsonb_build_object('status', 'skipped', 'reason', 'another run is in progress');
  end if;
  -- Expire first, so a user whose monthly bucket just ran out gets a fresh one in the same run.
  v_expired := public.expire_credit_buckets();
  v_granted := public.grant_free_monthly_credits();
  return jsonb_build_object('status', 'ok', 'expired_buckets', v_expired, 'monthly_grants', v_granted);
end;
$$;

comment on function public.run_credit_maintenance() is
  'Hourly (pg_cron): expire old credit buckets, then grant Free monthly credits (M3-B4).';

revoke all on function public.grant_credits(uuid, public.credit_source, integer, timestamptz) from public, anon, authenticated;
revoke all on function public.grant_signup_credits(uuid) from public, anon, authenticated;
revoke all on function public.on_auth_user_created_grant_credits() from public, anon, authenticated;
revoke all on function public.expire_credit_buckets() from public, anon, authenticated;
revoke all on function public.grant_free_monthly_credits() from public, anon, authenticated;
revoke all on function public.run_credit_maintenance() from public, anon, authenticated;
grant execute on function public.grant_credits(uuid, public.credit_source, integer, timestamptz) to service_role;
grant execute on function public.run_credit_maintenance() to service_role;

-- ── Existing users (signed up before this migration) ────────────────────────────────────────
select public.grant_signup_credits(u.id) from auth.users u;

-- ── Schedule ────────────────────────────────────────────────────────────────────────────────
create extension if not exists pg_cron with schema pg_catalog;

-- Hourly at :07. cron.schedule with an existing name replaces that job, so re-running is safe.
select cron.schedule('prepora-credit-maintenance', '7 * * * *', 'select public.run_credit_maintenance()');
