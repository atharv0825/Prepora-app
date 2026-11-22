/** Each scene plays for this long before the showcase moves on. */
export const SCENE_MS = 7500;

export function mmss(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Text revealed so far: `charsPerSecond` from `startMs`. */
export function typed(text: string, t: number, startMs: number, charsPerSecond: number): string {
  const n = Math.max(0, Math.floor(((t - startMs) / 1000) * charsPerSecond));
  return text.slice(0, n);
}

export type SceneProps = { t: number };
