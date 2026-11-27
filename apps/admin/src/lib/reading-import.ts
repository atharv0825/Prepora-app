// Reading builder import: a pasted or uploaded draft → passages and questions in the builder's
// own form state (QuestionDraft), so the preview can be edited and the save goes through the same
// conversion (contentFromDraft) and contract (ReadingQuestionInput) as the manual form. Pure.
//
// The draft format (what editors paste from their documents):
//
//   Passage 1: Title                       ← "Passage N" or "Reading Passage N", ":" or "-" optional
//   A. First paragraph …                    ← paragraph letters: "A.", "A)", "**A.**", or none
//   Questions 1–4                           ← a group: "Questions N–M" (or "Question N")
//   Choose the correct letter, A, B, C or D. ← instructions: pick the type and the word limit
//   List of Headings / i. … / A. …          ← the group's list (headings, features, word bank)
//   1. Question text                        ← numbered questions
//   A. choice                               ← MCQ choices under their question
//   Answer key                              ← a markdown table "| 1 | B | explanation |" or "1. B"
//   Notes for the builder                   ← shown as warnings, never imported
//
// Anything it can't place becomes a warning in the preview; nothing is guessed silently.
import type { ReadingQuestionType } from "@prepora/shared/ielts/reading";
import { emptyDraft, type QuestionDraft } from "./reading-builder";

// ── Types ───────────────────────────────────────────────────────────────────────────────────
export type ImportedPassage = {
  /** The slot it goes into (1–3): "Passage N" in the draft, else the order found. */
  order_no: number;
  title: string;
  /** Stored format: paragraphs separated by a blank line, lettered ones starting "A  ". */
  body: string;
  letters: string[];
  paragraphCount: number;
  wordCount: number;
};

/** One question as found, before it's turned into a form draft. Editable in the preview. */
export type ImportedQuestion = {
  number: number;
  /** The passage slot (1–3) it belongs to. */
  passage: number;
  /** Null when the instructions didn't say which type; the admin picks one in the preview. */
  q_type: ReadingQuestionType | null;
  prompt: string;
  /** MCQ choices, without their letters. */
  choices: string[];
  /** The group's list: headings (i, ii…), features (A, B…) or a word bank. */
  list: string[];
  /** The answer as written in the key ("B", "TRUE", "iv", "coastal plants / plants"); "" if none. */
  answer: string;
  explanation: string;
  /** Matching information: the paragraph letters to choose from. */
  paragraphs: string[];
  reuse: boolean;
  /** MCQ: how many letters to choose. */
  select: number;
  /** Typed answers: the word limit from the instructions. */
  max_words: number;
  number_allowed: boolean;
  /** Summary / flow chart: answered from the word bank. */
  bank: boolean;
  /** The question refers to a picture (diagram, map, plan) that isn't in the text. */
  needs_image: boolean;
  /** The group's instructions, shown in the preview. */
  instructions: string;
};

export type ImportWarningKind =
  | "missing_answer"
  | "unmatched_answer"
  | "answer_format"
  | "unknown_type"
  | "numbering"
  | "duplicate"
  | "orphan_choices"
  | "short_passage"
  | "needs_image"
  | "no_gap"
  | "word_limit"
  | "group_count"
  | "builder_note"
  | "too_many";

export type ImportWarning = { kind: ImportWarningKind; message: string; number?: number };

export type ImportResult = {
  passages: ImportedPassage[];
  questions: ImportedQuestion[];
  warnings: ImportWarning[];
  /** "Notes for the builder": shown, never imported. */
  notes: string[];
};

