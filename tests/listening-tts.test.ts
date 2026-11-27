// Listening audio from the transcript (generate-listening-audio): the speaker-label parser, the
// character estimate, the transcript hash cache and the generation itself, on the exact module the
// Edge Function runs (supabase/functions/_shared/listening_tts.ts). TTS and R2 are mocks: no API
// is called.
import { describe, expect, it, vi } from "vitest";
import {
  audioHash,
  cachedAudio,
  charCount,
  effectiveVoices,
  estimateCostUsd,
  type GenerationDeps,
  generatedAudioKey,
  isStandardVoice,
  joinMp3,
  mp3Info,
  objectKeyFromUrl,
  parseSpeakerTurns,
  planSectionAudio,
  runGeneration,
  type Segment,
  silentMp3,
  speakableText,
  speakerLabel,
  splitText,
  stripId3,
  TTS_MAX_SEGMENT_BYTES,
  TTS_VOICES,
  withinLimit,
} from "../supabase/functions/_shared/listening_tts";

const CONVERSATION = `You will hear a woman phoning a hotel.
Man: Good morning, Riverside Hotel. How can I help?
Woman: Hi, I'd like to book a room for two nights.
It's for the 14th of June.
MAN: Certainly. Could I have your name?
Woman: Yes, it's Sarah [pause] Jones. That's J-O-N-E-S. (Q1)`;

describe("speaker labels", () => {
  it("recognises the usual labels", () => {
    expect(speakerLabel("Man: Hello")).toEqual({ label: "Man", rest: "Hello" });
    expect(speakerLabel("WOMAN: Hi")).toEqual({ label: "WOMAN", rest: "Hi" });
    expect(speakerLabel("Speaker 1: Right")).toEqual({ label: "Speaker 1", rest: "Right" });
    expect(speakerLabel("Dr Smith: Today we look at")).toEqual({ label: "Dr Smith", rest: "Today we look at" });
    expect(speakerLabel("**Tutor:** So")).toEqual({ label: "Tutor", rest: "So" });
    expect(speakerLabel("Receptionist:")).toEqual({ label: "Receptionist", rest: "" });
  });

  it("doesn't take sentences, times or notes for labels", () => {
    expect(speakerLabel("There are two options: the bus or the train.")).toBeNull();
    expect(speakerLabel("Well, it opens at 10:30 every day.")).toBeNull();
    expect(speakerLabel("Note: the café is closed.")).toBeNull();
    expect(speakerLabel("Example: Name")).toBeNull();
    expect(speakerLabel("so here's the thing: it's free")).toBeNull();
  });

  it("splits a conversation into turns, strips the labels and keeps who speaks", () => {
    const p = parseSpeakerTurns(CONVERSATION);
    expect(p.labelled).toBe(true);
    expect(p.speakers.map((s) => [s.key, s.label, s.gender])).toEqual([
      ["narrator", "Narrator", null],
      ["man", "Man", "male"],
      ["woman", "Woman", "female"],
    ]);
    expect(p.turns.map((t) => t.key)).toEqual(["narrator", "man", "woman", "man", "woman"]);
    // Unlabelled lines continue the turn; labels, [directions] and (Q1) markers aren't read aloud.
    expect(p.turns[2]!.text).toBe("Hi, I'd like to book a room for two nights. It's for the 14th of June.");
    expect(p.turns[4]!.text).toBe("Yes, it's Sarah Jones. That's J-O-N-E-S.");
    expect(p.turns.some((t) => /Man:|Woman:/i.test(t.text))).toBe(false);
  });

  it("a monologue is one speaker", () => {
    const p = parseSpeakerTurns("Welcome to the museum.\n\nThe tour starts at ten.");
    expect(p.labelled).toBe(false);
    expect(p.turns).toEqual([{ key: "narrator", text: "Welcome to the museum. The tour starts at ten." }]);
  });

  it("reads markdown emphasis as plain words", () => {
    expect(speakableText("The answer is **Jones** and _blue_.")).toBe("The answer is Jones and blue.");
  });
});

