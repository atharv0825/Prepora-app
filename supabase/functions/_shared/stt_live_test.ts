// One real Groq Whisper call (M7-B1): checks the key, the multipart request and the verbose_json
// reply shape. Skipped unless run with GROQ_API_KEY and network access (never in CI). Sends a
// generated 2-second WAV (a tone, so there may be no words): bills the 10-second minimum (~$0.0001).
// Also transcribes the two browser-format fixtures (M7-B4: Chrome WebM/Opus, Safari MP4/AAC), about
// 12 s of synthetic speech each, to confirm Whisper reads both with word timings (~$0.0002 more).
// Run from supabase/functions (Deno 2):
//   deno test --frozen --env-file=.env --allow-env --allow-net=api.groq.com --allow-read=_eval _shared/stt_live_test.ts
import { sniffAudioType, transcribe } from "./stt.ts";

function ready(): boolean {
  const env = Deno.permissions.querySync({ name: "env", variable: "GROQ_API_KEY" }).state === "granted";
  const net = Deno.permissions.querySync({ name: "net", host: "api.groq.com" }).state === "granted";
  return env && net && Boolean(Deno.env.get("GROQ_API_KEY"));
}

/** A 2 s, 16 kHz mono, 16-bit PCM WAV of a quiet 440 Hz tone. */
function wav(): Blob {
  const rate = 16_000;
  const samples = rate * 2;
  const buf = new DataView(new ArrayBuffer(44 + samples * 2));
  const str = (o: number, s: string) => [...s].forEach((c, i) => buf.setUint8(o + i, c.charCodeAt(0)));
  str(0, "RIFF");
  buf.setUint32(4, 36 + samples * 2, true);
  str(8, "WAVEfmt ");
  buf.setUint32(16, 16, true);
  buf.setUint16(20, 1, true);
  buf.setUint16(22, 1, true);
  buf.setUint32(24, rate, true);
  buf.setUint32(28, rate * 2, true);
  buf.setUint16(32, 2, true);
  buf.setUint16(34, 16, true);
  str(36, "data");
  buf.setUint32(40, samples * 2, true);
  for (let i = 0; i < samples; i++) buf.setInt16(44 + i * 2, Math.round(Math.sin((2 * Math.PI * 440 * i) / rate) * 3000), true);
  return new Blob([buf.buffer], { type: "audio/wav" });
}

Deno.test({
  name: "live: Groq whisper-large-v3-turbo answers verbose_json with timings",
  ignore: !ready(),
  fn: async () => {
    const t = await transcribe({ audio: wav(), mimeType: "audio/wav", timeoutMs: 30_000 });
    if (!(t.duration_sec > 1.5 && t.duration_sec < 2.5)) throw new Error(`duration ${t.duration_sec}`);
    console.log(JSON.stringify({ text: t.text, words: t.words.length, segments: t.segments.length, usage: t.usage }));
  },
});

for (const file of ["chrome-opus.webm", "safari-aac.mp4"]) {
  Deno.test({
    name: `live (M7-B4): Whisper reads ${file} with word timings`,
    ignore: !ready() || Deno.permissions.querySync({ name: "read", path: "_eval" }).state !== "granted",
    fn: async () => {
      const bytes = await Deno.readFile(new URL(`../_eval/speaking/fixtures/${file}`, import.meta.url));
      const type = sniffAudioType(bytes)!;
      const t = await transcribe({ audio: new Blob([bytes], { type }), mimeType: type, timeoutMs: 30_000 });
      const text = t.text.toLowerCase();
      for (const w of ["beach", "hometown", "volleyball", "peaceful"]) if (!text.includes(w)) throw new Error(`"${w}" missing: ${t.text}`);
      if (t.words.length < 20 || !(t.words.at(-1)!.end > 5)) throw new Error(`words: ${t.words.length}, last ends ${t.words.at(-1)?.end}`);
      console.log(file, JSON.stringify({ text: t.text, words: t.words.length, duration: t.duration_sec, kept_um: /um/i.test(t.text) }));
    },
  });
}
