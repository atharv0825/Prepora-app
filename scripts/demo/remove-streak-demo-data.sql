-- Removes the demo practice added by scripts/demo/streak-demo-data.sql (rows marked
-- answers = {"_demo": true}). Real attempts are never touched.
-- Put the email in v_email, or set it to null to remove the demo rows of EVERY student.

do $$
declare
  v_email text := 'student@example.com';  -- ← change this (or null for everyone)
  v_count integer;
begin
  delete from public.test_attempts a
  where a.answers ? '_demo'
    and (v_email is null or a.user_id = (select u.id from auth.users u where lower(u.email) = lower(v_email)));
  get diagnostics v_count = row_count;
  raise notice 'removed % demo attempts', v_count;
end;
$$;
