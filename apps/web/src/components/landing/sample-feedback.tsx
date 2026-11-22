import { Reveal } from "./reveal";

// Illustrative result screen. Criteria average to the overall band (6.5).
const criteria = [
  { name: "Task Response", band: 6.5 },
  { name: "Coherence & Cohesion", band: 7.0 },
  { name: "Lexical Resource", band: 6.0 },
  { name: "Grammatical Range & Accuracy", band: 6.5 },
];

const corrections = [
  { wrong: "In nowadays,", right: "Nowadays," },
  { wrong: "many informations", right: "a lot of information" },
  { wrong: "make a research", right: "do research" },
];

/** Realistic feedback card: overall band, criteria bars, corrections (design doc §4). */
export function SampleFeedback() {
  return (
    <section className="container-page py-20 sm:py-28">
      <div className="grid items-center gap-12 lg:grid-cols-[1fr_1.1fr]">
        <Reveal className="max-w-lg">
          <p className="text-eyebrow text-muted-foreground uppercase">Feedback</p>
          <h2 className="mt-3 text-h1">Know exactly what moves your band.</h2>
          <p className="mt-4 text-lead text-muted-foreground">
            Every answer is scored on the four official criteria, with the mistakes that cost you
            marks and better ways to say it.
          </p>
        </Reveal>
        <Reveal>
          <div className="rounded-xl border border-border p-6 sm:p-8">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Writing Task 2 · Sample feedback</p>
                <p className="mt-1 font-heading text-7xl font-light tracking-tight">6.5</p>
                <p className="text-sm text-muted-foreground">Overall band</p>
              </div>
              <span className="rounded-full border border-foreground/25 px-3 py-1 text-xs">
                Target 7.0
              </span>
            </div>
            <ul className="mt-8 space-y-4">
              {criteria.map((c) => (
                <li key={c.name}>
                  <div className="flex justify-between text-sm">
                    <span>{c.name}</span>
                    <span className="font-mono">{c.band.toFixed(1)}</span>
                  </div>
                  <div className="mt-2 h-2 rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-brand-primary"
                      style={{ width: `${(c.band / 9) * 100}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
            <div className="mt-8 border-t border-border pt-6">
              <p className="text-sm font-medium">Corrections</p>
              <ul className="mt-3 space-y-2 text-sm">
                {corrections.map((c) => (
                  <li key={c.wrong} className="flex flex-wrap items-center gap-2">
                    <del className="text-muted-foreground decoration-foreground/50">{c.wrong}</del>
                    <span aria-hidden className="text-muted-foreground">→</span>
                    <ins className="rounded-md bg-brand-primary px-1.5 py-0.5 text-brand-ink no-underline">
                      {c.right}
                    </ins>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
