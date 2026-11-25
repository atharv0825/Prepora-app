"use client";

import { letterLabel, romanLabel } from "@prepora/shared/ielts/reading";
import { groupInstruction, type PlayerQuestion, type QuestionGroup, questionRange, sharedList } from "@prepora/shared/ielts/questions";
import type { Answers } from "@prepora/shared/ielts/questions";
import { QuestionField } from "./question-field";

/**
 * A group of questions as on the test paper (M4-F3): "Questions 1–5", the instruction, the shared
 * list once (headings, features or a word bank), then each question. With the list shown, the
 * questions show just its labels.
 */
export function QuestionGroupView<Q extends PlayerQuestion>({
  group,
  answers,
  onAnswer,
}: {
  group: QuestionGroup<Q>;
  answers: Answers;
  onAnswer: (qNo: number, value: string | string[]) => void;
}) {
  const first = group.questions[0]!;
  const list = sharedList(first);
  const showList = list && list.key !== "paragraphs";
  const label = (i: number) => (list?.key === "headings" ? romanLabel(i) : letterLabel(i));
  const listTitle = { headings: "List of headings", features: "Options", word_bank: "Words", paragraphs: "" } as const;

  return (
    <section className="flex flex-col gap-5" aria-label={questionRange(group)} data-group={group.first}>
      <header className="flex flex-col gap-1.5">
        <h3 className="font-semibold">{questionRange(group)}</h3>
        <p className="text-sm text-muted-foreground">{groupInstruction(group)}</p>
      </header>
      {showList && (
        <div className="rounded-2xl border border-black/10 bg-secondary/40 p-4">
          <p className="mb-2 text-sm font-semibold">{listTitle[list.key]}</p>
          <ol className="flex flex-col gap-1 text-sm">
            {list.items.map((item, i) => (
              <li key={i} className="flex gap-3">
                <span className="w-6 shrink-0 font-semibold">{label(i)}</span>
                <span>{item}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
      <div className="flex flex-col gap-6">
        {group.questions.map((q) => (
          <QuestionField key={q.q_no} question={q} value={answers[String(q.q_no)]} onChange={(v) => onAnswer(q.q_no, v)} compact={!!showList} />
        ))}
      </div>
    </section>
  );
}
