// Calling Edge Functions. Always goes through invokeFunction() so every call is pinned to
// PINNED_FUNCTION_REGION and errors come back in the shared { error: { code, message } } shape.
import type { SupabaseClient } from "@supabase/supabase-js";
import { FunctionRegion, FunctionsHttpError } from "@supabase/supabase-js";
import { type ApiErrorBody, isApiErrorBody } from "@prepora/shared/api/errors";
import type { HealthResponse } from "@prepora/shared/api/health";
import { PINNED_FUNCTION_REGION } from "@prepora/shared/api/regions";

export type FunctionResult<T> = { data: T; error: null } | { data: null; error: ApiErrorBody["error"] };

export async function invokeFunction<T>(
  // Any schema: this helper only uses `functions`.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  name: string,
  options: { method?: "GET" | "POST"; body?: Record<string, unknown> } = {},
): Promise<FunctionResult<T>> {
  const { data, error } = await supabase.functions.invoke<T>(name, {
    method: options.method ?? "POST",
    body: options.body,
    region: PINNED_FUNCTION_REGION as FunctionRegion,
  });
  if (!error) return { data: data as T, error: null };

  if (error instanceof FunctionsHttpError) {
    const body: unknown = await error.context.json().catch(() => null);
    if (isApiErrorBody(body)) return { data: null, error: body.error };
  }
  return { data: null, error: { code: "internal", message: error.message } };
}

export function getHealth(supabase: Parameters<typeof invokeFunction>[0]) {
  return invokeFunction<HealthResponse>(supabase, "health", { method: "GET" });
}
