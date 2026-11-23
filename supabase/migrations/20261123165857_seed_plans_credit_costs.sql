-- M3-C2: seed plans and credit_costs (Implementation Plan §2.5, estimated costs from §2.6).
--
-- "on conflict do nothing": safe to re-run, and never overwrites a value an admin has retuned
-- later (M3-A1 edits these rows). To change a seeded number on purpose, write an update in a
-- new migration.

insert into public.plans (id, name, limits) values
  ('free', 'Free', '{
    "monthly_credits": 8, "welcome_credits": 10, "daily_credit_cap": 8,
    "reading_tests": 2, "listening_tests": 2, "practice_sessions": 5, "mock_tests": 0,
    "ocr": false, "ai_gen": false, "premium_voice": false, "detailed_feedback": false
  }'),
  ('gold', 'Gold', '{
    "monthly_credits": 100, "welcome_credits": 0, "daily_credit_cap": 40,
    "reading_tests": 15, "listening_tests": 15, "practice_sessions": 30, "mock_tests": 2,
    "ocr": true, "ai_gen": false, "premium_voice": false, "detailed_feedback": true
  }'),
  ('platinum', 'Platinum', '{
    "monthly_credits": 220, "welcome_credits": 0, "daily_credit_cap": 60,
    "reading_tests": 30, "listening_tests": 30, "practice_sessions": 60, "mock_tests": 4,
    "ocr": true, "ai_gen": true, "premium_voice": true, "detailed_feedback": true
  }')
on conflict (id) do nothing;

-- Credit cost per action (§2.5). A full Speaking test (15) and a full mock test's AI parts (23)
-- are the sums of their parts, charged part by part, so they have no rows of their own.
-- Reading/Listening grading costs no credits (it uses the test allowance), so no rows either.
-- model = the model doing the scoring/generation (§2.6). Natural voice: Gemini TTS, price to
-- confirm on the pricing page (§2.6), so model and cost stay estimates until the beta measures them.
insert into public.credit_costs (action_key, label, credits, required_feature, model, est_cost_usd) values
  ('speaking_p1',         'Speaking Part 1 scored',                          5, null,            'gemini-3.8-flash',      0.0430),
  ('speaking_p2',         'Speaking Part 2 scored',                          4, null,            'gemini-3.8-flash',      0.0310),
  ('speaking_p3',         'Speaking Part 3 scored',                          6, null,            'gemini-3.8-flash',      0.0460),
  ('writing_t1',          'Writing Task 1 scored',                           4, null,            'gemini-3.8-flash',      0.0290),
  ('writing_t2',          'Writing Task 2 scored',                           4, null,            'gemini-3.8-flash',      0.0320),
  ('ocr',                 'Photo upload to text (OCR)',                      1, 'ocr',           'gemini-3.5-flash-lite', 0.0030),
  ('premium_voice',       'Natural examiner voice for one Speaking test',    4, 'premium_voice', 'gemini-tts',            0.0370),
  ('gen_cue_card',        'AI-generated cue card with Part 3 questions',     2, 'ai_gen',        'gemini-3.8-flash',      0.0110),
  ('gen_writing_prompt',  'AI-generated Writing prompt',                     1, 'ai_gen',        'gemini-3.8-flash',      null),
  ('gen_reading_passage', 'AI-generated Reading passage with questions',     5, 'ai_gen',        'gemini-3.8-flash',      0.0410)
on conflict (action_key) do nothing;
