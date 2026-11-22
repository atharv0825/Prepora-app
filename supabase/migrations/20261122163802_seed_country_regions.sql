-- M2-B1: seed country_regions with the APAC countries and enable Wave 1 (IN, NP, BD, LK).
-- Launch waves from Implementation Plan §8.2:
--   Wave 1: India, Nepal, Bangladesh, Sri Lanka                          → enabled now
--   Wave 2: Philippines, Vietnam, Indonesia, Malaysia, Thailand, Pakistan → listed, disabled
--   Wave 3: Australia, NZ, Singapore, Hong Kong, Japan, South Korea, Taiwan → listed, disabled
--   Everything else in APAC: listed with no wave (null), disabled.
-- Mainland China (CN) is listed but has no wave: out of scope (§8.2, Google services blocked).
-- North Korea is not listed. Countries outside APAC aren't listed at all: not listed = not enabled.
--
-- A migration, not seed.sql, so staging and production get it too. ON CONFLICT DO NOTHING keeps
-- it safe to re-run and never overwrites a row an admin has changed (M2-A2 toggles is_enabled).

insert into public.country_regions (country_code, region, launch_wave, is_enabled) values
  -- India
  ('IN', 'IN',  1, true),
  -- South Asia
  ('NP', 'SA',  1, true),
  ('BD', 'SA',  1, true),
  ('LK', 'SA',  1, true),
  ('PK', 'SA',  2, false),
  ('BT', 'SA',  null, false),
  ('MV', 'SA',  null, false),
  ('AF', 'SA',  null, false),
  -- South-East Asia
  ('PH', 'SEA', 2, false),
  ('VN', 'SEA', 2, false),
  ('ID', 'SEA', 2, false),
  ('MY', 'SEA', 2, false),
  ('TH', 'SEA', 2, false),
  ('SG', 'SEA', 3, false),
  ('MM', 'SEA', null, false),
  ('KH', 'SEA', null, false),
  ('LA', 'SEA', null, false),
  ('BN', 'SEA', null, false),
  ('TL', 'SEA', null, false),
  -- East Asia
  ('HK', 'EA',  3, false),
  ('JP', 'EA',  3, false),
  ('KR', 'EA',  3, false),
  ('TW', 'EA',  3, false),
  ('MO', 'EA',  null, false),
  ('MN', 'EA',  null, false),
  ('CN', 'EA',  null, false),
  -- Australia, New Zealand and the Pacific
  ('AU', 'ANZ', 3, false),
  ('NZ', 'ANZ', 3, false),
  ('FJ', 'ANZ', null, false),
  ('PG', 'ANZ', null, false),
  ('WS', 'ANZ', null, false),
  ('TO', 'ANZ', null, false),
  ('VU', 'ANZ', null, false),
  ('SB', 'ANZ', null, false),
  ('KI', 'ANZ', null, false),
  ('FM', 'ANZ', null, false),
  ('MH', 'ANZ', null, false),
  ('NR', 'ANZ', null, false),
  ('PW', 'ANZ', null, false),
  ('TV', 'ANZ', null, false)
on conflict (country_code) do nothing;
