-- M1-B2: a profiles row for every new auth user (default role 'user', plan 'free').
--
-- The plan marked this done, but it was never built. Until now, real Google sign-ups got no profile
-- row: they didn't appear in the admin panel, couldn't save onboarding or their country, and were
-- treated as Free by the credits engine. This adds the trigger and backfills existing users.
--
-- The name comes from Google's metadata (full_name, else name), trimmed to the column's 100
-- characters; blank → null (the profile page asks for it). Country and time zone are filled in
-- later by the auth callback (CF-IPCountry, M2-B3) and onboarding. "on conflict do nothing": a row
-- created another way (tests, the admin seed) is never overwritten.
--
-- Trigger order: Postgres fires same-event triggers by name, so create_profile_on_signup runs
-- before grant_credits_on_signup (M3-B4), which then sees the user's plan.

create function public.signup_full_name(meta jsonb)
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(btrim(left(btrim(coalesce(meta ->> 'full_name', meta ->> 'name', '')), 100)), '');
$$;

comment on function public.signup_full_name(jsonb) is
  'The display name from auth metadata (full_name, else name), at most 100 characters; null if blank (M1-B2).';

create function public.on_auth_user_created_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Not wrapped in an exception handler: an account without a profile is broken everywhere, so a
  -- failure here should fail the sign-up visibly rather than leave a half-made user.
  insert into public.profiles (id, full_name)
  values (new.id, public.signup_full_name(new.raw_user_meta_data))
  on conflict (id) do nothing;
  return new;
end;
$$;

comment on function public.on_auth_user_created_profile() is
  'M1-B2: creates the profiles row (role user, plan free) for a new auth user.';

revoke all on function public.on_auth_user_created_profile() from public, anon, authenticated;
revoke all on function public.signup_full_name(jsonb) from public, anon, authenticated;

create trigger create_profile_on_signup
after insert on auth.users
for each row execute function public.on_auth_user_created_profile();

-- Backfill: every existing auth user without a profile gets one (role user, plan free).
insert into public.profiles (id, full_name)
select u.id, public.signup_full_name(u.raw_user_meta_data)
from auth.users u
where not exists (select 1 from public.profiles p where p.id = u.id)
on conflict (id) do nothing;
