import { describe, expect, it } from "vitest";
import { CueCardForm, cueCardRow, Part3Form, part3Row, speakingPublishCheck } from "./admin-speaking";

const CARD = "Describe a place you like to visit";
const PARENT = "7c100000-0000-4000-8000-000000000002";

describe("cue card form → row", () => {
  it("trims, drops blank rows, keeps the order", () => {
    const f = CueCardForm.parse({ title: `  ${CARD} `, points: [" where it is", "", "how often you go there ", "  ", "and explain why"] });
    expect(cueCardRow(f)).toEqual({ part: 2, title: CARD, cue_card_points: ["where it is", "how often you go there", "and explain why"], questions: null, parent_topic_id: null });
  });
  it("needs 2 to 5 points and a task", () => {
    expect(CueCardForm.safeParse({ title: CARD, points: ["only one", " "] }).success).toBe(false);
    expect(CueCardForm.safeParse({ title: CARD, points: ["a", "b", "c", "d", "e", "f"] }).success).toBe(false);
    expect(CueCardForm.safeParse({ title: "  ", points: ["a", "b"] }).success).toBe(false);
    expect(CueCardForm.safeParse({ title: CARD, points: ["a", "b"], extra: 1 }).success).toBe(false);
  });
});

describe("Part 3 form → row", () => {
  it("questions in order, linked to its card", () => {
    const f = Part3Form.parse({ title: "Tourism", questions: ["Why do people travel?", "", "Is tourism good for locals?"], parent_topic_id: PARENT });
    expect(part3Row(f)).toEqual({ part: 3, title: "Tourism", questions: ["Why do people travel?", "Is tourism good for locals?"], cue_card_points: null, parent_topic_id: PARENT });
  });
  it("needs a question and a card", () => {
    expect(Part3Form.safeParse({ title: "T", questions: [""], parent_topic_id: PARENT }).success).toBe(false);
    expect(Part3Form.safeParse({ title: "T", questions: ["Why?"], parent_topic_id: "nope" }).success).toBe(false);
    expect(Part3Form.safeParse({ title: "T", questions: Array.from({ length: 13 }, (_, i) => `Q${i}?`), parent_topic_id: PARENT }).success).toBe(false);
  });
});

describe("speakingPublishCheck", () => {
  it("cue cards: 2–5 points block; Describe… and 'and explain why' are hints", () => {
    expect(speakingPublishCheck({ part: 2, title: CARD, cue_card_points: ["where", "and explain why"], questions: null })).toEqual({ blocking: [], warnings: [] });
    expect(speakingPublishCheck({ part: 2, title: "A place", cue_card_points: ["where", "when"], questions: null }).warnings).toHaveLength(2);
    expect(speakingPublishCheck({ part: 2, title: CARD, cue_card_points: ["x"], questions: null }).blocking).toHaveLength(1);
  });
  it("Part 3: needs questions and a published card; 4–6 questions is the usual", () => {
    const ok = { part: 3, title: "T", cue_card_points: null, questions: ["a?", "b?", "c?", "d?"], parent_status: "published" };
    expect(speakingPublishCheck(ok)).toEqual({ blocking: [], warnings: [] });
    expect(speakingPublishCheck({ ...ok, parent_status: "draft" }).blocking).toEqual(["Publish its Part 2 cue card first."]);
    expect(speakingPublishCheck({ ...ok, questions: ["a?"] }).warnings).toEqual(["Part 3 usually has 4 to 6 questions."]);
  });
});
