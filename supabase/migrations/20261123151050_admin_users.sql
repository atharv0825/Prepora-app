-- M2-A1: admin users list. is_admin() (the RLS helper planned for M1-B3) and two admin-only RPCs.
--
-- Why RPCs and not an "admins read all profiles" policy: the list needs each user's email and
-- last sign-in, which live in auth.users, and the API never exposes the auth schema. So these
-- functions run as their owner (SECURITY DEFINER), check is_admin() first and return only the
-- columns the admin panel shows. The admin app keeps using the public key: no service-role key.
--
-- Admins only: content editors manage content and don't need students' personal data.
-- Supabase's default privileges grant EXECUTE on new functions to anon directly, so each function
-- revokes it from anon as well as public.

-- ── 1. is_admin() ───────────────────────────────────────────────────────────────────────────
create function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  -- Definer rights so it can read the caller's role whatever the profiles policies are, and can
  -- be used inside those policies later without recursion.
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role = 'admin'
  );
$$;

comment on function public.is_admin() is
  'True when the signed-in user''s profile has role = admin (M2-A1; the helper planned for M1-B3).';

revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

-- ── 2. admin_list_users(search, country, plan, limit, offset) ───────────────────────────────
create function public.admin_list_users(
  p_search text default null,
  p_country text default null,
  p_plan public.plan_tier default null,
  p_limit integer default 25,
  p_offset integer default 0
)
returns table (
  id uuid,
  email text,
  full_name text,
  role public.app_role,
  plan public.plan_tier,
  country_code text,
  created_at timestamptz,
  last_sign_in_at timestamptz,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  -- Search is a case-insensitive "contains" on email or name. LIKE wildcards typed by the admin
  -- (% and _) are matched literally.
  v_search text := nullif(btrim(coalesce(p_search, '')), '');
  v_pattern text := '%' || replace(replace(replace(v_search, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  v_country text := nullif(upper(btrim(coalesce(p_country, ''))), '');
begin
  if not public.is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;

  return query
  select
    p.id,
    u.email::text,
    p.full_name,
    p.role,
    p.plan,
    p.country_code::text,
    p.created_at,
    u.last_sign_in_at,
    count(*) over () as total_count
  from public.profiles p
  join auth.users u on u.id = p.id
  where (v_search is null or u.email ilike v_pattern or p.full_name ilike v_pattern)
    and (v_country is null or p.country_code = v_country)
    and (p_plan is null or p.plan = p_plan)
  order by p.created_at desc, p.id
  limit least(greatest(coalesce(p_limit, 25), 1), 100)
  offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

comment on function public.admin_list_users(text, text, public.plan_tier, integer, integer) is
  'Admin users list (M2-A1): search email/name, filter by country and plan, newest first, 1–100 per page. Admins only.';

revoke all on function public.admin_list_users(text, text, public.plan_tier, integer, integer) from public, anon;
grant execute on function public.admin_list_users(text, text, public.plan_tier, integer, integer) to authenticated;

-- ── 3. admin_get_user(id) ───────────────────────────────────────────────────────────────────
create function public.admin_get_user(p_id uuid)
returns table (
  id uuid,
  email text,
  full_name text,
  role public.app_role,
  plan public.plan_tier,
  country_code text,
  timezone text,
  test_type public.ielts_test_type,
  target_band numeric,
  exam_date date,
  created_at timestamptz,
  updated_at timestamptz,
  last_sign_in_at timestamptz,
  auth_provider text
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
    p.id,
    u.email::text,
    p.full_name,
    p.role,
    p.plan,
    p.country_code::text,
    p.timezone,
    p.test_type,
    p.target_band,
    p.exam_date,
    p.created_at,
    p.updated_at,
    u.last_sign_in_at,
    u.raw_app_meta_data ->> 'provider'
  from public.profiles p
  join auth.users u on u.id = p.id
  where p.id = p_id;
end;
$$;

comment on function public.admin_get_user(uuid) is
  'One user''s profile for the admin panel (M2-A1): profile columns + email, last sign-in, provider. Admins only.';

revoke all on function public.admin_get_user(uuid) from public, anon;
grant execute on function public.admin_get_user(uuid) to authenticated;
