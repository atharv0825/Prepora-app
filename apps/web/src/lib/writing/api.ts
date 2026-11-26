// Scoring and OCR for the Writing screens (M6-F1..F3): the real Edge Functions, score-writing
// (M6-B3) and ocr-writing (M6-B4). Screens call these, never invokeFunction directly, so the
// request and response types stay in one place. M6-I1 removed the mock switch: CI and local
// testing point the functions at the ai-stub function instead (DEEPSEEK_API_URL, docs/ai.md).
import type { OcrWritingRequest, OcrWritingResponse } from "@prepora/shared/api/ocr-writing";
import type { ScoreWritingRequest, ScoreWritingResponse } from "@prepora/shared/api/score-writing";
import { type FunctionResult, invokeFunction } from "../supabase/functions";

type Client = Parameters<typeof invokeFunction>[0];

export function scoreWriting(supabase: Client, request: ScoreWritingRequest): Promise<FunctionResult<ScoreWritingResponse>> {
  return invokeFunction<ScoreWritingResponse>(supabase, "score-writing", { body: request });
}

export function ocrWriting(supabase: Client, request: OcrWritingRequest): Promise<FunctionResult<OcrWritingResponse>> {
  return invokeFunction<OcrWritingResponse>(supabase, "ocr-writing", { body: request });
}
