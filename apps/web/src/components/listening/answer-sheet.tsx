"use client";

import { useMemo } from "react";
import { cn } from "cn";
import type { PublicListeningQuestion } from "@prepora/shared/api/listening-test";
import { LISTENING_SECTIONS, sectionOfQuestion } from "@prepora/shared/ielts/listening";
import { type Answers, answeredCount, isAnswered, questionsBySection, sheetBlocks } from "@/lib/listening/answers";
import { LabellingBlock } from "./labelling";
import { QuestionField } from "@/components/questions/question-field";

/**
 * M5-F2: the 40-question answer sheet. Four parts (tabs, with how many are answered), a
 * navigator of all 40 numbers, and the current part's questions: labelling questions that share
 * a picture are laid out together (labelling.tsx); everything else is one QuestionField each.
 */
export function AnswerSheet({
  questions,
  answers,
  onAnswer,
  part,
  onPartChange,
}: {
  questions: readonly PublicListeningQuestion[];
  answers: Answers;
  onAnswer: (qNo: number, value: string | string[]) => void;
  part: number;
  onPartChange: (part: number) => void;
}) {
  const bySection = useMemo(() => questionsBySection(questions), [questions]);
  const parts = Array.from({ length: LISTENING_SECTIONS }, (_, i) => i + 1).filter((p) => (bySection.get(p)?.length ?? 0) > 0);
  const current = useMemo(() => bySection.get(part) ?? [], [bySection, part]);
  const blocks = useMemo(() => sheetBlocks(current), [current]);
  const allNos = questions.map((q) => q.q_no).sort((a, b) => a - b);

  function jump(qNo: number) {
    onPartChange(sectionOfQuestion(qNo));
    // After the part renders.
    requestAnimationFrame(() => {
      const el = document.querySelector<HTMLElement>(`[data-q="${qNo}"]`);
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
      el?.querySelector<HTMLElement>("input")?.focus({ preventScroll: true });
    });
  }

  return (
    <div className="flex flex-col gap-6" data-testid="answer-sheet">
      <div role="tablist" aria-label="Parts" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {parts.map((p) => {
          const nos = (bySection.get(p) ?? []).map((q) => q.q_no);
          return (
            <button
              key={p}
              role="tab"
              type="button"
              aria-selected={p === part}
              onClick={() => onPartChange(p)}
              className={cn(
                "flex flex-col items-start rounded-2xl border px-4 py-2.5 text-left transition-colors",
                p === part ? "border-primary bg-primary/10" : "border-black/10 hover:border-primary/60",
              )}
            >
              <span className="font-medium">Part {p}</span>
              <span className="text-xs text-muted-foreground">
                {answeredCount(answers, nos)} of {nos.length} answered
              </span>
            </button>
          );
        })}
      </div>

      <nav aria-label="Questions" className="flex flex-wrap gap-1.5">
        {allNos.map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => jump(n)}
            aria-label={`Question ${n}${isAnswered(answers[String(n)]) ? ", answered" : ""}`}
            className={cn(
              "grid size-8 place-items-center rounded-full border text-xs font-medium transition-colors",
              isAnswered(answers[String(n)]) ? "border-primary bg-primary text-primary-foreground" : "border-black/15 hover:border-primary",
              sectionOfQuestion(n) === part && !isAnswered(answers[String(n)]) && "border-foreground/40",
            )}
          >
            {n}
          </button>
        ))}
      </nav>

      <div role="tabpanel" aria-label={`Part ${part}`} className="flex flex-col gap-7">
        <p className="text-sm text-muted-foreground">
          Questions {current[0]?.q_no}–{current.at(-1)?.q_no}
        </p>
        {blocks.map((b) =>
          b.kind === "labelling" ? (
            <LabellingBlock key={`img-${b.questions[0]!.q_no}`} image={b.image} questions={b.questions} answers={answers} onAnswer={onAnswer} />
          ) : (
            <QuestionField key={b.question.q_no} question={b.question} value={answers[String(b.question.q_no)]} onChange={(v) => onAnswer(b.question.q_no, v)} />
          ),
        )}
      </div>
    </div>
  );
}
