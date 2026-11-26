import { afterEach, describe, expect, it, vi } from "vitest";
import { MOCK_TASK2_ESSAY, MOCK_TASK_IDS } from "@prepora/shared/mocks/writing";

const invokeFunction = vi.fn();
vi.mock("../supabase/functions", () => ({ invokeFunction: (...args: unknown[]) => invokeFunction(...args) }));

const { ocrWriting, scoreWriting, writingMocksEnabled } = await import("./api");
const client = {} as Parameters<typeof scoreWriting>[0];
const USER = "6c000000-0000-4000-8000-000000000002";

afterEach(() => {
  vi.unstubAllEnvs();
  invokeFunction.mockReset();
});

describe("Writing API", () => {
  it("calls the real functions unless mocks are switched on", async () => {
    vi.stubEnv("NEXT_PUBLIC_WRITING_MOCKS", "");
    expect(writingMocksEnabled()).toBe(false);
    invokeFunction.mockResolvedValue({ data: { ok: true }, error: null });
    await scoreWriting(client, { task_id: MOCK_TASK_IDS.task2, text: "Essay" });
    await ocrWriting(client, { photo_paths: [`${USER}/p1.jpg`] });
    expect(invokeFunction.mock.calls.map((c) => [c[1], c[2]])).toEqual([
      ["score-writing", { body: { task_id: MOCK_TASK_IDS.task2, text: "Essay" } }],
      ["ocr-writing", { body: { photo_paths: [`${USER}/p1.jpg`] } }],
    ]);
  });

  it("with NEXT_PUBLIC_WRITING_MOCKS=1: mock feedback for the plan, no function call", async () => {
    vi.stubEnv("NEXT_PUBLIC_WRITING_MOCKS", "1");
    const gold = await scoreWriting(client, { task_id: MOCK_TASK_IDS.task2, text: MOCK_TASK2_ESSAY }, { mockDelayMs: 0 });
    expect(gold.data?.detail).toBe("full");
    const free = await scoreWriting(client, { task_id: MOCK_TASK_IDS.task2, text: MOCK_TASK2_ESSAY }, { mock: { plan: "free" }, mockDelayMs: 0 });
    expect(free.data?.detail).toBe("summary");
    const ocr = await ocrWriting(client, { photo_paths: [`${USER}/p1.jpg`, `${USER}/p2.jpg`] }, { mockDelayMs: 0 });
    expect(ocr.data?.text).toBe(MOCK_TASK2_ESSAY);
    expect(invokeFunction).not.toHaveBeenCalled();
  });

  it("mock errors come back like invokeFunction's", async () => {
    vi.stubEnv("NEXT_PUBLIC_WRITING_MOCKS", "1");
    const broke = await scoreWriting(client, { task_id: MOCK_TASK_IDS.task2, text: "Essay" }, { mock: { balance: 0 }, mockDelayMs: 0 });
    expect(broke).toMatchObject({ data: null, error: { code: "insufficient_credits" } });
    const free = await ocrWriting(client, { photo_paths: [`${USER}/p1.jpg`] }, { mock: { plan: "free" }, mockDelayMs: 0 });
    expect(free).toMatchObject({ data: null, error: { code: "feature_not_in_plan" } });
  });
});
