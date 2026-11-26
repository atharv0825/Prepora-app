# M8-I1: the full Speaking test end to end on staging

One manual run of the whole test with real AI: DeepSeek scores and runs the examiner, and Gemini transcribes. It checks that a full test charges **exactly 15 credits** and that the **overall band is the IELTS-rounded mean** of the three parts.

CI already runs the same flow with the AI stubbed (`apps/web/e2e/speaking-test-ui.spec.ts` and `speaking-ai.spec.ts`, which check 15 credits and band 6.0). This run adds real voices, real transcription, the real examiner and real costs.

It takes about 15 minutes and costs a few US cents.

## Before you start

- [ ] `develop` is deployed to staging: the Actions "Deploy functions to staging" and "Push migrations to staging" are green.
- [ ] **Secrets** on the staging project (`supabase secrets list`):
  - `DEEPSEEK_API_KEY` and `GEMINI_API_KEY` (paid tier) are set;
  - `AI_STUB`, `DEEPSEEK_API_URL` and `GEMINI_API_URL` are **not** set.
- [ ] **Content**, published in the staging admin panel (Speaking):
  - at least one **Part 1 question set** with 4 or more questions (M8-A1);
  - at least one **Part 2 cue card** with a **published Part 3 discussion** linked to it.
- [ ] **A test student on Gold** (admin → Users) with **at least 15 credits**. Gold's daily cap is 40, so it fits in a day.
  - Free can't take a full test: its daily cap is 8 credits. The test's cost dialog says so before anything starts.
  - Note the balance before you start.
- [ ] A laptop with Chrome and a microphone, sound on. Use headphones if the examiner's voice is picked up by the mic.

## The run

1. **Speaking home → "Start the full test".**
   - The URL gets `?p1=…&card=…&p3=…`.
   - Reload once: the URL, and so the questions, stay the same.
2. **"Start the full test"** → the dialog says **"This costs 15 credits"** → "Start the test" → allow the microphone.
   - The URL gets `session=…`. Copy the session id.
3. **Part 1:**
   - The examiner reads each question aloud (a British or Australian voice when the device has one) and shows it.
   - Recording starts when the voice stops. Answer naturally for 15–30 s, then tap **Done**.
   - Expect **4–5 questions**; one may be a short follow-up on what you said.
   - "Part 1 done" appears. Check the header: the balance dropped by **5**.
4. **Part 2:**
   - The cue card → "Start my 1 minute" → speak for 1–2 minutes → Stop → **"Send and continue to Part 3"**.
   - There's no second cost dialog. The balance drops by **4**.
5. **Part 3:**
   - 4–5 discussion questions linked to the card's theme, with follow-ups.
   - At the end, the results page opens.
6. **Results:**
   - an overall band;
   - three part bands, each with its four criteria and summary;
   - "Full feedback and transcript" for each part;
   - "Go deeper" and "Next cue card".
   - Open each part's feedback and check the transcript is what you said, with your "um"s.
7. **Reload test (optional, a second run):** reload during Part 2 or 3. The page offers "Continue with Part N". The answered parts aren't asked or charged again.

## Checks in the database

Run these in the staging SQL editor. Replace `<session>` with the session id from step 2.

**The session and its rounded band.** `overall_band` must equal `expected`.

```sql
select s.status, s.part1_band, s.part2_band, s.part3_band, s.overall_band,
       round((s.part1_band + s.part2_band + s.part3_band) / 3, 3) as mean,
       case
         when m - floor(m) < 0.25 then floor(m)
         when m - floor(m) < 0.75 then floor(m) + 0.5
         else floor(m) + 1
       end as expected
from public.speaking_sessions s,
     lateral (select (s.part1_band + s.part2_band + s.part3_band) / 3 as m) x
where s.id = '<session>';
```

**Credits: exactly 15** (5 + 4 + 6), net of any refunds:

```sql
select r.part, l.action_key, sum(l.delta) as net
from public.speaking_responses r
join public.credit_ledger l on l.ref_id = r.id
where r.session_id = '<session>'
group by r.part, l.action_key
order by r.part;
-- expect: 1 speaking_p1 -5 · 2 speaking_p2 -4 · 3 speaking_p3 -6  (total -15)
```

**What it really cost.** The examiner's turns are logged with 0 credits; each scoring row includes the transcription's cost:

```sql
select action_key, model, credits_charged, success, audio_seconds, input_tokens, output_tokens, round(cost_usd::numeric, 5) as cost_usd, latency_ms
from public.ai_usage
where user_id = (select user_id from public.speaking_sessions where id = '<session>')
  and created_at >= (select started_at from public.speaking_sessions where id = '<session>')
order by created_at;
```

Expect:
- **3 rows with credits** (5, 4, 6), all `success = true`;
- **8–10 rows with 0 credits**: one per examiner turn, `speaking_p1` / `speaking_p3`;
- `audio_seconds` about the length you spoke;
- `cost_usd > 0` on every row.

## How the band is rounded (M8-C2)

The overall band is the mean of the three part bands, rounded as IELTS does: .25 rounds up to .5, and .75 rounds up to the next band. Part bands are whole or half bands, so the mean always ends in .0, .17, .33, .5, .67 or .83:

| Parts 1 / 2 / 3 | Mean | Overall |
|---|---|---|
| 6.0 / 6.0 / 6.0 | 6.00 | **6.0** |
| 6.0 / 6.0 / 6.5 | 6.17 | **6.0** |
| 6.0 / 6.5 / 6.5 | 6.33 | **6.5** |
| 6.0 / 6.5 / 7.0 | 6.50 | **6.5** |
| 6.5 / 6.5 / 7.0 | 6.67 | **6.5** |
| 5.5 / 6.0 / 6.0 | 5.83 | **6.0** |

## Results

Fill this in and copy it into `log.md`.

| Date | Tester | Browser | Balance before → after | Ledger total | Part bands | Overall (expected) | Examiner turns | Total cost (US$) | Notes |
|---|---|---|---|---|---|---|---|---|---|
| | | | | | | | | | |

Also note:
- Did the examiner's questions and follow-ups sound natural?
- Was any transcript wrong in a way that changed a band?
- How long did each part's scoring take?
