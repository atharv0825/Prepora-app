-- M4-C3: two sample Reading tests, published and free for everyone.
--   * Academic sample: 3 passages, 20 questions, all 11 question types.
--   * General Training sample: 3 everyday/workplace/general texts, 14 questions.
-- Original texts written for Prepora (not taken from any published test). Shorter than a real
-- 40-question test, so grade-test scales the score to 40 for the band (ielts/bands.ts).
--
-- options/answer follow packages/shared/src/ielts/reading.ts (checked by e2e reading-rls.spec.ts).
-- Passage bodies are plain text, paragraphs separated by a blank line; lettered paragraphs
-- ("A ...") are what matching questions refer to. The builder's rich-text format (M4-A1) can
-- convert them.
--
-- "on conflict do nothing": safe to re-run, and never overwrites edits an editor made later.

insert into public.reading_tests (id, test_type, title, source, status, min_plan) values
  ('5eed0000-0000-4000-8000-00000000000a', 'academic', 'Sample Academic Test', 'admin', 'draft', 'free'),
  ('5eed0000-0000-4000-8000-00000000000b', 'general', 'Sample General Training Test', 'admin', 'draft', 'free')
on conflict (id) do nothing;

-- ── Academic: passages ──────────────────────────────────────────────────────────────────────
insert into public.reading_passages (id, test_id, order_no, title, body) values
('5eed0a01-0000-4000-8000-000000000000', '5eed0000-0000-4000-8000-00000000000a', 1, 'Bees in the city', $p$A Over the past two decades, beekeeping has moved from the countryside into cities. In London alone, the number of registered hives rose from around 1,600 in 2008 to more than 7,000 by 2020. Supporters argue that rooftops, gardens and parks offer bees a wider variety of flowers than farmland, where a single crop may cover several square kilometres.

B However, researchers have begun to question whether the boom is good for wild pollinators. Honeybees are generalists: a strong colony can send out tens of thousands of foragers a day, and they compete with wild bees for the same nectar and pollen. A 2019 study in Zurich found that areas with many hives had fewer wild bee species than similar areas with only a few.

C The problem is not the number of hives alone but the number of flowers available to them. A city with plenty of gardens may support many colonies, while a dense business district cannot. Some councils therefore now ask new beekeepers to plant flowering species before they are allowed to place a hive.

D Beekeeping associations accept that training matters. Many offer a one-year course, and in several cities a beginner must work alongside an experienced mentor before keeping a colony alone. Their members point out that a well-managed hive is also less likely to swarm, which reduces complaints from neighbours.$p$),
('5eed0a02-0000-4000-8000-000000000000', '5eed0000-0000-4000-8000-00000000000a', 2, 'Bridges that move', $p$A For most of history, a bridge that had to let ships pass was simply built high. Where that was impossible, builders made part of the deck move. The first moving bridges were drawbridges over castle moats, raised by chains and a hand-turned winch. They were light, short and slow, and two people could operate them.

B The industrial age changed this. Counterweights, heavy blocks that balance the weight of the deck, meant that a long steel span could be lifted by a relatively small engine. Tower Bridge in London, opened in 1894, used steam to pump water into large accumulators, which stored hydraulic power until the moment the bridge had to open.

C Swing bridges took a different approach. Instead of lifting, the deck turns sideways on a central pier until it lies parallel to the river. Such bridges need no tall towers, which makes them cheaper to build, but the pier itself can block part of the channel used by boats.

D Today, engineers can also lift a whole deck vertically, like a lift between two towers. Whatever the design, opening a bridge follows the same steps everywhere: traffic lights stop vehicles, barriers close, the deck rises, and the vessel passes before the sequence is reversed.$p$),
('5eed0a03-0000-4000-8000-000000000000', '5eed0000-0000-4000-8000-00000000000a', 3, 'Sleep and memory', $p$Scientists have long suspected that sleep helps us remember. In 1924, the psychologists John Jenkins and Karl Dallenbach asked volunteers to learn lists of nonsense syllables. People who slept after learning forgot less than people who stayed awake for the same length of time.

More recent work has tried to explain why. Matthew Walker has argued that deep sleep moves memories from short-term to long-term storage in the brain, while Jessica Payne found that sleep strengthens emotional memories more than neutral ones. A typical night contains four to six sleep cycles, each lasting about 90 minutes, and different stages of the cycle appear to help different kinds of memory.

In my view, the evidence is now strong enough for schools to take it seriously. Exams scheduled early in the morning may disadvantage teenagers, whose body clocks run later than those of adults. Yet it would be a mistake to claim that sleep alone makes people learn: practice still matters most, and a good night's rest cannot replace it.$p$)
on conflict (id) do nothing;

-- ── Academic: questions (all 11 types) ──────────────────────────────────────────────────────
insert into public.reading_questions (test_id, passage_id, q_no, q_type, prompt, options, answer, explanation) values
('5eed0000-0000-4000-8000-00000000000a', '5eed0a01-0000-4000-8000-000000000000', 1, 'tfng',
  'The number of registered hives in London more than quadrupled between 2008 and 2020.', '{}',
  '{"value": "true"}', 'Paragraph A: from around 1,600 to more than 7,000, which is over four times as many.'),
('5eed0000-0000-4000-8000-00000000000a', '5eed0a01-0000-4000-8000-000000000000', 2, 'tfng',
  'Farmland usually offers bees a greater variety of flowers than cities do.', '{}',
  '{"value": "false"}', 'Paragraph A says cities offer a wider variety; farmland may be a single crop.'),
('5eed0000-0000-4000-8000-00000000000a', '5eed0a01-0000-4000-8000-000000000000', 3, 'tfng',
  'Honey produced in cities is of higher quality than honey from the countryside.', '{}',
  '{"value": "not_given"}', 'The passage never compares the quality of honey.'),
('5eed0000-0000-4000-8000-00000000000a', '5eed0a01-0000-4000-8000-000000000000', 4, 'matching_information',
  'an example of a rule introduced by local government', '{"paragraphs": ["A", "B", "C", "D"], "reuse": true}',
  '{"label": "C"}', 'Paragraph C: some councils ask new beekeepers to plant flowers first.'),
('5eed0000-0000-4000-8000-00000000000a', '5eed0a01-0000-4000-8000-000000000000', 5, 'matching_information',
  'a reference to research comparing areas with different numbers of hives', '{"paragraphs": ["A", "B", "C", "D"], "reuse": true}',
  '{"label": "B"}', 'Paragraph B: the 2019 Zurich study.'),
('5eed0000-0000-4000-8000-00000000000a', '5eed0a01-0000-4000-8000-000000000000', 6, 'sentence_completion',
  'In several cities, a beginner must work with an experienced ___ before keeping a colony alone.', '{"max_words": 1}',
  '{"accept": ["mentor"]}', 'Paragraph D: "alongside an experienced mentor".'),
('5eed0000-0000-4000-8000-00000000000a', '5eed0a01-0000-4000-8000-000000000000', 7, 'sentence_completion',
  'A hive that is well managed is less likely to ___.', '{"max_words": 1}',
  '{"accept": ["swarm"]}', 'Paragraph D: a well-managed hive is less likely to swarm.'),
('5eed0000-0000-4000-8000-00000000000a', '5eed0a02-0000-4000-8000-000000000000', 8, 'matching_headings',
  'Paragraph A', '{"headings": ["The cost of maintaining old bridges", "Small beginnings", "Balancing weight with power", "Turning rather than lifting", "Why ships grew taller"]}',
  '{"label": "ii"}', 'Paragraph A describes the first, simple drawbridges.'),
('5eed0000-0000-4000-8000-00000000000a', '5eed0a02-0000-4000-8000-000000000000', 9, 'matching_headings',
  'Paragraph B', '{"headings": ["The cost of maintaining old bridges", "Small beginnings", "Balancing weight with power", "Turning rather than lifting", "Why ships grew taller"]}',
  '{"label": "iii"}', 'Paragraph B: counterweights balance the deck so a small engine can lift it.'),
('5eed0000-0000-4000-8000-00000000000a', '5eed0a02-0000-4000-8000-000000000000', 10, 'matching_headings',
  'Paragraph C', '{"headings": ["The cost of maintaining old bridges", "Small beginnings", "Balancing weight with power", "Turning rather than lifting", "Why ships grew taller"]}',
  '{"label": "iv"}', 'Paragraph C: swing bridges turn sideways instead of lifting.'),
('5eed0000-0000-4000-8000-00000000000a', '5eed0a02-0000-4000-8000-000000000000', 11, 'mcq',
  'According to the writer, what is a disadvantage of swing bridges?',
  '{"choices": ["They are slow to open.", "Their pier can get in the way of boats.", "They need tall towers.", "They depend on hydraulic power."], "select": 1}',
  '{"labels": ["B"]}', 'Paragraph C: the pier can block part of the channel.'),
('5eed0000-0000-4000-8000-00000000000a', '5eed0a02-0000-4000-8000-000000000000', 12, 'summary_completion',
  'Tower Bridge used steam to pump water, and the hydraulic power was kept in ___ until the bridge opened.',
  '{"word_bank": ["engines", "accumulators", "counterweights", "towers"]}',
  '{"label": "B"}', 'Paragraph B: large accumulators stored hydraulic power.'),
('5eed0000-0000-4000-8000-00000000000a', '5eed0a02-0000-4000-8000-000000000000', 13, 'flowchart_completion',
  'Lights stop traffic → barriers close → the deck ___ → the vessel passes', '{"max_words": 1}',
  '{"accept": ["rises"]}', 'Paragraph D lists the steps: "the deck rises".'),
('5eed0000-0000-4000-8000-00000000000a', '5eed0a03-0000-4000-8000-000000000000', 14, 'ynng',
  'Schools should take pupils'' sleep into account when planning exams.', '{}',
  '{"value": "yes"}', 'Third paragraph: "strong enough for schools to take it seriously".'),
('5eed0000-0000-4000-8000-00000000000a', '5eed0a03-0000-4000-8000-000000000000', 15, 'ynng',
  'Sleep is more important for learning than practice.', '{}',
  '{"value": "no"}', 'The writer says practice still matters most.'),
('5eed0000-0000-4000-8000-00000000000a', '5eed0a03-0000-4000-8000-000000000000', 16, 'matching_features',
  'found that sleep helps emotional memories most',
  '{"features": ["John Jenkins and Karl Dallenbach", "Matthew Walker", "Jessica Payne"], "reuse": true}',
  '{"label": "C"}', 'Second paragraph: Jessica Payne.'),
('5eed0000-0000-4000-8000-00000000000a', '5eed0a03-0000-4000-8000-000000000000', 17, 'matching_features',
  'compared people who slept with people who stayed awake',
  '{"features": ["John Jenkins and Karl Dallenbach", "Matthew Walker", "Jessica Payne"], "reuse": true}',
  '{"label": "A"}', 'First paragraph: the 1924 study.'),
('5eed0000-0000-4000-8000-00000000000a', '5eed0a03-0000-4000-8000-000000000000', 18, 'note_table_completion',
  'Length of one sleep cycle: about ___ minutes', '{"max_words": 1, "number_allowed": true}',
  '{"accept": ["90", "ninety"]}', 'Second paragraph: each cycle lasts about 90 minutes.'),
('5eed0000-0000-4000-8000-00000000000a', '5eed0a03-0000-4000-8000-000000000000', 19, 'short_answer',
  'In which year was the first study in the passage carried out?', '{"max_words": 1, "number_allowed": true}',
  '{"accept": ["1924"]}', 'First paragraph: "In 1924".'),
('5eed0000-0000-4000-8000-00000000000a', '5eed0a03-0000-4000-8000-000000000000', 20, 'mcq',
  'Which TWO claims does the writer make?',
  '{"choices": ["Teenagers'' body clocks run later than adults''.", "Deep sleep happens only once a night.", "Practice matters most for learning.", "Nonsense syllables are easy to remember.", "Exams should be held in the evening."], "select": 2}',
  '{"labels": ["A", "C"]}', 'Third paragraph: teenagers'' body clocks run later; practice still matters most.')
on conflict (test_id, q_no) do nothing;

-- ── General Training: passages ──────────────────────────────────────────────────────────────
insert into public.reading_passages (id, test_id, order_no, title, body) values
('5eed0b01-0000-4000-8000-000000000000', '5eed0000-0000-4000-8000-00000000000b', 1, 'Riverside Leisure Centre', $p$Opening hours
Monday to Friday 6.30 am to 10 pm. Saturday and Sunday 8 am to 8 pm. The centre closes at 4 pm on public holidays.

Swimming
The main pool is open to the public at all times except Tuesday and Thursday evenings between 6 and 8 pm, when it is reserved for the swimming club. The learner pool is kept at 31°C and is suitable for children under eight.

Prices
A single swim costs £5.20 for adults and £3.10 for children aged 4 to 15. Children under four swim free with a paying adult. Members pay £38 a month and can use the pool, the gym and fitness classes at no extra charge.

Parking
The car park is free for the first two hours. Please register your car number at reception.$p$),
('5eed0b02-0000-4000-8000-000000000000', '5eed0000-0000-4000-8000-00000000000b', 2, 'Staff parking permits', $p$All employees who drive to work need a parking permit. To apply, complete the online form on the staff intranet and attach a copy of your vehicle registration document.

Applications are checked by the Facilities team, who aim to reply within five working days. If your application is approved, collect your permit from the security desk in the main building. You will need to show your staff ID card.

Permits must be displayed on the windscreen at all times. They are valid for twelve months and must then be renewed. Staff who share a car with a colleague can apply for a car-sharing permit, which guarantees a space in the covered area near the entrance. A lost permit can be replaced for a fee of £10.$p$),
('5eed0b03-0000-4000-8000-000000000000', '5eed0000-0000-4000-8000-00000000000b', 3, 'Two wheels: a short history of the bicycle', $p$A The first bicycle-like machine, built in Germany in 1817 by Karl Drais, had no pedals at all. Riders sat on a wooden frame and pushed themselves along with their feet. It was a curiosity rather than a practical way to travel.

B Pedals arrived in the 1860s, attached directly to the front wheel. To go faster, makers enlarged that wheel, producing the "penny-farthing". It was quick, but dangerous: a rider who hit a stone could be thrown over the handlebars.

C The "safety bicycle" of the 1880s solved the problem with two wheels of equal size and a chain driving the rear wheel. Together with air-filled tyres, introduced by John Dunlop in 1888, it made cycling comfortable enough for millions of ordinary people, and women in particular gained a new freedom to travel on their own.$p$)
on conflict (id) do nothing;

-- ── General Training: questions ─────────────────────────────────────────────────────────────
insert into public.reading_questions (test_id, passage_id, q_no, q_type, prompt, options, answer, explanation) values
('5eed0000-0000-4000-8000-00000000000b', '5eed0b01-0000-4000-8000-000000000000', 1, 'tfng',
  'The centre opens earlier on weekdays than at weekends.', '{}',
  '{"value": "true"}', '6.30 am on weekdays, 8 am at weekends.'),
('5eed0000-0000-4000-8000-00000000000b', '5eed0b01-0000-4000-8000-000000000000', 2, 'tfng',
  'Children under four pay a reduced price for swimming.', '{}',
  '{"value": "false"}', 'Children under four swim free with a paying adult.'),
('5eed0000-0000-4000-8000-00000000000b', '5eed0b01-0000-4000-8000-000000000000', 3, 'tfng',
  'The gym has recently been refurbished.', '{}',
  '{"value": "not_given"}', 'The notice says nothing about the state of the gym.'),
('5eed0000-0000-4000-8000-00000000000b', '5eed0b01-0000-4000-8000-000000000000', 4, 'note_table_completion',
  'Adult single swim: £___', '{"max_words": 1, "number_allowed": true}',
  '{"accept": ["5.20"]}', 'Prices: a single swim costs £5.20 for adults.'),
('5eed0000-0000-4000-8000-00000000000b', '5eed0b01-0000-4000-8000-000000000000', 5, 'note_table_completion',
  'Membership (£38 a month) includes the pool, the gym and ___', '{"max_words": 2}',
  '{"accept": ["fitness classes"]}', 'Prices: members can use the pool, the gym and fitness classes.'),
('5eed0000-0000-4000-8000-00000000000b', '5eed0b02-0000-4000-8000-000000000000', 6, 'short_answer',
  'Which team checks applications for parking permits?', '{"max_words": 2}',
  '{"accept": ["Facilities", "Facilities team"]}', 'Second paragraph: the Facilities team.'),
('5eed0000-0000-4000-8000-00000000000b', '5eed0b02-0000-4000-8000-000000000000', 7, 'short_answer',
  'For how long is a parking permit valid?', '{"max_words": 2, "number_allowed": true}',
  '{"accept": ["twelve months", "12 months", "one year", "a year"]}', 'Third paragraph: valid for twelve months.'),
('5eed0000-0000-4000-8000-00000000000b', '5eed0b02-0000-4000-8000-000000000000', 8, 'sentence_completion',
  'To collect a permit, staff must show their ___.', '{"max_words": 3}',
  '{"accept": ["staff ID card", "ID card", "staff ID"]}', 'Second paragraph: you will need to show your staff ID card.'),
('5eed0000-0000-4000-8000-00000000000b', '5eed0b02-0000-4000-8000-000000000000', 9, 'mcq',
  'What is the advantage of a car-sharing permit?',
  '{"choices": ["It is cheaper.", "It is valid for longer.", "It guarantees a covered space.", "It can be replaced free of charge."], "select": 1}',
  '{"labels": ["C"]}', 'Third paragraph: it guarantees a space in the covered area.'),
('5eed0000-0000-4000-8000-00000000000b', '5eed0b02-0000-4000-8000-000000000000', 10, 'flowchart_completion',
  'Complete the online form → the Facilities team checks it → collect the permit from the ___', '{"max_words": 2}',
  '{"accept": ["security desk"]}', 'Second paragraph: collect your permit from the security desk.'),
('5eed0000-0000-4000-8000-00000000000b', '5eed0b03-0000-4000-8000-000000000000', 11, 'matching_headings',
  'Paragraph A', '{"headings": ["A safer design for everyone", "Racing becomes popular", "A machine without pedals", "Speed at a price"]}',
  '{"label": "iii"}', 'Paragraph A: Drais''s machine had no pedals.'),
('5eed0000-0000-4000-8000-00000000000b', '5eed0b03-0000-4000-8000-000000000000', 12, 'matching_headings',
  'Paragraph B', '{"headings": ["A safer design for everyone", "Racing becomes popular", "A machine without pedals", "Speed at a price"]}',
  '{"label": "iv"}', 'Paragraph B: the penny-farthing was quick but dangerous.'),
('5eed0000-0000-4000-8000-00000000000b', '5eed0b03-0000-4000-8000-000000000000', 13, 'matching_information',
  'a change that gave women more independence', '{"paragraphs": ["A", "B", "C"], "reuse": true}',
  '{"label": "C"}', 'Paragraph C: women gained a new freedom to travel on their own.'),
('5eed0000-0000-4000-8000-00000000000b', '5eed0b03-0000-4000-8000-000000000000', 14, 'summary_completion',
  'Air-filled tyres, introduced by John ___ in 1888, made cycling more comfortable.', '{"max_words": 1}',
  '{"accept": ["Dunlop"]}', 'Paragraph C: John Dunlop, 1888.')
on conflict (test_id, q_no) do nothing;

-- ── Publish (the trigger checks 3 passages and questions 1..N) ───────────────────────────────
update public.reading_tests set status = 'published'
where id in ('5eed0000-0000-4000-8000-00000000000a', '5eed0000-0000-4000-8000-00000000000b') and status = 'draft';
