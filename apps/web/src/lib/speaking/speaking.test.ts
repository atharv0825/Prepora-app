import { describe, expect, it } from "vitest";
import { browserKind, levelFromSamples, micHelp, micProblem, mmss, pickRecorderType, transcriptPieces, uploadTypeFor } from "./speaking";

describe("recording format", () => {
  it("prefers Opus/WebM, then MP4 (Safari), else the browser's choice", () => {
    expect(pickRecorderType((t) => t.startsWith("audio/webm"))).toBe("audio/webm;codecs=opus");
    expect(pickRecorderType((t) => t === "audio/mp4")).toBe("audio/mp4");
    expect(pickRecorderType(() => false)).toBeNull();
    expect(pickRecorderType(() => {
      throw new Error("unknown");
    })).toBeNull();
  });
  it("uploads with the bare type and a matching extension", () => {
    expect(uploadTypeFor("audio/webm;codecs=opus")).toEqual({ contentType: "audio/webm", ext: "webm" });
    expect(uploadTypeFor("audio/mp4;codecs=mp4a.40.2")).toEqual({ contentType: "audio/mp4", ext: "m4a" });
    expect(uploadTypeFor("video/mp4")).toEqual({ contentType: "audio/mp4", ext: "m4a" });
    expect(uploadTypeFor("audio/ogg;codecs=opus")).toEqual({ contentType: "audio/ogg", ext: "ogg" });
    expect(uploadTypeFor(null)).toEqual({ contentType: "audio/webm", ext: "webm" });
  });
});

describe("microphone problems and help", () => {
  it("classifies getUserMedia errors", () => {
    expect(micProblem({ name: "NotAllowedError" })).toBe("denied");
    expect(micProblem({ name: "NotFoundError" })).toBe("no_device");
    expect(micProblem({ name: "NotReadableError" })).toBe("busy");
    expect(micProblem({ name: "TypeError" })).toBe("unsupported");
    expect(micProblem(new Error("x"))).toBe("other");
    expect(micProblem(null)).toBe("other");
  });
  it("knows the browser, and gives its steps", () => {
    const ua = {
      chrome: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36",
      edge: "Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36 Edg/131.0",
      ios: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/131.0 Mobile/15E148 Safari/604.1",
      mac: "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15",
      firefox: "Mozilla/5.0 (X11; Linux x86_64; rv:133.0) Gecko/20100101 Firefox/133.0",
      samsung: "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0 Mobile Safari/537.36",
    };
    expect(browserKind(ua.chrome)).toBe("chrome");
    expect(browserKind(ua.edge)).toBe("edge");
    expect(browserKind(ua.ios)).toBe("safari-ios"); // Chrome on iPhone uses Safari's settings
    expect(browserKind(ua.mac)).toBe("safari-mac");
    expect(browserKind(ua.firefox)).toBe("firefox");
    expect(browserKind(ua.samsung)).toBe("samsung");
    expect(browserKind("curl/8")).toBe("other");
    expect(micHelp("safari-ios").steps[0]).toContain("aA");
    expect(micHelp("chrome").steps.at(-1)).toBe("Reload this page.");
  });
  it("level meter: silence is 0, speech fills the bar, capped at 1", () => {
    expect(levelFromSamples([])).toBe(0);
    expect(levelFromSamples(new Float32Array(128))).toBe(0);
    expect(levelFromSamples(new Float32Array(128).fill(0.1))).toBeCloseTo(0.4);
    expect(levelFromSamples(new Float32Array(128).fill(0.9))).toBe(1);
  });
});

describe("transcriptPieces", () => {
  it("marks fillers and better phrases; the text is unchanged", () => {
    const t = "Um, the food is very delicious, you know, and I feel very relax. Umbrella.";
    const pieces = transcriptPieces(t, [{ original: "very delicious" }, { original: "feel very relax" }, { original: "not said" }]);
    expect(pieces.map((p) => p.text).join("")).toBe(t);
    expect(pieces.filter((p) => p.filler).map((p) => p.text)).toEqual(["Um", "you know"]);
    expect(pieces.filter((p) => p.phrase !== undefined).map((p) => [p.text, p.phrase])).toEqual([
      ["very delicious", 0],
      ["feel very relax", 1],
    ]);
  });
  it("a phrase wins over a filler inside it; no phrases: fillers only", () => {
    const t = "Uh I mean it is good.";
    expect(transcriptPieces(t, [{ original: "I mean it is good" }]).filter((p) => p.filler).map((p) => p.text)).toEqual(["Uh"]);
    expect(transcriptPieces("Plain answer.")).toEqual([{ text: "Plain answer." }]);
  });
  it("mmss", () => {
    expect([mmss(0), mmss(65), mmss(120), mmss(-3)]).toEqual(["0:00", "1:05", "2:00", "0:00"]);
  });
});

describe("speakingPartNote", () => {
  it("describes each part with its cost when known", async () => {
    const { speakingPartNote } = await import("./speaking");
    const costs: Record<string, number> = { speaking_p1: 5, speaking_p2: 4, speaking_p3: 6 };
    expect(speakingPartNote(1, (k) => costs[k])).toBe("4–5 short questions from the examiner. 5 credits.");
    expect(speakingPartNote(2, (k) => costs[k])).toBe("1 minute to prepare, then speak for up to 2 minutes. 4 credits. Part 3 discusses the card's theme (6 credits).");
    expect(speakingPartNote(1, () => undefined)).toBe("4–5 short questions from the examiner.");
  });
});
