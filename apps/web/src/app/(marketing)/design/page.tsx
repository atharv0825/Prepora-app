import type { Metadata } from "next";
import { ArrowRight, AudioLines, Mic, PenLine, TrendingUp } from "lucide-react";
import { Badge } from "@prepora/ui/components/badge";
import { Button } from "@prepora/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@prepora/ui/components/card";
import { Input } from "@prepora/ui/components/input";
import { Label } from "@prepora/ui/components/label";
import { Textarea } from "@prepora/ui/components/textarea";
import { DialogDemo, ToastDemo } from "./interactive-demos";

// M0-F2: living reference for the design system. Not linked from the site; not indexed.
export const metadata: Metadata = {
  title: "Design system · Prepora",
  robots: { index: false, follow: false },
};

const palette = [
  { name: "brand-black", hex: "#0A0A0A", use: "Hero, footer, final CTA" },
  { name: "brand-surface", hex: "#141414", use: "Cards on black" },
  { name: "brand-line", hex: "#262626", use: "1px borders on dark" },
  { name: "brand-white", hex: "#FFFFFF", use: "Light background, primary buttons" },
  { name: "brand-stone", hex: "#F5F5F4", use: "Alternate light sections" },
  { name: "brand-grey", hex: "#A3A3A3", use: "Muted text on dark" },
  { name: "brand-slate", hex: "#525252", use: "Muted text on light" },
];

// Accents: only for italic serif phrases (gradient), small dots and the Platinum badge.
const accents = [
  { name: "brand-green-light", hex: "#86EFAC", use: "Accent on dark sections" },
  { name: "brand-purple-light", hex: "#C4B5FD", use: "Accent on dark sections" },
  { name: "brand-green-dark", hex: "#166534", use: "Accent on light sections" },
  { name: "brand-purple-dark", hex: "#6D28D9", use: "Accent on light sections" },
];

const iconProps = { className: "size-5", strokeWidth: 1.5 } as const;

function Section({
  title,
  children,
  dark = false,
}: {
  title: string;
  children: React.ReactNode;
  dark?: boolean;
}) {
  return (
    <section className={dark ? "dark py-12 sm:py-16" : "py-12 sm:py-16"}>
      <div className="container-page">
        <h2 className="mb-8 text-h2">{title}</h2>
        {children}
      </div>
    </section>
  );
}

