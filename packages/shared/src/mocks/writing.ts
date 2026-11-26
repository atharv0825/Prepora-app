// Mock score-writing and ocr-writing responses (M6-C3), used to build the Writing screens before
// the AI worked. Since M6-I1 the app always calls the real functions (CI points them at the
// ai-stub function); these fixtures and handlers remain for unit and e2e tests.
//
// The handlers answer like the real functions: the response is built from the request (word
// count, under-length penalty, corrections that really occur in the text), shaped for the plan
// (full for Gold/Platinum, summary for Free), and parsed by the contract before it's returned,
// so a screen that works with the mock works with the function.
//
// Deterministic: the same text gives the same scores, so screenshots and e2e tests are stable.
import type { ApiErrorBody } from "../api/errors";
import { joinOcrPages, type OcrWritingRequest, OcrWritingResponse } from "../api/ocr-writing";
import {
  ScoreWritingRequest,
  ScoreWritingResponse,
  type ScoredWriting,
  type WritingCorrection,
  writingFeedbackFor,
} from "../api/score-writing";
import { countEssayWords, isUnderLength, WRITING_TASKS, type WritingScores, type WritingTaskNo, writingTaskBand } from "../ielts/writing";

// ── Fixtures ────────────────────────────────────────────────────────────────────────────────
export const MOCK_TASK_IDS = {
  task1Academic: "6d000000-0000-4000-8000-000000000001",
  task1General: "6d000000-0000-4000-8000-000000000002",
  task2: "6d000000-0000-4000-8000-000000000003",
} as const;

export const MOCK_TASK2_PROMPT =
  "Some people believe that working from home benefits both employees and employers. Others think it causes more problems than it solves. Discuss both views and give your own opinion.";

/** A believable band-6 Task 2 answer with the mistakes the mock corrects. */
export const MOCK_TASK2_ESSAY = `Nowadays, alot of companies let their staff work from home. Some people think this is good for both workers and employers, while others believe it create more problems. In this essay I will discuss both views and give my opinion.

On the one hand, working from home save time and money. Employees dont need to travel to the office every day, so they have more time for their family and they spend less on transport. Employers also benefit because they can rent smaller offices and hire talented people who live far away from the city, which was not possible in the past. In addition, many peoples feel more relaxed at home, which can make them more productive. For example, my cousin works for a bank and she says she finishes her tasks faster at home because nobody interrupts her.

On the other hand, there are some disadvantages. Workers may feel lonely because they do not see their colleagues, and it is more harder for managers to check the progress of a team. Furthermore, some employees find it difficult to separate work and private life, so they work longer hours and become tired. Not everyone has a quiet room at home either, and children or noisy neighbours can make it hard to concentrate on important tasks.

In conclusion, I believe that working from home has more advantages than disadvantages, but companies should give clear rules and meet their staff regularly. In my opinion a mix of home and office work is the best solution for everyone.`;

/** Mistakes the mock looks for (whole words, case-insensitive); the first hit of each becomes a correction. */
const MOCK_RULES: readonly (Omit<WritingCorrection, "original"> & { find: RegExp })[] = [
  { find: /\balot\b/i, suggestion: "a lot", category: "spelling", explanation: "\"A lot\" is always two words." },
  { find: /\bdont\b/i, suggestion: "don't", category: "punctuation", explanation: "Contractions need an apostrophe (in an essay, \"do not\" is better)." },
  { find: /\bpeoples\b/i, suggestion: "people", category: "grammar", explanation: "\"People\" is already plural." },
  { find: /\bmore harder\b/i, suggestion: "harder", category: "grammar", explanation: "Use \"harder\" or \"more difficult\", not both." },
  { find: /\bit create\b/i, suggestion: "it creates", category: "grammar", explanation: "Third person singular needs -s." },
  { find: /\bhome save\b/i, suggestion: "home saves", category: "grammar", explanation: "The subject \"working from home\" is singular." },
  { find: /\binformations\b/i, suggestion: "information", category: "grammar", explanation: "\"Information\" is uncountable." },
  { find: /\badvices\b/i, suggestion: "advice", category: "grammar", explanation: "\"Advice\" is uncountable." },
  { find: /\bgive clear rules\b/i, suggestion: "set clear rules", category: "vocabulary", explanation: "\"Set rules\" is the natural collocation." },
  { find: /\bIn my opinion a\b/, suggestion: "In my opinion, a", category: "punctuation", explanation: "Put a comma after an introductory phrase." },
  { find: /\bNowadays\b/, suggestion: "Increasingly,", category: "style", explanation: "\"Nowadays\" is an overused opening; a more precise word reads better." },
];