describe("voices", () => {
  it("offers Standard voices only", () => {
    expect(TTS_VOICES.every((v) => isStandardVoice(v.name))).toBe(true);
    expect(isStandardVoice("en-GB-Wavenet-A")).toBe(false);
    expect(isStandardVoice("en-GB-Neural2-A")).toBe(false);
    expect(isStandardVoice("en-GB-Studio-B")).toBe(false);
  });

  it("gives each speaker a different voice: men male, women female; the admin's choice wins", () => {
    const { speakers } = parseSpeakerTurns(CONVERSATION);
    const v = effectiveVoices(speakers, {}, 1);
    expect(new Set(Object.values(v)).size).toBe(3);
    expect(TTS_VOICES.find((x) => x.name === v.man)!.gender).toBe("male");
    expect(TTS_VOICES.find((x) => x.name === v.woman)!.gender).toBe("female");
    expect([v.man, v.woman]).toEqual(["en-GB-Standard-B", "en-GB-Standard-A"]); // named speakers get the first choices
    const chosen = effectiveVoices(speakers, { woman: "en-AU-Standard-C", man: "en-GB-Wavenet-B" }, 1);
    expect(chosen.woman).toBe("en-AU-Standard-C");
    expect(chosen.man).not.toBe("en-GB-Wavenet-B"); // not offered: the default instead
  });
});

describe("the plan and the character estimate", () => {
  it("one request per turn, labels stripped, a 0.5 s pause between turns (SSML)", () => {
    const r = planSectionAudio({ transcript: CONVERSATION, section: 1 });
    if (!r.ok) throw new Error(r.error);
    const s = r.plan.segments;
    expect(s).toHaveLength(5);
    expect(s[1]!.input).toBe('<speak>Good morning, Riverside Hotel. How can I help?<break time="500ms"/></speak>');
    expect(s[4]!.input).toBe("<speak>Yes, it&apos;s Sarah Jones. That&apos;s J-O-N-E-S.</speak>"); // no pause after the last
    expect(r.plan.chars).toBe(s.reduce((n, x) => n + charCount(x.input), 0));
  });

  it("without SSML: plain text, fewer characters", () => {
    const withSsml = planSectionAudio({ transcript: CONVERSATION, section: 1 });
    const plain = planSectionAudio({ transcript: CONVERSATION, section: 1, ssml: false });
    if (!withSsml.ok || !plain.ok) throw new Error("plan failed");
    expect(plain.plan.segments[1]!.input).toBe("Good morning, Riverside Hotel. How can I help?");
    expect(plain.plan.chars).toBeLessThan(withSsml.plan.chars);
    expect(plain.plan.chars).toBe(parseSpeakerTurns(CONVERSATION).turns.reduce((n, t) => n + t.text.length, 0));
  });

  it("sections 1 and 3 need speaker labels; 2 and 4 don't", () => {
    expect(planSectionAudio({ transcript: "Hello and welcome.", section: 1 })).toEqual({
      ok: false,
      error: 'Section 1 is a conversation: start each turn with the speaker, e.g. "Man:" or "Woman:".',
    });
    expect(planSectionAudio({ transcript: "Hello and welcome.", section: 2 }).ok).toBe(true);
    expect(planSectionAudio({ transcript: "  ", section: 4 }).ok).toBe(false);
  });

  it("long turns are split under Google's 5,000-byte limit, at sentence ends", () => {
    const sentence = "The museum's west wing was rebuilt after the fire in nineteen eighty-two. ";
    const long = sentence.repeat(120);
    const pieces = splitText(long.trim());
    expect(pieces.length).toBeGreaterThan(1);
    for (const p of pieces) expect(new TextEncoder().encode(p).length).toBeLessThanOrEqual(TTS_MAX_SEGMENT_BYTES);
    expect(pieces.every((p) => p.endsWith("eighty-two."))).toBe(true);
    const r = planSectionAudio({ transcript: long, section: 2 });
    if (!r.ok) throw new Error(r.error);
    for (const s of r.plan.segments) expect(new TextEncoder().encode(s.input).length).toBeLessThan(5000);
  });

  it("costs: $4 per million Standard characters; the per-test limit", () => {
    expect(estimateCostUsd(1_000_000)).toBe(4);
    expect(estimateCostUsd(6_000)).toBeCloseTo(0.024);
    expect(withinLimit(90_000, 10_000)).toBe(true);
    expect(withinLimit(90_000, 10_001)).toBe(false);
    expect(withinLimit(0, 50, 40)).toBe(false);
  });
});

