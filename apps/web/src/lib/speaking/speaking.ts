// Speaking screens (M7-F1..F3): pure helpers, unit-tested. The components render what they return.
import type { BetterPhrase } from "@prepora/shared/api/score-speaking";
import { FILLERS } from "@prepora/shared/ielts/speaking";

// ── Recording format ────────────────────────────────────────────────────────────────────────
/**
 * The MediaRecorder type to ask for, in order of preference: Opus in WebM (Chrome, Edge, Firefox,
 * Android), then AAC in MP4 (Safari, iOS). Null: let the browser choose. score-speaking reads the
 * real container from the file's bytes anyway (M7-B4).
 */
export function pickRecorderType(isTypeSupported: (type: string) => boolean): string | null {
  for (const t of ["audio/webm;codecs=opus", "audio/webm", "audio/mp4;codecs=mp4a.40.2", "audio/mp4", "audio/ogg;codecs=opus"]) {
    try {
      if (isTypeSupported(t)) return t;
    } catch {
      /* some browsers throw for unknown types */
    }
  }
  return null;
}

/** The bucket accepts bare types ("audio/webm", not "…;codecs=opus"); and the file's extension. */
export function uploadTypeFor(recorderType: string | null | undefined): { contentType: string; ext: string } {
  const bare = (recorderType ?? "").split(";")[0]!.trim().toLowerCase();
  if (bare === "audio/mp4" || bare === "video/mp4" || bare === "audio/aac" || bare === "audio/x-m4a") return { contentType: "audio/mp4", ext: "m4a" };
  if (bare === "audio/ogg") return { contentType: "audio/ogg", ext: "ogg" };
  return { contentType: "audio/webm", ext: "webm" };
}

// ── Microphone access (M7-F1) ───────────────────────────────────────────────────────────────
export type MicProblem = "denied" | "no_device" | "busy" | "insecure" | "unsupported" | "other";

/** What a getUserMedia failure means for the student. */
export function micProblem(error: unknown): MicProblem {
  const name = (error as { name?: string } | null)?.name ?? "";
  if (name === "NotAllowedError" || name === "PermissionDeniedError" || name === "SecurityError") return "denied";
  if (name === "NotFoundError" || name === "DevicesNotFoundError" || name === "OverconstrainedError") return "no_device";
  if (name === "NotReadableError" || name === "TrackStartError" || name === "AbortError") return "busy";
  if (name === "TypeError") return "unsupported";
  return "other";
}

export type BrowserKind = "chrome" | "edge" | "safari-mac" | "safari-ios" | "firefox" | "samsung" | "other";

export function browserKind(userAgent: string): BrowserKind {
  const ua = userAgent;
  if (/iPhone|iPad|iPod/.test(ua)) return "safari-ios"; // every iOS browser uses Safari's engine and settings
  if (/SamsungBrowser/.test(ua)) return "samsung";
  if (/Edg\//.test(ua)) return "edge";
  if (/Firefox\//.test(ua)) return "firefox";
  if (/Chrome\//.test(ua)) return "chrome";
  if (/Safari\//.test(ua) && /Macintosh/.test(ua)) return "safari-mac";
  return "other";
}

/** How to turn the microphone back on, per browser. */
export function micHelp(kind: BrowserKind): { title: string; steps: string[] } {
  switch (kind) {
    case "chrome":
    case "edge":
      return {
        title: kind === "edge" ? "Microsoft Edge" : "Chrome",
        steps: [
          "Click the icon at the left of the address bar (a padlock or sliders).",
          "Set Microphone to Allow.",
          "Reload this page.",
        ],
      };
    case "safari-mac":
      return { title: "Safari on Mac", steps: ["Open Safari → Settings → Websites → Microphone.", "Set this site to Allow.", "Reload this page."] };
    case "safari-ios":
      return {
        title: "iPhone or iPad",
        steps: [
          "Tap \"aA\" in the address bar → Website Settings → Microphone → Allow.",
          "If that's not there: Settings → Safari → Microphone → Ask or Allow.",
          "Reload this page.",
        ],
      };
    case "firefox":
      return { title: "Firefox", steps: ["Click the microphone icon (crossed out) in the address bar.", "Remove the block, or choose Allow.", "Reload this page."] };
    case "samsung":
      return { title: "Samsung Internet", steps: ["Tap the menu → Settings → Sites and downloads → Site permissions → Microphone.", "Allow this site.", "Reload this page."] };
    default:
      return { title: "Your browser", steps: ["Open this site's settings from the address bar.", "Allow the microphone.", "Reload this page."] };
  }
}

/** Level meter: RMS of the samples (−1…1), scaled so normal speech fills most of the bar. */
export function levelFromSamples(samples: ArrayLike<number>): number {
  if (!samples.length) return 0;
  let sum = 0;
  for (let i = 0; i < samples.length; i++) sum += samples[i]! * samples[i]!;
  const rms = Math.sqrt(sum / samples.length);
  return Math.min(1, rms * 4);
}

/** The mic test passes once the level has gone over this (someone spoke). */
export const MIC_OK_LEVEL = 0.15;

// ── Transcript highlights (M7-F3) ───────────────────────────────────────────────────────────
export type TranscriptPiece = { text: string; filler?: boolean; phrase?: number };

/**
 * The transcript cut into plain text, fillers (um, uh, "you know"…) and better phrases (their
 * first occurrence, numbered, in list order; a phrase never overlaps a filler or another phrase).
 */
export function transcriptPieces(transcript: string, phrases: readonly Pick<BetterPhrase, "original">[] = []): TranscriptPiece[] {
  const marks: { start: number; end: number; filler?: boolean; phrase?: number }[] = [];
  const free = (s: number, e: number) => !marks.some((m) => s < m.end && e > m.start);
  phrases.forEach((p, i) => {
    if (!p.original) return;
    let from = 0;
    for (;;) {
      const s = transcript.indexOf(p.original, from);
      if (s < 0) return;
      if (free(s, s + p.original.length)) {
        marks.push({ start: s, end: s + p.original.length, phrase: i });
        return;
      }
      from = s + 1;
    }
  });
  for (const f of FILLERS) {
    const re = new RegExp(`(?<![\\p{L}'])${f.replace(" ", "\\s+")}(?![\\p{L}'])`, "giu");
    for (const m of transcript.matchAll(re)) {
      const s = m.index!;
      if (free(s, s + m[0].length)) marks.push({ start: s, end: s + m[0].length, filler: true });
    }
  }
  marks.sort((a, b) => a.start - b.start);
  const out: TranscriptPiece[] = [];
  let pos = 0;
  for (const m of marks) {
    if (m.start > pos) out.push({ text: transcript.slice(pos, m.start) });
    out.push({ text: transcript.slice(m.start, m.end), ...(m.filler ? { filler: true } : { phrase: m.phrase }) });
    pos = m.end;
  }
  if (pos < transcript.length) out.push({ text: transcript.slice(pos) });
  return out;
}

/** "1:05" for seconds. */
export function mmss(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
