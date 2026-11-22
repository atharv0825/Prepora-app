import { routes } from "@/lib/routes";
import { JourneyScene } from "./journey-scene";
import { ListeningPreview, ReadingPreview, SpeakingPreview, WritingPreview } from "./module-previews";
import { Reveal } from "./reveal";

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

/** 2×2 module cards with live mini UI previews in brand-rust #8C3F3F (design doc §4). */
export function ModulesGrid() {
  const anchor = routes.modules.split("#")[1];
  return (
    <section id={anchor} className="container-page scroll-mt-20 pt-20 pb-0 sm:pt-28">
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
      {/* Cartoon film standing on the top edge of the grey How it works section (no bottom padding). */}
      <Reveal className="mt-4 sm:mt-6">
        <JourneyScene />
      </Reveal>
    </section>
  );
}
