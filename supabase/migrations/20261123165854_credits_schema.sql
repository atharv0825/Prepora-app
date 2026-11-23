-- M3-C1: plans & credits schema (Implementation Plan §2.5, §4, §5.5). Nothing unlimited: AI
-- features spend credits from buckets; curated tests count against a monthly allowance.
--
-- Security model:
--   * plans, credit_costs: public reference data (pricing page, "this costs N credits"); anyone
--     may read. Writes: service role (admin editor policies come with M3-A1).
--   * credit_buckets, credit_ledger, usage_allowance: a user reads only their own rows.
--   * ai_usage: internal cost data, no client access.
--   * No client writes anything here. Balances change only through server-side functions
--     (spend_credits, refund_credits, grants: M3-B1…B4) and the service role.

-- ── Enums ───────────────────────────────────────────────────────────────────────────────────
create type public.credit_source as enum ('monthly', 'welcome', 'exam_pack', 'topup', 'admin');
comment on type public.credit_source is 'Where a credit bucket came from.';

create type public.credit_ledger_reason as enum ('grant', 'spend', 'refund', 'expire', 'admin_adjust');
comment on type public.credit_ledger_reason is 'Why a ledger entry changed a balance.';

-- ── 1. plans ────────────────────────────────────────────────────────────────────────────────
-- limits is jsonb (one place for every per-plan number, retunable without a deploy). This
-- function is its contract: all keys present, no unknown keys, counts are whole numbers ≥ 0,
-- flags are booleans. Adding a key = a migration that updates this function.
-- coalesce(…, false): a missing key gives NULL, which bool_and would otherwise ignore.
create function public.plan_limits_valid(p_limits jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select jsonb_typeof(p_limits) = 'object'
    -- counts
    and (
      select bool_and(coalesce(jsonb_typeof(p_limits -> k) = 'number' and (p_limits ->> k) ~ '^[0-9]+$', false))
      from unnest(array['monthly_credits', 'welcome_credits', 'daily_credit_cap', 'reading_tests',
                        'listening_tests', 'practice_sessions', 'mock_tests']) as k
    )
    -- feature flags
    and (
      select bool_and(coalesce(jsonb_typeof(p_limits -> k) = 'boolean', false))
      from unnest(array['ocr', 'ai_gen', 'premium_voice', 'detailed_feedback']) as k
    )
    -- nothing else
    and not exists (
      select 1 from jsonb_object_keys(p_limits) as k
      where k not in ('monthly_credits', 'welcome_credits', 'daily_credit_cap', 'reading_tests',
                      'listening_tests', 'practice_sessions', 'mock_tests',
                      'ocr', 'ai_gen', 'premium_voice', 'detailed_feedback')
    );
$$;

comment on function public.plan_limits_valid(jsonb) is
  'Contract for plans.limits (M3-C1): counts monthly_credits, welcome_credits, daily_credit_cap, '
  'reading_tests, listening_tests, practice_sessions, mock_tests (ints ≥ 0); flags ocr, ai_gen, '
  'premium_voice, detailed_feedback (booleans); no other keys.';

create table public.plans (
  id public.plan_tier primary key,
  name text not null check (char_length(btrim(name)) between 1 and 40),
  limits jsonb not null check (public.plan_limits_valid(limits)),
  is_active boolean not null default true,
  updated_at timestamptz not null default now()
);

comment on table public.plans is
  'Per-plan limits (M3-C1, plan §2.5): monthly/welcome credits, daily cap, allowances, feature flags.';

create trigger plans_touch
before update on public.plans
for each row execute function public.touch_updated_at();

-- ── 2. credit_costs ─────────────────────────────────────────────────────────────────────────
create table public.credit_costs (
  action_key text primary key check (action_key ~ '^[a-z][a-z0-9_]{1,40}$'),
  label text not null check (char_length(btrim(label)) between 1 and 80),
  credits integer not null check (credits between 0 and 1000),
  -- The plans.limits flag an action needs (null = every plan may use it).
  required_feature text check (required_feature in ('ocr', 'ai_gen', 'premium_voice')),
  model text check (char_length(model) <= 80),
  -- Estimated AI cost per action (plan §2.6); ai_usage holds the real cost to compare with.
  est_cost_usd numeric(10, 4) check (est_cost_usd >= 0),
  is_active boolean not null default true,
  updated_at timestamptz not null default now()
);

comment on table public.credit_costs is
  'Credits charged per AI action (M3-C1, plan §2.5). 1 credit ≈ US$0.01 of AI budget.';
comment on column public.credit_costs.required_feature is
  'plans.limits flag the action needs (ocr, ai_gen, premium_voice); null = all plans.';

create trigger credit_costs_touch
before update on public.credit_costs
for each row execute function public.touch_updated_at();

-- ── 3. credit_buckets ───────────────────────────────────────────────────────────────────────
-- One grant = one bucket. Spending takes from the bucket that expires first (M3-B1).
create table public.credit_buckets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  source public.credit_source not null,
  granted integer not null check (granted > 0),
  remaining integer not null,
  -- null = never expires (e.g. welcome credits, if configured so).
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  constraint credit_buckets_remaining_range check (remaining between 0 and granted)
);

comment on table public.credit_buckets is
  'Credit grants per user (M3-C1). remaining never goes below 0 or above granted.';

