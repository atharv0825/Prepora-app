// The builders' question form (Reading M4-A1, Listening M5-A1): one flat form state for all 13
// types (the 11 Reading types plus map and diagram labelling), turned into the stored
// { prompt, options, answer } for the chosen type, and back. Pure; the Server Function validates
// the result again with the shared contract before saving.
import type { ListeningQuestionType } from "@prepora/shared/ielts/listening";
import { letterLabel, romanLabel } from "@prepora/shared/ielts/reading";

type QuestionType = ListeningQuestionType;
export type Point = { x: number; y: number };

export type QuestionDraft = {
  q_type: QuestionType;
  prompt: string;
  explanation: string;
  /** MCQ */
  choices: string[];
  select: number;
  correct: string[];
  /** TFNG / YNNG: "true" | "false" | "not_given" | "yes" | "no" */
  value: string;
  /** Headings, features or a word bank. */
  list: string[];
  /** Matching information: the passage's paragraph letters, e.g. "A B C D E". */
  paragraphs: string;
  reuse: boolean;
  /** Matching and word banks: the answer's label. */
  label: string;
  /** Typed gaps. */
  max_words: number;
  number_allowed: boolean;
  accept: string[];
  /** Summary / flow-chart / diagram: chosen from a word bank instead of typed. */
  bank: boolean;
  /** Labelling (Listening): the picture, its description, and points in % of its size. */
  image_url: string;
  image_alt: string;
  /** Map: the lettered places A, B, C… in order. */
  points: Point[];
  /** Diagram: where this question's number sits. */
  marker: Point | null;
};

const TYPED: QuestionType[] = ["sentence_completion", "note_table_completion", "short_answer"];
const BANKABLE: QuestionType[] = ["summary_completion", "flowchart_completion", "diagram_labelling"];
const LISTED: QuestionType[] = ["matching_headings", "matching_features"];

export const isLabellingType = (t: QuestionType) => t === "map_labelling" || t === "diagram_labelling";
export const usesGap = (t: QuestionType) => t !== "short_answer" && t !== "diagram_labelling" && (TYPED.includes(t) || BANKABLE.includes(t));
export const isBankable = (t: QuestionType) => BANKABLE.includes(t);
/** The draft types a word answer (completion and short answer, word bank off). */
export const isTypedDraft = (d: Pick<QuestionDraft, "q_type" | "bank">) => TYPED.includes(d.q_type) || (BANKABLE.includes(d.q_type) && !d.bank);
/** The draft has a list to match against (headings, features, or a word bank). */
export const hasList = (d: Pick<QuestionDraft, "q_type" | "bank">) => LISTED.includes(d.q_type) || (BANKABLE.includes(d.q_type) && d.bank);

/** How list items are labelled for this draft: i, ii, … for headings, else A, B, … */
export function listLabel(d: Pick<QuestionDraft, "q_type">, i: number): string {
  return d.q_type === "matching_headings" ? romanLabel(i) : letterLabel(i);
}

/** Paragraph letters typed as "A B C", "A, B, C" or "ABC". */
export function paragraphLetters(text: string): string[] {
  return [...new Set((text.toUpperCase().match(/[A-Z]/g) ?? []))];
}

/** Hints shown under the prompt, per type. */
export const promptHints: Record<QuestionType, string> = {
  mcq: "The question or sentence stem.",
  tfng: "The statement students judge against the passage.",
  ynng: "The claim students judge against the writer's views.",
  matching_headings: 'The paragraph or section to give a heading, e.g. "Paragraph B".',
  matching_information: 'The information to find, e.g. "a reference to the cost of the project".',
  matching_features: 'The statement to match, e.g. "argued that tourism harms the region".',
  sentence_completion: 'Write the sentence with ___ (three underscores) where the gap is.',
  summary_completion: 'One sentence of the summary, with ___ where the gap is.',
  note_table_completion: 'The note or table cell, with ___ where the gap is.',
  flowchart_completion: 'One step of the flow chart, with ___ where the gap is.',
  short_answer: "The question; students answer in a few words from the passage.",
  map_labelling: 'The place students find on the map, e.g. "Café". They answer with its letter.',
  diagram_labelling: 'The part being labelled, e.g. "Water enters through the ___" or just "Part 3".',
};

