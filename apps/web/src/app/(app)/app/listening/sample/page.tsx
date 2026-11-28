import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { appEnvironment } from "@prepora/shared/observability";
import { ListeningTest } from "@/components/listening/listening-test";
import { samplePayload, sampleSeconds } from "@/lib/listening/sample";
import { gradeSampleListening } from "./actions";

export const metadata: Metadata = { title: "Sample Listening test · Prepora", robots: { index: false } };

// M5-F1..F3 on a built-in sample test: the audio player (exam / practice), the 40-question
// answer sheet with map and diagram labelling, and the results with transcripts. A stand-in
// until real Listening tests exist (tables M5-C1, audio M5-B1, grading M5-B2, builder M5-A1):
// tones play in place of recordings. Not linked anywhere, and 404 in production.
// ?sec=N sets each part's length (default 20 s; the e2e tests use a few seconds).
export default async function SampleListeningPage({ searchParams }: PageProps<"/app/listening/sample">) {
  const host = ((await headers()).get("host") ?? "").replace(/:\d+$/, "");
  if (appEnvironment(host) === "production") notFound();
  const { sec } = await searchParams;

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 pb-16">
      <div className="flex flex-col gap-2">
        <h1 className="text-h1">Sample Listening test</h1>
        <p className="text-muted-foreground">
          Four parts, 40 questions. Tones play in place of recordings until real tests are published. Not available in
          production.
        </p>
      </div>
      <ListeningTest payload={samplePayload(sampleSeconds(sec))} grade={gradeSampleListening} />
    </div>
  );
}
