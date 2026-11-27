// Listening audio from the transcript: Google Cloud Text-to-Speech, Standard voices only.
//
// NO imports, so the same file runs in the generate-listening-audio Edge Function (Deno), in the
// admin builder (the voice pickers, the character estimate and the "up to date" status) and in the
// unit tests (tests/listening-tts.test.ts), with TTS and R2 mocked.
//
//   transcript ─ parseSpeakerTurns ─▶ turns (speaker labels stripped, speaker → voice kept)
//              ─ planSectionAudio  ─▶ segments: one TTS request each (a turn, split if > 4,500 bytes)
//              ─ audioHash         ─▶ SHA-256 of exactly what's sent (voice + input per segment):
//                                     the same hash on the next click skips TTS (cache)
//              ─ runGeneration     ─▶ synthesize all → join the MP3s → ONE upload → save → only then
//                                     delete the old file. Nothing is uploaded unless every segment
//                                     worked, so R2 never holds a half-written recording.
//
// Sections 1 and 3 are conversations: every turn starts with a label ("Man:", "Woman:",
// "Speaker 1:"). Sections 2 and 4 are monologues and need none.

// ── Configuration ───────────────────────────────────────────────────────────────────────────
export type TtsGender = "female" | "male";
export type TtsVoice = { name: string; languageCode: string; gender: TtsGender; label: string };

/**
 * The voices the builder offers: Google's Standard voices only (not WaveNet, Neural2, Chirp or
 * Studio), British and Australian first, as in IELTS recordings. Add or remove voices here.
 */
export const TTS_VOICES: readonly TtsVoice[] = [
  { name: "en-GB-Standard-A", languageCode: "en-GB", gender: "female", label: "British · female A" },
  { name: "en-GB-Standard-B", languageCode: "en-GB", gender: "male", label: "British · male B" },
  { name: "en-GB-Standard-C", languageCode: "en-GB", gender: "female", label: "British · female C" },
  { name: "en-GB-Standard-D", languageCode: "en-GB", gender: "male", label: "British · male D" },
  { name: "en-GB-Standard-F", languageCode: "en-GB", gender: "female", label: "British · female F" },
  { name: "en-AU-Standard-A", languageCode: "en-AU", gender: "female", label: "Australian · female A" },
  { name: "en-AU-Standard-B", languageCode: "en-AU", gender: "male", label: "Australian · male B" },
  { name: "en-AU-Standard-C", languageCode: "en-AU", gender: "female", label: "Australian · female C" },
  { name: "en-AU-Standard-D", languageCode: "en-AU", gender: "male", label: "Australian · male D" },
  { name: "en-US-Standard-C", languageCode: "en-US", gender: "female", label: "American · female C" },
  { name: "en-US-Standard-D", languageCode: "en-US", gender: "male", label: "American · male D" },
];

/** Google's limit is 5,000 bytes of input per request; this leaves room for the SSML markup. */
export const TTS_MAX_SEGMENT_BYTES = 4500;
/** The pause between speaker turns (SSML <break>). */
export const TTS_PAUSE_MS = 500;
/** Pauses on by default; the function's LISTENING_TTS_SSML=0 turns them off. */
export const TTS_SSML_DEFAULT = true;
/** One sample rate for every voice, so the joined MP3 is one stream. */
export const TTS_SAMPLE_RATE = 24000;
/** Characters a test may send to TTS in total (all sections, all regenerations). LISTENING_TTS_TEST_CHAR_LIMIT overrides. */
export const TTS_CHAR_LIMIT_PER_TEST = 100_000;
/** Google's price for Standard voices, US$ per million characters (after 4M free a month). */
export const TTS_USD_PER_MILLION_CHARS = 4;
/** Bump when the way requests are built changes, so cached audio is regenerated. */
export const TTS_PLAN_VERSION = 1;
export const CONVERSATION_SECTIONS: readonly number[] = [1, 3];

export const isStandardVoice = (name: string) => /^[a-z]{2,3}-[A-Z]{2}-Standard-[A-Z]$/.test(name);
export const voiceByName = (name: string) => TTS_VOICES.find((v) => v.name === name) ?? null;
export const estimateCostUsd = (chars: number) => (chars / 1_000_000) * TTS_USD_PER_MILLION_CHARS;