export function emptyDraft(q_type: QuestionType, previous?: QuestionDraft): QuestionDraft {
  const base: QuestionDraft = {
    q_type,
    prompt: "",
    explanation: "",
    choices: ["", "", "", ""],
    select: 1,
    correct: [],
    value: "",
    list: ["", "", ""],
    paragraphs: "A B C D E",
    reuse: true,
    label: "",
    max_words: 2,
    number_allowed: false,
    accept: [""],
    bank: false,
    image_url: "",
    image_alt: "",
    points: [],
    marker: null,
  };
  // Questions in a group share their list, word limit and paragraphs: carry them over from the
  // previous question of the same type.
  if (previous && previous.q_type === q_type) {
    return {
      ...base,
      choices: previous.choices.map(() => ""),
      select: previous.select,
      list: [...previous.list],
      paragraphs: previous.paragraphs,
      reuse: previous.reuse,
      max_words: previous.max_words,
      number_allowed: previous.number_allowed,
      bank: previous.bank,
      // Questions on one picture share it (and, on a map, its lettered places).
      image_url: previous.image_url,
      image_alt: previous.image_alt,
      points: previous.points.map((p) => ({ ...p })),
    };
  }
  return base;
}

const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
const point = (v: unknown): Point | null => {
  const p = v as Partial<Point> | null;
  return p && typeof p.x === "number" && typeof p.y === "number" ? { x: p.x, y: p.y } : null;
};
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

/** A saved question → the form. */
export function draftFromQuestion(q: {
  q_type: QuestionType;
  prompt: string;
  options: Record<string, unknown>;
  answer: unknown;
  explanation: string | null;
}): QuestionDraft {
  const o = q.options;
  const a = obj(q.answer);
  const d = emptyDraft(q.q_type);
  d.prompt = q.prompt;
  d.explanation = q.explanation ?? "";
  if (isLabellingType(q.q_type)) {
    d.image_url = typeof o.image_url === "string" ? o.image_url : "";
    d.image_alt = typeof o.image_alt === "string" ? o.image_alt : "";
    d.points = Array.isArray(o.locations) ? (o.locations as Point[]).map(({ x, y }) => ({ x, y })) : [];
    d.marker = point(o.marker);
  }
  switch (q.q_type) {
    case "mcq":
      d.choices = strings(o.choices);
      d.select = typeof o.select === "number" ? o.select : 1;
      d.correct = strings(a.labels);
      break;
    case "tfng":
    case "ynng":
      d.value = typeof a.value === "string" ? a.value : "";
      break;
    case "matching_headings":
      d.list = strings(o.headings);
      d.label = typeof a.label === "string" ? a.label : "";
      break;
    case "matching_features":
      d.list = strings(o.features);
      d.reuse = o.reuse !== false;
      d.label = typeof a.label === "string" ? a.label : "";
      break;
    case "map_labelling":
      d.label = typeof a.label === "string" ? a.label : "";
      break;
    case "matching_information":
      d.paragraphs = strings(o.paragraphs).join(" ");
      d.reuse = o.reuse !== false;
      d.label = typeof a.label === "string" ? a.label : "";
      break;
    default:
      if (Array.isArray(o.word_bank)) {
        d.bank = true;
        d.list = strings(o.word_bank);
        d.label = typeof a.label === "string" ? a.label : "";
      } else {
        d.max_words = typeof o.max_words === "number" ? o.max_words : 2;
        d.number_allowed = o.number_allowed === true;
        d.accept = strings(a.accept).length ? strings(a.accept) : [""];
      }
  }
  return d;
}

/** Points are stored to one decimal place of a percent. */
const round = (n: number) => Math.round(Math.min(100, Math.max(0, n)) * 10) / 10;

const filled = (list: string[]) => list.map((s) => s.trim()).filter(Boolean);

/**
 * Drops empty rows from a labelled list and relabels the chosen answers to match: with choice B
 * left empty, the answer "C" becomes "B". An answer pointing at an empty row becomes "" (invalid).
 */
