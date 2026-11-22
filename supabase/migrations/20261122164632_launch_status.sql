-- M2-B2: get_launch_status(country) → 'enabled' | 'waitlist' (the country gate, plan §8.2).
--
-- An RPC rather than an Edge Function: the web middleware (M2-F1) calls it on page loads, so it
-- should be one fast query with the public key (POST /rest/v1/rpc/get_launch_status), not a
-- function cold start. country_regions is already public and read-only, so the function runs
-- with the caller's rights (SECURITY INVOKER) and needs nothing extra.

create type public.launch_status as enum ('enabled', 'waitlist');
comment on type public.launch_status is
  'enabled: visitors from this country can sign up. waitlist: they join the waitlist instead.';

create function public.get_launch_status(p_country text)
returns public.launch_status
language sql
stable
parallel safe
security invoker
set search_path = ''
as $$
  -- Input is Cloudflare's CF-IPCountry header (or a profile's country_code): trimmed and
  -- uppercased. XX (unknown), T1 (Tor), empty, null and anything that isn't two letters match
  -- no row, so they get the waitlist, as do countries that aren't listed or aren't enabled.
  select case
    when exists (
      select 1
      from public.country_regions
      where country_code = upper(btrim(coalesce(p_country, '')))
        and is_enabled
    ) then 'enabled'::public.launch_status
    else 'waitlist'::public.launch_status
  end;
$$;

comment on function public.get_launch_status(text) is
  'Country gate (M2-B2): enabled if the country is listed in country_regions and enabled, else waitlist.';

revoke all on function public.get_launch_status(text) from public;
grant execute on function public.get_launch_status(text) to anon, authenticated;
