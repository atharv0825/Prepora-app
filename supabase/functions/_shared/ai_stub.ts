// A stand-in for the AI providers (M6-I1), served by the ai-stub function. CI points
// DEEPSEEK_API_URL and GEMINI_API_URL at it, so score-writing, ocr-writing, score-speaking and
// examiner-turn run for real (auth, credits, storage, saving, refunds) while no AI is called. It is
// OFF unless AI_STUB=1 (set only in CI's and a developer's local functions env): deployed
// elsewhere it answers 404.
//
// It answers DeepSeek's chat completions (choices[0].message.content + usage) and Gemini's
// generateContent (candidates[0].content.parts + usageMetadata, a ":generateContent" path), with
// JSON matching what the prompt's schema asks for:
//   * Writing scoring (the system prompt is a Writing rubric): deterministic bands from the word
//     count, corrections that quote real mistakes in the answer (so the screen can highlight
//     them), and feedback marked "(Stub AI)";
//   * OCR (Gemini; the system prompt starts "You transcribe photos"): one fixed page per image;
//   * Speaking scoring (the Speaking rubric, M7-B3, M8-B2): bands from the signals, better phrases
//     quoted from the transcript;
//   * the examiner's turn (M8-B1): the next set question, or a follow-up when the last answer
//     contains STUB_FOLLOW_UP;
//   * speech to text (Gemini with an audio part, stt.ts): a fixed Part 2 transcript, about 70 s
//     long (as audio tokens) with one 2.8 s silence. A marker in the AUDIO BYTES picks a case
//     (score-speaking never sends the upload's name): "STUB_SHORT" → too few words; "STUB_FAIL"
//     → a transcript the scoring stub answers with HTTP 500; "STUB_FOLLOW_UP" → the examiner
//     stub asks a follow-up. Tests put the marker after a real container header (WebM's 1A 45 DF A3).
// Test hooks, written in a Writing answer: STUB_FAIL → HTTP 500 (exercises the refund path);
// STUB_BAD_JSON → a reply that isn't JSON (exercises retries, then the refund).

type ChatBody = {
  model?: string;
  messages?: { role: string; content: string | { type: string; text?: string; image_url?: { url: string } }[] }[];
};

const RULES: readonly { find: RegExp; suggestion: string; category: string; explanation: string }[] = [
  { find: /\balot\b/i, suggestion: "a lot", category: "spelling", explanation: "\"A lot\" is two words." },
  { find: /\bpeoples\b/i, suggestion: "people", category: "grammar", explanation: "\"People\" is already plural." },
  { find: /\bdont\b/i, suggestion: "don't", category: "punctuation", explanation: "Contractions need an apostrophe." },
  { find: /\bmore harder\b/i, suggestion: "harder", category: "grammar", explanation: "Use one comparative." },
  { find: /\binformations\b/i, suggestion: "information", category: "grammar", explanation: "\"Information\" is uncountable." },
];

export const STUB_OCR_PAGE =
  "Working from home saves time and money for many employees, and alot of companies now allow it. However, some peoples feel lonely [?] without colleagues.";

const words = (s: string) => s.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;

function scoring(answer: string, minWords: number) {
  const n = words(answer);
  const under = n < minWords;
  const corrections = RULES.flatMap((r) => {
    const hit = r.find.exec(answer);
    return hit ? [{ original: hit[0], suggestion: r.suggestion, category: r.category, explanation: r.explanation }] : [];
  });
  const gra = Math.max(4, 7 - corrections.length * 0.5);
  return {
    scores: { ta: under ? 5 : 6.5, cc: n < 80 ? 4.5 : 6, lr: 6, gra },
    summary: under
      ? `Your answer has ${n} words, under the ${minWords}-word minimum, which lowers your score. (Stub AI)`
      : "A clear answer with a consistent position; grammar slips hold it back. (Stub AI)",
    corrections,
    strengths: ["Your position is clear. (Stub AI)"],
    improvements: ["Check subject–verb agreement. (Stub AI)"],
    model_answer: "Remote working has become widespread, and it benefits both staff and employers when it is managed well. (Stub AI model answer)",
  };
}

export const STUB_TRANSCRIPT =
  "Um, the place I want to talk about is a small beach near my hometown. It is about thirty minutes by bus from my house, and I go there two or three times in a month, " +
  "especially in summer. Usually I go with my friends, you know, and we swim and play volleyball, and the food in the small restaurant is very delicious. " +
  "Uh, I like it because it is very peaceful and I feel very relax there, so it is a special place for me.";

