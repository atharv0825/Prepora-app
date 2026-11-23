-- M2-A2: admins toggle launch countries and read the waitlist. Uses is_admin() (M2-A1).
--
-- Plain RLS policies (not SECURITY DEFINER functions): the admin panel reads and writes the
-- tables directly with the signed-in admin's session, and the database decides what they may do.

-- ── 1. country_regions: admins can switch countries on/off ──────────────────────────────────
-- Only is_enabled: regions and waves are set by migrations (seed M2-B1), not from the panel.
grant update (is_enabled) on table public.country_regions to authenticated;

create policy "country_regions: admins can update"
on public.country_regions for update
to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));

-- ── 2. waitlist: admins can read it ─────────────────────────────────────────────────────────
-- Still no writes through the API (join_waitlist() only); invites come with M12.
grant select on table public.waitlist to authenticated;

create policy "waitlist: admins can read"
on public.waitlist for select
to authenticated
using ((select public.is_admin()));

comment on table public.waitlist is
  'Beta waitlist (M0-F4). Written only via join_waitlist(); admins read it (M2-A2).';

-- ── 3. Waiting people per country (for the country waves page) ──────────────────────────────
-- SECURITY INVOKER: it reads through the waitlist policy above, so non-admins get no rows.
create function public.admin_waitlist_by_country()
returns table (country_code text, waiting bigint, invited bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    w.country_code::text,
    count(*) filter (where w.invited_at is null) as waiting,
    count(*) filter (where w.invited_at is not null) as invited
  from public.waitlist w
  group by w.country_code
  order by waiting desc, w.country_code nulls last;
$$;

comment on function public.admin_waitlist_by_country() is
  'Waitlist counts per country (null = unknown), for the admin country waves page (M2-A2). Reads through RLS: admins only.';

-- Supabase grants new functions to anon directly; revoke it as well as public.
revoke all on function public.admin_waitlist_by_country() from public, anon;
grant execute on function public.admin_waitlist_by_country() to authenticated;
