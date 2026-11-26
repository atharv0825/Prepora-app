// score-speaking for the Speaking screens (M7-F3): the real Edge Function (M7-B3).
import type { ScoreSpeakingRequest, ScoreSpeakingResponse } from "@prepora/shared/api/score-speaking";
import { type FunctionResult, invokeFunction } from "../supabase/functions";

type Client = Parameters<typeof invokeFunction>[0];

export function scoreSpeaking(supabase: Client, request: ScoreSpeakingRequest): Promise<FunctionResult<ScoreSpeakingResponse>> {
  return invokeFunction<ScoreSpeakingResponse>(supabase, "score-speaking", { body: request });
}
