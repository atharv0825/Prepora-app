// The Writing prompts in use (M6-B2) and how a scoring / OCR request is built from them. score-writing,
// ocr-writing and the prompt eval (supabase/functions/_eval) all go through here, so the eval
// measures exactly what production sends. To release a new prompt version: add the *.v2.ts file,
// point the import below at it, run the eval, and compare against the previous version.
import type { AiPart, Thinking } from "../ai.ts";
import * as t1Academic from "./writing-t1-academic.v1.ts";
import * as t1General from "./writing-t1-general.v1.ts";
import * as t2 from "./writing-t2.v1.ts";
import * as ocr from "./ocr-handwriting.v1.ts";
import { countEssayWords, WRITING_TASKS, type WritingTaskNo } from "../writing.ts";

export type WritingTaskKind = "t1_academic" | "t1_general" | "t2";

export const SCORING_PROMPTS: Record<WritingTaskKind, { version: string; system: string }> = {
  t1_academic: { version: t1Academic.VERSION, system: t1Academic.SYSTEM },
  t1_general: { version: t1General.VERSION, system: t1General.SYSTEM },
  t2: { version: t2.VERSION, system: t2.SYSTEM },
};

export const OCR_PROMPT = { version: ocr.VERSION, system: ocr.SYSTEM };

/** Scoring thinks (low effort: compare "high" with the eval before changing); OCR doesn't need to. */
export const SCORING_SETTINGS: { thinking?: Thinking; maxOutputTokens: number } = { thinking: "low", maxOutputTokens: 16_000 };
export const OCR_SETTINGS: { thinking?: Thinking; maxOutputTokens: number } = { thinking: "off", maxOutputTokens: 8_000 };

export function taskKind(taskNo: WritingTaskNo, testType: "academic" | "general" | null): WritingTaskKind {
  if (taskNo === 2) return "t2";
  if (testType === "academic") return "t1_academic";
  if (testType === "general") return "t1_general";
  throw new Error("Task 1 needs a test type");
}

export interface ScoringTask {
  taskNo: WritingTaskNo;
  testType: "academic" | "general" | null;
  prompt: string;
  /** The chart for Task 1 Academic, already fetched. */
  image?: { mimeType: string; data: string };
}

/** The system instruction, user message and prompt version for scoring one answer. */
export function buildScoringRequest(task: ScoringTask, answer: string): { version: string; system: string; parts: AiPart[] } {
  const kind = taskKind(task.taskNo, task.testType);
  const { version, system } = SCORING_PROMPTS[kind];
  const words = countEssayWords(answer);
  const { minWords } = WRITING_TASKS[task.taskNo];
  const label = kind === "t2"
    ? "Task 2 essay"
    : kind === "t1_academic"
    ? "Academic Task 1 report"
    : "General Training Task 1 letter";

  const parts: AiPart[] = [{ text: `${label}.\n\nThe task:\n<task>\n${task.prompt.trim()}\n</task>` }];
  if (task.image) {
    parts.push({ text: "The visual given with the task:" }, { image: task.image });
  }
  parts.push({
    text: `Word count (counted by the app): ${words}. Minimum: ${minWords}.${words < minWords ? " The answer is UNDER the minimum length." : ""}\n\n<answer>\n${answer.replaceAll("</answer>", "<\\/answer>")}\n</answer>`,
  });
  return { version, system, parts };
}

/** The OCR request: the photos in page order. */
export function buildOcrRequest(photos: { mimeType: string; data: string }[], taskPrompt?: string): { version: string; system: string; parts: AiPart[] } {
  const parts: AiPart[] = [];
  if (taskPrompt) {
    parts.push({ text: `For context only (do not transcribe it), the task the candidate answered:\n<task>\n${taskPrompt.trim()}\n</task>` });
  }
  photos.forEach((p, i) => {
    parts.push({ text: `Photo ${i + 1} of ${photos.length}:` }, { image: p });
  });
  return { version: OCR_PROMPT.version, system: OCR_PROMPT.system, parts };
}
