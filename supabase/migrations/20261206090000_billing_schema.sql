-- M9-C1: billing schema: prices, subscriptions, payment_events (Implementation Plan §4) and the
-- regional prices of §2.7.
--
-- Security model (§4 RLS):
--   * prices: public reference data (the pricing page works signed out). Everyone reads the
--     active ones; admins read all of them.
--   * subscriptions: a student reads only their own; admins read all (support, M9-A1).
--   * payment_events: raw provider webhooks. No client access at all.
--   * No client writes anything here. Rows are written only by Edge Functions with the service
--     role (create-checkout, billing-webhook, manage-subscription: M9-B2…B5), from verified
--     payment webhooks. The same goes for profiles.plan and the new profiles.plan_expires_at.

-- ── Enums ───────────────────────────────────────────────────────────────────────────────────
create type public.price_kind as enum ('subscription', 'exam_pack', 'topup');
comment on type public.price_kind is
  'subscription: renews monthly. exam_pack: 3 months of a plan, paid once. topup: extra credits, paid once.';

create type public.billing_period as enum ('month', 'quarter');
comment on type public.billing_period is 'How long a subscription period or exam pack lasts.';

-- google_play / app_store are for the future mobile app (§10); manual = a support case (M9-A1).
create type public.payment_provider as enum ('razorpay', 'paddle', 'google_play', 'app_store', 'manual');
comment on type public.payment_provider is
  'razorpay: India (INR). paddle: every other country (Merchant of Record). manual: set by an admin.';

create type public.subscription_status as enum ('active', 'past_due', 'cancelled', 'expired');
comment on type public.subscription_status is
  'active: paid. past_due: a renewal failed, grace period. cancelled: ended early. expired: ran out.';

-- ── 1. prices ───────────────────────────────────────────────────────────────────────────────
-- What can be bought where. Each row is one offer in one region; a row with a country_code
-- overrides its region's row for the same offer in that country (Singapore pays East Asia
-- prices, New Zealand pays in NZD). Offer = (kind, plan_id, period, credits).
-- get-prices (M9-B1): for a country, each offer uses the country's row if there is one, otherwise
-- its region's row. Only active rows count.
--
-- The composite foreign key below needs (country_code, region) to be unique on country_regions.
-- It is (country_code is the primary key); this makes it usable as a reference.
alter table public.country_regions
  add constraint country_regions_code_region_key unique (country_code, region);

create table public.prices (
  -- Stable, readable id used by create-checkout (M9-C2), e.g. in_gold_month.
  id text primary key check (id ~ '^[a-z][a-z0-9_]{2,59}$'),
  kind public.price_kind not null,
  -- The plan bought; null for top-ups (credits only).
  plan_id public.plan_tier,
  region public.market_region not null,
  -- Set only on a country override; must belong to the row's region.
  country_code char(2),
  period public.billing_period,
  -- Credits granted at purchase: exam packs and top-ups. Subscriptions grant
  -- plans.limits.monthly_credits each period instead, so it's null for them.
  credits integer check (credits between 1 and 10000),
  -- ISO 4217 code; amount in its minor unit (paise, cents).
  currency char(3) not null check (currency ~ '^[A-Z]{3}$'),
  amount_minor integer not null check (amount_minor between 1 and 100000000),
  provider public.payment_provider not null,
  -- The provider's id once the product exists there (Razorpay plan_…, Paddle pri_…). Null until
  -- then, and for Razorpay one-time orders, which are created with an amount and no price id.
  provider_price_id text check (char_length(provider_price_id) between 1 and 100),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint prices_country_in_region foreign key (country_code, region)
    references public.country_regions (country_code, region) on update cascade,
  -- Web checkout only: India pays through Razorpay, everyone else through Paddle (§1, §2.7).
  constraint prices_provider check (provider in ('razorpay', 'paddle') and (region = 'IN') = (provider = 'razorpay')),
  constraint prices_kind_shape check (
    (kind = 'subscription' and plan_id in ('gold', 'platinum') and period = 'month' and credits is null)
    or (kind = 'exam_pack' and plan_id in ('gold', 'platinum') and period = 'quarter' and credits is not null)
    or (kind = 'topup' and plan_id is null and period is null and credits is not null)
  )
);