/** The corrections whose mistake occurs in the text, quoting it exactly as written. */
export function mockCorrections(text: string): WritingCorrection[] {
  const out: WritingCorrection[] = [];
  for (const { find, ...rest } of MOCK_RULES) {
    const hit = find.exec(text);
    if (hit) out.push({ original: hit[0], ...rest });
  }
  return out;
}

/** Scores from the text: band 7 to start; under length costs TA, each correction found costs a little. */
export function mockScores(text: string, taskNo: WritingTaskNo): WritingScores {
  const words = countEssayWords(text);
  const corrections = mockCorrections(text);
  const grammar = corrections.filter((c) => c.category === "grammar" || c.category === "spelling").length;
  const vocab = corrections.filter((c) => c.category === "vocabulary" || c.category === "style").length;
  const clamp = (n: number) => Math.min(9, Math.max(0, Math.round(n * 2) / 2));
  const short = isUnderLength(words, taskNo);
  return {
    ta: clamp(short ? 5 : 7 - (words < WRITING_TASKS[taskNo].minWords * 1.1 ? 0.5 : 0)),
    cc: clamp(words < 80 ? 4.5 : 6.5),
    lr: clamp(7 - vocab * 0.5),
    gra: clamp(7 - grammar * 0.5),
  };
}

export function mockScoredWriting(text: string, taskNo: WritingTaskNo): ScoredWriting {
  const words = countEssayWords(text);
  const { minWords } = WRITING_TASKS[taskNo];
  const corrections = mockCorrections(text);
  const scores = mockScores(text, taskNo);
  const band = writingTaskBand(scores);
  const short = isUnderLength(words, taskNo);
  return {
    scores,
    summary: short
      ? `Your answer has ${words} words, under the ${minWords}-word minimum, which lowers your Task ${taskNo === 1 ? "Achievement" : "Response"} score. The ideas you do include are clear; develop them fully next time. (Mock feedback.)`
      : `A clear, well-organised answer at about band ${band.toFixed(1)}. Your position is easy to follow, but grammar slips and some basic vocabulary hold it back. (Mock feedback.)`,
    corrections,
    strengths: [
      "Your position is clear from the introduction to the conclusion.",
      "Each body paragraph has a clear main idea with supporting reasons.",
      "Linking words (On the one hand, Furthermore, In conclusion) guide the reader.",
    ],
    improvements: [
      short ? `Write at least ${minWords} words: plan two developed body paragraphs.` : "Develop each idea with a specific example.",
      "Check subject–verb agreement (it creates, working from home saves).",
      "Use less common vocabulary where it fits naturally (e.g. 'flexibility', 'commute', 'isolation').",
    ],
    model_answer:
      taskNo === 2
        ? "Remote working has become widespread, and opinions differ on whether it serves both staff and businesses. While it brings real challenges, I believe its advantages outweigh them when it is managed well.\n\nThe benefits are considerable. Employees save the time and expense of a daily commute, which leaves more room for family life, and many report that a quieter environment helps them concentrate. Employers, in turn, can reduce the cost of office space.\n\nThere are, however, genuine drawbacks. Staff can become isolated from colleagues, managers find it harder to monitor progress, and the boundary between work and private life may blur, leading to longer hours and fatigue.\n\nIn conclusion, home working offers clear gains for both sides, provided companies set clear expectations and bring teams together regularly. A hybrid arrangement seems the most balanced solution. (Mock model answer.)"
        : "The chart compares … (Mock model answer for Task 1: an overview of the main trends, then the key figures grouped logically.)",
  };
}

