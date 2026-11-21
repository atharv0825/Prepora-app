import { Pause } from "lucide-react";
import { routes } from "@/lib/routes";
import { Reveal } from "./reveal";

const wave = [8, 14, 22, 16, 28, 34, 20, 30, 38, 26, 18, 32, 24, 14, 22, 30, 18, 10, 16, 24, 12, 8];

function SpeakingPreview() {
  return (
    <div className="flex h-full flex-col justify-between gap-4">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>Part 2 · Recording</span>
        <span className="font-mono">1:46</span>
      </div>
      <div className="flex h-14 items-center gap-[3px]">
        {wave.map((h, i) => (
          <span key={i} className="w-1 rounded-full bg-foreground" style={{ height: `${h}px` }} />
        ))}
      </div>
    </div>
  );
}

function WritingPreview() {
  return (
    <div className="flex h-full flex-col gap-2.5">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>Task 2 · Essay</span>
        <span className="font-mono">32:10 left</span>
      </div>
      <div className="space-y-2 rounded-xl border border-border bg-background p-3">
        {[100, 92, 96, 70].map((w, i) => (
          <div key={i} className="h-2 rounded-full bg-foreground/15" style={{ width: `${w}%` }} />
        ))}
      </div>
      <p className="text-right font-mono text-xs text-muted-foreground">268 / 250 words</p>
    </div>
  );
}

function ReadingPreview() {
  return (
    <div className="grid h-full grid-cols-2 gap-3">
      <div className="space-y-2 rounded-xl border border-border bg-background p-3">
        {[100, 94, 98, 88, 96, 60].map((w, i) => (
          <div key={i} className="h-1.5 rounded-full bg-foreground/15" style={{ width: `${w}%` }} />
        ))}
      </div>
      <div className="space-y-2 text-[11px]">
        <p className="font-medium">14. The author suggests…</p>
        {["True", "False", "Not Given"].map((o, i) => (
          <div key={o} className="flex items-center gap-2 text-muted-foreground">
            <span className={`size-3 rounded-full border border-foreground/40 ${i === 0 ? "bg-foreground" : ""}`} />
            {o}
          </div>
        ))}
      </div>
    </div>
  );
}

function ListeningPreview() {
  return (
    <div className="flex h-full flex-col justify-between gap-4">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>Section 2 of 4</span>
        <span>Questions 11–20</span>
      </div>
      <div className="flex items-center gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-foreground text-background">
          <Pause className="size-4" strokeWidth={1.5} />
        </span>
        <div className="h-1.5 flex-1 rounded-full bg-foreground/15">
          <div className="h-full w-2/5 rounded-full bg-foreground" />
        </div>
        <span className="font-mono text-xs text-muted-foreground">2:41</span>
      </div>
    </div>
  );
}

const modules = [
  {
    title: "Speaking",
    body: "Interview, cue card and discussion with an AI examiner. Scored on fluency, vocabulary, grammar and pronunciation.",
    Preview: SpeakingPreview,
  },
  {
    title: "Writing",
    body: "Task 1 reports and letters, Task 2 essays. Typed or photographed, with corrections and a model answer.",
    Preview: WritingPreview,
  },
  {
    title: "Reading",
    body: "Three passages per test, all 11 question types, in the computer-delivered split-screen layout.",
    Preview: ReadingPreview,
  },
  {
    title: "Listening",
    body: "Four sections, 40 questions, UK, Australian and US accents. Exam mode plays each recording once.",
    Preview: ListeningPreview,
  },
];

/** 2×2 module cards with mini UI previews (design doc §4). */
export function ModulesGrid() {
  const anchor = routes.modules.split("#")[1];
  return (
    <section id={anchor} className="container-page scroll-mt-20 py-20 sm:py-28">
      <Reveal className="max-w-2xl">
        <p className="text-eyebrow text-muted-foreground uppercase">Modules</p>
        <h2 className="mt-3 text-h1">All four IELTS skills, one coach.</h2>
      </Reveal>
      <div className="mt-12 grid gap-4 md:grid-cols-2">
        {modules.map(({ title, body, Preview }) => (
          <Reveal key={title}>
            <article className="flex h-full flex-col gap-6 rounded-xl bg-muted p-6 sm:p-8">
              <div className="h-36 rounded-2xl border border-border bg-background/60 p-4">
                <Preview />
              </div>
              <div>
                <h3 className="text-h3">{title}</h3>
                <p className="mt-2 text-muted-foreground">{body}</p>
              </div>
            </article>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
