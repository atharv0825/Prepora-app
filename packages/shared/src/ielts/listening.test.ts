import { describe, expect, it } from "vitest";
import {
  LabellingQuestionContent,
  LISTENING_BANDS,
  labellingImage,
  listeningBand,
  listeningQuestionTypes,
  sectionOfQuestion,
  sectionQuestionNumbers,
} from "./listening";

const image = { image_url: "https://cdn.example.com/map.png", image_alt: "Campus map" };

describe("Listening sections", () => {
  it("puts 10 questions in each of 4 sections", () => {
    expect([1, 10, 11, 20, 21, 30, 31, 40].map(sectionOfQuestion)).toEqual([1, 1, 2, 2, 3, 3, 4, 4]);
    expect(sectionQuestionNumbers(2)).toEqual([11, 12, 13, 14, 15, 16, 17, 18, 19, 20]);
    expect(() => sectionOfQuestion(41)).toThrow(RangeError);
    expect(() => sectionOfQuestion(0)).toThrow(RangeError);
    expect(() => sectionQuestionNumbers(5)).toThrow(RangeError);
  });

  it("has the 11 Reading types plus map and diagram labelling", () => {
    expect(listeningQuestionTypes).toHaveLength(13);
    expect(listeningQuestionTypes).toContain("map_labelling");
    expect(listeningQuestionTypes).toContain("diagram_labelling");
  });
});

describe("labelling questions (M5-C2 shape)", () => {
  const locations = [
    { label: "A", x: 10, y: 20 },
    { label: "B", x: 50, y: 50 },
    { label: "C", x: 90, y: 80 },
  ];

  it("map: the answer is one of the map's letters, in order A, B, C…", () => {
    const q = { q_type: "map_labelling", prompt: "Café", options: { ...image, locations }, answer: { label: "B" } };
    expect(LabellingQuestionContent.safeParse(q).success).toBe(true);
    expect(LabellingQuestionContent.safeParse({ ...q, answer: { label: "D" } }).success).toBe(false);
    const skipped = { ...q, options: { ...image, locations: [locations[0], { ...locations[2], label: "C" }] } };
    expect(LabellingQuestionContent.safeParse(skipped).success).toBe(false);
    const offImage = { ...q, options: { ...image, locations: [locations[0], { label: "B", x: 120, y: 5 }] } };
    expect(LabellingQuestionContent.safeParse(offImage).success).toBe(false);
  });

  it("diagram: typed with a word limit, or from a word bank", () => {
    const typed = {
      q_type: "diagram_labelling",
      prompt: "Water enters through the ___",
      options: { ...image, marker: { x: 30, y: 40 }, max_words: 1, number_allowed: false },
      answer: { accept: ["valve"] },
    };
    expect(LabellingQuestionContent.safeParse(typed).success).toBe(true);
    const bank = { ...typed, options: { ...image, marker: { x: 30, y: 40 }, word_bank: ["pipe", "valve"] }, answer: { label: "B" } };
    expect(LabellingQuestionContent.safeParse(bank).success).toBe(true);
    expect(LabellingQuestionContent.safeParse({ ...bank, answer: { label: "C" } }).success).toBe(false);
    const noMarker = { ...typed, options: { ...image, max_words: 1 } };
    expect(LabellingQuestionContent.safeParse(noMarker).success).toBe(false);
    const notUrl = { ...typed, options: { ...typed.options, image_url: "map.png" } };
    expect(LabellingQuestionContent.safeParse(notUrl).success).toBe(false);
  });

  it("labellingImage reads the picture from options", () => {
    expect(labellingImage(image)).toEqual({ url: image.image_url, alt: "Campus map" });
    expect(labellingImage({})).toBeNull();
  });
});

describe("Listening band table", () => {
  it.each([
    [40, 9],
    [39, 9],
    [37, 8.5],
    [35, 8],
    [32, 7.5],
    [30, 7],
    [29, 6.5],
    [26, 6.5],
    [23, 6],
    [18, 5.5],
    [16, 5],
    [13, 4.5],
    [10, 4],
    [4, 2.5],
    [0, 0],
  ])("%i/40 → %d", (raw, band) => {
    expect(listeningBand(raw)).toBe(band);
  });

  it("never drops as the score rises, and scales short tests down", () => {
    let previous = -1;
    for (let raw = 0; raw <= 40; raw++) {
      const band = listeningBand(raw);
      expect(band).toBeGreaterThanOrEqual(previous);
      previous = band;
    }
    expect(LISTENING_BANDS.at(-1)).toEqual([0, 0]);
    expect(listeningBand(15, 20)).toBe(7); // 30/40
    expect(listeningBand(7, 10)).toBe(6.5); // 28/40
  });
});
