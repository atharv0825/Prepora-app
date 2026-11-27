import { describe, expect, it } from "vitest";
import {
  listeningPublishCheck,
  listeningQuestionOrder,
  ListeningQuestionInput,
  ListeningSectionAudio,
  ListeningSectionInput,
  ListeningTestCreate,
  moveListeningQuestion,
  nextQuestionNumber,
} from "./admin-listening";

const T = "00000000-0000-4000-8000-000000000001";
const S = [1, 2, 3, 4].map((n) => `00000000-0000-4000-8000-0000000000b${n}`);
const qid = (n: number) => `00000000-0000-4000-8000-0000000002${String(n).padStart(2, "0")}`;
const sections = S.map((id, i) => ({
  id,
  order_no: i + 1,
  title: `Part ${i + 1}`,
  audio_url: `https://audio.prepora.site/${i + 1}.mp3`,
  duration_sec: 300,
  transcript: "Words.",
  updated_at: "2026-11-25",
}));
const tfng = (n: number, section: number, extra: Record<string, unknown> = {}) => ({
  id: qid(n),
  section_id: S[section - 1]!,
  q_no: n,
  q_type: "tfng" as const,
  prompt: `Q${n}`,
  options: {},
  answer: { value: "true" },
  explanation: "Because.",
  ...extra,
});
const full = (section: number) => Array.from({ length: 10 }, (_, i) => tfng((section - 1) * 10 + i + 1, section));

describe("Listening builder inputs (M5-A1)", () => {
  it("sections: title and transcript; audio is an http(s) URL with a length", () => {
    expect(ListeningSectionInput.parse({ test_id: T, order_no: "3", title: " Part 3 ", transcript: "A\r\nB  " })).toEqual({
      test_id: T,
      order_no: 3,
      title: "Part 3",
      transcript: "A\nB",
    });
    expect(ListeningSectionInput.safeParse({ test_id: T, order_no: 5, title: "x", transcript: "" }).success).toBe(false);
    expect(ListeningSectionAudio.safeParse({ test_id: T, order_no: 1, audio_url: "https://audio.prepora.site/a.mp3", duration_sec: 312 }).success).toBe(true);
    expect(ListeningSectionAudio.safeParse({ test_id: T, order_no: 1, audio_url: "javascript:alert(1)", duration_sec: null }).success).toBe(false);
  });

  it("questions: all 13 types by their contract, labelling included", () => {
    const base = { test_id: T, section_id: S[0], explanation: "" };
    const map = ListeningQuestionInput.safeParse({
      ...base,
      q_type: "map_labelling",
      prompt: "Café",
      options: { image_url: "https://x.test/m.png", image_alt: "Plan", locations: [{ label: "A", x: 1, y: 1 }, { label: "B", x: 2, y: 2 }] },
      answer: { label: "B" },
    });
    expect(map.success && map.data.explanation).toBeNull();
    const wrong = ListeningQuestionInput.safeParse({ ...base, q_type: "map_labelling", prompt: "Café", options: { image_url: "https://x.test/m.png", image_alt: "Plan", locations: [] }, answer: { label: "A" } });
    expect(wrong.success).toBe(false);
    expect(ListeningQuestionInput.safeParse({ ...base, q_type: "tfng", prompt: "x", options: {}, answer: { value: "yes" } }).success).toBe(false);
  });
});

describe("numbering within sections (M5-A1)", () => {
  it("orders by section then number; a section's next number; full at 10", () => {
    const qs = [tfng(11, 2), tfng(1, 1), tfng(2, 1)];
    expect(listeningQuestionOrder(qs, sections)).toEqual([qid(1), qid(2), qid(11)]);
    expect(nextQuestionNumber(qs, sections[0]!)).toBe(3);
    expect(nextQuestionNumber(qs, sections[1]!)).toBe(12);
    expect(nextQuestionNumber(qs, sections[3]!)).toBe(31);
    expect(nextQuestionNumber(full(1), sections[0]!)).toBeNull();
  });

  it("moves within a section only", () => {
    const qs = [tfng(1, 1), tfng(2, 1), tfng(11, 2)];
    expect(moveListeningQuestion(qs, sections, qid(2), "up")).toEqual([qid(2), qid(1), qid(11)]);
    expect(moveListeningQuestion(qs, sections, qid(2), "down")).toBeNull();
  });
});

describe("Listening publish checklist (M5-A1)", () => {
  it("a full test passes", () => {
    const check = listeningPublishCheck({ sections, questions: [1, 2, 3, 4].flatMap(full) });
    expect(check).toEqual({ blocking: [], warnings: [] });
  });

  it("blocks missing sections, recordings, transcripts and invalid keys", () => {
    const missing = [{ ...sections[0]!, audio_url: null, transcript: " " }, sections[1]!];
    expect(listeningPublishCheck({ sections: missing, questions: [] }).blocking).toEqual([
      "Add all 4 sections (2 so far).",
      "Upload the recording for section 1.",
      "Write the transcript for section 1.",
      "Add questions.",
    ]);
    expect(listeningPublishCheck({ sections, questions: [tfng(1, 1, { answer: { value: "yes" } })] }).blocking).toEqual([
      expect.stringMatching(/^Question 1 \(True \/ False \/ Not Given\): /),
    ]);
  });

  it("numbers run on, so a short section can't be followed by questions", () => {
    const { blocking, warnings } = listeningPublishCheck({ sections, questions: [tfng(1, 1), tfng(11, 2)] });
    expect(blocking).toEqual(["Section 1 needs 10 questions before later sections can have any (numbers run 1–10, 11–20, …)."]);
    expect(warnings).toContain("Section 1 has 1 of 10 questions.");
    // Only the last section in use may be short: a warning, not a block.
    const short = listeningPublishCheck({ sections, questions: [...full(1), tfng(11, 2, { explanation: null })] });
    expect(short.blocking).toEqual([]);
    expect(short.warnings).toEqual([
      "Section 2 has 1 of 10 questions.",
      "Section 3 has no questions.",
      "Section 4 has no questions.",
      "No explanation for question 11. Students see one with their results.",
    ]);
  });
});

describe("creating a Listening test", () => {
  it("needs no title (the database names it)", () => {
    expect(ListeningTestCreate.parse({ title: "ignored", min_plan: "gold" })).toEqual({ min_plan: "gold" });
    expect(ListeningTestCreate.safeParse({ min_plan: "platinum-plus" }).success).toBe(false);
  });
});
