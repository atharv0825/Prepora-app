// Grades the sample Listening test (not production) with the same marking code grade-test runs
// (supabase/functions/_shared/reading.ts, import-free so it loads here too). Labelling has no
// rule of its own there yet (M5-B2 adds it), so it's marked as its equivalent:
//   map labelling → a letter, like matching features;
//   diagram labelling → a typed gap with a word limit, or a word-bank letter.
import type { ListeningMode } from "@prepora/shared/api/listening-test";
import { listeningBand } from "@prepora/shared/ielts/listening";
import { type GradableQuestion, gradeQuestion, type QuestionType } from "../../../../../supabase/functions/_shared/reading";
import type { Answers, ListeningResultsData } from "./answers";
import { sampleKeys, sampleTranscripts } from "./sample";

function asReadingType(type: string, options: Record<string, unknown>): QuestionType {
  if (type === "map_labelling") return "matching_features";
  if (type === "diagram_labelling") return Array.isArray(options.word_bank) ? "summary_completion" : "short_answer";
  return type as QuestionType;
}

export function gradeSample(mode: ListeningMode, answers: Answers): ListeningResultsData {
  const results = sampleKeys()
    .sort((a, b) => a.q_no - b.q_no)
    .map((k) => {
      const question: GradableQuestion = {
        q_no: k.q_no,
        q_type: asReadingType(k.q_type, k.options),
        options: k.options,
        answer: k.answer,
        explanation: k.explanation,
      };
      return { ...gradeQuestion(question, answers[String(k.q_no)]), q_type: k.q_type };
    });
  const raw_score = results.filter((r) => r.correct).length;
  return { mode, raw_score, total: results.length, band: listeningBand(raw_score, results.length), results, transcripts: sampleTranscripts() };
}