// ── Speaker labels ──────────────────────────────────────────────────────────────────────────
/**
 * "Man: …", "WOMAN: …", "Speaker 1: …", "Dr Smith: …", "**Tutor:** …". Every word of the label
 * is capitalised (or a number), at most 4 words, so "There are two options: …" isn't a label.
 */
const LABEL = /^\s*(?:\*\*|__)?([A-Z][A-Za-z.'’-]*(?:\s+(?:[A-Z][A-Za-z.'’-]*|\d{1,2})){0,3})(?:\*\*|__)?\s*:(?:\*\*|__)?(?:\s+(.*))?$/;
const NOT_SPEAKERS = new Set(["note", "notes", "example", "answer", "answers", "question", "questions", "section", "part", "transcript", "audioscript", "tapescript", "recording", "audio", "key"]);
const MALE = new Set(["man", "male", "mr", "boy", "father", "dad", "husband", "son", "brother", "gentleman", "sir", "he", "him"]);
const FEMALE = new Set(["woman", "female", "mrs", "ms", "miss", "girl", "mother", "mum", "mom", "wife", "daughter", "sister", "lady", "madam", "she", "her"]);

export type Speaker = { key: string; label: string; gender: TtsGender | null };
export type Turn = { key: string; text: string };
export type ParsedTranscript = { turns: Turn[]; speakers: Speaker[]; labelled: boolean };

/** The label → its key (case and spacing don't matter: "MAN" and "Man" are one speaker). */
export const speakerKey = (label: string) => label.toLowerCase().replace(/\s+/g, " ").replace(/\.$/, "").trim();

function speakerGender(label: string): TtsGender | null {
  const first = speakerKey(label).split(" ")[0]!.replace(/\./g, "");
  return MALE.has(first) ? "male" : FEMALE.has(first) ? "female" : null;
}

/** A label at the start of a line, or null. */
export function speakerLabel(line: string): { label: string; rest: string } | null {
  const m = line.match(LABEL);
  if (!m) return null;
  const label = m[1]!.trim();
  if (NOT_SPEAKERS.has(speakerKey(label).split(" ")[0]!)) return null;
  return { label, rest: (m[2] ?? "").trim() };
}

/** What's read aloud: markdown emphasis, [stage directions] and question markers "(Q3)" removed. */
export function speakableText(line: string): string {
  return line
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/\(\s*Q\s*\d{1,2}\s*\)/gi, " ")
    .replace(/(\*\*|__)(.+?)\1/g, "$2")
    .replace(/(^|[\s(])[*_]([^*_]+)[*_](?=[\s).,;:!?]|$)/g, "$1$2")
    .replace(/^#{1,6}\s+/, "")
    .replace(/\s+/g, " ")
    .trim();
}

const NARRATOR: Speaker = { key: "narrator", label: "Narrator", gender: null };

/**
 * The transcript as turns, in order. Text before the first label is the narrator's ("You will
 * hear…"); unlabelled lines continue the last speaker's turn. A transcript without any label is
 * one speaker (a monologue).
 */
export function parseSpeakerTurns(transcript: string): ParsedTranscript {
  const turns: Turn[] = [];
  const speakers = new Map<string, Speaker>();
  let current: string | null = null;
  let labelled = false;

  const add = (key: string, text: string) => {
    if (!text) return;
    const last = turns[turns.length - 1];
    if (last && last.key === key) last.text = `${last.text} ${text}`;
    else turns.push({ key, text });
  };

  for (const raw of transcript.replace(/\r\n?/g, "\n").split("\n")) {
    if (!raw.trim()) continue;
    const l = speakerLabel(raw);
    if (l) {
      labelled = true;
      const key = speakerKey(l.label);
      if (!speakers.has(key)) speakers.set(key, { key, label: l.label.replace(/\s+/g, " "), gender: speakerGender(l.label) });
      current = key;
      add(key, speakableText(l.rest));
      continue;
    }
    const key = current ?? NARRATOR.key;
    if (key === NARRATOR.key && !speakers.has(key)) speakers.set(key, NARRATOR);
    add(key, speakableText(raw));
  }
  // Order speakers as they first speak.
  const order = [...new Set(turns.map((t) => t.key))];
  return { turns, speakers: order.map((k) => speakers.get(k)!), labelled };
}