/** Markers a test can put in a recording's bytes to pick the stub's transcription. */
export const STUB_SHORT_MARKER = "STUB_SHORT";
export const STUB_FAIL_MARKER = "STUB_FAIL";
/** In an examiner-turn answer: the examiner stub asks a follow-up (M8-B1). */
export const STUB_FOLLOW_UP_MARKER = "STUB_FOLLOW_UP";

/** The transcription JSON stt.ts asks for, and the recording's length (the stub's words at 0.8 s each, plus the silence). */
function transcription(audio: string): { content: string; seconds: number } {
  const text = audio.includes(STUB_SHORT_MARKER)
    ? "Um, the beach."
    : audio.includes(STUB_FAIL_MARKER)
    ? `${STUB_TRANSCRIPT} STUB_FAIL`
    : audio.includes(STUB_FOLLOW_UP_MARKER)
    ? `${STUB_TRANSCRIPT} STUB_FOLLOW_UP`
    : STUB_TRANSCRIPT;
  const n = text.split(/\s+/).length;
  const silences = n > 20 ? [{ start_sec: 16.3, length_sec: 2.8 }] : [];
  return { content: JSON.stringify({ text, silences }), seconds: Math.round((0.8 + n * 0.8 + (n > 20 ? 2.8 : 0)) * 10) / 10 };
}

function speaking(transcript: string, signals: { duration_sec?: number; filler_count?: number }) {
  const phrases = [
    { find: /\bvery delicious\b/i, better: "absolutely delicious", why: "\"Delicious\" is already strong." },
    { find: /\bfeel very relax\b/i, better: "feel really relaxed", why: "Use the adjective \"relaxed\"." },
    { find: /\btwo or three times in a month\b/i, better: "two or three times a month", why: "Say \"times a month\"." },
  ].flatMap((p) => {
    const hit = p.find.exec(transcript);
    return hit ? [{ original: hit[0], better: p.better, why: p.why }] : [];
  });
  const short = (signals.duration_sec ?? 0) < 60;
  return {
    scores: { fc: short ? 5 : 6, lr: 6, gra: 6, pron: 6.5 },
    summary: `A relevant answer with ${signals.filler_count ?? 0} fillers. (Stub AI)`,
    better_phrases: phrases,
    strengths: ["You covered the card's points. (Stub AI)"],
    improvements: ["Replace fillers with short pauses. (Stub AI)"],
    model_answer: "I'd like to talk about a little cove near my hometown… (Stub AI model answer)",
  };
}

type Answer = { status: number; content: string; promptChars: number; audioSeconds?: number; imageCount?: number };

const failure = (promptChars: number): Answer => ({ status: 500, content: "", promptChars });

