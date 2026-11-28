-- Top-ups in India: any amount from ₹100 to ₹500 in ₹50 steps (a slider on the plans page)
-- instead of two packs. Each step is an ordinary top-up price, so checkout and the webhook are
-- unchanged. Credits at the ₹399 = 150 credits rate (§2.7 margin check: AI cost ≤ ~40% of net),
-- rounded down to a multiple of 5.
--
-- The two old packs (₹149 = 50, ₹399 = 150) are switched off, not deleted: past purchases and
-- refunds still point at them. Other countries keep their one 150-credit pack (Paddle's fixed
-- fee makes small packs unprofitable).

update public.prices set is_active = false where id in ('in_topup_50', 'in_topup_150');

insert into public.prices (id, kind, plan_id, region, country_code, period, credits, currency, amount_minor, provider) values
  ('in_topup_inr_100', 'topup', null, 'IN', null, null, 35, 'INR', 10000, 'razorpay'),
  ('in_topup_inr_150', 'topup', null, 'IN', null, null, 55, 'INR', 15000, 'razorpay'),
  ('in_topup_inr_200', 'topup', null, 'IN', null, null, 75, 'INR', 20000, 'razorpay'),
  ('in_topup_inr_250', 'topup', null, 'IN', null, null, 90, 'INR', 25000, 'razorpay'),
  ('in_topup_inr_300', 'topup', null, 'IN', null, null, 110, 'INR', 30000, 'razorpay'),
  ('in_topup_inr_350', 'topup', null, 'IN', null, null, 130, 'INR', 35000, 'razorpay'),
  ('in_topup_inr_400', 'topup', null, 'IN', null, null, 150, 'INR', 40000, 'razorpay'),
  ('in_topup_inr_450', 'topup', null, 'IN', null, null, 165, 'INR', 45000, 'razorpay'),
  ('in_topup_inr_500', 'topup', null, 'IN', null, null, 185, 'INR', 50000, 'razorpay')
on conflict (id) do nothing;