-- "Spendable buckets, soonest expiry first" (M3-B1) and balances (M3-B5).
create index credit_buckets_spendable_idx
  on public.credit_buckets (user_id, expires_at nulls last, created_at)
  where remaining > 0;

-- ── 4. credit_ledger ────────────────────────────────────────────────────────────────────────
-- Append-only audit trail: every change to a bucket's remaining credits.
create table public.credit_ledger (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  bucket_id uuid references public.credit_buckets (id) on delete set null,
  delta integer not null check (delta <> 0),
  reason public.credit_ledger_reason not null,
  action_key text references public.credit_costs (action_key) on update cascade,
  -- What the credits were for (a writing submission, speaking response, …).
  ref_id uuid,
  -- Groups the entries of one spend (it can touch several buckets) and their refund (M3-B1/B2).
  reservation_id uuid,
  created_at timestamptz not null default now(),
  -- Grants and refunds add credits; spends and expiries remove them; admin adjustments either.
  constraint credit_ledger_delta_sign check (
    (reason in ('grant', 'refund') and delta > 0)
    or (reason in ('spend', 'expire') and delta < 0)
    or reason = 'admin_adjust'
  )
);

comment on table public.credit_ledger is
  'Append-only credit history (M3-C1): grants, spends, refunds, expiries, admin adjustments.';

create index credit_ledger_user_idx on public.credit_ledger (user_id, created_at desc);
create index credit_ledger_reservation_idx on public.credit_ledger (reservation_id) where reservation_id is not null;
-- Daily cap (M3-B1): today's spends per user.
create index credit_ledger_spend_idx on public.credit_ledger (user_id, created_at) where reason = 'spend';

-- ── 5. usage_allowance ──────────────────────────────────────────────────────────────────────
-- Monthly counters for content that needs no AI (curated tests, practice sessions).
create table public.usage_allowance (
  user_id uuid not null references auth.users (id) on delete cascade,
  period_start date not null,
  reading_tests_used integer not null default 0 check (reading_tests_used >= 0),
  listening_tests_used integer not null default 0 check (listening_tests_used >= 0),
  practice_sessions_used integer not null default 0 check (practice_sessions_used >= 0),
  mock_tests_used integer not null default 0 check (mock_tests_used >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, period_start)
);

comment on table public.usage_allowance is
  'Allowance used per user and period (M3-C1); limits are in plans.limits.';

create trigger usage_allowance_touch
before update on public.usage_allowance
for each row execute function public.touch_updated_at();

-- ── 6. ai_usage ─────────────────────────────────────────────────────────────────────────────
-- Every AI call with its real tokens and cost, to compare with the credits charged (§5.5).
create table public.ai_usage (
  id bigint generated always as identity primary key,
  -- Kept (user set to null) when the account is deleted: cost history stays complete.
  user_id uuid references auth.users (id) on delete set null,
  action_key text not null references public.credit_costs (action_key) on update cascade,
  model text not null check (char_length(model) between 1 and 80),
  input_tokens integer not null default 0 check (input_tokens >= 0),
  output_tokens integer not null default 0 check (output_tokens >= 0),
  audio_seconds numeric(10, 2) not null default 0 check (audio_seconds >= 0),
  cost_usd numeric(12, 6) not null default 0 check (cost_usd >= 0),
  credits_charged integer not null default 0 check (credits_charged >= 0),
  success boolean not null,
  latency_ms integer check (latency_ms >= 0),
  reservation_id uuid,
  created_at timestamptz not null default now()
);

comment on table public.ai_usage is
  'One row per AI call (M3-C1): real tokens and cost vs credits charged. Service role only.';

create index ai_usage_action_created_idx on public.ai_usage (action_key, created_at);
create index ai_usage_user_created_idx on public.ai_usage (user_id, created_at) where user_id is not null;

-- ── Privileges & RLS ────────────────────────────────────────────────────────────────────────
alter table public.plans enable row level security;
alter table public.credit_costs enable row level security;
alter table public.credit_buckets enable row level security;
alter table public.credit_ledger enable row level security;
alter table public.usage_allowance enable row level security;
alter table public.ai_usage enable row level security;

revoke all on table public.plans, public.credit_costs, public.credit_buckets, public.credit_ledger,
  public.usage_allowance, public.ai_usage from anon, authenticated;

-- Reference data: readable by everyone (also signed out, e.g. a pricing page).
grant select on table public.plans, public.credit_costs to anon, authenticated;

create policy "plans: anyone can read"
on public.plans for select to anon, authenticated using (true);

create policy "credit_costs: anyone can read"
on public.credit_costs for select to anon, authenticated using (true);

-- Per-user data: read own rows only.
grant select on table public.credit_buckets, public.credit_ledger, public.usage_allowance to authenticated;

create policy "credit_buckets: read own"
on public.credit_buckets for select to authenticated using ((select auth.uid()) = user_id);

create policy "credit_ledger: read own"
on public.credit_ledger for select to authenticated using ((select auth.uid()) = user_id);

create policy "usage_allowance: read own"
on public.usage_allowance for select to authenticated using ((select auth.uid()) = user_id);

-- ai_usage: no grants, no policies (service role only).

revoke all on function public.plan_limits_valid(jsonb) from public, anon, authenticated;
