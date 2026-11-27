import { describe, expect, it } from "vitest";
import { studyItemHref } from "./study";

const id = "5a100000-0000-4000-8000-000000000001";
const p1 = "5a100000-0000-4000-8000-000000000002";
const p3 = "5a100000-0000-4000-8000-000000000003";

describe("studyItemHref: a picked item → the page that starts it", () => {
  it("tests, Writing tasks and Speaking parts", () => {
    expect(studyItemHref("reading_test", id, {})).toBe(`/app/reading/${id}`);
    expect(studyItemHref("listening_test", id, {})).toBe(`/app/listening/${id}`);
    expect(studyItemHref("writing_t1", id, { task_no: 1 })).toBe(`/app/writing/${id}`);
    expect(studyItemHref("writing_t2", id, null)).toBe(`/app/writing/${id}`);
    expect(studyItemHref("speaking_p1", id, { part: 1 })).toBe(`/app/speaking/examiner/${id}`);
    expect(studyItemHref("speaking_p2", id, { part: 2 })).toBe(`/app/speaking/${id}`);
  });
  it("the Speaking full test carries its Part 1 set, card and Part 3", () => {
    expect(studyItemHref("speaking_full", id, { card: id, p1, p3 })).toBe(`/app/speaking/test?p1=${p1}&card=${id}&p3=${p3}`);
  });
});
