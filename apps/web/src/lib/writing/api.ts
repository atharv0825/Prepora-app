// Scoring and OCR for the Writing screens (M6-F1..F3). Screens call these, never the functions
// directly, so swapping the mocks for the real functions (M6-I1) changes this file only.
//
// With NEXT_PUBLIC_WRITING_MOCKS=1 (inlined at build time), the answers come from
// @prepora/shared/mocks/writing after a short delay, so progress states show; errors come back
// in the same { code, message, details } shape as invokeFunction's. Otherwise the real Edge
// Functions are called (M6-B3/B4). Never set it in staging or production.
import type { OcrWritingRequest, OcrWritingResponse } from "@prepora/shared/api/ocr-writing";
import type { ScoreWritingRequest, ScoreWritingResponse } from "@prepora/shared/api/score-writing";
import { MockApiError, type MockOptions, mockOcrWriting, mockScoreWriting } from "@prepora/shared/mocks/writing";
import { type FunctionResult, invokeFunction } from "../supabase/functions";

type Client = Parameters<typeof invokeFunction>[0];

export function writingMocksEnabled(): boolean {
  return process.env.NEXT_PUBLIC_WRITING_MOCKS === "1";
}

export type WritingCallOptions = {
  /** For the mock only: the student's plan and balance (the real function knows them). */
  mock?: MockOptions;
  /** Mock delay in ms (default 1500 to score, 1000 to read photos). */
  mockDelayMs?: number;
};

async function fromMock<T>(run: () => T, delayMs: number): Promise<FunctionResult<T>> {
  if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
  try {
    return { data: run(), error: null };
  } catch (e) {
    if (e instanceof MockApiError) return { data: null, error: e.body.error };
    throw e;
  }
}

export function scoreWriting(
  supabase: Client,
  request: ScoreWritingRequest,
  opts: WritingCallOptions = {},
): Promise<FunctionResult<ScoreWritingResponse>> {
  if (writingMocksEnabled()) return fromMock(() => mockScoreWriting(request, opts.mock), opts.mockDelayMs ?? 1500);
  return invokeFunction<ScoreWritingResponse>(supabase, "score-writing", { body: request });
}

export function ocrWriting(
  supabase: Client,
  request: OcrWritingRequest,
  opts: WritingCallOptions = {},
): Promise<FunctionResult<OcrWritingResponse>> {
  if (writingMocksEnabled()) return fromMock(() => mockOcrWriting(request, opts.mock), opts.mockDelayMs ?? 1000);
  return invokeFunction<OcrWritingResponse>(supabase, "ocr-writing", { body: request });
}
