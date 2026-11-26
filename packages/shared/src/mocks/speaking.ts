// Mock score-speaking responses (M7-C2), so the Speaking screens (M7-F1..F3) can be built before
// transcription and scoring work (M7-B1..B3). Like the Writing mocks: built from the request,
// shaped for the plan, parsed by the contract before being returned, deterministic.
import {
  type BetterPhrase,
  ScoreSpeakingRequest,
  ScoreSpeakingResponse,
  type ScoredSpeaking,
  speakingFeedbackFor,
} from "../api/score-speaking";
import { countFillers, countSpokenWords, SPEAKING_PARTS, type SpeakingScores, speakingPartBand, wordsPerMinute } from "../ielts/speaking";
import { MockApiError, type MockOptions } from "./writing";

export const MOCK_SPEAKING_IDS = {
  session: "7d000000-0000-4000-8000-000000000001",
  cueCard: "7d000000-0000-4000-8000-000000000002",
} as const;

export const MOCK_CUE_CARD = {
  title: "Describe a place you like to visit in your free time",
  points: ["where it is", "how often you go there", "what you do there", "and explain why you like going there"],
};

/** About 1 min 50 s of a band-6 Part 2 answer, with the hesitations a transcript shows. */
export const MOCK_PART2_TRANSCRIPT =
  "Um, the place I would like to talk about is a small beach near my hometown. It is about, uh, thirty minutes by bus from my house. " +
  "I go there maybe two or three times in a month, especially in the summer when the weather is very hot. " +
  "Usually I go there with my friends, you know, and we swim, we play volleyball and sometimes we eat seafood in a small restaurant near the beach. " +
  "The food there is very delicious and also it is not expensive. Um, in the evening we sit on the sand and watch the sunset, which is really beautiful. " +
  "I like going there because it is very peaceful. In my city there is a lot of traffic and noise, so when I go to the beach I feel very relax. " +
  "Er, I think it is a good place to forget about the stress from my study. Also, I mean, it is a place where I have many good memories with my family, " +
  "because when I was a child my parents took me there every weekend. So, uh, that is why this beach is very special for me and I will continue to go there in the future.";

/** Phrases the mock suggests improving when it finds them (quoted exactly from the transcript). */
const MOCK_PHRASES: readonly (BetterPhrase & { find: RegExp })[] = [
  { find: /\bvery delicious\b/i, original: "", better: "absolutely delicious", why: "\"Delicious\" is already strong: use an intensifier that fits it." },
  { find: /\bfeel very relax\b/i, original: "", better: "feel really relaxed", why: "Use the adjective \"relaxed\" for how you feel." },
  { find: /\btwo or three times in a month\b/i, original: "", better: "two or three times a month", why: "Frequency is \"times a month\", without \"in\"." },
  { find: /\bthe stress from my study\b/i, original: "", better: "the pressure of my studies", why: "A more natural collocation." },
  { find: /\bvery peaceful\b/i, original: "", better: "wonderfully tranquil", why: "Less common vocabulary raises Lexical Resource." },
];

export function mockBetterPhrases(transcript: string): BetterPhrase[] {
  return MOCK_PHRASES.flatMap(({ find, better, why }) => {
    const hit = find.exec(transcript);
    return hit ? [{ original: hit[0], better, why }] : [];
  });
}

/** Scores from the transcript: short answers lose fluency, fillers and slips cost a little. */
export function mockSpeakingScores(transcript: string, durationSec: number, part: 1 | 2 | 3): SpeakingScores {
  const fillers = countFillers(transcript).reduce((n, f) => n + f.count, 0);
  const phrases = mockBetterPhrases(transcript).length;
  const short = part === 2 && durationSec < 60;
  const clamp = (v: number) => Math.min(9, Math.max(0, Math.round(v * 2) / 2));
  return {
    fc: clamp((short ? 5 : 7) - Math.min(1.5, fillers * 0.25)),
    lr: clamp(7 - phrases * 0.25),
    gra: clamp(6.5 - phrases * 0.25),
    pron: 6.5,
  };
}

export function mockScoredSpeaking(transcript: string, durationSec: number, part: 1 | 2 | 3): ScoredSpeaking {
  const scores = mockSpeakingScores(transcript, durationSec, part);
  const fillers = countFillers(transcript).reduce((n, f) => n + f.count, 0);
  return {
    scores,
    summary: `A clear, relevant answer at about band ${speakingPartBand(scores).toFixed(1)}. You kept going with few long pauses, but ${fillers} hesitation fillers and some basic vocabulary hold it back. (Mock feedback.)`,
    better_phrases: mockBetterPhrases(transcript),
    strengths: ["You covered every point on the card, in order.", "Linking words (because, so, also) made your answer easy to follow."],
    improvements: ["Replace \"um\" and \"uh\" with a short pause, or a phrase like \"let me think\".", "Use a few less common words for feelings and places."],
    model_answer:
      "I'd like to talk about a small cove a short bus ride from my hometown. I head there two or three times a month, particularly in the sweltering summer months… (Mock model answer.)",
  };
}

/** What score-speaking would answer. Throws MockApiError with the real error shapes. */
export function mockScoreSpeaking(
  input: unknown,
  opts: Pick<MockOptions, "plan" | "balance"> & { transcript?: string } = {},
): ScoreSpeakingResponse {
  const parsed = ScoreSpeakingRequest.safeParse(input);
  if (!parsed.success) {
    throw new MockApiError(400, { error: { code: "validation_failed", message: "Invalid request", details: parsed.error.issues } });
  }
  const req = parsed.data;
  const { actionKey } = SPEAKING_PARTS[req.part];
  const credits = { 1: 5, 2: 4, 3: 6 }[req.part];
  const balance = opts.balance ?? 100;
  if (balance < credits) {
    throw new MockApiError(402, { error: { code: "insufficient_credits", message: "Not enough credits", details: { action_key: actionKey, credits, balance } } });
  }
  const transcript = opts.transcript ?? MOCK_PART2_TRANSCRIPT;
  const duration = req.duration_sec ?? 110;
  const fillers = countFillers(transcript);
  const words = countSpokenWords(transcript);
  const scored = mockScoredSpeaking(transcript, duration, req.part);
  const feedback = speakingFeedbackFor(scored, (opts.plan ?? "gold") !== "free");
  return ScoreSpeakingResponse.parse({
    response_id: "7d100000-0000-4000-8000-000000000001",
    session_id: req.session_id,
    topic_id: req.topic_id,
    part: req.part,
    transcript,
    signals: {
      duration_sec: duration,
      words,
      words_per_minute: wordsPerMinute(words, duration),
      pauses: 4,
      longest_pause_sec: 2.1,
      filler_count: fillers.reduce((n, f) => n + f.count, 0),
    },
    fillers,
    scores: scored.scores,
    band: speakingPartBand(scored.scores),
    credits_charged: credits,
    balance_after: balance - credits,
    ...feedback,
  });
}