// ── Voices ──────────────────────────────────────────────────────────────────────────────────
const FEMALE_POOL = ["en-GB-Standard-A", "en-AU-Standard-C", "en-GB-Standard-C", "en-GB-Standard-F", "en-AU-Standard-A", "en-US-Standard-C"];
const MALE_POOL = ["en-GB-Standard-B", "en-AU-Standard-B", "en-GB-Standard-D", "en-AU-Standard-D", "en-US-Standard-D"];
/** A monologue's default voice: section 2 female, section 4 male (variety across the test). */
const MONOLOGUE_DEFAULT: Record<number, string> = { 2: "en-GB-Standard-A", 4: "en-GB-Standard-D" };

/**
 * Speaker → voice: the admin's choice when it's an offered Standard voice, else a default, each
 * speaker a different voice. Men get male voices and women female ones; other labels alternate,
 * starting female.
 */
export function effectiveVoices(speakers: readonly Speaker[], chosen: Record<string, unknown>, section: number): Record<string, string> {
  const out: Record<string, string> = {};
  const used = new Set<string>();
  for (const s of speakers) {
    const c = chosen[s.key];
    if (typeof c === "string" && isStandardVoice(c) && voiceByName(c)) {
      out[s.key] = c;
      used.add(c);
    }
  }
  let alternate: TtsGender = "female";
  // Named speakers first, the narrator (text before the first label) last.
  const order = [...speakers].sort((a, b) => Number(a.key === NARRATOR.key) - Number(b.key === NARRATOR.key));
  for (const s of order) {
    if (out[s.key]) continue;
    if (speakers.length === 1 && MONOLOGUE_DEFAULT[section] && !used.has(MONOLOGUE_DEFAULT[section]!)) {
      out[s.key] = MONOLOGUE_DEFAULT[section]!;
      used.add(out[s.key]!);
      continue;
    }
    let gender = s.gender;
    if (!gender) {
      gender = alternate;
      alternate = alternate === "female" ? "male" : "female";
    }
    const pool = gender === "male" ? MALE_POOL : FEMALE_POOL;
    const voice = pool.find((v) => !used.has(v)) ?? TTS_VOICES.find((v) => !used.has(v.name))?.name ?? pool[0]!;
    out[s.key] = voice;
    used.add(voice);
  }
  return out;
}

// ── Segments ────────────────────────────────────────────────────────────────────────────────
export type Segment = { key: string; voice: string; languageCode: string; ssml: boolean; input: string };
export type AudioPlan = {
  segments: Segment[];
  speakers: Speaker[];
  voices: Record<string, string>;
  /** Characters sent to TTS (SSML markup included: Google bills it). */
  chars: number;
  ssml: boolean;
};
export type PlanResult = { ok: true; plan: AudioPlan } | { ok: false; error: string };

const byteLength = (s: string) => new TextEncoder().encode(s).length;
export const charCount = (s: string) => [...s].length;

