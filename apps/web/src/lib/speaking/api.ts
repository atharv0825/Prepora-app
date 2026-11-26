// The Speaking Edge Functions for the screens: score-speaking (M7-B3) and examiner-turn (M8-B1).
import type { ScoreSpeakingRequest, ScoreSpeakingResponse } from "@prepora/shared/api/score-speaking";
import type { ExaminerTurnRequest, ExaminerTurnResponse } from "@prepora/shared/api/examiner-turn";
import { type FunctionResult, invokeFunction } from "../supabase/functions";

type Client = Parameters<typeof invokeFunction>[0];

export function scoreSpeaking(supabase: Client, request: ScoreSpeakingRequest): Promise<FunctionResult<ScoreSpeakingResponse>> {
  return invokeFunction<ScoreSpeakingResponse>(supabase, "score-speaking", { body: request });
}

/** examiner-turn (M8-B1): the next question in Part 1 or 3, and the newest answer's transcript. No credits. */
export function examinerTurn(supabase: Client, request: ExaminerTurnRequest): Promise<FunctionResult<ExaminerTurnResponse>> {
  return invokeFunction<ExaminerTurnResponse>(supabase, "examiner-turn", { body: request });
}
