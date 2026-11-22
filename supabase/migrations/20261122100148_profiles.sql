-- M1-C1: profiles, one row per auth user (plan.md, Implementation Plan §4).
--
-- Security model:
--   * A signed-in user can read and update only their own row (RLS).
--   * Column privileges decide WHAT they may update: full_name, country_code, timezone.
--     role and plan are never writable through the API: role is changed by admins
--     (service role / admin panel), plan only by billing Edge Functions (service role).
--   * No insert or delete through the API: rows are created by the auth.users trigger (M1-B2)
--     and removed with the user (on delete cascade).
--   * anon has no access at all.
-- Columns from later milestones (test_type, target_band, exam_date, plan_expires_at) are added by
-- their own migrations.

create type public.app_role as enum ('user', 'admin', 'content_editor');
create type public.plan_tier as enum ('free', 'gold', 'platinum');

comment on type public.app_role is 'Who someone is in Prepora. Only admins/service role change it.';
comment on type public.plan_tier is 'Subscription tier. profiles.plan caches the active one.';

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text check (full_name is null or char_length(btrim(full_name)) between 1 and 100),
  role public.app_role not null default 'user',
  plan public.plan_tier not null default 'free',
  -- ISO 3166-1 alpha-2, from Cloudflare's CF-IPCountry at sign-up or chosen by the user.
  country_code char(2) check (country_code ~ '^[A-Z]{2}$'),
  -- IANA name, e.g. 'Asia/Kolkata'. Validated by profiles_validate() (needs a catalog lookup).
  timezone text check (timezone is null or char_length(timezone) between 1 and 64),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is
  'One row per auth user (M1-C1). Users read/update their own row; role and plan are server-only.';
comment on column public.profiles.plan is
  'Cached from subscriptions; written only by billing Edge Functions (service role).';
comment on column public.profiles.role is
  'Changed only by admins / service role, never by the user themselves.';

-- Keeps updated_at current and rejects unknown time zones.
create function public.profiles_validate()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.timezone is not null
     and not exists (select 1 from pg_catalog.pg_timezone_names where name = new.timezone) then
    raise exception 'invalid timezone: %', new.timezone using errcode = '22023';
  end if;
  if tg_op = 'UPDATE' then
    new.updated_at := now();
  end if;
  return new;
end;
$$;

create trigger profiles_validate
before insert or update on public.profiles
for each row execute function public.profiles_validate();

-- Privileges: start from nothing, then grant exactly what the app needs.
alter table public.profiles enable row level security;
revoke all on table public.profiles from anon, authenticated;
grant select on table public.profiles to authenticated;
grant update (full_name, country_code, timezone) on table public.profiles to authenticated;

-- (select auth.uid()) is evaluated once per statement, not per row.
create policy "profiles: read own row"
on public.profiles for select
to authenticated
using ((select auth.uid()) = id);

create policy "profiles: update own row"
on public.profiles for update
to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);
