// One real Gemini speech-to-text call (stt.ts): checks the key, the request, the JSON reply and the
// audio token count. Skipped unless run with GEMINI_API_KEY and network access (never in CI). Sends
// a generated 2-second WAV (a tone, so there may be no words), then the two browser-format fixtures
// (M7-B4: Chrome WebM/Opus, Safari MP4/AAC), about 12 s of synthetic speech each, to confirm Gemini
// reads both: WebM and MP4 aren't on the Gemini API's documented audio list. Well under a cent.
// Run from supabase/functions (Deno 2):
//   deno test --frozen --env-file=.env --allow-env --allow-net=generativelanguage.googleapis.com --allow-read=_eval _shared/stt_live_test.ts
import { sniffAudioType, transcribe } from "./stt.ts";

function ready(): boolean {
  const env = Deno.permissions.querySync({ name: "env", variable: "GEMINI_API_KEY" }).state === "granted";
  const net = Deno.permissions.querySync({ name: "net", host: "generativelanguage.googleapis.com" }).state === "granted";
  return env && net && Boolean(Deno.env.get("GEMINI_API_KEY"));
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
  name: "live: Gemini transcribes a WAV and counts its audio tokens",
  ignore: !ready(),
  fn: async () => {
    const t = await transcribe({ audio: wav(), mimeType: "audio/wav", timeoutMs: 30_000 });
    if (!(t.duration_sec > 1.5 && t.duration_sec < 2.5)) throw new Error(`duration ${t.duration_sec}`);
    console.log(JSON.stringify({ text: t.text, silences: t.silences, usage: t.usage }));
  },
});

for (const file of ["chrome-opus.webm", "safari-aac.mp4"]) {
  Deno.test({
    name: `live (M7-B4): Gemini reads ${file}`,
    ignore: !ready() || Deno.permissions.querySync({ name: "read", path: "_eval" }).state !== "granted",
    fn: async () => {
      const bytes = await Deno.readFile(new URL(`../_eval/speaking/fixtures/${file}`, import.meta.url));
      const type = sniffAudioType(bytes)!;
      const t = await transcribe({ audio: new Blob([bytes], { type }), mimeType: type, timeoutMs: 30_000 });
      const text = t.text.toLowerCase();
      for (const w of ["beach", "hometown", "volleyball", "peaceful"]) if (!text.includes(w)) throw new Error(`"${w}" missing: ${t.text}`);
      if (!(t.duration_sec > 5)) throw new Error(`duration ${t.duration_sec}`);
      console.log(file, JSON.stringify({ text: t.text, duration: t.duration_sec, silences: t.silences, kept_um: /\bum\b/i.test(t.text), usage: t.usage }));
    },
  });
}
