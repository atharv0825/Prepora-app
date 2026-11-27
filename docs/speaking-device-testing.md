# Speaking on real devices (M7-I1)

Automated tests use Chromium's fake microphone (a beep) and a stand-in for the AI, so they can't
show what students will meet on real phones: Safari's recorder and permissions, Android Chrome,
real voices through Gemini (speech to text) and DeepSeek. This is the one manual run, **on staging**, with
**real recordings**. It takes about 45 minutes.

## Before you start

- Staging has `GEMINI_API_KEY` and `DEEPSEEK_API_KEY`, and **no** `AI_STUB`, `DEEPSEEK_API_URL` or `GEMINI_API_URL`
  (`supabase secrets list`). The latest `develop` is deployed (functions, migrations, web).
- In the staging admin panel → Speaking: at least one **published** cue card (for example "Describe a place
  you like to visit…").
- Two staging accounts: one **Free**, one **Gold** (admin → Users → plan). Each has credits (Free: 18 at sign-up).
- Devices:

| # | Device | Browser | Records as (expected) |
|---|---|---|---|
| 1 | iPhone (iOS 17+) | **Safari** | MP4/AAC |
| 2 | iPhone | Chrome for iOS (uses Safari's engine) | MP4/AAC |
| 3 | Android phone | **Chrome** | WebM/Opus |
| 4 | Android (Samsung if available) | Samsung Internet | WebM/Opus |
| 5 | Desktop (Windows or Mac) | Chrome or Edge | WebM/Opus |
| 6 | Mac | Safari | MP4/AAC |

## On each device

Sign in as the **Gold** student unless the step says otherwise. Speak a real 1.5–2 minute answer, with a few
natural "um"s.

1. **Permission (M7-F1):** open a cue card → the explainer → "Allow microphone" → the browser's prompt
   appears → Allow.
   - ✅ The level meter moves when you speak, and "We can hear you" appears.
2. **Blocked microphone:** deny the permission (or block it in site settings), reload, and tap Allow again.
   - ✅ "Your browser blocked the microphone" and **steps that match this browser**. Follow them: it works again.
3. **Prep and recording (M7-F2):** "Start my 1 minute" → write notes → let the minute run out.
   - ✅ Recording **starts by itself at 0:00**; the notes stay visible.
   - Speak about 1:45, then Stop. Once per device, **let it run to 2:00**: ✅ it stops by itself.
4. **Playback:** ✅ the recording plays back, clear, and the length is right.
   - On iPhone, also check with the **silent switch on**.
   - Try "Record again" once.
5. **Scoring (M7-F3):** "Get my band score" → ✅ "This costs 4 credits" → upload % → scoring steps → the feedback page.
   Note how long it took.
6. **Feedback:** ✅ the four criteria and band; "How you spoke" (length, wpm, pauses, fillers); **your
   recording plays**; the transcript is **what you said**, with your "um"s highlighted (if the transcription kept them);
   better phrases quote your words; the model answer.
7. **A bad connection (once on one phone):** turn on aeroplane mode right after "Score my answer".
   - ✅ "The upload failed… saved on this device".
   - Close the tab, turn the network back on, and reopen the card: ✅ "You have a recording that wasn't scored"
     → **Send it** → it's scored.
8. **Free account (once):** ✅ the summary with locked cards ("N better phrases found", Upgrade), and the
   transcript and fillers still visible.

**Data check (staging SQL editor), after the run:**

```sql
select r.created_at, r.duration_sec, r.audio_paths, r.band, r.prompt_version,
       r.signals->>'words_per_minute' wpm, r.signals->>'transcript_confidence' conf
from speaking_responses r order by r.created_at desc limit 10;

select created_at, model, action_key, audio_seconds, input_tokens, output_tokens, cost_usd, success
from ai_usage where action_key = 'speaking_p2' order by created_at desc limit 10;
```

- ✅ `audio_paths` ends in `.m4a` for the Safari devices and `.webm` for the others.
- ✅ `audio_seconds` matches the length.
- ✅ The cost is about $0.005 for 2 minutes.

## Results (copy into log.md)

| # | Device / browser | Permission | Blocked help OK | Auto-start / 2:00 stop | Playback | Upload + score time | Transcript accurate? | "um" kept? | Band you'd expect / AI band | Problems |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | iPhone Safari | | | | | | | | | |
| 2 | iPhone Chrome | | | | | | | | | |
| 3 | Android Chrome | | | | | | | | | |
| 4 | Samsung Internet | | | | | | | | | |
| 5 | Desktop Chrome/Edge | | | | | | | | | |
| 6 | Mac Safari | | | | | | | | | |

**Exit (plan M7):** a student records a 2-minute answer on an iPhone and on Android, gets a band with a
transcript, and 4 credits are deducted.

Anything that fails: note the device, the step and what you saw (a screenshot helps), and it gets fixed
before M8.