comment on table public.prices is
  'Regional prices (M9-C1, plan §2.7): subscriptions, exam packs, top-ups. A country_code row '
  'overrides its region''s row for the same offer. Written by the service role only.';
comment on column public.prices.credits is
  'Credits granted at purchase (exam packs, top-ups); null for subscriptions (monthly credits come from plans.limits).';
comment on column public.prices.amount_minor is
  'Price in the currency''s minor unit. For Paddle regions in USD, Paddle shows the local-currency equivalent at checkout.';

-- One active row per offer and place, so the price a country gets is never ambiguous.
-- NULLS NOT DISTINCT: two top-ups (no plan, no period) or two region rows (no country) clash too.
create unique index prices_one_active_offer_idx
  on public.prices (kind, plan_id, period, credits, region, country_code) nulls not distinct
  where is_active;

create unique index prices_provider_price_idx on public.prices (provider, provider_price_id)
  where provider_price_id is not null;

create trigger prices_touch
before update on public.prices
for each row execute function public.touch_updated_at();

-- ── 2. subscriptions ────────────────────────────────────────────────────────────────────────
-- A paid plan a student holds: a monthly subscription or an exam pack (3 months, no renewal).
-- profiles.plan and profiles.plan_expires_at are a cache of the current one (M9-B3/B4).
create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  plan_id public.plan_tier not null check (plan_id in ('gold', 'platinum')),
  kind public.price_kind not null check (kind in ('subscription', 'exam_pack')),
  -- The price bought; null for manual (support) and app store subscriptions.
  price_id text references public.prices (id) on update cascade,
  provider public.payment_provider not null,
  -- Razorpay sub_… or order_… (exam packs), Paddle sub_… or txn_…; null for manual ones.
  provider_subscription_id text check (char_length(provider_subscription_id) between 1 and 100),
  provider_customer_id text check (char_length(provider_customer_id) between 1 and 100),
  status public.subscription_status not null default 'active',
  current_period_start timestamptz not null default now(),
  current_period_end timestamptz not null,
  -- The student cancelled: it stays active until current_period_end, then expires (M9-B4).
  cancel_at_period_end boolean not null default false,
  cancelled_at timestamptz,
  -- What the student pays per period (null for manual ones).
  currency char(3) check (currency ~ '^[A-Z]{3}$'),
  amount_minor integer check (amount_minor >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint subscriptions_period check (current_period_end > current_period_start),
  constraint subscriptions_provider_id check ((provider = 'manual') = (provider_subscription_id is null)),
  constraint subscriptions_amount check ((currency is null) = (amount_minor is null)),
  constraint subscriptions_paid check (provider = 'manual' or amount_minor is not null),
  constraint subscriptions_exam_pack_no_renewal check (kind = 'subscription' or not cancel_at_period_end)
);

comment on table public.subscriptions is
  'Paid plans (M9-C1): monthly subscriptions and exam packs. profiles.plan caches the current one. '
  'Written only by billing Edge Functions (service role) from verified webhooks.';

create unique index subscriptions_provider_id_idx on public.subscriptions (provider, provider_subscription_id)
  where provider_subscription_id is not null;
create index subscriptions_user_idx on public.subscriptions (user_id, current_period_end desc);
-- Renewals, grace periods and expiry jobs (M9-B4).
create index subscriptions_live_idx on public.subscriptions (current_period_end)
  where status in ('active', 'past_due');

create trigger subscriptions_touch
before update on public.subscriptions
for each row execute function public.touch_updated_at();

