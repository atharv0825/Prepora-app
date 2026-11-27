-- Demo practice data for ONE student, so the dashboard (streak, bands, practice mix, this week)
-- and the profile's 12-week calendar have something to show. For local Supabase or staging,
-- NEVER production.
--
-- How to run:
--   1. Put the student's sign-in email in v_email below.
--   2. Staging: Supabase dashboard → SQL Editor → paste → Run.
--      Local:   docker exec -i supabase_db_prepora psql -U postgres -d postgres < scripts/demo/streak-demo-data.sql
--   3. Reload /app and /app/profile.
-- Remove it again with scripts/demo/remove-streak-demo-data.sql.
--
-- What it adds: Reading and Listening test attempts (test_attempts) on these days, counted back
-- from today in the student's own time zone:
--   current streak  today … 4 days ago        → 5 days in a row
--   best streak     12 … 20 days ago          → 9 days in a row
--   scattered days  25, 31, 38, 45, 52, 59, 66, 73 days ago
-- Bands climb slowly from about 5.5 to 7.0. Every row is marked answers = {"_demo": true} so the
-- remove script finds exactly these rows. Running it twice first removes the earlier demo rows.

do $$
declare
  v_email text := 'student@example.com';  -- ← change this
  v_user uuid;
  v_tz text;
  v_today date;
  v_days integer[] := array[0, 0, 1, 2, 3, 3, 4,
                            12, 13, 14, 14, 15, 16, 17, 18, 18, 19, 20,
                            25, 31, 38, 45, 52, 59, 66, 73];
  v_ago integer;
  v_i integer := 0;
  v_band numeric;
begin
  select u.id into v_user from auth.users u where lower(u.email) = lower(v_email);
  if v_user is null then
    raise exception 'no user with email % (change v_email at the top)', v_email;
  end if;

  v_tz := coalesce((select p.timezone from public.profiles p where p.id = v_user), 'UTC');
  v_today := (now() at time zone v_tz)::date;

  delete from public.test_attempts where user_id = v_user and answers ? '_demo';

  foreach v_ago in array v_days loop
    v_i := v_i + 1;
    -- 7.0 today, about 0.02 lower per day back, snapped to half bands, between 5.0 and 7.5.
    v_band := least(7.5, greatest(5.0, round((7.0 - v_ago * 0.02 + (v_i % 3 - 1) * 0.5) * 2) / 2));
    insert into public.test_attempts (user_id, module, test_id, answers, raw_score, band, time_taken_sec, created_at)
    values (
      v_user,
      case when v_i % 2 = 0 then 'reading' else 'listening' end::public.test_module,
      gen_random_uuid(),                      -- no real test: lists show it without a title
      '{"_demo": true}'::jsonb,
      least(40, greatest(0, (v_band * 4.5)::integer)),
      v_band,
      3000 + v_i * 37,
      -- Midday in the student's time zone (a different minute per row), never in the future.
      least(now(), ((v_today - v_ago) + time '12:00' + make_interval(mins => v_i)) at time zone v_tz)
    );
  end loop;

  raise notice 'added % demo attempts for % (time zone %)', array_length(v_days, 1), v_email, v_tz;
end;
$$;
