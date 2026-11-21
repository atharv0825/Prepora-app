// Region pinning (plan §3, M0-B3). Every client must invoke AI Edge Functions in this region,
// so Gemini is always called from a supported country whatever the user's location.
// Must match PINNED_REGION in supabase/functions/_shared/region.ts.
export const PINNED_FUNCTION_REGION = "ap-southeast-1" as const;
