// M6-B3/B4: the Writing rules the Edge Functions run (supabase/functions/_shared/writing.ts, no
// imports, so vitest loads the exact file) agree with the shared contract in packages/shared; the
// Deno Zod copies (_shared/writing_schemas.ts) keep the contract's categories and path rule.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import * as sharedWriting from "../packages/shared/src/ielts/writing";
import { correctionCategories, toWritingSummary, writingFeedbackFor } from "../packages/shared/src/api/score-writing";
import { joinOcrPages as sharedJoin } from "../packages/shared/src/api/ocr-writing";
import { MOCK_TASK2_ESSAY, mockScoredWriting } from "../packages/shared/src/mocks/writing";
import * as fn from "../supabase/functions/_shared/writing";

const schemasSource = readFileSync(new URL("../supabase/functions/_shared/writing_schemas.ts", import.meta.url), "utf8");

describe("Edge copy ↔ shared contract", () => {
  it("tasks, bands and word counts match", () => {
    expect(fn.WRITING_TASKS).toEqual(sharedWriting.WRITING_TASKS);
    const halves = Array.from({ length: 19 }, (_, i) => i / 2);
    for (const ta of halves) {
      for (const gra of [0, 4.5, 6, 7.5, 9]) {
        const s = { ta, cc: 6, lr: 6.5, gra };
        expect(fn.writingTaskBand(s)).toBe(sharedWriting.writingTaskBand(s));
      }
    }
    for (const t of ["", "  ", MOCK_TASK2_ESSAY, "well-known 25% — … n'est-ce", "line\n\nbreaks\ttabs"]) {
      expect(fn.countEssayWords(t)).toBe(sharedWriting.countEssayWords(t));
    }
    for (const n of [0, 149, 150, 249, 250]) {
      for (const task of [1, 2] as const) expect(fn.isUnderLength(n, task)).toBe(sharedWriting.isUnderLength(n, task));
    }
    expect(() => fn.writingTaskBand({ ta: 6.3, cc: 6, lr: 6, gra: 6 })).toThrow(RangeError);
  });

  it("feedback trimming and OCR joining match", () => {
    const scored = mockScoredWriting(MOCK_TASK2_ESSAY, 2);
    expect(fn.writingFeedbackFor(scored, true)).toEqual(writingFeedbackFor(scored, true));
    expect(fn.writingFeedbackFor(scored, false)).toEqual(writingFeedbackFor(scored, false));
    expect(fn.toWritingSummary(scored)).toEqual(toWritingSummary(scored));
    const pages = [{ text: " a \n" }, { text: "" }, { text: "b" }];
    expect(fn.joinOcrPages(pages)).toBe(sharedJoin(pages));
  });

  it("the Deno schemas keep the contract's categories and photo path rule", () => {
    const categories = schemasSource.match(/correctionCategories = \[([^\]]+)\]/)?.[1];
    expect([...(categories ?? "").matchAll(/"([a-z]+)"/g)].map((m) => m[1])).toEqual([...correctionCategories]);
    const pathRegex = (src: string) => src.match(/WritingPhotoPath = z\s*\.string\(\)\s*\.regex\((\/.+\/),/)?.[1];
    const sharedSource = readFileSync(new URL("../packages/shared/src/api/score-writing.ts", import.meta.url), "utf8");
    expect(pathRegex(schemasSource)).toBeTruthy();
    expect(pathRegex(schemasSource)).toBe(pathRegex(sharedSource));
    for (const limit of ["max(20_000", ".max(40)", "min(1).max(6)", "max(6000)", "max(1500)", "max(400)"]) expect(schemasSource).toContain(limit);
  });
});

describe("keepFoundCorrections", () => {
  const c = (original: string, suggestion = "x") => ({ original, suggestion, category: "grammar", explanation: "Because." });
  it("keeps exact quotes only, once each, and drops no-op corrections", () => {
    const text = "Many peoples thinks that alot is fine.";
    expect(
      fn.keepFoundCorrections(text, [c("peoples", "people"), c("Peoples", "people"), c("alot", "a lot"), c("peoples", "people"), c("thinks", "thinks"), c(" "), c("not in the text")]),
    ).toEqual([c("peoples", "people"), c("alot", "a lot")]);
  });
});

describe("isOwnPhotoPath", () => {
  const me = "6c000000-0000-4000-8000-000000000002";
  it("accepts only a file directly in the user's folder", () => {
    expect(fn.isOwnPhotoPath(me, `${me}/page1.jpg`)).toBe(true);
    expect(fn.isOwnPhotoPath(me, `6c000000-0000-4000-8000-000000000009/page1.jpg`)).toBe(false);
    expect(fn.isOwnPhotoPath(me, `${me}/sub/page1.jpg`)).toBe(false);
    expect(fn.isOwnPhotoPath(me, `${me}/`)).toBe(false);
    expect(fn.isOwnPhotoPath(me, `${me}/..`)).toBe(false);
    expect(fn.isOwnPhotoPath(me, "page1.jpg")).toBe(false);
  });
});
