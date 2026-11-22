// Response of the `health` Edge Function (supabase/functions/health/index.ts).
export interface HealthResponse {
  status: "ok";
  version: string;
  env: string;
  region: string;
  pinnedRegion: string;
  inPinnedRegion: boolean;
  authenticated: boolean;
  time: string;
  echo?: string;
}