export default function DesignSystemPage() {
  return (
    <div className="flex-1">
      {/* Dark hero sample: grid texture, eyebrow, display type with serif accent, CTAs, glass cards */}
      <section className="dark relative overflow-hidden">
        <div aria-hidden className="bg-grid pointer-events-none absolute inset-0" />
        <div className="container-page relative grid gap-12 py-16 sm:py-24 lg:grid-cols-[55fr_45fr] lg:items-center">
          <div className="flex animate-fade-up flex-col items-start gap-6">
            <Badge variant="outline" className="text-eyebrow">
              <span className="size-1.5 rounded-full bg-accent-green" aria-hidden />
              Your AI IELTS Coach
            </Badge>
            <h1 className="text-display">
              Practise smarter.
              <br />
              Score higher.
              <br />
              Reach <span className="text-accent-serif">Band 8+</span>.
            </h1>
            <p className="max-w-md text-lead text-muted-foreground">
              Speaking, Writing, Reading and Listening, with instant AI band scores and feedback
              on all 4 official criteria.
            </p>
            <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
              <Button size="lg">
                Start practising free <ArrowRight />
              </Button>
              <Button size="lg" variant="outline">
                Try a speaking test
              </Button>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-1 lg:justify-items-end">
            {[
              { icon: TrendingUp, label: "Avg. band improvement", value: "+1.0" },
              { icon: PenLine, label: "Mock tests", value: "500+" },
              { icon: Mic, label: "Speaking sessions", value: "20,000+" },
            ].map(({ icon: Icon, label, value }, i) => (
              <Card
                key={label}
                variant="glass"
                size="sm"
                className="animate-drift lg:w-64"
                style={{ animationDelay: `${i * 0.8}s` }}
              >
                <CardContent className="flex items-center gap-3">
                  <Icon {...iconProps} className="size-5 text-brand-grey" />
                  <div>
                    <p className="text-xs text-brand-grey">{label}</p>
                    <p className="font-heading text-2xl font-semibold tracking-tight">{value}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <Section title="Colours">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {palette.map((c) => (
            <div key={c.name} className="overflow-hidden rounded-xl border">
              <div className="h-20" style={{ backgroundColor: c.hex }} />
              <div className="p-3">
                <p className="text-sm font-medium">{c.name}</p>
                <p className="font-mono text-xs text-muted-foreground">{c.hex}</p>
                <p className="mt-1 text-xs text-muted-foreground">{c.use}</p>
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Accents">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {accents.map((c) => (
            <div key={c.name} className="overflow-hidden rounded-xl border">
              <div className="h-20" style={{ backgroundColor: c.hex }} />
              <div className="p-3">
                <p className="text-sm font-medium">{c.name}</p>
                <p className="font-mono text-xs text-muted-foreground">{c.hex}</p>
                <p className="mt-1 text-xs text-muted-foreground">{c.use}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl border p-6">
            <p className="text-xs text-muted-foreground">On light</p>
            <p className="mt-2 text-h1">
              Reach <span className="text-accent-serif">Band 8+</span>.
            </p>
          </div>
          <div className="dark rounded-xl border p-6">
            <p className="text-xs text-muted-foreground">On dark</p>
            <p className="mt-2 text-h1">
              Reach <span className="text-accent-serif">Band 8+</span>.
            </p>
          </div>
        </div>
      </Section>

      <Section title="Typography">
        <div className="grid gap-6">
          <p className="text-display">Display · Hanken Grotesk</p>
          <p className="text-h1">Heading 1 · Reach your target band</p>
          <p className="text-h2">Heading 2 · How it works</p>
          <p className="text-h3">Heading 3 · AI Speaking Examiner</p>
          <p className="max-w-xl text-lead text-muted-foreground">
            Lead · Get criterion-wise band scores for Task Achievement, Coherence & Cohesion,
            Lexical Resource and Grammatical Range & Accuracy.
          </p>
          <p className="max-w-xl">
            Body · Hanken Grotesk 16px. The cue card has a one-minute preparation timer, then you speak
            for one to two minutes.
          </p>
          <p className="text-eyebrow text-muted-foreground uppercase">Eyebrow · 13px</p>
          <p className="text-h2">
            Accent · <span className="text-accent-serif">Instrument Serif italic</span>
          </p>
        </div>
      </Section>

      {[false, true].map((dark) => (
        <Section key={String(dark)} title={dark ? "Buttons · on dark" : "Buttons · on light"} dark={dark}>
          <div className="grid gap-6">
            <div className="flex flex-wrap items-center gap-3">
              <Button>Start free</Button>
              <Button variant="outline">Try a speaking test</Button>
              <Button variant="secondary">Secondary</Button>
              <Button variant="ghost">Ghost</Button>
              <Button variant="link">Log in</Button>
              <Button variant="destructive">Delete account</Button>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button size="sm">Small</Button>
              <Button>Default</Button>
              <Button size="lg">
                Large <ArrowRight />
              </Button>
              <Button size="icon" variant="outline" aria-label="Record">
                <Mic />
              </Button>
              <Button disabled>Disabled</Button>
            </div>
          </div>
        </Section>
      ))}

      <Section title="Inputs">
        <div className="grid max-w-xl gap-5">
          <div className="grid gap-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" placeholder="you@example.com" />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="band">Target band</Label>
            <Input id="band" aria-invalid defaultValue="10" />
            <p className="text-sm text-destructive">Choose a band between 4.0 and 9.0.</p>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="essay">Your essay</Label>
            <Textarea id="essay" placeholder="Some people believe that…" />
          </div>
          <Input disabled placeholder="Disabled" />
        </div>
      </Section>

      <Section title="Cards & badges">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle>Writing Feedback</CardTitle>
              <CardDescription>
                Type your answer or upload a photo. Get criterion-wise band scores.
              </CardDescription>
            </CardHeader>
            <CardFooter>
              <Badge variant="outline">4 credits</Badge>
            </CardFooter>
          </Card>
          <Card variant="inverted">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                Platinum <Badge variant="outline" className="border-accent-purple">Most popular</Badge>
              </CardTitle>
              <CardDescription>220 AI credits a month, natural examiner voice.</CardDescription>
            </CardHeader>
            <CardContent>
              <Button className="w-full">Go Platinum</Button>
            </CardContent>
          </Card>
          <Card variant="muted">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AudioLines {...iconProps} /> Listening
              </CardTitle>
              <CardDescription>4 sections, 40 questions, auto-scored.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              <Badge>Default</Badge>
              <Badge variant="secondary">Secondary</Badge>
              <Badge variant="outline">Outline</Badge>
              <Badge variant="destructive">Error</Badge>
            </CardContent>
          </Card>
        </div>
      </Section>

      <Section title="Dialogs & toasts">
        <div className="flex flex-col gap-6">
          <p className="max-w-xl text-muted-foreground">
            Dialogs open as a bottom sheet on phones and as a centred dialog from 640px up.
          </p>
          <div>
            <DialogDemo />
          </div>
          <ToastDemo />
        </div>
      </Section>
    </div>
  );
}
