// Listening audio player rules (M5-F1). Pure, unit-tested (player.test.ts); the component is
// components/listening/audio-player.tsx.
//
// Two modes:
//   * exam      as on test day: each section plays once, start to finish. No pause, no seeking,
//               no replay, no choosing a section; when a section ends the next one starts on
//               its own after a short gap.
//   * practice  free: play/pause, seek, skip back/forward, replay, pick any section.
//
// Preloading: while one section plays, the next one is fetched in full on slow networks (or when
// we can't tell the speed, e.g. Safari, which has no Network Information API), so the next
// section doesn't stall in the middle of an exam. On a fast connection the browser's own
// buffering is enough and only metadata is loaded ahead. A stall during playback ("waiting")
// marks the network slow for the rest of the test.
import type { ListeningMode } from "@prepora/shared/api/listening-test";

export type PlaybackRules = {
  canPause: boolean;
  canSeek: boolean;
  canReplay: boolean;
  canChooseSection: boolean;
  /** Start the next section by itself when one ends. */
  autoAdvance: boolean;
};

export function playbackRules(mode: ListeningMode): PlaybackRules {
  return mode === "exam"
    ? { canPause: false, canSeek: false, canReplay: false, canChooseSection: false, autoAdvance: true }
    : { canPause: true, canSeek: true, canReplay: true, canChooseSection: true, autoAdvance: false };
}

/** Seconds between sections in exam mode (the recording's own pause stands in on test day). */
export const EXAM_SECTION_GAP_SEC = 3;
/** The skip buttons in practice mode. */
export const SKIP_SEC = 10;

export type SectionStatus = "not_started" | "playing" | "paused" | "ended";

/**
 * May the student press play on this section now?
 * Exam: only the next unplayed section, only once, and never while another is playing.
 */
export function canPlaySection(
  mode: ListeningMode,
  section: number,
  statuses: Record<number, SectionStatus>,
): boolean {
  const status = statuses[section] ?? "not_started";
  if (mode === "practice") return true;
  if (status !== "not_started") return false;
  if (Object.values(statuses).some((s) => s === "playing")) return false;
  // Sections in order: every earlier section has ended.
  for (let s = 1; s < section; s++) if ((statuses[s] ?? "not_started") !== "ended") return false;
  return true;
}

/**
 * Exam mode refuses seeking: if the element's position jumps away from where it was playing
 * (keyboard shortcuts, media keys, devtools), put it back. Small jumps are normal playback.
 */
export function examSeekCorrection(lastTime: number, currentTime: number, toleranceSec = 1.5): number | null {
  return Math.abs(currentTime - lastTime) > toleranceSec ? lastTime : null;
}

/** Clamp a practice-mode seek into the recording. */
export function clampSeek(target: number, duration: number): number {
  if (!Number.isFinite(duration) || duration <= 0) return Math.max(0, target);
  return Math.min(Math.max(0, target), duration);
}

// ── Network ────────────────────────────────────────────────────────────────────────────────
/** The parts of navigator.connection (Network Information API) we read. Missing on Safari/Firefox. */
export type NetworkInfo = { effectiveType?: string; downlink?: number; rtt?: number; saveData?: boolean } | undefined;

const SLOW_TYPES = new Set(["slow-2g", "2g", "3g"]);

/** true = slow, false = fast, null = can't tell. */
export function isSlowNetwork(info: NetworkInfo): boolean | null {
  if (!info) return null;
  if (info.effectiveType && SLOW_TYPES.has(info.effectiveType)) return true;
  if (typeof info.downlink === "number" && info.downlink > 0 && info.downlink < 1.5) return true;
  if (typeof info.rtt === "number" && info.rtt > 400) return true;
  if (info.effectiveType || typeof info.downlink === "number") return false;
  return null;
}

export type PreloadPlan = "full" | "metadata";

/**
 * How to load the section after the one playing. Full when the network is slow, unknown, or has
 * already stalled once; metadata when it is known to be fast.
 */
export function preloadPlan(info: NetworkInfo, stalled: boolean): PreloadPlan {
  if (stalled) return "full";
  return isSlowNetwork(info) === false ? "metadata" : "full";
}

/** The section to preload while `current` plays (null after the last). */
export function nextSection(current: number, sectionCount: number): number | null {
  return current < sectionCount ? current + 1 : null;
}

/** 75 → "1:15", 3600 → "60:00". */
export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const whole = Math.floor(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}
