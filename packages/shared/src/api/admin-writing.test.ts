import { describe, expect, it } from "vitest";
import { WritingTaskForm, writingPublishCheck, writingTaskKind, writingTaskRow } from "./admin-writing";

const PROMPT = "The chart below shows the average monthly rainfall in three cities. Summarise the information.";
const LETTER = "Write a letter to your neighbour. In your letter:\n- introduce yourself\n- explain the problem\n- suggest a solution";

describe("WritingTaskForm → writing_tasks row", () => {
  it("Task 1 Academic keeps its image and description", () => {
    const f = WritingTaskForm.parse({ kind: "t1_academic", title: " Rainfall ", prompt: PROMPT, image_url: "https://cdn.example.com/r.png", image_alt: "Bar chart" });
    expect(writingTaskRow(f)).toEqual({ task_no: 1, test_type: "academic", title: "Rainfall", prompt: PROMPT, image_url: "https://cdn.example.com/r.png", image_alt: "Bar chart" });
  });

  it("Task 1 General and Task 2 (both tests, or one)", () => {
    expect(writingTaskRow(WritingTaskForm.parse({ kind: "t1_general", title: "Noise", prompt: LETTER }))).toMatchObject({ task_no: 1, test_type: "general", image_url: null });
    expect(writingTaskRow(WritingTaskForm.parse({ kind: "t2", title: "Remote work", prompt: PROMPT }))).toMatchObject({ task_no: 2, test_type: null });
    expect(writingTaskRow(WritingTaskForm.parse({ kind: "t2", t2_test_type: "general", title: "Remote work", prompt: PROMPT }))).toMatchObject({ task_no: 2, test_type: "general" });
  });

  it("empty image fields become null; an Academic image left blank is allowed while drafting", () => {
    const f = WritingTaskForm.parse({ kind: "t1_academic", title: "Rain", prompt: PROMPT, image_url: "  ", image_alt: "" });
    expect(writingTaskRow(f)).toMatchObject({ image_url: null, image_alt: null });
  });

  it("refuses bad input", () => {
    const bad = (v: Record<string, unknown>) => WritingTaskForm.safeParse({ kind: "t2", title: "T", prompt: PROMPT, ...v }).success;
    expect(bad({ title: "  " })).toBe(false);
    expect(bad({ prompt: "Too short" })).toBe(false);
    expect(bad({ kind: "t3" })).toBe(false);
    expect(bad({ image_url: "https://cdn.example.com/x.png" })).toBe(false); // only Task 1 Academic has an image
    expect(WritingTaskForm.safeParse({ kind: "t1_academic", title: "T", prompt: PROMPT, image_url: "javascript:alert(1)" }).success).toBe(false);
    expect(bad({ extra: 1 })).toBe(false);
  });
});

describe("writingPublishCheck", () => {
  it("Task 1 Academic needs its image; a description is recommended", () => {
    expect(writingPublishCheck({ task_no: 1, test_type: "academic", prompt: PROMPT, image_url: null, image_alt: null }).blocking).toHaveLength(1);
    expect(writingPublishCheck({ task_no: 1, test_type: "academic", prompt: PROMPT, image_url: "https://x.y/c.png", image_alt: null })).toEqual({
      blocking: [],
      warnings: ["Add a description of the image for screen readers."],
    });
  });
  it("letters without bullet points and very short tasks get a warning, not a block", () => {
    expect(writingPublishCheck({ task_no: 1, test_type: "general", prompt: LETTER, image_url: null, image_alt: null })).toEqual({ blocking: [], warnings: [] });
    expect(writingPublishCheck({ task_no: 1, test_type: "general", prompt: "Write a letter to your neighbour about the noise at night.", image_url: null, image_alt: null }).warnings).toHaveLength(2);
    expect(writingPublishCheck({ task_no: 2, test_type: null, prompt: PROMPT, image_url: null, image_alt: null })).toEqual({ blocking: [], warnings: [] });
  });
  it("kinds of stored tasks", () => {
    expect(writingTaskKind({ task_no: 2, test_type: "general" })).toBe("t2");
    expect(writingTaskKind({ task_no: 1, test_type: "general" })).toBe("t1_general");
    expect(writingTaskKind({ task_no: 1, test_type: "academic" })).toBe("t1_academic");
  });
});