-- ── 3. payment_events ───────────────────────────────────────────────────────────────────────
-- Every verified webhook, stored before it is acted on. (provider, event_id) is unique, so a
-- duplicate delivery is a no-op (billing-webhook inserts … on conflict do nothing, M9-B3).
create table public.payment_events (
  id bigint generated always as identity primary key,
  provider public.payment_provider not null check (provider in ('razorpay', 'paddle')),
  -- Razorpay: the x-razorpay-event-id header. Paddle: event_id (evt_…).
  event_id text not null check (char_length(event_id) between 1 and 200),
  -- e.g. subscription.charged, transaction.completed (mapped to our actions in M9-C2).
  event_type text not null check (char_length(event_type) between 1 and 100),
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  -- Filled in once the event is matched (from the checkout's notes / custom_data).
  user_id uuid references auth.users (id) on delete set null,
  subscription_id uuid references public.subscriptions (id) on delete set null,
  received_at timestamptz not null default now(),
  -- Null until acted on (or deliberately ignored); error holds why processing failed.
  processed_at timestamptz,
  error text check (char_length(error) <= 2000),

  constraint payment_events_once unique (provider, event_id)
);

comment on table public.payment_events is
  'Verified payment webhooks (M9-C1), idempotent by (provider, event_id). Service role only.';

create index payment_events_unprocessed_idx on public.payment_events (received_at) where processed_at is null;
create index payment_events_user_idx on public.payment_events (user_id, received_at desc) where user_id is not null;

-- ── 4. profiles.plan_expires_at ─────────────────────────────────────────────────────────────
-- Planned in §4 next to profiles.plan: when the cached plan ends (null = Free, or no end).
-- Not added to the user-editable column grants: billing functions (service role) set it.
alter table public.profiles add column plan_expires_at timestamptz;
comment on column public.profiles.plan_expires_at is
  'When profiles.plan ends (cached from subscriptions, M9-B3/B4); null on Free. Server-only.';

-- ── Privileges & RLS ────────────────────────────────────────────────────────────────────────
alter table public.prices enable row level security;
alter table public.subscriptions enable row level security;
alter table public.payment_events enable row level security;

revoke all on table public.prices, public.subscriptions, public.payment_events from anon, authenticated;

grant select on table public.prices to anon, authenticated;

create policy "prices: anyone reads active ones"
on public.prices for select to anon, authenticated using (is_active);

create policy "prices: admins read all"
on public.prices for select to authenticated using ((select public.is_admin()));

grant select on table public.subscriptions to authenticated;

create policy "subscriptions: read own"
on public.subscriptions for select to authenticated using ((select auth.uid()) = user_id);

create policy "subscriptions: admins read all"
on public.subscriptions for select to authenticated using ((select public.is_admin()));

-- payment_events: no grants, no policies (service role only).

-- ── Seed: regional prices (§2.7) ────────────────────────────────────────────────────────────
-- Starting points to validate in the beta. Exam packs grant 3 months of the plan's credits
-- (Gold 3 × 100, Platinum 3 × 220), matching the §2.7 margin check. Top-ups: India 50 and 150
-- credits; everywhere else one 150-credit pack (Paddle's fixed fee makes small packs unprofitable).
-- Paddle regions in USD are charged in local currency by Paddle; Australia and New Zealand have
-- their own currency prices. provider_price_id is filled in once the products exist (M9-B2).
-- A migration, not seed.sql, so staging and production get it. ON CONFLICT DO NOTHING: re-runnable,
-- and never overwrites a price changed later.
insert into public.prices (id, kind, plan_id, region, country_code, period, credits, currency, amount_minor, provider) values
  -- India (Razorpay, INR)
  ('in_gold_month',          'subscription', 'gold',     'IN',  null, 'month',   null, 'INR', 29900,  'razorpay'),
  ('in_platinum_month',      'subscription', 'platinum', 'IN',  null, 'month',   null, 'INR', 59900,  'razorpay'),
  ('in_gold_exam_pack',      'exam_pack',    'gold',     'IN',  null, 'quarter', 300,  'INR', 79900,  'razorpay'),
  ('in_platinum_exam_pack',  'exam_pack',    'platinum', 'IN',  null, 'quarter', 660,  'INR', 169900, 'razorpay'),
  ('in_topup_50',            'topup',        null,       'IN',  null, null,      50,   'INR', 14900,  'razorpay'),
  ('in_topup_150',           'topup',        null,       'IN',  null, null,      150,  'INR', 39900,  'razorpay'),
  -- South Asia: Nepal, Bangladesh, Sri Lanka, Pakistan (Paddle, USD)
  ('sa_gold_month',          'subscription', 'gold',     'SA',  null, 'month',   null, 'USD', 400,    'paddle'),
  ('sa_platinum_month',      'subscription', 'platinum', 'SA',  null, 'month',   null, 'USD', 800,    'paddle'),
  ('sa_gold_exam_pack',      'exam_pack',    'gold',     'SA',  null, 'quarter', 300,  'USD', 1099,   'paddle'),
  ('sa_platinum_exam_pack',  'exam_pack',    'platinum', 'SA',  null, 'quarter', 660,  'USD', 2199,   'paddle'),
  ('sa_topup_150',           'topup',        null,       'SA',  null, null,      150,  'USD', 499,    'paddle'),
  -- South-East Asia: Philippines, Vietnam, Indonesia, Thailand, Malaysia (Paddle, local currency)
  ('sea_gold_month',         'subscription', 'gold',     'SEA', null, 'month',   null, 'USD', 500,    'paddle'),
  ('sea_platinum_month',     'subscription', 'platinum', 'SEA', null, 'month',   null, 'USD', 1000,   'paddle'),
  ('sea_gold_exam_pack',     'exam_pack',    'gold',     'SEA', null, 'quarter', 300,  'USD', 1399,   'paddle'),
  ('sea_platinum_exam_pack', 'exam_pack',    'platinum', 'SEA', null, 'quarter', 660,  'USD', 2699,   'paddle'),
  ('sea_topup_150',          'topup',        null,       'SEA', null, null,      150,  'USD', 499,    'paddle'),
  -- Singapore is in South-East Asia but pays East Asia prices (§2.7)
  ('sg_gold_month',          'subscription', 'gold',     'SEA', 'SG', 'month',   null, 'USD', 800,    'paddle'),
  ('sg_platinum_month',      'subscription', 'platinum', 'SEA', 'SG', 'month',   null, 'USD', 1600,   'paddle'),
  ('sg_gold_exam_pack',      'exam_pack',    'gold',     'SEA', 'SG', 'quarter', 300,  'USD', 2199,   'paddle'),
  ('sg_platinum_exam_pack',  'exam_pack',    'platinum', 'SEA', 'SG', 'quarter', 660,  'USD', 4299,   'paddle'),
  -- East Asia: Hong Kong, Japan, Korea, Taiwan (Paddle, local currency)
  ('ea_gold_month',          'subscription', 'gold',     'EA',  null, 'month',   null, 'USD', 800,    'paddle'),
  ('ea_platinum_month',      'subscription', 'platinum', 'EA',  null, 'month',   null, 'USD', 1600,   'paddle'),
  ('ea_gold_exam_pack',      'exam_pack',    'gold',     'EA',  null, 'quarter', 300,  'USD', 2199,   'paddle'),
  ('ea_platinum_exam_pack',  'exam_pack',    'platinum', 'EA',  null, 'quarter', 660,  'USD', 4299,   'paddle'),
  ('ea_topup_150',           'topup',        null,       'EA',  null, null,      150,  'USD', 499,    'paddle'),
  -- Australia (and the rest of the region) in AUD
  ('anz_gold_month',         'subscription', 'gold',     'ANZ', null, 'month',   null, 'AUD', 1200,   'paddle'),
  ('anz_platinum_month',     'subscription', 'platinum', 'ANZ', null, 'month',   null, 'AUD', 2400,   'paddle'),
  ('anz_gold_exam_pack',     'exam_pack',    'gold',     'ANZ', null, 'quarter', 300,  'AUD', 3200,   'paddle'),
  ('anz_platinum_exam_pack', 'exam_pack',    'platinum', 'ANZ', null, 'quarter', 660,  'AUD', 6400,   'paddle'),
  ('anz_topup_150',          'topup',        null,       'ANZ', null, null,      150,  'USD', 499,    'paddle'),
  -- New Zealand in NZD
  ('nz_gold_month',          'subscription', 'gold',     'ANZ', 'NZ', 'month',   null, 'NZD', 1300,   'paddle'),
  ('nz_platinum_month',      'subscription', 'platinum', 'ANZ', 'NZ', 'month',   null, 'NZD', 2600,   'paddle'),
  ('nz_gold_exam_pack',      'exam_pack',    'gold',     'ANZ', 'NZ', 'quarter', 300,  'NZD', 3500,   'paddle'),
  ('nz_platinum_exam_pack',  'exam_pack',    'platinum', 'ANZ', 'NZ', 'quarter', 660,  'NZD', 7000,   'paddle')
on conflict (id) do nothing;
