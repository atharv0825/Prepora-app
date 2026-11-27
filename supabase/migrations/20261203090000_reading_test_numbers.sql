-- Reading tests are numbered per type (Academic Test 1, 2…; General Training Test 1, 2…).
--
-- reading_tests.test_no keeps each test's number: unique within its type, given by the
-- database on insert (the next one for that type). When a test is created without a title
-- (the admin's "Create test" no longer asks for one), it's named "Academic Test N" /
-- "General Training Test N". Admins can still rename it later.
--
-- Existing rows: a title that already reads "<Type> Test N" keeps that N (the first such row per
-- type and N); every other row (e.g. the sample tests) gets the next free numbers, oldest first.

alter table public.reading_tests add column test_no integer check (test_no > 0);

-- 1. Titles that already carry their number.
with parsed as (
  select id, test_type,
         (regexp_match(btrim(title), '^(?:Academic|General Training) Test ([0-9]{1,6})$', 'i'))[1]::integer as n,
         created_at
  from public.reading_tests
),
firsts as (
  select distinct on (test_type, n) id, n
  from parsed
  where n is not null and n > 0
  order by test_type, n, created_at, id
)
update public.reading_tests t set test_no = f.n from firsts f where t.id = f.id;

-- 2. Everything else, after the highest number of its type, oldest first.
with tops as (
  select test_type, coalesce(max(test_no), 0) as top from public.reading_tests group by test_type
),
rest as (
  select t.id, tops.top + row_number() over (partition by t.test_type order by t.created_at, t.id) as n
  from public.reading_tests t join tops using (test_type)
  where t.test_no is null
)
update public.reading_tests t set test_no = r.n from rest r where t.id = r.id;

alter table public.reading_tests
  alter column test_no set not null,
  add constraint reading_tests_type_no_key unique (test_type, test_no),
  -- 0 = "number it for me": the trigger below always replaces it (and with the trigger off, the
  -- check above refuses it), so callers never send a number.
  alter column test_no set default 0,
  -- '' means "name it for me": the trigger below replaces it before the length check runs.
  alter column title set default '';

comment on column public.reading_tests.test_no is
  'The test''s number within its type (Academic Test 3 → 3). Given on insert; unique per test_type.';

-- The next number for a type. Locks per type for the transaction, so two tests created at the
-- same moment can't get the same number.
create function public.next_reading_test_no(p_type public.ielts_test_type)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_next integer;
begin
  perform pg_advisory_xact_lock(hashtext('reading_tests.test_no'), hashtext(p_type::text));
  select coalesce(max(test_no), 0) + 1 into v_next from public.reading_tests where test_type = p_type;
  return v_next;
end;
$$;

create function public.reading_test_title(p_type public.ielts_test_type, p_no integer)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_type when 'academic' then 'Academic' else 'General Training' end || ' Test ' || p_no;
$$;

create function public.reading_tests_before_number()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.test_no := public.next_reading_test_no(new.test_type);
    if new.title is null or btrim(new.title) = '' then
      new.title := public.reading_test_title(new.test_type, new.test_no);
    end if;
  elsif new.test_type is distinct from old.test_type then
    -- Moved to the other type: the next number there; a title we generated follows it.
    new.test_no := public.next_reading_test_no(new.test_type);
    if btrim(new.title) = public.reading_test_title(old.test_type, old.test_no) then
      new.title := public.reading_test_title(new.test_type, new.test_no);
    end if;
  else
    new.test_no := old.test_no; -- the number isn't edited by hand
    if new.title is null or btrim(new.title) = '' then
      new.title := public.reading_test_title(new.test_type, new.test_no);
    end if;
  end if;
  return new;
end;
$$;

create trigger reading_tests_number
before insert or update on public.reading_tests
for each row execute function public.reading_tests_before_number();

revoke all on function public.next_reading_test_no(public.ielts_test_type) from public, anon, authenticated;
revoke all on function public.reading_tests_before_number() from public, anon, authenticated;
revoke all on function public.reading_test_title(public.ielts_test_type, integer) from public, anon;
grant execute on function public.reading_test_title(public.ielts_test_type, integer) to authenticated;
