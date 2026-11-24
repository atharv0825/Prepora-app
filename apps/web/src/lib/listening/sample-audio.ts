// Stand-in recordings for the sample Listening test (not production): a WAV of soft tones per
// part, generated on request, so the player can be exercised without real audio (real
// recordings come from R2, M5-B1). Part n opens with n beeps, so you can hear which part plays.

const RATE = 8000; // Hz, 8-bit mono: ~8 KB per second

/** A mono 8-bit PCM WAV of `seconds` length for part `part` (1–4). */
export function sampleWav(part: number, seconds: number): Uint8Array<ArrayBuffer> {
  const samples = Math.round(RATE * seconds);
  const out = new Uint8Array(new ArrayBuffer(44 + samples));
  const view = new DataView(out.buffer);
  const ascii = (offset: number, s: string) => [...s].forEach((c, i) => view.setUint8(offset + i, c.charCodeAt(0)));
  ascii(0, "RIFF");
  view.setUint32(4, 36 + samples, true);
  ascii(8, "WAVE");
  ascii(12, "fmt ");
  view.setUint32(16, 16, true); // fmt chunk size
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, RATE, true);
  view.setUint32(28, RATE, true); // byte rate
  view.setUint16(32, 1, true); // block align
  view.setUint16(34, 8, true); // bits per sample
  ascii(36, "data");
  view.setUint32(40, samples, true);

  const base = 330 + part * 55;
  for (let i = 0; i < samples; i++) {
    const t = i / RATE;
    let amp: number;
    let freq = base;
    if (t < part * 0.4) {
      // Opening beeps: one per part number.
      amp = t % 0.4 < 0.2 ? 0.5 : 0;
      freq = 880;
    } else {
      // A slow pulse, half a second on, half off.
      amp = t % 1 < 0.5 ? 0.2 * Math.sin(Math.PI * ((t % 1) / 0.5)) : 0;
    }
    out[44 + i] = 128 + Math.round(127 * amp * Math.sin(2 * Math.PI * freq * t));
  }
  return out;
}

/** Parse "bytes=a-b" against a body of `size` bytes. null = not satisfiable / malformed. */
export function parseRange(header: string | null, size: number): { start: number; end: number } | null {
  const m = header?.match(/^bytes=(\d*)-(\d*)$/);
  if (!m || (m[1] === "" && m[2] === "")) return null;
  let start: number;
  let end: number;
  if (m[1] === "") {
    // Suffix: the last N bytes.
    start = Math.max(0, size - Number(m[2]));
    end = size - 1;
  } else {
    start = Number(m[1]);
    end = m[2] === "" ? size - 1 : Math.min(Number(m[2]), size - 1);
  }
  return start <= end && start < size ? { start, end } : null;
}
