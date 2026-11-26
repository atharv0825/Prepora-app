// The AI examiner's screen (M8-F1) and the full test (M8-F2): the pure parts, unit-tested.
import type { SpeakingAnswer } from "@prepora/shared/api/score-speaking";
import type { SessionMode, SpeakingPartNo } from "@prepora/shared/ielts/speaking-session";

/** The longest answer the recorder takes per question: Part 1 answers are short, Part 3 longer. */
export const MAX_ANSWER_SECONDS: Record<1 | 3, number> = { 1: 45, 3: 90 };

/** If the browser never says the question finished (some never fire `end`), start recording after this. */
export const TTS_FALLBACK_MS = 15_000;

type Voice = Pick<SpeechSynthesisVoice, "lang" | "name" | "localService">;

const lang = (v: Voice) => v.lang.replace("_", "-").toLowerCase();

/**
 * The examiner's voice: British English first, then Australian (as in the exam), then any other
 * English voice. Within a group, a voice on the device beats a network one (it starts at once
 * and works offline). Null: no English voice, so the browser's default reads it.
 */
export function pickExaminerVoice<V extends Voice>(voices: readonly V[]): V | null {
  const rank = (v: V) => {
    const l = lang(v);
    const group = l.startsWith("en-gb") ? 0 : l.startsWith("en-au") ? 1 : l.startsWith("en") ? 2 : 9;
    return group * 2 + (v.localService ? 0 : 1);
  };
  const english = voices.filter((v) => rank(v) < 18);
  if (!english.length) return null;
  return [...english].sort((a, b) => rank(a) - rank(b))[0]!;
}

/** Where an answer's recording goes: {user}/{session}-p{part}-q{n}-{nonce}.{ext} (a retake gets a new name). */
export function answerPath(userId: string, sessionId: string, part: 1 | 3, questionNo: number, ext: string, nonce: string): string {
  return `${userId}/${sessionId}-p${part}-q${questionNo}-${nonce}.${ext}`;
}

/** One question and its answer, as the examiner screen keeps them. */
export type ExaminerQA = { question: string; audioPath: string; seconds: number; transcript?: string };

/** The examiner-turn request's turns: every answer transcribed except, perhaps, the newest. */
export function examinerTurns(qa: readonly ExaminerQA[]) {
  return qa.map((t) => ({
    question: t.question,
    audio_path: t.audioPath,
    ...(t.transcript !== undefined ? { transcript: t.transcript } : {}),
    duration_sec: Math.min(300, Math.max(1, t.seconds)),
  }));
}

/** score-speaking's answers for Parts 1 and 3. */
export function scoreAnswers(qa: readonly ExaminerQA[]): SpeakingAnswer[] {
  return qa.map((t) => ({ question: t.question, audio_path: t.audioPath, duration_sec: Math.min(300, Math.max(1, t.seconds)) }));
}

/** The session mode for practising one part. */
export function practiceMode(part: SpeakingPartNo): SessionMode {
  return `part${part}` as SessionMode;
}

/** What the full test costs: the three parts' credits added up (credit_costs, admin-tunable). */
export function fullTestCredits(costs: Partial<Record<string, { credits: number }>>): number | null {
  const parts = ["speaking_p1", "speaking_p2", "speaking_p3"].map((k) => costs[k]?.credits);
  return parts.every((c) => typeof c === "number") ? parts.reduce((a, c) => a! + c!, 0)! : null;
}

export type FullTestPick = { p1: string; card: string; p3: string };

/**
 * The full test's three topics (M8-F2): a Part 1 question set, a Part 2 cue card that has a Part 3
 * discussion, and one of that card's discussions. `locked`: the topics of parts already scored
 * in this session (they stay). `wanted`: the ones in the URL (kept when still published, so a
 * reload asks the same questions). `not`: a card to avoid if another exists ("Next cue card").
 * Null when there isn't enough published content for a full test.
 */
export function pickFullTest(
  pool: { part1: readonly string[]; cards: readonly string[]; discussions: readonly { id: string; card: string }[] },
  locked: Partial<FullTestPick>,
  wanted: Partial<FullTestPick>,
  not?: string,
  random: () => number = Math.random,
): FullTestPick | null {
  const any = (xs: readonly string[]) => (xs.length ? xs[Math.floor(random() * xs.length)] : undefined);
  const discussionsOf = (card: string) => pool.discussions.filter((d) => d.card === card).map((d) => d.id);
  const playable = pool.cards.filter((c) => discussionsOf(c).length > 0);
  const others = playable.filter((c) => c !== not);
  const p1 = locked.p1 ?? (wanted.p1 && pool.part1.includes(wanted.p1) ? wanted.p1 : any(pool.part1));
  const card = locked.card ?? (wanted.card && playable.includes(wanted.card) ? wanted.card : any(others.length ? others : playable));
  if (!p1 || !card) return null;
  const kids = discussionsOf(card);
  const p3 = locked.p3 ?? (wanted.p3 && kids.includes(wanted.p3) ? wanted.p3 : any(kids));
  return p3 ? { p1, card, p3 } : null;
}