/** Splits text into pieces of at most `maxBytes`, at sentence ends, else at spaces. */
export function splitText(text: string, maxBytes = TTS_MAX_SEGMENT_BYTES): string[] {
  if (byteLength(text) <= maxBytes) return [text];
  const sentences = text.match(/[^.!?]+(?:[.!?]+["”’)]*|$)\s*/g) ?? [text];
  const out: string[] = [];
  let cur = "";
  const push = () => {
    if (cur.trim()) out.push(cur.trim());
    cur = "";
  };
  for (const s of sentences) {
    if (byteLength(cur + s) <= maxBytes) {
      cur += s;
      continue;
    }
    push();
    if (byteLength(s) <= maxBytes) {
      cur = s;
      continue;
    }
    // One very long sentence: by words.
    for (const w of s.split(/(\s+)/)) {
      if (byteLength(cur + w) > maxBytes) push();
      cur += w;
    }
  }
  push();
  return out;
}

const escapeSsml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");

/**
 * The TTS requests for one section: one per speaker turn (long turns split), the label stripped,
 * the speaker's voice, and with SSML a pause after each turn but the last.
 */
export function planSectionAudio(opts: { transcript: string; section: number; voices?: Record<string, unknown>; ssml?: boolean }): PlanResult {
  const ssml = opts.ssml ?? TTS_SSML_DEFAULT;
  const parsed = parseSpeakerTurns(opts.transcript);
  if (!parsed.turns.length) return { ok: false, error: `Write section ${opts.section}'s transcript first.` };
  if (CONVERSATION_SECTIONS.includes(opts.section) && !parsed.labelled) {
    return { ok: false, error: `Section ${opts.section} is a conversation: start each turn with the speaker, e.g. "Man:" or "Woman:".` };
  }
  const voices = effectiveVoices(parsed.speakers, opts.voices ?? {}, opts.section);
  const segments: Segment[] = [];
  parsed.turns.forEach((turn, i) => {
    const voice = voices[turn.key]!;
    const pieces = splitText(turn.text);
    pieces.forEach((piece, j) => {
      const pause = ssml && j === pieces.length - 1 && i < parsed.turns.length - 1;
      const input = ssml ? `<speak>${escapeSsml(piece)}${pause ? `<break time="${TTS_PAUSE_MS}ms"/>` : ""}</speak>` : piece;
      segments.push({ key: turn.key, voice, languageCode: voiceByName(voice)?.languageCode ?? voice.slice(0, 5), ssml, input });
    });
  });
  return { ok: true, plan: { segments, speakers: parsed.speakers, voices, chars: segments.reduce((n, s) => n + charCount(s.input), 0), ssml } };
}

const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");

/** SHA-256 of exactly what would be sent: same transcript, voices and pauses → same hash. */
export async function audioHash(plan: Pick<AudioPlan, "segments">): Promise<string> {
  const body = JSON.stringify({ v: TTS_PLAN_VERSION, rate: TTS_SAMPLE_RATE, s: plan.segments.map((s) => [s.voice, s.input]) });
  return hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(body)));
}

/** The saved section already has this exact generated audio: return it, no TTS call. */
export function cachedAudio(section: { audio_url: string | null; audio_source: string | null; audio_hash: string | null }, hash: string): boolean {
  return !!section.audio_url && section.audio_source === "generated" && section.audio_hash === hash;
}

/** Whether a generation of `chars` fits the test's character budget. */
export function withinLimit(usedChars: number, chars: number, limit = TTS_CHAR_LIMIT_PER_TEST): boolean {
  return usedChars + chars <= limit;
}

// ── MP3 ─────────────────────────────────────────────────────────────────────────────────────
const BITRATES_V1_L3 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320];
const BITRATES_V2_L3 = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160];
const RATES: Record<number, number[]> = { 3: [44100, 48000, 32000], 2: [22050, 24000, 16000], 0: [11025, 12000, 8000] };

/** An MPEG Layer III frame header at `i`: its length in bytes and duration in seconds, or null. */
function frameAt(b: Uint8Array, i: number): { length: number; seconds: number } | null {
  if (i + 4 > b.length || b[i] !== 0xff || (b[i + 1]! & 0xe0) !== 0xe0) return null;
  const version = (b[i + 1]! >> 3) & 0b11; // 3 = MPEG1, 2 = MPEG2, 0 = MPEG2.5
  const layer = (b[i + 1]! >> 1) & 0b11; // 1 = Layer III
  const bitrateIndex = b[i + 2]! >> 4;
  const rateIndex = (b[i + 2]! >> 2) & 0b11;
  const padding = (b[i + 2]! >> 1) & 1;
  if (version === 1 || layer !== 1 || bitrateIndex === 0 || bitrateIndex === 15 || rateIndex === 3) return null;
  const kbps = (version === 3 ? BITRATES_V1_L3 : BITRATES_V2_L3)[bitrateIndex]!;
  const rate = RATES[version]![rateIndex]!;
  const samples = version === 3 ? 1152 : 576;
  const length = Math.floor(((version === 3 ? 144 : 72) * kbps * 1000) / rate) + padding;
  return length > 4 ? { length, seconds: samples / rate } : null;
}

/** Drops a leading ID3v2 tag (so joined parts are one plain MPEG stream). */
export function stripId3(b: Uint8Array): Uint8Array {
  if (b.length < 10 || b[0] !== 0x49 || b[1] !== 0x44 || b[2] !== 0x33) return b;
  const size = ((b[6]! & 0x7f) << 21) | ((b[7]! & 0x7f) << 14) | ((b[8]! & 0x7f) << 7) | (b[9]! & 0x7f);
  const footer = b[5]! & 0x10 ? 10 : 0;
  return b.subarray(Math.min(b.length, 10 + size + footer));
}

/** Frames and length of an MP3 (Layer III), skipping anything that isn't a frame. */
export function mp3Info(b: Uint8Array): { frames: number; seconds: number } {
  let frames = 0;
  let seconds = 0;
  for (let i = 0; i < b.length; ) {
    const f = frameAt(b, i);
    if (f && i + f.length <= b.length) {
      frames++;
      seconds += f.seconds;
      i += f.length;
    } else i++;
  }
  return { frames, seconds };
}