export function compactList(list: readonly string[], labelOf: (i: number) => string, chosen: readonly string[]) {
  const items: string[] = [];
  const relabel = new Map<string, string>();
  list.forEach((s, i) => {
    if (!s.trim()) return;
    relabel.set(labelOf(i), labelOf(items.length));
    items.push(s.trim());
  });
  return { items, labels: chosen.map((l) => relabel.get(l) ?? "") };
}

/** The form → what's stored for its type. Empty list rows are dropped. */
export function contentFromDraft(d: QuestionDraft): { q_type: QuestionType; prompt: string; options: Record<string, unknown>; answer: unknown } {
  const prompt = d.prompt.trim();
  const image = { image_url: d.image_url.trim(), image_alt: d.image_alt.trim() };
  const labelled = (chosen: string[]) => compactList(d.list, (i) => listLabel(d, i), chosen);
  switch (d.q_type) {
    case "mcq": {
      const { items, labels } = compactList(d.choices, letterLabel, d.correct);
      return { q_type: d.q_type, prompt, options: { choices: items, select: d.select }, answer: { labels: labels.sort() } };
    }
    case "tfng":
    case "ynng":
      return { q_type: d.q_type, prompt, options: {}, answer: { value: d.value } };
    case "matching_headings": {
      const { items, labels } = labelled([d.label]);
      return { q_type: d.q_type, prompt, options: { headings: items }, answer: { label: labels[0] } };
    }
    case "matching_features": {
      const { items, labels } = labelled([d.label]);
      return { q_type: d.q_type, prompt, options: { features: items, reuse: d.reuse }, answer: { label: labels[0] } };
    }
    case "map_labelling":
      return {
        q_type: d.q_type,
        prompt,
        options: { ...image, locations: d.points.map((p, i) => ({ label: letterLabel(i), x: round(p.x), y: round(p.y) })) },
        answer: { label: d.label },
      };
    case "matching_information":
      return { q_type: d.q_type, prompt, options: { paragraphs: paragraphLetters(d.paragraphs), reuse: d.reuse }, answer: { label: d.label } };
    default: {
      // Diagram labelling adds the picture and the question's marker to the gap or word bank.
      const pic = d.q_type === "diagram_labelling" ? { ...image, marker: d.marker && { x: round(d.marker.x), y: round(d.marker.y) } } : {};
      if (isBankable(d.q_type) && d.bank) {
        const { items, labels } = labelled([d.label]);
        return { q_type: d.q_type, prompt, options: { ...pic, word_bank: items }, answer: { label: labels[0] } };
      }
      return {
        q_type: d.q_type,
        prompt,
        options: { ...pic, max_words: d.max_words, number_allowed: d.number_allowed },
        answer: { accept: filled(d.accept) },
      };
    }
  }
}

/**
 * What's missing from a labelling question's picture, in words (the contract would only say
 * "Invalid input" for a missing marker). Null when it's complete or not a labelling question.
 */
export function labellingProblem(d: Pick<QuestionDraft, "q_type" | "image_url" | "image_alt" | "points" | "marker">): string | null {
  if (!isLabellingType(d.q_type)) return null;
  if (!d.image_url.trim()) return "Add the picture: upload it or paste its URL.";
  if (!d.image_alt.trim()) return "Describe the picture for screen readers.";
  if (d.q_type === "map_labelling" && d.points.length < 2) return "Click the picture to add at least 2 lettered places.";
  if (d.q_type === "diagram_labelling" && !d.marker) return "Click the picture where this question's number goes.";
  return null;
}

/** Which form field a contract problem belongs to (issue path → field). */
export function fieldOf(path: readonly PropertyKey[]): "prompt" | "list" | "answer" | "explanation" | "image" | "form" {
  const [head, next] = path;
  if (head === "prompt") return "prompt";
  if (head === "explanation") return "explanation";
  if (head === "answer") return "answer";
  if (head === "options" && ["image_url", "image_alt", "locations", "marker"].includes(String(next))) return "image";
  if (head === "options") return next === "max_words" ? "answer" : "list";
  return "form";
}

/** Contract problems grouped by form field (first message each). */
export function fieldErrors(issues: readonly { path: readonly PropertyKey[]; message: string }[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const i of issues) out[fieldOf(i.path)] ??= i.message;
  return out;
}
