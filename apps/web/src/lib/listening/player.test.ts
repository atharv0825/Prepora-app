import { describe, expect, it } from "vitest";
import {
  canPlaySection,
  clampSeek,
  examSeekCorrection,
  formatTime,
  isSlowNetwork,
  nextSection,
  playbackRules,
  preloadPlan,
} from "./player";

describe("playback rules (M5-F1)", () => {
  it("exam: no pause, seek, replay or section choice; advances by itself", () => {
    expect(playbackRules("exam")).toEqual({ canPause: false, canSeek: false, canReplay: false, canChooseSection: false, autoAdvance: true });
  });

  it("practice: everything allowed, no auto-advance", () => {
    expect(playbackRules("practice")).toEqual({ canPause: true, canSeek: true, canReplay: true, canChooseSection: true, autoAdvance: false });
  });

  it("exam: each section once, in order, one at a time", () => {
    expect(canPlaySection("exam", 1, {})).toBe(true);
    expect(canPlaySection("exam", 2, {})).toBe(false);
    expect(canPlaySection("exam", 1, { 1: "playing" })).toBe(false);
    expect(canPlaySection("exam", 2, { 1: "playing" })).toBe(false);
    expect(canPlaySection("exam", 1, { 1: "ended" })).toBe(false); // no replay
    expect(canPlaySection("exam", 2, { 1: "ended" })).toBe(true);
    expect(canPlaySection("exam", 3, { 1: "ended" })).toBe(false);
  });

  it("practice: any section, any time, again", () => {
    expect(canPlaySection("practice", 4, {})).toBe(true);
    expect(canPlaySection("practice", 1, { 1: "ended" })).toBe(true);
    expect(canPlaySection("practice", 2, { 1: "playing" })).toBe(true);
  });

  it("exam: a jump in position is put back; normal playback isn't", () => {
    expect(examSeekCorrection(10, 10.3)).toBeNull();
    expect(examSeekCorrection(10, 40)).toBe(10);
    expect(examSeekCorrection(10, 2)).toBe(10);
  });

  it("practice: seeks stay inside the recording", () => {
    expect(clampSeek(-5, 100)).toBe(0);
    expect(clampSeek(150, 100)).toBe(100);
    expect(clampSeek(42, 100)).toBe(42);
    expect(clampSeek(42, Number.NaN)).toBe(42);
  });
});

describe("preloading the next section on slow networks (M5-F1)", () => {
  it("reads the Network Information API", () => {
    expect(isSlowNetwork({ effectiveType: "3g" })).toBe(true);
    expect(isSlowNetwork({ effectiveType: "slow-2g" })).toBe(true);
    expect(isSlowNetwork({ effectiveType: "4g", downlink: 0.8 })).toBe(true);
    expect(isSlowNetwork({ effectiveType: "4g", rtt: 600 })).toBe(true);
    expect(isSlowNetwork({ effectiveType: "4g", downlink: 10, rtt: 50 })).toBe(false);
    expect(isSlowNetwork(undefined)).toBeNull(); // Safari, Firefox
    expect(isSlowNetwork({})).toBeNull();
  });

  it("loads the next section in full when slow, unknown or after a stall; metadata when fast", () => {
    expect(preloadPlan({ effectiveType: "3g" }, false)).toBe("full");
    expect(preloadPlan(undefined, false)).toBe("full");
    expect(preloadPlan({ effectiveType: "4g", downlink: 10 }, false)).toBe("metadata");
    expect(preloadPlan({ effectiveType: "4g", downlink: 10 }, true)).toBe("full");
  });

  it("the next section, none after the last", () => {
    expect(nextSection(1, 4)).toBe(2);
    expect(nextSection(4, 4)).toBeNull();
  });

  it("formats times", () => {
    expect(formatTime(0)).toBe("0:00");
    expect(formatTime(75.9)).toBe("1:15");
    expect(formatTime(3600)).toBe("60:00");
    expect(formatTime(Number.NaN)).toBe("0:00");
  });
});