/** MP3 parts → one MP3 (frames simply follow each other; tags removed). */
export function joinMp3(parts: readonly Uint8Array[]): Uint8Array {
  const clean = parts.map(stripId3);
  const out = new Uint8Array(clean.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of clean) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

/** n frames of silence (MPEG1 Layer III, 128 kbps, 44.1 kHz, mono): the TTS stub's audio. */
export function silentMp3(frames: number): Uint8Array {
  const frame = new Uint8Array(417);
  frame.set([0xff, 0xfb, 0x90, 0xc0]);
  const out = new Uint8Array(417 * frames);
  for (let i = 0; i < frames; i++) out.set(frame, i * 417);
  return out;
}

// ── Storage keys ────────────────────────────────────────────────────────────────────────────
/** listening/<test>/section-<n>-<hash16>.mp3: stable for the same audio, new for new audio. */
export const generatedAudioKey = (testId: string, section: number, hash: string) => `listening/${testId}/section-${section}-${hash.slice(0, 16)}.mp3`;

/** The object key of one of this test's recordings from its public URL; null if it isn't ours. */
export function objectKeyFromUrl(url: string | null, publicBase: string, testId: string): string | null {
  if (!url) return null;
  const base = publicBase.replace(/\/+$/, "");
  if (!url.startsWith(`${base}/`)) return null;
  const key = decodeURIComponent(url.slice(base.length + 1).split(/[?#]/)[0]!);
  return key.startsWith(`listening/${testId}/`) && !key.includes("..") ? key : null;
}

// ── The generation ──────────────────────────────────────────────────────────────────────────
export type SavedAudio = { audio_url: string; duration_sec: number; audio_hash: string; audio_chars: number };

export interface GenerationDeps {
  /** One TTS request → MP3 bytes. Throws on failure (after its own retries). */
  synthesize(segment: Segment): Promise<Uint8Array>;
  /** Uploads the whole file in one request; returns its public URL. */
  putObject(key: string, bytes: Uint8Array): Promise<string>;
  deleteObject(key: string): Promise<void>;
  /** Saves the new audio on the section. Throws on failure. */
  saveSection(audio: SavedAudio): Promise<void>;
  log(event: Record<string, unknown>): void;
  concurrency?: number;
}

export type GenerationResult = SavedAudio & { key: string; requests: number };

async function inPool<T, R>(items: readonly T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]!);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

/**
 * Synthesizes every segment, joins them, uploads ONE file, saves it on the section, then removes
 * the previous file. A failed segment throws before anything is uploaded; a failed save removes
 * the new upload, so the section and the bucket stay as they were.
 */
export async function runGeneration(
  plan: AudioPlan,
  ctx: { testId: string; section: number; hash: string; previousKey: string | null },
  deps: GenerationDeps,
): Promise<GenerationResult> {
  const started = Date.now();
  const parts = await inPool(plan.segments, deps.concurrency ?? 4, (s) => deps.synthesize(s));
  const bytes = joinMp3(parts);
  const { frames, seconds } = mp3Info(bytes);
  if (!frames) throw new Error("The speech service returned no audio.");
  const key = generatedAudioKey(ctx.testId, ctx.section, ctx.hash);
  const audio_url = await deps.putObject(key, bytes);
  const saved: SavedAudio = { audio_url, duration_sec: Math.min(3600, Math.max(1, Math.round(seconds))), audio_hash: ctx.hash, audio_chars: plan.chars };
  try {
    await deps.saveSection(saved);
  } catch (e) {
    await deps.deleteObject(key).catch(() => undefined);
    throw e;
  }
  if (ctx.previousKey && ctx.previousKey !== key) {
    await deps.deleteObject(ctx.previousKey).catch((e) => deps.log({ event: "tts_old_audio_not_deleted", key: ctx.previousKey, error: String(e) }));
  }
  deps.log({
    event: "tts_generated",
    test_id: ctx.testId,
    section: ctx.section,
    chars: plan.chars,
    requests: plan.segments.length,
    voices: plan.voices,
    ssml: plan.ssml,
    seconds: saved.duration_sec,
    bytes: bytes.length,
    cost_usd: Number(estimateCostUsd(plan.chars).toFixed(4)),
    ms: Date.now() - started,
  });
  return { ...saved, key, requests: plan.segments.length };
}
