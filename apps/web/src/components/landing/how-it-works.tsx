import { routes } from "@/lib/routes";
import { Reveal } from "./reveal";

const steps = [
  { title: "Choose Academic or General", body: "Tell us your test type, target band and exam date." },
  { title: "Practise", body: "Take a full test or a single part, on your phone or laptop." },
  { title: "Get an instant band score and fixes", body: "See your band per criterion, what held it back and how to fix it." },
];

/** Three numbered steps in a row (design doc §4). */
export function HowItWorks() {
  const anchor = routes.howItWorks.split("#")[1];
  return (
    <section id={anchor} className="scroll-mt-16 bg-muted py-20 sm:py-28">
      <div className="container-page">
        <Reveal className="max-w-2xl">
          <p className="text-eyebrow text-muted-foreground uppercase">How it works</p>
          <h2 className="mt-3 text-h1">From first answer to band score in minutes.</h2>
        </Reveal>
        <ol className="mt-12 grid gap-8 md:grid-cols-3 md:gap-6">
          {steps.map((s, i) => (
            <li key={s.title}>
              <Reveal className="flex flex-col gap-4 border-t border-foreground/15 pt-6">
                <span className="font-heading text-5xl font-light tracking-tight">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <h3 className="text-h3">{s.title}</h3>
                <p className="text-muted-foreground">{s.body}</p>
              </Reveal>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