/** The fake answer to one request, whichever provider's shape it came in. */
function answer(system: string, text: string, images: number, audio: string | null): Answer {
  const promptChars = system.length + text.length;
  if (audio !== null) {
    const t = transcription(audio);
    return { status: 200, content: t.content, promptChars, audioSeconds: t.seconds };
  }

  if (system.startsWith("You transcribe photos")) {
    const pages = Array.from({ length: images }, () => ({ text: STUB_OCR_PAGE, legibility: "partial" }));
    return { status: 200, content: JSON.stringify({ pages }), promptChars, imageCount: images };
  }

  // examiner-turn (M8-B1): the next set question; a follow-up when the last answer says STUB_FOLLOW_UP.
  if (system.startsWith("You conduct a part of an IELTS Speaking test")) {
    const lastAnswer = [...text.matchAll(/<answer>\n([\s\S]*?)\n<\/answer>/g)].at(-1)?.[1] ?? "";
    const choice = lastAnswer.includes("STUB_FOLLOW_UP")
      ? { action: "follow_up", set_index: null, follow_up: "Why do you feel that way?" }
      : { action: "set", set_index: 0, follow_up: null };
    return { status: 200, content: JSON.stringify(choice), promptChars };
  }

  if (system.includes("IELTS Speaking examiner")) {
    const transcript = /<transcript>\n([\s\S]*)\n<\/transcript>/.exec(text)?.[1] ?? "";
    if (transcript.includes("STUB_FAIL")) return failure(promptChars);
    const signals = JSON.parse(/Measured signals[^\n]*\n(\{.*\})/.exec(text)?.[1] ?? "{}");
    return { status: 200, content: JSON.stringify(speaking(transcript, signals)), promptChars };
  }

  const essay = /<answer>\n([\s\S]*)\n<\/answer>/.exec(text)?.[1] ?? "";
  if (essay.includes("STUB_FAIL")) return failure(promptChars);
  if (essay.includes("STUB_BAD_JSON")) return { status: 200, content: "not json", promptChars };
  const minWords = Number(/Minimum: (\d+)\./.exec(text)?.[1] ?? 250);
  return { status: 200, content: JSON.stringify(scoring(essay, minWords)), promptChars };
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

/** DeepSeek's chat completions shape. */
function deepseekReply(a: Answer): Response {
  if (a.status !== 200) return json({ error: { message: "stub failure", type: "server_error" } }, a.status);
  const prompt = Math.ceil(a.promptChars / 4) + (a.imageCount ?? 0) * 1000;
  return json({
    id: "stub",
    object: "chat.completion",
    model: "deepseek-flash",
    choices: [{ index: 0, message: { role: "assistant", content: a.content }, finish_reason: "stop" }],
    usage: { prompt_tokens: prompt, prompt_cache_hit_tokens: 0, prompt_cache_miss_tokens: prompt, completion_tokens: Math.ceil(a.content.length / 4) + 200 },
  });
}

/** Gemini's generateContent shape, with audio tokens counted at 32 per second. */
function geminiReply(a: Answer): Response {
  if (a.status !== 200) return json({ error: { code: a.status, message: "stub failure", status: "INTERNAL" } }, a.status);
  const audio = Math.round((a.audioSeconds ?? 0) * 32);
  const image = (a.imageCount ?? 0) * 1100;
  const text = Math.ceil(a.promptChars / 4);
  const details = [{ modality: "TEXT", tokenCount: text }, ...(audio ? [{ modality: "AUDIO", tokenCount: audio }] : []), ...(image ? [{ modality: "IMAGE", tokenCount: image }] : [])];
  return json({
    candidates: [{ content: { role: "model", parts: [{ text: a.content }] }, finishReason: "STOP", index: 0 }],
    usageMetadata: { promptTokenCount: text + audio + image, candidatesTokenCount: Math.ceil(a.content.length / 4) + 50, promptTokensDetails: details },
    modelVersion: "stub",
  });
}

type GeminiBody = {
  systemInstruction?: { parts?: { text?: string }[] };
  contents?: { parts?: { text?: string; inlineData?: { mimeType: string; data: string } }[] }[];
};

/** The markers are ASCII, so a lossy decode of the audio bytes finds them. */
function decodeAudio(base64: string): string {
  try {
    return new TextDecoder().decode(Uint8Array.from(atob(base64), (c) => c.charCodeAt(0)));
  } catch {
    return "";
  }
}

/** The ai-stub function's handler. */
export async function handleStub(req: Request, enabled: boolean): Promise<Response> {
  if (!enabled) return new Response("Not found", { status: 404 });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  let body: ChatBody & GeminiBody;
  try {
    body = await req.json();
  } catch {
    return json({ error: { message: "Invalid JSON", type: "invalid_request_error" } }, 400);
  }

  if (new URL(req.url).pathname.endsWith(":generateContent") || body.contents) {
    const system = (body.systemInstruction?.parts ?? []).map((p) => p.text ?? "").join("\n");
    const parts = (body.contents ?? []).flatMap((c) => c.parts ?? []);
    const text = parts.map((p) => p.text ?? "").join("\n");
    const media = parts.flatMap((p) => (p.inlineData ? [p.inlineData] : []));
    const audio = media.find((m) => m.mimeType.startsWith("audio/"));
    return geminiReply(answer(system, text, media.filter((m) => m.mimeType.startsWith("image/")).length, audio ? decodeAudio(audio.data) : null));
  }

  const system = String(body.messages?.find((m) => m.role === "system")?.content ?? "");
  const user = body.messages?.find((m) => m.role === "user")?.content ?? [];
  const parts = typeof user === "string" ? [{ type: "text", text: user }] : user;
  const text = parts.map((p) => p.text ?? "").join("\n");
  return deepseekReply(answer(system, text, parts.filter((p) => p.type === "image_url").length, null));
}
