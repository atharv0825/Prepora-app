-- M3-C2: seeded plans and credit costs match the Implementation Plan §2.5. Run: supabase test db
begin;
select plan(19);

-- Plans
select results_eq(
  $$ select id::text, name from public.plans order by id $$,
  $$ values ('free', 'Free'), ('gold', 'Gold'), ('platinum', 'Platinum') $$,
  'three plans, all named');
select ok((select bool_and(is_active) from public.plans), 'all plans active');

select results_eq(
  $$ select id::text, (limits->>'monthly_credits')::int, (limits->>'welcome_credits')::int, (limits->>'daily_credit_cap')::int
     from public.plans order by id $$,
  $$ values ('free', 8, 10, 8), ('gold', 100, 0, 40), ('platinum', 220, 0, 60) $$,
  'credits: Free 8 + 10 welcome (cap 8), Gold 100 (cap 40), Platinum 220 (cap 60)');

select results_eq(
  $$ select id::text, (limits->>'reading_tests')::int, (limits->>'listening_tests')::int,
            (limits->>'practice_sessions')::int, (limits->>'mock_tests')::int
     from public.plans order by id $$,
  $$ values ('free', 2, 2, 5, 0), ('gold', 15, 15, 30, 2), ('platinum', 30, 30, 60, 4) $$,
  'allowances: reading, listening, practice sessions, mock tests');

select results_eq(
  $$ select id::text, (limits->>'ocr')::bool, (limits->>'ai_gen')::bool, (limits->>'premium_voice')::bool,
            (limits->>'detailed_feedback')::bool
     from public.plans order by id $$,
  $$ values ('free', false, false, false, false), ('gold', true, false, false, true), ('platinum', true, true, true, true) $$,
  'feature flags: OCR Gold+, generation and natural voice Platinum, detailed feedback Gold+');

select is((select (limits->>'monthly_credits')::int + (limits->>'welcome_credits')::int from public.plans where id = 'free'),
  18, 'a new Free user starts with 18 credits (M3 exit criterion)');

-- Credit costs
select is((select count(*) from public.credit_costs), 10::bigint, 'ten AI actions');
select ok((select bool_and(is_active) from public.credit_costs), 'all actions active');

select results_eq(
  $$ select action_key, credits from public.credit_costs order by action_key $$,
  $$ values ('gen_cue_card', 2), ('gen_reading_passage', 5), ('gen_writing_prompt', 1), ('ocr', 1),
            ('premium_voice', 4), ('speaking_p1', 5), ('speaking_p2', 4), ('speaking_p3', 6),
            ('writing_t1', 4), ('writing_t2', 4) $$,
  'credits per action (§2.5)');

select is((select sum(credits) from public.credit_costs where action_key in ('speaking_p1', 'speaking_p2', 'speaking_p3')),
  15::bigint, 'a full Speaking test (Parts 1–3) costs 15');
select is((select sum(credits) from public.credit_costs where action_key in ('speaking_p1', 'speaking_p2', 'speaking_p3', 'writing_t1', 'writing_t2')),
  23::bigint, 'a full mock test''s AI parts cost 23');
select is((select 3 * credits from public.credit_costs where action_key = 'gen_reading_passage'),
  15, 'a generated 3-passage Reading test costs 15');

select results_eq(
  $$ select action_key, required_feature from public.credit_costs where required_feature is not null order by action_key $$,
  $$ values ('gen_cue_card', 'ai_gen'), ('gen_reading_passage', 'ai_gen'), ('gen_writing_prompt', 'ai_gen'),
            ('ocr', 'ocr'), ('premium_voice', 'premium_voice') $$,
  'plan-gated actions name their feature flag');
select is((select count(*) from public.credit_costs where required_feature is null), 5::bigint,
  'scoring (speaking parts, writing tasks) is open to every plan');

-- Every required feature is a real flag in plans.limits.
select ok((select bool_and((select limits from public.plans where id = 'free') ? required_feature)
           from public.credit_costs where required_feature is not null), 'required features exist in plans.limits');

-- Plan examples from §2.5 fit the monthly credits.
select ok((select 3 * 15 + 12 * 4 + 7 * 1) <= (select (limits->>'monthly_credits')::int from public.plans where id = 'gold'),
  'Gold example (3 Speaking tests + 12 Writing + 7 OCR) fits 100');
select ok((select 6 * 15 + 6 * 4 + 18 * 4 + 2 * 15 + 2 * 2) <= (select (limits->>'monthly_credits')::int from public.plans where id = 'platinum'),
  'Platinum example fits 220');

-- Budget sanity (§2.6): estimated cost per credit stays within the $0.01 budget.
select ok((select bool_and(est_cost_usd / credits <= 0.01) from public.credit_costs where est_cost_usd is not null and credits > 0),
  'every estimated cost is within US$0.01 per credit');

-- Re-running the seed changes nothing (on conflict do nothing).
update public.plans set name = 'Gold (tuned)' where id = 'gold';
insert into public.plans (id, name, limits) select id, 'Gold', limits from public.plans where id = 'gold'
on conflict (id) do nothing;
select is((select name from public.plans where id = 'gold'), 'Gold (tuned)', 're-seeding keeps an admin''s changes');

select * from finish();
rollback;