// ── Handlers ────────────────────────────────────────────────────────────────────────────────
export type MockOptions = {
  /** Gold/Platinum (detailed_feedback) get the full shape; Free the summary. */
  plan?: "free" | "gold" | "platinum";
  /** The task's number; the mock can't look it up. Defaults from MOCK_TASK_IDS, else 2. */
  taskNo?: WritingTaskNo;
  /** Credits before the call (for balance_after). */
  balance?: number;
};

export class MockApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: ApiErrorBody,
  ) {
    super(body.error.message);
  }
}

function taskNoFor(taskId: string, explicit?: WritingTaskNo): WritingTaskNo {
  if (explicit) return explicit;
  return taskId === MOCK_TASK_IDS.task1Academic || taskId === MOCK_TASK_IDS.task1General ? 1 : 2;
}

let seq = 0;
/** A valid, distinct UUID per mock call (deterministic within a run). */
function mockUuid(prefix: string): string {
  seq = (seq + 1) % 0xffffffff;
  return `${prefix.padEnd(8, "0").slice(0, 8)}-0000-4000-8000-${seq.toString(16).padStart(12, "0")}`;
}

/** What score-writing would answer. Throws MockApiError with the real error shapes. */
export function mockScoreWriting(input: unknown, opts: MockOptions = {}): ScoreWritingResponse {
  const parsed = ScoreWritingRequest.safeParse(input);
  if (!parsed.success) {
    throw new MockApiError(400, {
      error: { code: "validation_failed", message: "Invalid request", details: parsed.error.issues },
    });
  }
  const req = parsed.data;
  const taskNo = taskNoFor(req.task_id, opts.taskNo);
  const credits = 4;
  const balance = opts.balance ?? 100;
  if (balance < credits) {
    throw new MockApiError(402, {
      error: {
        code: "insufficient_credits",
        message: "Not enough credits",
        details: { action_key: WRITING_TASKS[taskNo].actionKey, credits, balance },
      },
    });
  }
  const scored = mockScoredWriting(req.text, taskNo);
  const feedback = writingFeedbackFor(scored, (opts.plan ?? "gold") !== "free");
  return ScoreWritingResponse.parse({
    submission_id: mockUuid("5b"),
    task_id: req.task_id,
    task_no: taskNo,
    word_count: countEssayWords(req.text),
    min_words: WRITING_TASKS[taskNo].minWords,
    scores: scored.scores,
    band: writingTaskBand(scored.scores),
    credits_charged: credits,
    balance_after: balance - credits,
    ...feedback,
  });
}

/** The text the mock "reads" from a page: the sample essay, split across two pages. */
const [MOCK_PAGE_1, MOCK_PAGE_2] = (() => {
  const paras = MOCK_TASK2_ESSAY.split("\n\n");
  return [paras.slice(0, 2).join("\n\n"), paras.slice(2).join("\n\n")];
})();

/** What ocr-writing would answer. Free plans get feature_not_in_plan, as the real function. */
export function mockOcrWriting(input: OcrWritingRequest, opts: Pick<MockOptions, "plan" | "balance"> = {}): OcrWritingResponse {
  if ((opts.plan ?? "gold") === "free") {
    throw new MockApiError(403, {
      error: { code: "feature_not_in_plan", message: "Not in your plan", details: { action_key: "ocr", credits: 1 } },
    });
  }
  const balance = opts.balance ?? 100;
  const one = input.photo_paths.length === 1;
  const pages = input.photo_paths.map((path, i) => ({
    path,
    // One page: the whole essay, with one guessed word for the "check the [?] words" hint.
    text: one ? MOCK_TASK2_ESSAY.replace("colleagues", "colleagues [?]") : i === 0 ? MOCK_PAGE_1 : MOCK_PAGE_2,
    legibility: one ? ("partial" as const) : ("good" as const),
  }));
  const text = joinOcrPages(pages);
  return OcrWritingResponse.parse({
    text,
    word_count: countEssayWords(text),
    pages,
    credits_charged: 1,
    balance_after: Math.max(0, balance - 1),
  });
}
