-- M2-C1: onboarding fields on profiles, country_regions (launch waves), waitlist in its final shape.
-- (Implementation Plan §4 and §8.2.)

-- ── 1. Profiles: onboarding answers (M2-F2) ─────────────────────────────────────────────────
create type public.ielts_test_type as enum ('academic', 'general');
comment on type public.ielts_test_type is 'IELTS test the student is preparing for.';

alter table public.profiles
  add column test_type public.ielts_test_type,
  -- IELTS bands go in half steps. 1.0–9.0 is the whole scale; the UI offers a narrower range.
  add column target_band numeric(2, 1)
    check (target_band between 1.0 and 9.0 and target_band * 2 = trunc(target_band * 2)),
  -- Optional (the onboarding step is skippable). Past dates stay valid after the exam.
  add column exam_date date check (exam_date between date '2020-01-01' and date '2100-12-31');

comment on column public.profiles.target_band is 'Target overall band, 1.0–9.0 in 0.5 steps.';
comment on column public.profiles.exam_date is 'Planned exam date; null when not booked yet.';

-- The student sets these during onboarding, so they join the user-editable columns.
-- role and plan stay server-only (M1-C1). packages/shared editableProfileFields mirrors the
-- full list (contract test).
grant update (test_type, target_band, exam_date) on table public.profiles to authenticated;

-- ── 2. country_regions: which countries can sign up (launch waves, §8.2) ────────────────────
-- Market regions used for pricing (§4 prices.region) and analytics.
create type public.market_region as enum ('IN', 'SA', 'SEA', 'EA', 'ANZ');
comment on type public.market_region is
  'Pricing/analytics region: IN India, SA South Asia, SEA South-East Asia, EA East Asia, ANZ Australia/NZ.';

create table public.country_regions (
  country_code char(2) primary key check (country_code ~ '^[A-Z]{2}$'),
  region public.market_region not null,
  -- 1 = first wave (§8.2). Null = not scheduled yet.
  launch_wave smallint check (launch_wave between 1 and 9),
  is_enabled boolean not null default false,
  updated_at timestamptz not null default now()
);

comment on table public.country_regions is
  'Launch gate (§8.2): visitors from enabled countries can sign up, others see the waitlist. '
  'Countries not listed are not enabled. Seeded in M2-B1; toggled by admins (M2-A2).';

create index country_regions_enabled_idx on public.country_regions (is_enabled) where is_enabled;

create function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger country_regions_touch
before update on public.country_regions
for each row execute function public.touch_updated_at();

-- Public, non-personal data: anyone may read it (the country gate runs before sign-in).
-- Writes: service role only for now; admin write policies arrive with is_admin() (M1-B3/M2-A2).
alter table public.country_regions enable row level security;
revoke all on table public.country_regions from anon, authenticated;
grant select on table public.country_regions to anon, authenticated;

create policy "country_regions: anyone can read"
on public.country_regions for select
to anon, authenticated
using (true);

-- ── 3. waitlist: final shape ─────────────────────────────────────────────────────────────────
-- M0-F4 created it with email, country_code, source, created_at, invited_at. For the admin
-- waitlist and beta invites (M2-A2, M12) it also records who sent the invite and which account
-- the person became. Still written only through join_waitlist() (and the service role);
-- nobody reads it through the API until admin policies exist.
alter table public.waitlist
  add column invited_by uuid references auth.users (id) on delete set null,
  add column user_id uuid references auth.users (id) on delete set null,
  add constraint waitlist_invited_by_needs_invited_at check (invited_by is null or invited_at is not null);

comment on column public.waitlist.invited_by is 'Admin who sent the beta invite.';
comment on column public.waitlist.user_id is 'Account created from this waitlist entry (set at sign-up).';

-- "Who is still waiting, per country" (admin list, invites) and "which entry became this user".
create index waitlist_not_invited_idx on public.waitlist (country_code, created_at) where invited_at is null;
create unique index waitlist_user_id_key on public.waitlist (user_id) where user_id is not null;
