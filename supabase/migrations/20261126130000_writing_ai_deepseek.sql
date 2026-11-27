-- Writing AI runs on DeepSeek first (supabase/functions/_shared/ai.ts; Gemini stays available with
-- AI_PROVIDER=gemini). credit_costs.model and est_cost_usd are informational (the admin panel and
-- the margin check); the credits charged don't change.
--
-- Estimates at DeepSeek's peak price for deepseek-flash ($0.30 per 1M input tokens, $1.20 output,
-- off-peak half), with the plan's token estimates (§2.6) plus low-effort thinking:
--   writing_t2: ≈ 4,000 in + 4,000 out (thinking, feedback, model answer) ≈ $0.006
--   writing_t1: ≈ 3,500 in (the chart image included) + 3,500 out          ≈ $0.0053
--   ocr:        ≈ 3,000 in (two photos) + 900 out                          ≈ $0.002
-- ai_usage records the real tokens and cost of every call; retune from it after the beta.
update public.credit_costs set model = 'deepseek-flash', est_cost_usd = 0.0060 where action_key = 'writing_t2';
update public.credit_costs set model = 'deepseek-flash', est_cost_usd = 0.0053 where action_key = 'writing_t1';
update public.credit_costs set model = 'deepseek-flash', est_cost_usd = 0.0020 where action_key = 'ocr';
