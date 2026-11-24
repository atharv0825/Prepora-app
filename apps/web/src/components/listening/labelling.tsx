"use client";

import { useState } from "react";
import { cn } from "cn";
import type { PublicListeningQuestion } from "@prepora/shared/api/listening-test";
import type { ImagePoint, MapLocation } from "@prepora/shared/ielts/listening";
import type { Answers } from "@/lib/listening/answers";
import { isAnswered } from "@/lib/listening/answers";
import { QuestionField } from "@/components/questions/question-field";

/**
 * M5-F2: map / diagram labelling. One picture for a group of questions on the same image.
 *
 *   * Map: lettered places are drawn over the map. Pick a question (or let it pick the first
 *     unanswered one), then tap a place on the map, or a letter in the list: both answer it.
 *   * Diagram: each question's number sits on the diagram; tapping it jumps to its answer box.
 *
 * Marker positions are percentages, so they stay on target at any width.
 */
export function LabellingBlock({
  image,
  questions,
  answers,
  onAnswer,
}: {
  image: { url: string; alt: string };
  questions: PublicListeningQuestion[];
  answers: Answers;
  onAnswer: (qNo: number, value: string | string[]) => void;
}) {
  const isMap = questions[0]?.q_type === "map_labelling";
  const firstOpen = questions.find((q) => !isAnswered(answers[String(q.q_no)]))?.q_no ?? questions[0]!.q_no;
  const [active, setActive] = useState<number | null>(null);
  const current = active ?? firstOpen;

  const locations: MapLocation[] = isMap && Array.isArray(questions[0]!.options.locations) ? (questions[0]!.options.locations as MapLocation[]) : [];
  const markers = questions
    .map((q) => ({ q_no: q.q_no, at: q.options.marker as ImagePoint | undefined }))
    .filter((m): m is { q_no: number; at: ImagePoint } => !!m.at && typeof m.at.x === "number");

  function placeOnMap(label: string) {
    onAnswer(current, label);
    // Move on to the next question still to answer.
    const next = questions.find((q) => q.q_no > current && !isAnswered(answers[String(q.q_no)]));
    setActive(next?.q_no ?? current);
  }

  function focusQuestion(qNo: number) {
    setActive(qNo);
    document.getElementById(`q${qNo}`)?.focus();
  }

  return (
    <div className="grid gap-5 md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]" data-testid={isMap ? "map-labelling" : "diagram-labelling"}>
      <figure className="relative self-start overflow-hidden rounded-2xl border border-black/10 bg-white">
        {/* Plain <img>: CDN images, sized by the container; optimisation is off app-wide. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={image.url} alt={image.alt} className="block h-auto w-full select-none" draggable={false} />
        {locations.map((l) => {
          const takenBy = questions.find((q) => answers[String(q.q_no)] === l.label)?.q_no;
          return (
            <button
              key={l.label}
              type="button"
              onClick={() => placeOnMap(l.label)}
              aria-label={`Place ${l.label}${takenBy ? `, chosen for question ${takenBy}` : ""}: answer question ${current}`}
              className={cn(
                "absolute grid size-8 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-2 text-sm font-bold shadow transition-transform hover:scale-110 focus-visible:ring-3 focus-visible:ring-ring/40 focus-visible:outline-none",
                takenBy ? "border-primary bg-primary text-primary-foreground" : "border-foreground bg-white text-foreground",
              )}
              style={{ left: `${l.x}%`, top: `${l.y}%` }}
            >
              {l.label}
            </button>
          );
        })}
        {markers.map((m) => (
          <button
            key={m.q_no}
            type="button"
            onClick={() => focusQuestion(m.q_no)}
            aria-label={`Question ${m.q_no} on the diagram`}
            className={cn(
              "absolute grid size-7 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-2 text-xs font-bold shadow focus-visible:ring-3 focus-visible:ring-ring/40 focus-visible:outline-none",
              isAnswered(answers[String(m.q_no)]) ? "border-primary bg-primary text-primary-foreground" : "border-foreground bg-white",
              m.q_no === current && "ring-3 ring-primary/50",
            )}
            style={{ left: `${m.at.x}%`, top: `${m.at.y}%` }}
          >
            {m.q_no}
          </button>
        ))}
        {isMap && (
          <figcaption className="border-t border-black/5 px-3 py-2 text-xs text-muted-foreground" aria-live="polite">
            Tap a letter on the map to answer question {current}.
          </figcaption>
        )}
      </figure>

      <div className="flex flex-col gap-5">
        {questions.map((q) => (
          <div
            key={q.q_no}
            onFocusCapture={() => setActive(q.q_no)}
            onClick={() => setActive(q.q_no)}
            className={cn("rounded-2xl p-2 transition-colors", isMap && q.q_no === current && "bg-primary/5 ring-1 ring-primary/30")}
          >
            <QuestionField question={q} value={answers[String(q.q_no)]} onChange={(v) => onAnswer(q.q_no, v)} />
          </div>
        ))}
      </div>
    </div>
  );
}