describe("the transcript hash cache", () => {
  it("same transcript and voices → same hash; a changed transcript or voice → a new one", async () => {
    const plan = (t: string, voices = {}) => {
      const r = planSectionAudio({ transcript: t, section: 1, voices });
      if (!r.ok) throw new Error(r.error);
      return r.plan;
    };
    const a = await audioHash(plan(CONVERSATION));
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(await audioHash(plan(CONVERSATION))).toBe(a);
    expect(await audioHash(plan(CONVERSATION.replace("two nights", "three nights")))).not.toBe(a);
    expect(await audioHash(plan(CONVERSATION, { woman: "en-GB-Standard-F" }))).not.toBe(a);
    // Whitespace and line endings that don't change what's said don't change the hash.
    expect(await audioHash(plan(CONVERSATION.replace(/\n/g, "\r\n\n")))).toBe(a);
  });

  it("a matching hash returns the saved audio (no TTS call); otherwise TTS runs", async () => {
    const r = planSectionAudio({ transcript: CONVERSATION, section: 1 });
    if (!r.ok) throw new Error(r.error);
    const hash = await audioHash(r.plan);
    const synthesize = vi.fn(async () => silentMp3(10));
    const generateIfNeeded = async (section: { audio_url: string | null; audio_source: string | null; audio_hash: string | null }, h: string) =>
      cachedAudio(section, h) ? "cached" : (await Promise.all(r.plan.segments.map((s) => synthesize(s))), "generated");

    const saved = { audio_url: "https://cdn.test/a.mp3", audio_source: "generated", audio_hash: hash };
    expect(await generateIfNeeded(saved, hash)).toBe("cached");
    expect(synthesize).not.toHaveBeenCalled();

    const changed = planSectionAudio({ transcript: `${CONVERSATION}\nMan: Thank you.`, section: 1 });
    if (!changed.ok) throw new Error(changed.error);
    expect(await generateIfNeeded(saved, await audioHash(changed.plan))).toBe("generated");
    expect(synthesize).toHaveBeenCalledTimes(r.plan.segments.length);
    // Uploaded audio, or none, is never "cached".
    expect(cachedAudio({ ...saved, audio_source: "uploaded" }, hash)).toBe(false);
    expect(cachedAudio({ ...saved, audio_url: null }, hash)).toBe(false);
  });
});

describe("MP3 joining", () => {
  it("counts frames and seconds, drops ID3 tags, joins parts", () => {
    const one = silentMp3(10);
    expect(mp3Info(one).frames).toBe(10);
    expect(mp3Info(one).seconds).toBeCloseTo((10 * 1152) / 44100);
    const tagged = new Uint8Array([0x49, 0x44, 0x33, 4, 0, 0, 0, 0, 0, 5, 1, 2, 3, 4, 5, ...one]);
    expect(stripId3(tagged)).toEqual(one);
    const joined = joinMp3([tagged, silentMp3(5)]);
    expect(mp3Info(joined).frames).toBe(15);
    expect(joined.length).toBe(15 * 417);
    expect(mp3Info(new Uint8Array([1, 2, 3])).frames).toBe(0);
  });
});

