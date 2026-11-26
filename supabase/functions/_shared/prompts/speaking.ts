// The Speaking prompts in use (M7-B3) and how a scoring request is built from them. score-speaking
// and the Speaking eval (supabase/functions/_eval/speaking_eval.ts) both go through here, so the
// eval measures what production sends. Parts 1 and 3 are added in M8.
import type { AiPart, Thinking } from "../ai.ts";
import type { SpeakingSignals } from "../speaking.ts";
import * as part1 from "./speaking-part1.v1.ts";
import * as part2 from "./speaking-part2.v1.ts";
import * as part3 from "./speaking-part3.v1.ts";
import * as examiner from "./examiner.v1.ts";

export const SPEAKING_PROMPTS = {
  1: { version: part1.VERSION, system: part1.SYSTEM },
  2: { version: part2.VERSION, system: part2.SYSTEM },
  3: { version: part3.VERSION, system: part3.SYSTEM },
} as const;

export const EXAMINER_PROMPT = { version: examiner.VERSION, system: examiner.SYSTEM };
/** Examiner turns: quick and cheap (plan M8-B1: no thinking). */
export const EXAMINER_SETTINGS: { thinking?: Thinking; maxOutputTokens: number } = { thinking: "off", maxOutputTokens: 300 };

export const SPEAKING_SETTINGS: { thinking?: Thinking; maxOutputTokens: number } = { thinking: "low", maxOutputTokens: 16_000 };

export interface CueCard {
  title: string;
  points: readonly string[];
}

/** The system instruction, user message and prompt version for scoring a Part 2 answer. */
export function buildPart2Request(card: CueCard, transcript: string, signals: SpeakingSignals): { version: string; system: string; parts: AiPart[] } {
  const { version, system } = SPEAKING_PROMPTS[2];
  const minutes = (signals.duration_sec / 60).toFixed(1);
  const measured = {
    duration_sec: signals.duration_sec,
    words: signals.words,
    words_per_minute: signals.words_per_minute,
    pauses_of_1s_or_more: signals.pauses,
    longest_pause_sec: signals.longest_pause_sec,
    filler_count: signals.filler_count,
    transcript_confidence: signals.transcript_confidence,
  };
  const card_ = `${card.title.trim()}\nYou should say:\n${card.points.map((p) => `- ${p.trim()}`).join("\n")}`;
  return {
    version,
    system,
    parts: [
      { text: `Part 2 cue card:\n<card>\n${card_}\n</card>` },
      {
        text: `The candidate spoke for ${minutes} minutes.${signals.duration_sec < 60 ? " This is a SHORT turn (under 1 minute)." : ""}\nMeasured signals (from the audio and the speech-to-text timings):\n${JSON.stringify(measured)}`,
      },
      { text: `<transcript>\n${transcript.replaceAll("</transcript>", "<\\/transcript>")}\n</transcript>` },
    ],
  };
}

const measured = (s: SpeakingSignals) => ({
  duration_sec: s.duration_sec,
  words: s.words,
  words_per_minute: s.words_per_minute,
  pauses_of_1s_or_more: s.pauses,
  longest_pause_sec: s.longest_pause_sec,
  filler_count: s.filler_count,
  transcript_confidence: s.transcript_confidence,
});

/** Scoring a Part 1 or Part 3 conversation: the topic, the signals and the Q&A (M8-B2). */
export function buildConversationRequest(
  part: 1 | 3,
  topic: { title: string; card?: CueCard | null },
  turns: readonly { question: string; answer: string }[],
  signals: SpeakingSignals,
): { version: string; system: string; parts: AiPart[] } {
  const { version, system } = SPEAKING_PROMPTS[part];
  const qa = turns
    .map((t, i) => `Question ${i + 1}: ${t.question.trim()}\n<answer>\n${t.answer.replaceAll("</answer>", "<\\/answer>")}\n</answer>`)
    .join("\n\n");
  return {
    version,
    system,
    parts: [
      { text: `Part ${part} topic: ${topic.title.trim()}${topic.card ? `\nIt follows the Part 2 cue card: "${topic.card.title.trim()}"` : ""}` },
      { text: `Measured signals over all the answers (from the audio and the speech-to-text timings):\n${JSON.stringify(measured(signals))}` },
      { text: `<transcript>\n${qa.replaceAll("</transcript>", "<\\/transcript>")}\n</transcript>` },
    ],
  };
}

/** The examiner's next turn: the remaining set questions and the conversation so far (M8-B1). */
export function buildExaminerRequest(
  part: 1 | 3,
  topic: { title: string; card?: CueCard | null },
  remaining: readonly string[],
  turns: readonly { question: string; answer: string }[],
): { version: string; system: string; parts: AiPart[] } {
  const conversation = turns.length
    ? turns.map((t, i) => `Q${i + 1}: ${t.question.trim()}\n<answer>\n${t.answer.replaceAll("</answer>", "<\\/answer>")}\n</answer>`).join("\n\n")
    : "(none yet: this is the opening question)";
  return {
    version: EXAMINER_PROMPT.version,
    system: EXAMINER_PROMPT.system,
    parts: [
      { text: `Part ${part}. Topic: ${topic.title.trim()}${topic.card ? `\nThe candidate's Part 2 cue card was: "${topic.card.title.trim()}"` : ""}\nQuestions asked so far: ${turns.length}.` },
      { text: `Questions still available from the set:\n${remaining.length ? remaining.map((q, i) => `${i}. ${q}`).join("\n") : "(none left)"}` },
      { text: `Conversation so far:\n${conversation}` },
    ],
  };
}