// ── Line patterns ───────────────────────────────────────────────────────────────────────────
/** A line without markdown heading marks, bold/italic wrappers and surrounding spaces. */
function bare(line: string): string {
  return line
    .trim()
    .replace(/^#{1,6}\s+/, "")
    .replace(/^(\*\*|__)(.*)\1$/, "$2")
    .replace(/^(\*|_)(.*)\1$/, "$2")
    .trim();
}

/** "Passage 2: Title", "Reading Passage 2 – Title", "Passage 2"; not "Reading Passage 2 has six paragraphs". */
const PASSAGE = /^(?:reading\s+)?passage\s+(\d)\b\s*([:.\-–—])?\s*(.*)$/i;
const QUESTIONS = /^questions?\s+(\d{1,2})(?:\s*(?:-|–|—|to|and)\s*(\d{1,2}))?\b\s*[:.\-–—]?\s*(.*)$/i;
/** A heading line only ("Answer key", "Answers:", "Answer key (1–40)"), not a sentence starting "Answers". */
const ANSWER_KEY = /^(?:answer\s*key|answers)\s*(?:[:(\-–—].*)?$/i;
const BUILDER_NOTES = /^(?:notes?\s+(?:for|to)\s+(?:the\s+)?builders?|builder(?:'s)?\s+notes?)\s*:?$/i;
/** "A. text", "A) text", "**A.** text", "**A**. text" */
const LETTERED = /^\s*(?:\*\*|__)?([A-Z])(?:\*\*|__)?\s*[.)](?:\*\*|__)?\s+(.+)$/;
/** "1. text", "1) text", "**1.** text" */
const NUMBERED = /^\s*(?:\*\*|__)?(\d{1,2})(?:\*\*|__)?\s*[.)](?:\*\*|__)?\s+(.+)$/;
/** "i. heading" … "xv. heading" (lower case: upper-case I, V, X are letters). */
const ROMAN = /^\s*(?:\*\*|__)?(x{0,1}(?:ix|iv|v?i{0,3}))(?:\*\*|__)?\s*[.)](?:\*\*|__)?\s+(.+)$/;

const WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5 };
const GAP_TYPES: ReadingQuestionType[] = ["sentence_completion", "summary_completion", "note_table_completion", "flowchart_completion"];
const TYPED_TYPES: ReadingQuestionType[] = [...GAP_TYPES, "short_answer"];

/** Gaps written as dots, an ellipsis, underscores or "[gap]" → the builder's "___". */
export function normalizeGaps(text: string): string {
  return text
    .replace(/(?:\.\s?){4,}|…{1,}|_{2,}|\[\s*gap\s*\]/gi, "___")
    .replace(/\s+([.,;:?!])/g, "$1")
    .replace(/\s{2,}/g, " ")
    .trim();
}

