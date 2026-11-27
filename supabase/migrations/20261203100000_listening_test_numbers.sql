-- Listening tests are numbered (Listening Test 1, 2…), like Reading (20261203090000). One
-- sequence: a Listening test is the same for Academic and General Training.
--
-- listening_tests.test_no keeps each test's number: unique, given by the database on insert.
-- A test created without a title (the admin's "Create test" no longer asks for one) is named
-- "Listening Test N". Admins can still rename it later.
--
-- Existing rows: a title that already reads "Listening Test N" keeps that N (the first such row);
-- every other row gets the next free numbers, oldest first.

alter table public.listening_tests add column test_no integer check (test_no > 0);

with parsed as (
  select id, (regexp_match(btrim(title), '^Listening Test ([0-9]{1,6})$', 'i'))[1]::integer as n, created_at
  from public.listening_tests
),
firsts as (
  select distinct on (n) id, n from parsed where n is not null and n > 0 order by n, created_at, id
)
update public.listening_tests t set test_no = f.n from firsts f where t.id = f.id;

with top as (select coalesce(max(test_no), 0) as top from public.listening_tests),
rest as (
  select t.id, top.top + row_number() over (order by t.created_at, t.id) as n
  from public.listening_tests t cross join top
  where t.test_no is null
)
update public.listening_tests t set test_no = r.n from rest r where t.id = r.id;

alter table public.listening_tests
  alter column test_no set not null,
  add constraint listening_tests_test_no_key unique (test_no),
  -- 0 / '' = "fill it in": the trigger below always replaces them (and with the trigger off, the
  -- checks refuse them), so callers never send a number or need a title.
  alter column test_no set default 0,
  alter column title set default '';

comment on column public.listening_tests.test_no is
  'The test''s number (Listening Test 3 → 3). Given on insert; unique.';

create function public.listening_tests_before_number()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    -- One lock for all Listening tests, so two created at once can't share a number.
    perform pg_advisory_xact_lock(hashtext('listening_tests.test_no'));
    select coalesce(max(test_no), 0) + 1 into new.test_no from public.listening_tests;
  else
    new.test_no := old.test_no; -- the number isn't edited by hand
  end if;
  if new.title is null or btrim(new.title) = '' then
    new.title := 'Listening Test ' || new.test_no;
  end if;
  return new;
end;
$$;

create trigger listening_tests_number
before insert or update on public.listening_tests
for each row execute function public.listening_tests_before_number();

revoke all on function public.listening_tests_before_number() from public, anon, authenticated;
