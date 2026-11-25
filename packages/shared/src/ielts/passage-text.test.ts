import { describe, expect, it } from "vitest";
import { parsePassage, passagePieces, sanitizePassage } from "./passage-text";

describe("passage text (M4-A1)", () => {
  it("cleans what an editor pastes", () => {
    expect(sanitizePassage("  A  Bees\r\nthrive.\r\n\r\n\r\n\r\nB  <b>Cities</b> help<br/>​\u0007 \t")).toBe("A  Bees\nthrive.\n\nB  Cities help");
    // Not tags: comparisons and arrows stay.
    expect(sanitizePassage("x < y and y > z; 3<4; a -> b")).toBe("x < y and y > z; 3<4; a -> b");
    expect(sanitizePassage("<script>alert(1)</script>Text")).toBe("alert(1)Text");
    expect(sanitizePassage("non breaking")).toBe("non breaking");
  });

  it("a plain passage is its own plain text (the seeded samples)", () => {
    const body = "A  Urban beekeeping has grown.\n\nB  Hives on roofs (2019) cost £200 * 2.";
    const { plain, runs } = parsePassage(body);
    expect(plain).toBe(body);
    expect(runs).toEqual([{ text: body, start: 0, bold: false, italic: false, heading: false }]);
  });

  it("reads headings, bold and italic, and removes the marks from the plain text", () => {
    const { plain, runs } = parsePassage("## The return of the bee\n\nA  Bees are **vital** to *urban* life.");
    expect(plain).toBe("The return of the bee\n\nA  Bees are vital to urban life.");
    expect(runs.map((r) => [r.text, r.bold, r.italic, r.heading])).toEqual([
      ["The return of the bee", false, false, true],
      ["\n\nA  Bees are ", false, false, false],
      ["vital", true, false, false],
      [" to ", false, false, false],
      ["urban", false, true, false],
      [" life.", false, false, false],
    ]);
    // Every run starts where the previous one ended.
    runs.forEach((r, i) => expect(r.start).toBe(i === 0 ? 0 : runs[i - 1]!.start + runs[i - 1]!.text.length));
    expect(plain.slice(runs[2]!.start, runs[2]!.start + 5)).toBe("vital");
  });

  it("leaves stray or spaced marks as typed", () => {
    expect(parsePassage("2 * 3 = 6 and ** nothing **").plain).toBe("2 * 3 = 6 and ** nothing **");
    expect(parsePassage("#No space is not a heading").runs[0]!.heading).toBe(false);
  });

  it("cuts runs at highlight edges; the pieces add back up to the plain text", () => {
    const { plain, runs } = parsePassage("Bees in the **city** are thriving.");
    const pieces = passagePieces(runs, [[0, 4], [12, 14]]);
    expect(pieces.map((p) => [p.text, p.start, p.marked, p.bold])).toEqual([
      ["Bees", 0, true, false],
      [" in the ", 4, false, false],
      ["ci", 12, true, true],
      ["ty", 14, false, true],
      [" are thriving.", 16, false, false],
    ]);
    expect(pieces.map((p) => p.text).join("")).toBe(plain);
    // Ranges past the end are clipped.
    expect(passagePieces(parsePassage("abc").runs, [[1, 99]]).map((p) => [p.text, p.marked])).toEqual([
      ["a", false],
      ["bc", true],
    ]);
  });
});