const wordCount = (text: string) => (text.match(/[\p{L}\p{N}'’-]+/gu) ?? []).length;

// ── Instructions → type and rules ───────────────────────────────────────────────────────────
type GroupRules = {
  q_type: ReadingQuestionType | null;
  needs_image: boolean;
  max_words: number | null;
  number_allowed: boolean;
  select: number;
  reuse: boolean;
  /** Paragraph letters named in the instructions ("paragraphs, A–F"). */
  paragraphs: string[];
};

/** What a group's instructions say: its type, word limit and other rules. */
export function rulesFromInstructions(text: string, hasRomanList: boolean, hasLetterList: boolean): GroupRules {
  const t = text.replace(/\s+/g, " ");
  const has = (re: RegExp) => re.test(t);
  const needs_image = has(/label the (?:diagram|map|plan|picture|drawing)|(?:diagram|map|plan|picture) below/i);

  let q_type: ReadingQuestionType | null = null;
  if (has(/yes\b.*\bno\b.*not given|claims? of the writer|views? of the writer/i)) q_type = "ynng";
  else if (has(/true\b.*\bfalse\b.*not given/i)) q_type = "tfng";
  else if (has(/list of headings|correct heading|matching headings/i) || (hasRomanList && has(/heading/i))) q_type = "matching_headings";
  else if (has(/which (?:paragraph|section) contains|matching information/i)) q_type = "matching_information";
  else if (has(/flow-?\s?chart/i)) q_type = "flowchart_completion";
  else if (has(/summary/i)) q_type = "summary_completion";
  else if (has(/\btable\b|\bnotes?\b(?! for)/i) || needs_image) q_type = "note_table_completion";
  else if (has(/complete (?:each|the) sentences?|sentence completion|sentences below/i)) q_type = "sentence_completion";
  else if (has(/answer the questions?|short[- ]answer/i)) q_type = "short_answer";
  else if (has(/\bmatch\b|matching features|list of [a-z]+/i) && hasLetterList) q_type = "matching_features";
  else if (has(/choose the correct letter|multiple choice|choose (?:two|three) letters/i)) q_type = "mcq";

  const limit =
    t.match(/(?:no|not) more than (one|two|three|four|five|\d) words?/i)?.[1] ??
    t.match(/\b(one|two|three|four|five|\d) words? only\b/i)?.[1] ??
    t.match(/\bup to (one|two|three|four|five|\d) words?/i)?.[1] ??
    // "Write ONE WORD AND/OR A NUMBER"
    t.match(/\b(one|two|three|four|five|\d) words? and\/or (?:a )?numbers?/i)?.[1] ??
    null;
  const max_words = limit ? (WORDS[limit.toLowerCase()] ?? Number(limit)) : null;
  const number_allowed = has(/and\/or a number|or a number|and\/or numbers/i);
  const select = has(/choose three letters/i) ? 3 : has(/choose two letters/i) ? 2 : 1;
  const reuse = has(/more than once/i) || q_type !== "matching_information";
  const range = t.match(/paragraphs?,?\s+([A-Z])\s*(?:-|–|—|to)\s*([A-Z])\b/);
  const paragraphs = range ? letterRange(range[1]!, range[2]!) : [];
  return { q_type, needs_image, max_words, number_allowed, select, reuse, paragraphs };
}

function letterRange(from: string, to: string): string[] {
  const a = from.charCodeAt(0);
  const b = to.charCodeAt(0);
  return b >= a && b - a < 26 ? Array.from({ length: b - a + 1 }, (_, i) => String.fromCharCode(a + i)) : [];
}

// ── Answers ─────────────────────────────────────────────────────────────────────────────────
/** "(their own) honey / honey" → ["their own honey", "honey"]: "/" or " OR " separate, "( )" is optional. */
export function acceptedAnswers(raw: string): string[] {
  const out: string[] = [];
  for (const part of raw.split(/\s*\/\s*|\s+OR\s+/)) {
    const p = part.trim().replace(/^["“'‘]|["”'’]$/g, "");
    if (!p) continue;
    if (/\(([^)]+)\)/.test(p)) {
      out.push(p.replace(/[()]/g, "").replace(/\s+/g, " ").trim());
      out.push(p.replace(/\s*\([^)]*\)\s*/g, " ").replace(/\s+/g, " ").trim());
    } else out.push(p);
  }
  return [...new Set(out.filter(Boolean))].slice(0, 10);
}

/** TRUE / T, FALSE / F, NOT GIVEN / NG (and YES / NO) → the stored value; null if it isn't one. */
export function judgementValue(raw: string, type: "tfng" | "ynng"): string | null {
  const v = raw.trim().toUpperCase().replace(/[^A-Z ]/g, "").replace(/\s+/g, " ");
  if (v === "NOT GIVEN" || v === "NG") return "not_given";
  if (type === "tfng") return v === "TRUE" || v === "T" ? "true" : v === "FALSE" || v === "F" ? "false" : null;
  return v === "YES" || v === "Y" ? "yes" : v === "NO" || v === "N" ? "no" : null;
}

/** How a stored judgement reads in the preview: "true" → "True", "not_given" → "Not Given". */
export function judgementLabel(value: string): string {
  return value === "not_given" ? "Not Given" : value.charAt(0).toUpperCase() + value.slice(1);
}

// ── Question → form draft ───────────────────────────────────────────────────────────────────
/**
 * An imported question → the builder's form state for its type, so contentFromDraft() and the
 * shared contract decide what's valid, exactly as for the manual form. Unknown type → short answer
 * (the preview asks the admin to choose).
 */
export function draftFromImported(q: ImportedQuestion): QuestionDraft {
  const type = q.q_type ?? "short_answer";
  const d = emptyDraft(type);
  d.prompt = GAP_TYPES.includes(type) ? normalizeGaps(q.prompt) : q.prompt.trim();
  d.explanation = q.explanation;
  const answer = q.answer.trim();
  switch (type) {
    case "mcq":
      d.choices = [...q.choices];
      d.select = q.select;
      d.correct = (answer.toUpperCase().match(/\b[A-Z]\b/g) ?? []).slice(0, 3);
      break;
    case "tfng":
    case "ynng":
      d.value = judgementValue(answer, type) ?? "";
      break;
    case "matching_headings":
      d.list = [...q.list];
      d.label = answer.toLowerCase();
      break;
    case "matching_features":
      d.list = [...q.list];
      d.reuse = q.reuse;
      d.label = answer.toUpperCase();
      break;
    case "matching_information":
      d.paragraphs = q.paragraphs.join(" ");
      d.reuse = q.reuse;
      d.label = answer.toUpperCase();
      break;
    default:
      if ((type === "summary_completion" || type === "flowchart_completion") && q.bank) {
        d.bank = true;
        d.list = [...q.list];
        d.label = answer.toUpperCase();
      } else {
        d.bank = false;
        d.max_words = q.max_words;
        d.number_allowed = q.number_allowed;
        d.accept = answer ? acceptedAnswers(answer) : [""];
      }
  }
  return d;
}

// ── The parser ──────────────────────────────────────────────────────────────────────────────
type Group = {
  from: number;
  to: number;
  passage: number;
  instructions: string[];
  romanList: string[];
  letterList: string[];
  questions: { number: number; text: string[]; choices: string[] }[];
  rules: GroupRules | null;
};

type PassageDraft = { order_no: number; title: string; paragraphs: { letter: string | null; lines: string[] }[] };

/**
 * Parses a draft into passages, questions and warnings. `testType` only changes the checks
 * (Academic passages should have at least 4 paragraphs).
 */
export function parseReadingDraft(text: string, opts: { testType?: "academic" | "general" } = {}): ImportResult {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const warnings: ImportWarning[] = [];
  const notes: string[] = [];
  const passages: PassageDraft[] = [];
  const groups: Group[] = [];
  const key = new Map<number, { answer: string; explanation: string }>();

  type Section = "preamble" | "passage" | "questions" | "answers" | "notes";
  // Widened on purpose: startPassage() changes it inside the loop.
  let section = "preamble" as Section;
  let passage: PassageDraft | null = null;
  let group: Group | null = null;
  let blank = true;
  let warnedOrphan = false;
  /** Answer key as table cells on separate lines: the number waiting for its answer. */
  let pendingNumber: number | null = null;

  const startPassage = (n: number | null, title: string) => {
    passage = { order_no: n ?? passages.length + 1, title, paragraphs: [] };
    passages.push(passage);
    section = "passage";
    blank = true;
  };

  for (const raw of lines) {
    const line = raw.trim();
    const b = bare(line);
    if (!line) {
      blank = true;
      continue;
    }

    // Section headings win wherever they appear.
    if (BUILDER_NOTES.test(b)) {
      section = "notes";
      continue;
    }
    if (ANSWER_KEY.test(b) && !NUMBERED.test(line)) {
      section = "answers";
      continue;
    }
    const p = b.match(PASSAGE);
    const rest = p?.[3]?.trim() ?? "";
    // A heading has a separator, nothing after the number, or a capitalised title.
    if (p && (p[2] || !rest || /^[A-Z"“'‘]/.test(rest)) && section !== "answers" && section !== "notes") {
      startPassage(Number(p[1]), rest.replace(/^[*_]+|[*_]+$/g, "").trim());
      continue;
    }
    const g = b.match(QUESTIONS);
    if (g && section !== "answers" && section !== "notes") {
      const from = Number(g[1]);
      const to = g[2] ? Number(g[2]) : from;
      group = {
        from,
        to,
        passage: (passage as PassageDraft | null)?.order_no ?? 1,
        instructions: g[3] ? [g[3]] : [],
        romanList: [],
        letterList: [],
        questions: [],
        rules: null,
      };
      groups.push(group);
      section = "questions";
      continue;
    }

    switch (section) {
      case "notes":
        notes.push(line.replace(/^[-*•]\s+/, ""));
        break;

      case "answers": {
        // A Word table comes out of a .docx one cell per line: "1", "B", "2", "C"…
        if (/^\d{1,2}$/.test(line)) {
          pendingNumber = Number(line);
          break;
        }
        let row = answerRow(line);
        if (!row && pendingNumber !== null && !/^(?:q|no\.?|question|answers?|explanation)$/i.test(b)) {
          row = { number: pendingNumber, answer: b, explanation: "" };
        }
        pendingNumber = null;
        if (!row) break;
        if (key.has(row.number)) {
          warnings.push({ kind: "duplicate", number: row.number, message: `The answer key lists question ${row.number} twice; the first answer is used.` });
        } else key.set(row.number, row);
        break;
      }

      case "preamble":
        // Text before any "Passage N" heading: a lettered paragraph starts passage 1 (a single
        // passage pasted without its heading); anything else (the test's title) is skipped.
        if (LETTERED.test(line)) {
          startPassage(null, "");
          addParagraphLine(passages[passages.length - 1]!, line, true);
          blank = false;
        }
        break;

      case "passage": {
        const cur = passages[passages.length - 1]!;
        // A heading-less first line after "Passage N" is its title.
        if (!cur.title && !cur.paragraphs.length && !LETTERED.test(line) && line.length <= 120 && !/[.!?]$/.test(b)) {
          cur.title = b;
          break;
        }
        addParagraphLine(cur, line, blank);
        blank = false;
        break;
      }

      case "questions": {
        const gr = groups[groups.length - 1]!;
        const num = line.match(NUMBERED);
        const roman = line.match(ROMAN);
        const letter = line.match(LETTERED);
        const current = gr.questions[gr.questions.length - 1];
        if (num) {
          // The instructions are complete once the first question appears.
          gr.rules ??= rulesFromInstructions(gr.instructions.join(" "), gr.romanList.length > 0, gr.letterList.length > 0);
          gr.questions.push({ number: Number(num[1]), text: [num[2]!.trim()], choices: [] });
        } else if (roman && roman[1]) {
          gr.romanList.push(roman[2]!.trim());
        } else if (letter) {
          const isMcq = (gr.rules ?? rulesFromInstructions(gr.instructions.join(" "), gr.romanList.length > 0, true)).q_type === "mcq";
          if (isMcq && current) current.choices.push(letter[2]!.trim());
          else if (isMcq && !current) {
            if (!warnedOrphan) {
              warnings.push({ kind: "orphan_choices", message: `Questions ${gr.from}–${gr.to}: choices (A, B, …) appear before any numbered question; they were skipped.` });
              warnedOrphan = true;
            }
          } else gr.letterList.push(letter[2]!.trim());
        } else if (current && !gr.letterList.length) {
          // A wrapped line: of the last choice, or of the question.
          if (current.choices.length) current.choices[current.choices.length - 1] += ` ${line}`;
          else current.text.push(line);
        } else if (!current) {
          gr.instructions.push(b);
        }
        break;
      }
    }
  }

  // ── Passages ──
  const outPassages: ImportedPassage[] = passages.map((pd) => {
    const paragraphs = pd.paragraphs.map((p) => ({ letter: p.letter, text: p.lines.join(" ").replace(/\s+/g, " ").trim() })).filter((p) => p.text);
    const body = paragraphs.map((p) => (p.letter ? `${p.letter}  ${p.text}` : p.text)).join("\n\n");
    return {
      order_no: pd.order_no,
      title: pd.title || `Passage ${pd.order_no}`,
      body,
      letters: paragraphs.map((p) => p.letter).filter((l): l is string => !!l),
      paragraphCount: paragraphs.length,
      wordCount: wordCount(paragraphs.map((p) => p.text).join(" ")),
    };
  });
  for (const pd of outPassages) {
    if (pd.order_no < 1 || pd.order_no > 3) {
      warnings.push({ kind: "numbering", message: `"Passage ${pd.order_no}": a test has passages 1–3. Choose its place in the preview.` });
    }
    if ((opts.testType ?? "academic") === "academic" && pd.paragraphCount < 4) {
      warnings.push({ kind: "short_passage", message: `Passage ${pd.order_no} has ${pd.paragraphCount} paragraph${pd.paragraphCount === 1 ? "" : "s"}; Academic passages usually have at least 4.` });
    }
  }
  const slots = new Map<number, number>();
  for (const pd of outPassages) slots.set(pd.order_no, (slots.get(pd.order_no) ?? 0) + 1);
  for (const [n, count] of slots) if (count > 1) warnings.push({ kind: "duplicate", message: `Passage ${n} appears ${count} times.` });

  // ── Questions ──
  const questions: ImportedQuestion[] = [];
  for (const gr of groups) {
    const rules = gr.rules ?? rulesFromInstructions(gr.instructions.join(" "), gr.romanList.length > 0, gr.letterList.length > 0);
    const instructions = gr.instructions.join(" ").replace(/\s+/g, " ").trim();
    const range = gr.from === gr.to ? `Question ${gr.from}` : `Questions ${gr.from}–${gr.to}`;
    if (!gr.questions.length) {
      warnings.push({
        kind: "group_count",
        message: `${range}: no numbered questions found under the heading. (Word's automatic numbering isn't kept: type the numbers, e.g. "${gr.from}. …".)`,
      });
      continue;
    }
    if (!rules.q_type) {
      warnings.push({ kind: "unknown_type", number: gr.from, message: `${range}: couldn't tell the question type from "${instructions.slice(0, 80)}". Choose it in the preview.` });
    }
    const typed = rules.q_type !== null && TYPED_TYPES.includes(rules.q_type);
    const bank = (rules.q_type === "summary_completion" || rules.q_type === "flowchart_completion") && gr.letterList.length > 0;
    if (typed && !bank && rules.max_words === null) {
      warnings.push({ kind: "word_limit", number: gr.from, message: `${range}: no word limit found in the instructions; set to 2 words. Check it in the preview.` });
    }
    if (rules.needs_image) {
      warnings.push({
        kind: "needs_image",
        number: gr.from,
        message: `${range} ${gr.from === gr.to ? "refers" : "refer"} to a picture that isn't in the text. Reading questions have no picture field: describe it in the question or passage, or replace the question.`,
      });
    }
    const passageLetters = outPassages.find((pd) => pd.order_no === gr.passage)?.letters ?? [];
    const found = gr.questions.map((q) => q.number);
    const outside = found.filter((n) => n < gr.from || n > gr.to);
    const missing = Array.from({ length: gr.to - gr.from + 1 }, (_, i) => gr.from + i).filter((n) => !found.includes(n));
    if (outside.length || missing.length) {
      warnings.push({
        kind: "group_count",
        message: `${range}: found ${found.length} question${found.length === 1 ? "" : "s"}${missing.length ? `; missing ${missing.join(", ")}` : ""}${outside.length ? `; ${outside.join(", ")} outside the range` : ""}.`,
      });
    }

    for (const q of gr.questions) {
      const k = key.get(q.number);
      const list = rules.q_type === "matching_headings" ? gr.romanList : gr.letterList;
      const item: ImportedQuestion = {
        number: q.number,
        passage: gr.passage,
        q_type: rules.q_type,
        prompt: q.text.join(" ").replace(/\s+/g, " ").trim(),
        choices: q.choices,
        list: [...list],
        answer: k?.answer ?? "",
        explanation: k?.explanation ?? "",
        paragraphs: rules.paragraphs.length ? rules.paragraphs : passageLetters,
        reuse: rules.reuse,
        select: rules.select,
        max_words: rules.max_words ?? 2,
        number_allowed: rules.number_allowed,
        bank,
        needs_image: rules.needs_image,
        instructions,
      };
      questions.push(item);
      if (!k) warnings.push({ kind: "missing_answer", number: q.number, message: `Question ${q.number} has no answer in the answer key.` });
      else answerFormatWarning(item, warnings);
      if (item.q_type && GAP_TYPES.includes(item.q_type) && !bank && !/_{3,}/.test(normalizeGaps(item.prompt))) {
        warnings.push({ kind: "no_gap", number: q.number, message: `Question ${q.number}: no gap found (write it as "___" or "……").` });
      }
      if (item.q_type === "mcq" && item.choices.length < 2) {
        warnings.push({ kind: "orphan_choices", number: q.number, message: `Question ${q.number}: multiple choice without its lettered choices.` });
      }
    }
  }

  // Numbering across the whole draft.
  const numbers = questions.map((q) => q.number);
  const seen = new Set<number>();
  for (const n of numbers) {
    if (seen.has(n)) warnings.push({ kind: "duplicate", number: n, message: `Question ${n} appears more than once.` });
    seen.add(n);
  }
  const sorted = [...seen].sort((a, b) => a - b);
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i]! !== sorted[i - 1]! + 1) {
      warnings.push({ kind: "numbering", message: `Question numbers skip from ${sorted[i - 1]} to ${sorted[i]}.` });
    }
  }
  if (questions.length > 40) warnings.push({ kind: "too_many", message: `${questions.length} questions found; a test has 40 at most.` });
  for (const n of key.keys()) {
    if (!seen.has(n)) warnings.push({ kind: "unmatched_answer", number: n, message: `The answer key has question ${n}, which isn't in the questions.` });
  }
  for (const note of notes) warnings.push({ kind: "builder_note", message: `Note for the builder: ${note}` });

  questions.sort((a, b) => a.passage - b.passage || a.number - b.number);
  return { passages: outPassages, questions, warnings, notes };
}

function addParagraphLine(pd: PassageDraft, line: string, startsParagraph: boolean) {
  const m = line.match(LETTERED);
  if (m) {
    pd.paragraphs.push({ letter: m[1]!, lines: [m[2]!.trim()] });
    return;
  }
  const last = pd.paragraphs[pd.paragraphs.length - 1];
  // "## Subtitle" lines stay headings (the passage format keeps them).
  if (startsParagraph || !last || /^#{1,6}\s/.test(line)) pd.paragraphs.push({ letter: null, lines: [line] });
  else last.lines.push(line);
}

/** One answer-key line: "| 1 | B | why |", "1 | B", "1. B", "1) B", "1 – B". Header rows are skipped. */
function answerRow(line: string): { number: number; answer: string; explanation: string } | null {
  if (line.includes("|")) {
    const cells = line.split("|").map((c) => c.trim());
    if (cells[0] === "") cells.shift();
    if (cells[cells.length - 1] === "") cells.pop();
    const n = cells[0]?.replace(/[^\d]/g, "");
    if (!n || !/^\**\s*\d{1,2}\s*\**$/.test(cells[0]!) || cells.length < 2) return null;
    return { number: Number(n), answer: (cells[1] ?? "").replace(/\*\*/g, "").trim(), explanation: (cells[2] ?? "").trim() };
  }
  const m = line.match(/^\s*(\d{1,2})\s*[.):\-–—]?\s+(.+)$/);
  return m ? { number: Number(m[1]), answer: m[2]!.trim(), explanation: "" } : null;
}

function answerFormatWarning(q: ImportedQuestion, warnings: ImportWarning[]) {
  const a = q.answer.trim();
  const bad = (expected: string) =>
    warnings.push({ kind: "answer_format", number: q.number, message: `Question ${q.number}: the answer "${a}" isn't ${expected}.` });
  switch (q.q_type) {
    case "tfng":
      if (!judgementValue(a, "tfng")) bad("True, False or Not Given");
      break;
    case "ynng":
      if (!judgementValue(a, "ynng")) bad("Yes, No or Not Given");
      break;
    case "mcq":
      if (!/^[A-Z](?:\s*(?:,|and|&)?\s*[A-Z]){0,2}$/i.test(a)) bad("a letter");
      break;
    case "matching_headings":
      if (!ROMAN.test(`${a}. x`)) bad("a heading number (i, ii, …)");
      break;
    case "matching_information":
    case "matching_features":
      if (!/^[A-Z]$/i.test(a)) bad("a letter");
      break;
    default:
      if (q.bank && !/^[A-Z]$/i.test(a)) bad("a letter from the word list");
  }
}
