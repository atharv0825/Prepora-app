-- M0-F4: temporary waitlist for the landing page (plan.md). M2-C1 moves it to its final shape.
--
-- Security model:
--   * Nobody can read or write the table through the API (RLS on, no policies, no grants).
--   * The public can only call join_waitlist(), which validates input and silently ignores
--     duplicates, so the endpoint can't be used to check whether an email is on the list.
--   * Admins read it with the service role (admin panel, later).

create table public.waitlist (
  id bigint generated always as identity primary key,
  email text not null unique
    check (char_length(email) between 3 and 254)
    check (email = lower(email))
    check (email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  -- From Cloudflare's CF-IPCountry header (ISO 3166-1 alpha-2); null when unknown.
  country_code char(2) check (country_code ~ '^[A-Z]{2}$'),
  -- Where the sign-up came from: utm_source or the form location ("hero", "final_cta").
  source text check (char_length(source) <= 64),
  created_at timestamptz not null default now(),
  invited_at timestamptz
);

comment on table public.waitlist is
  'Beta waitlist (M0-F4). Written only via join_waitlist(); read with the service role.';

alter table public.waitlist enable row level security;
revoke all on table public.waitlist from anon, authenticated;

create index waitlist_country_created_idx on public.waitlist (country_code, created_at);

-- Public entry point. SECURITY DEFINER so callers need no table privileges; empty search_path
-- so nothing can be hijacked through it.
create function public.join_waitlist(
  p_email text,
  p_country_code text default null,
  p_source text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_country text := upper(btrim(coalesce(p_country_code, '')));
  v_source text := nullif(left(btrim(coalesce(p_source, '')), 64), '');
begin
  if char_length(v_email) not between 3 and 254
     or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'invalid email' using errcode = '22023';
  end if;

  -- Cloudflare uses XX (unknown) and T1 (Tor); store anything that isn't a real code as null.
  if v_country !~ '^[A-Z]{2}$' or v_country = 'XX' then
    v_country := null;
  end if;

  insert into public.waitlist (email, country_code, source)
  values (v_email, v_country, v_source)
  on conflict (email) do nothing;
end;
$$;

comment on function public.join_waitlist(text, text, text) is
  'Adds an email to the waitlist. Idempotent: an existing email is silently ignored.';

revoke all on function public.join_waitlist(text, text, text) from public;
grant execute on function public.join_waitlist(text, text, text) to anon, authenticated;
