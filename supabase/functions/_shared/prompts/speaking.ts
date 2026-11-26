// The Speaking prompts in use (M7-B3) and how a scoring request is built from them. score-speaking
// and the Speaking eval (supabase/functions/_eval/speaking_eval.ts) both go through here, so the
// eval measures what production sends. Parts 1 and 3 are added in M8.
import type { AiPart, Thinking } from "../ai.ts";
import type { SpeakingSignals } from "../speaking.ts";
import * as part2 from "./speaking-part2.v1.ts";

export const SPEAKING_PROMPTS = { 2: { version: part2.VERSION, system: part2.SYSTEM } } as const;

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