describe("storage keys", () => {
  it("a stable key per audio; only this test's own files are deleted", () => {
    const test = "11111111-1111-4111-8111-111111111111";
    expect(generatedAudioKey(test, 2, "ab".repeat(32))).toBe(`listening/${test}/section-2-abababababababab.mp3`);
    expect(objectKeyFromUrl(`https://audio.prepora.test/listening/${test}/section-2-x.mp3?v=1`, "https://audio.prepora.test/", test)).toBe(
      `listening/${test}/section-2-x.mp3`,
    );
    expect(objectKeyFromUrl(`https://audio.prepora.test/listening/other/section-2-x.mp3`, "https://audio.prepora.test", test)).toBeNull();
    expect(objectKeyFromUrl("https://elsewhere.test/a.mp3", "https://audio.prepora.test", test)).toBeNull();
    expect(objectKeyFromUrl(null, "https://audio.prepora.test", test)).toBeNull();
  });
});

describe("runGeneration (TTS and R2 mocked)", () => {
  const plan = () => {
    const r = planSectionAudio({ transcript: CONVERSATION, section: 1 });
    if (!r.ok) throw new Error(r.error);
    return r.plan;
  };
  const ctx = { testId: "t1", section: 1, hash: "c".repeat(64), previousKey: "listening/t1/section-1-old.mp3" };
  const mocks = (over: Partial<GenerationDeps> = {}) => {
    const deps = {
      synthesize: vi.fn(async (_s: Segment) => silentMp3(40)),
      putObject: vi.fn(async (key: string) => `https://cdn.test/${key}`),
      deleteObject: vi.fn(async () => undefined),
      saveSection: vi.fn(async () => undefined),
      log: vi.fn(),
      ...over,
    };
    return deps;
  };

  it("one TTS call per segment, ONE upload, saved, then the old file removed; the cost is logged", async () => {
    const p = plan();
    const deps = mocks();
    const out = await runGeneration(p, ctx, deps);
    expect(deps.synthesize).toHaveBeenCalledTimes(p.segments.length);
    expect(deps.putObject).toHaveBeenCalledTimes(1);
    expect(deps.putObject.mock.calls[0]![0]).toBe("listening/t1/section-1-cccccccccccccccc.mp3");
    expect(mp3Info(deps.putObject.mock.calls[0]![1] as Uint8Array).frames).toBe(40 * p.segments.length);
    expect(deps.saveSection).toHaveBeenCalledWith({ audio_url: out.audio_url, duration_sec: Math.round((40 * 5 * 1152) / 44100), audio_hash: ctx.hash, audio_chars: p.chars });
    expect(deps.deleteObject).toHaveBeenCalledWith("listening/t1/section-1-old.mp3");
    const logged = deps.log.mock.calls.map((c) => c[0]).find((e) => e.event === "tts_generated")!;
    expect(logged).toMatchObject({ chars: p.chars, requests: p.segments.length, test_id: "t1", section: 1 });
    expect(logged.cost_usd).toBeCloseTo(estimateCostUsd(p.chars), 4);
  });

  it("a failed TTS call uploads nothing (no half-written file)", async () => {
    let n = 0;
    const deps = mocks({ synthesize: vi.fn(async () => (++n === 3 ? Promise.reject(new Error("TTS 500")) : silentMp3(5))) });
    await expect(runGeneration(plan(), ctx, deps)).rejects.toThrow("TTS 500");
    expect(deps.putObject).not.toHaveBeenCalled();
    expect(deps.saveSection).not.toHaveBeenCalled();
    expect(deps.deleteObject).not.toHaveBeenCalled();
  });

  it("a failed save removes the new upload and keeps the old file", async () => {
    const deps = mocks({ saveSection: vi.fn(async () => Promise.reject(new Error("db down"))) });
    await expect(runGeneration(plan(), ctx, deps)).rejects.toThrow("db down");
    expect(deps.deleteObject).toHaveBeenCalledTimes(1);
    expect(deps.deleteObject).toHaveBeenCalledWith("listening/t1/section-1-cccccccccccccccc.mp3");
  });

  it("no audio back → an error, nothing uploaded", async () => {
    const deps = mocks({ synthesize: vi.fn(async () => new Uint8Array([0, 1, 2])) });
    await expect(runGeneration(plan(), ctx, deps)).rejects.toThrow("no audio");
    expect(deps.putObject).not.toHaveBeenCalled();
  });
});
