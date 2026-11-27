// Region pinning (plan §3): AI functions must run in one known region where the AI provider's API
// is available (Gemini restricts countries; DeepSeek is the default, ai.ts), whatever the user's
// location.
//
// How pinning works on Supabase: the CALLER chooses the region —
//   supabase-js:  supabase.functions.invoke("name", { region: FunctionRegion.ApSoutheast1 })
//   raw HTTP:     header `x-region: ap-southeast-1`  (or ?forceFunctionRegion=ap-southeast-1)
// Without it, the request runs in the region nearest the user.
//
// Server side, functions created with `requirePinnedRegion: true` reject requests that ran
// in another region, so a client that forgets to pin fails loudly instead of silently
// calling an AI API from an unsupported country.

/** Region every pinned function must run in. Override with the PINNED_REGION secret. */
export const PINNED_REGION = Deno.env.get("PINNED_REGION") ?? "ap-southeast-1";

/** Region this invocation is running in (set by Supabase; "local" when served locally). */
export function currentRegion(): string {
  return Deno.env.get("SB_REGION") ?? "local";
}

export function isPinnedRegion(): boolean {
  const region = currentRegion();
  return region === "local" || region === PINNED_REGION;
}
