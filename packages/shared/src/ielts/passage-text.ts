// Reading passage text (M4-A1): the formatting editors can use, how it's cleaned on save, and how
// it's split for display.
//
// Format: plain text with a few marks, never HTML.
//   * Paragraphs are separated by a blank line. A paragraph may start with its letter ("A  …")
//     for matching-information questions.
//   * "## " at the start of a line makes it a heading (the passage's subtitle or a section).
//   * **bold** and *italic* within a line.
// Nothing in the body is ever interpreted as HTML: it's rendered as React text, so markup typed
// or pasted in can't run. sanitizePassage() also strips pasted tags and invisible characters.
//
// Students highlight passages by character offsets (M4-F2). Offsets count the text as shown
// (`plain`: the marks removed), so a plain passage, like the seeded samples, is its own `plain`.

export const PASSAGE_MAX = 30_000;

export type PassageRun = {
  text: string;
  /** Offset of this run in the plain text. */
  start: number;
  bold: boolean;
  italic: boolean;
  heading: boolean;
};

export type PassagePiece = PassageRun & { marked: boolean };

/** What an editor typed or pasted → what's stored. */
export function sanitizePassage(raw: string): string {
  return (
    raw
      .normalize("NFC")
      .replace(/\r\n?/g, "\n")
      // Pasted HTML: drop the tags, keep their text. "x < y" isn't a tag (a tag starts "<letter" or "</").
      .replace(/<\/?[a-zA-Z][^<>]*>/g, "")
      .replace(/\t/g, " ")
      // Control and zero-width characters (newlines kept).
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u0009\u000B-\u001F\u007F​-‍⁠﻿]/g, "")
      .replace(/ /g, " ")
      .split("\n")
      .map((line) => line.replace(/\s+$/, ""))
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
  );
}

// **bold** or *italic*: the mark must hug the text (no space just inside), on one line.
const INLINE = /\*\*(?=\S)(.+?)(?<=\S)\*\*|\*(?=[^\s*])(.+?)(?<=[^\s*])\*/g;

/** The body split into formatted runs; `plain` is what students see and highlight. */
export function parsePassage(body: string): { plain: string; runs: PassageRun[] } {
  const runs: PassageRun[] = [];
  let plain = "";
  const push = (text: string, style: Omit<PassageRun, "text" | "start">) => {
    if (!text) return;
    const last = runs[runs.length - 1];
    if (last && last.bold === style.bold && last.italic === style.italic && last.heading === style.heading) {
      last.text += text;
    } else {
      runs.push({ text, start: plain.length, ...style });
    }
    plain += text;
  };

  body.split("\n").forEach((rawLine, i) => {
    if (i > 0) push("\n", { bold: false, italic: false, heading: false });
    const heading = /^##\s+\S/.test(rawLine);
    const line = heading ? rawLine.replace(/^##\s+/, "") : rawLine;
    let at = 0;
    for (const m of line.matchAll(INLINE)) {
      push(line.slice(at, m.index), { bold: false, italic: false, heading });
      if (m[1] !== undefined) push(m[1], { bold: true, italic: false, heading });
      else push(m[2]!, { bold: false, italic: true, heading });
      at = m.index + m[0].length;
    }
    push(line.slice(at), { bold: false, italic: false, heading });
  });
  return { plain, runs };
}

/** Runs cut at highlight edges, each marked or not; the pieces' text adds up to `plain`. */
export function passagePieces(runs: readonly PassageRun[], highlights: readonly (readonly [number, number])[]): PassagePiece[] {
  const sorted = [...highlights].map(([a, b]) => [Math.min(a, b), Math.max(a, b)] as const).sort((x, y) => x[0] - y[0]);
  const cuts = new Set<number>();
  for (const [a, b] of sorted) cuts.add(a).add(b);
  const inMark = (pos: number) => sorted.some(([a, b]) => pos >= a && pos < b);

  const out: PassagePiece[] = [];
  for (const run of runs) {
    const end = run.start + run.text.length;
    const edges = [run.start, ...[...cuts].filter((c) => c > run.start && c < end).sort((a, b) => a - b), end];
    for (let k = 0; k < edges.length - 1; k++) {
      const from = edges[k]!;
      const to = edges[k + 1]!;
      out.push({ ...run, text: run.text.slice(from - run.start, to - run.start), start: from, marked: inMark(from) });
    }
  }
  return out;
}

/** The format, for the editor's help text. */
export const passageFormatHelp = [
  "Leave a blank line between paragraphs.",
  "Start a paragraph with its letter (A, B, …) when questions ask which paragraph.",
  "## at the start of a line makes a heading.",
  "**bold** and *italic*.",
];
