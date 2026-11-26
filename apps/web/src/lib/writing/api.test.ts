import { afterEach, describe, expect, it, vi } from "vitest";
import { MOCK_TASK_IDS } from "@prepora/shared/mocks/writing";

const invokeFunction = vi.fn();
vi.mock("../supabase/functions", () => ({ invokeFunction: (...args: unknown[]) => invokeFunction(...args) }));

const { ocrWriting, scoreWriting } = await import("./api");
const client = {} as Parameters<typeof scoreWriting>[0];
const USER = "6c000000-0000-4000-8000-000000000002";

afterEach(() => invokeFunction.mockReset());

describe("Writing API", () => {
  it("calls the real Edge Functions with the request as the body", async () => {
    invokeFunction.mockResolvedValue({ data: { ok: true }, error: null });
    await scoreWriting(client, { task_id: MOCK_TASK_IDS.task2, text: "Essay" });
    await ocrWriting(client, { photo_paths: [`${USER}/p1.jpg`] });
    expect(invokeFunction.mock.calls.map((c) => [c[1], c[2]])).toEqual([
      ["score-writing", { body: { task_id: MOCK_TASK_IDS.task2, text: "Essay" } }],
      ["ocr-writing", { body: { photo_paths: [`${USER}/p1.jpg`] } }],
    ]);
  });

  it("passes errors through in invokeFunction's shape", async () => {
    invokeFunction.mockResolvedValue({ data: null, error: { code: "insufficient_credits", message: "Not enough credits" } });
    expect(await scoreWriting(client, { task_id: MOCK_TASK_IDS.task2, text: "Essay" })).toEqual({
      data: null,
      error: { code: "insufficient_credits", message: "Not enough credits" },
    });
  });
});
