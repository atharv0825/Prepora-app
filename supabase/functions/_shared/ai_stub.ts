// A stand-in for DeepSeek's chat completions API (M6-I1), served by the ai-stub function. CI points
// DEEPSEEK_API_URL at it, so score-writing and ocr-writing run for real (auth, credits, storage,
// saving, refunds) while no AI is called. It is OFF unless AI_STUB=1 (set only in CI's and a
// developer's local functions env): deployed elsewhere it answers 404.
//
// It answers in DeepSeek's shape (choices[0].message.content + usage) with JSON matching what the
// prompt's schema asks for:
//   * scoring (the system prompt is a Writing rubric): deterministic bands from the word count,
//     corrections that quote real mistakes in the answer (so the screen can highlight them), and
//     feedback marked "(Stub AI)";
//   * OCR (the system prompt starts "You transcribe photos"): one fixed page of text per image.
//   * Speaking scoring (the system prompt is the Speaking rubric, M7-B3, M8-B2): bands from the
//     signals, better phrases quoted from the transcript.
//   * The examiner's turn (M8-B1): the next set question, or a follow-up when the last answer
//     contains STUB_FOLLOW_UP.
//   * Groq transcription (a multipart request, M7-B1; GROQ_API_URL points here in CI): a fixed
//     Part 2 transcript with word and segment timings. A marker in the AUDIO BYTES picks a case
//     (score-speaking always sends the file as "answer.<ext>", so the upload's name never reaches
//     here): "STUB_SHORT" → too few words; "STUB_FAIL" → a transcript the scoring stub answers
//     with HTTP 500. Tests put the marker after a real container header (e.g. WebM's 1A 45 DF A3).
// Test hooks, written in the answer: STUB_FAIL → HTTP 500 (exercises the refund path);
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

function reply(content: string, promptChars: number, status = 200): Response {
  const usage = { prompt_tokens: Math.ceil(promptChars / 4), prompt_cache_hit_tokens: 0, prompt_cache_miss_tokens: Math.ceil(promptChars / 4), completion_tokens: Math.ceil(content.length / 4) + 200 };
  return new Response(
    JSON.stringify({ id: "stub", object: "chat.completion", model: "deepseek-flash", choices: [{ index: 0, message: { role: "assistant", content }, finish_reason: "stop" }], usage }),
    { status, headers: { "content-type": "application/json" } },
  );
}

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

/** A verbose_json transcription, words timed one every 0.8 s (≈ 70 s in all), with one 2.5 s pause. */
function transcription(audio: string): Response {
  const text = audio.includes(STUB_SHORT_MARKER)
    ? "Um, the beach."
    : audio.includes(STUB_FAIL_MARKER)
    ? `${STUB_TRANSCRIPT} STUB_FAIL`
    : audio.includes(STUB_FOLLOW_UP_MARKER)
    ? `${STUB_TRANSCRIPT} STUB_FOLLOW_UP`
    : STUB_TRANSCRIPT;
  let t = 0.3;
  const words = text.split(/\s+/).map((word, i) => {
    if (i === 20) t += 2.5;
    const w = { word, start: Math.round(t * 100) / 100, end: Math.round((t + 0.5) * 100) / 100 };
    t += 0.8;
    return w;
  });
  const duration = Math.round((t + 0.5) * 10) / 10;
  return new Response(
    JSON.stringify({
      task: "transcribe",
      language: "english",
      duration,
      text,
      segments: [{ id: 0, seek: 0, start: 0, end: duration, text, tokens: [], temperature: 0, avg_logprob: -0.12, compression_ratio: 1.4, no_speech_prob: 0.01 }],
      words,
      x_groq: { id: "stub" },
    }),
    { headers: { "content-type": "application/json" } },
  );
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

/** The ai-stub function's handler. */
export async function handleStub(req: Request, enabled: boolean): Promise<Response> {
  if (!enabled) return new Response("Not found", { status: 404 });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  if ((req.headers.get("content-type") ?? "").startsWith("multipart/form-data")) {
    const form = await req.formData();
    const file = form.get("file");
    // The markers are ASCII, so a lossy decode of the audio bytes finds them.
    return transcription(file instanceof Blob ? new TextDecoder().decode(await file.arrayBuffer()) : "");
  }
  let body: ChatBody;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: { message: "Invalid JSON", type: "invalid_request_error" } }), { status: 400 });
  }
  const system = String(body.messages?.find((m) => m.role === "system")?.content ?? "");
  const user = body.messages?.find((m) => m.role === "user")?.content ?? [];
  const parts = typeof user === "string" ? [{ type: "text", text: user }] : user;
  const text = parts.map((p) => p.text ?? "").join("\n");
  const promptChars = system.length + text.length;

  if (system.startsWith("You transcribe photos")) {
    const pages = parts.filter((p) => p.type === "image_url").map(() => ({ text: STUB_OCR_PAGE, legibility: "partial" }));
    return reply(JSON.stringify({ pages }), promptChars + pages.length * 4000);
  }

  // examiner-turn (M8-B1): the next set question; a follow-up when the last answer says STUB_FOLLOW_UP.
  if (system.startsWith("You conduct a part of an IELTS Speaking test")) {
    const lastAnswer = [...text.matchAll(/<answer>\n([\s\S]*?)\n<\/answer>/g)].at(-1)?.[1] ?? "";
    const choice = lastAnswer.includes("STUB_FOLLOW_UP")
      ? { action: "follow_up", set_index: null, follow_up: "Why do you feel that way?" }
      : { action: "set", set_index: 0, follow_up: null };
    return reply(JSON.stringify(choice), promptChars);
  }

  if (system.includes("IELTS Speaking examiner")) {
    const transcript = /<transcript>\n([\s\S]*)\n<\/transcript>/.exec(text)?.[1] ?? "";
    if (transcript.includes("STUB_FAIL")) return new Response(JSON.stringify({ error: { message: "stub failure", type: "server_error" } }), { status: 500 });
    const signals = JSON.parse(/Measured signals[^\n]*\n(\{.*\})/.exec(text)?.[1] ?? "{}");
    return reply(JSON.stringify(speaking(transcript, signals)), promptChars);
  }

  const answer = /<answer>\n([\s\S]*)\n<\/answer>/.exec(text)?.[1] ?? "";
  if (answer.includes("STUB_FAIL")) return new Response(JSON.stringify({ error: { message: "stub failure", type: "server_error" } }), { status: 500 });
  if (answer.includes("STUB_BAD_JSON")) return reply("not json", promptChars);
  const minWords = Number(/Minimum: (\d+)\./.exec(text)?.[1] ?? 250);
  return reply(JSON.stringify(scoring(answer, minWords)), promptChars);
}
