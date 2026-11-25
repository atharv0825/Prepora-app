// Grades the sample Listening test (not production) with the same marking code grade-test runs
// (supabase/functions/_shared/reading.ts, import-free so it loads here too), labelling included
// (M5-B2).
import type { ListeningMode } from "@prepora/shared/api/listening-test";
import { type GradableQuestion, gradeListeningTest, type QuestionType } from "../../../../../supabase/functions/_shared/reading";
import type { Answers, ListeningResultsData } from "./answers";
import { sampleKeys, sampleTranscripts } from "./sample";

export function gradeSample(mode: ListeningMode, answers: Answers): ListeningResultsData {
  const questions: GradableQuestion[] = sampleKeys().map((k) => ({
    q_no: k.q_no,
    q_type: k.q_type as QuestionType,
    options: k.options,
    answer: k.answer,
    explanation: k.explanation,
  }));
  const graded = gradeListeningTest(questions, answers);
  return { mode, ...graded, transcripts: sampleTranscripts() };
}
