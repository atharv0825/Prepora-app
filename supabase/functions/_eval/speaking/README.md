# Speaking evaluation recordings (M7-B5)

The Speaking eval (`../speaking_eval.ts`) checks two things on real, accent-diverse speech:

1. **Transcription:** does the speech-to-text model (Gemini) understand each accent as well as the others, and keep the fillers?
2. **Scoring:** does the AI's band, and especially its **Pronunciation** band, match an IELTS teacher's,
   with **no accent scored lower** (plan §5.1: judge intelligibility, never accent)?

It can't be done with synthetic voices. It needs real speakers, collected as below.

## What to collect

- **Accents (the plan's set):** Indian, Nepali, Filipino, Vietnamese. Add others you expect (Chinese,
  Arabic, Indonesian…). For comparison, also include a few speakers whose accents score well in IELTS.
- **At least 3 speakers per accent, ideally 5**, across levels (about band 5, 6.5 and 8), 1–2 Part 2
  answers each. The fairness flags need several speakers per group to mean anything.
- **Record in the app's own recorder** (Chrome on Android and Safari on iPhone), or any phone. Answers
  of 1–2 minutes on a Part 2 cue card.
- For each recording:
  - **a verbatim reference transcript**, with every "um", "uh", repetition and false start, typed by a person;
  - **the bands a qualified IELTS teacher gives**: overall, and Pronunciation separately.

## Consent and privacy

Voices are personal data.

- Get **written consent** saying what the recording is for (testing Prepora's scoring), where it's kept,
  and that it's deleted afterwards. Speakers can withdraw at any time.
- Keep recordings **only on the evaluating machine**, in `recordings/` (gitignored), never in the repo
  or a shared drive.
- They are sent to Google (Gemini) and DeepSeek when the eval runs: say so in the consent.
- Delete them when the evaluation is done.

## Manifest

`recordings.local.json` (gitignored), next to this file:

```json
[
  {
    "id": "in-01-a",
    "accent": "indian",
    "file": "recordings/in-01-a.webm",
    "card": { "title": "Describe a place you like to visit", "points": ["where it is", "how often you go there", "what you do there", "and explain why you like it"] },
    "reference_transcript": "Um, so the place I'd like to talk about is…",
    "expected_band": 6.5,
    "expected_pron": 7
  }
]
```

`reference_transcript`, `expected_band` and `expected_pron` are optional, but without them the matching
metric is skipped. Any audio the app accepts works (WebM, MP4/M4A, OGG, MP3, WAV).

## Run

From `supabase/functions`, with Deno 2 and both keys in `.env` (≈ US$0.005 per recording):

```sh
deno run --frozen --env-file=.env --allow-env --allow-net=generativelanguage.googleapis.com,api.deepseek.com \
  --allow-read=_eval --allow-write=_eval/results _eval/speaking_eval.ts
```

`--dry-run` checks the manifest and that every file is readable, without any API call.

The report is printed per accent:
- transcription word error rate;
- filler retention;
- bands within ±0.5 of the teacher's;
- Pronunciation bias (AI minus teacher);
- cost.

It also lists **fairness flags**: an accent whose Pronunciation is scored 0.5 band or more below the
others, or whose transcription error rate is 10 points or more above them. **Any flag blocks releasing
the prompt version:** change the prompt (a v2), or consider Gemini with audio for Pronunciation (plan M7-B3).
