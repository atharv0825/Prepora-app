// Audio containers (M7-B4). Pure TypeScript with NO imports, so vitest can test it on the real
// recordings in _eval/speaking/fixtures (tests/speaking-formats.test.ts); stt.ts re-exports it.
/**
 * The real container of a recording, from its first bytes (M7-B4), whatever type it was uploaded
 * with: browsers label MediaRecorder output inconsistently ("audio/webm;codecs=opus", "video/mp4",
 * or nothing), and Gemini is told the type we read here.
 *   WebM/Matroska 1A 45 DF A3 (Chrome, Edge, Firefox, Android) · MP4 "ftyp" at byte 4 (Safari, iOS:
 *   fragmented MP4 with AAC) · Ogg "OggS" · WAV "RIFF…WAVE" · MP3 "ID3" or an MPEG frame sync ·
 *   AAC ADTS FF F1/F9. Null when it's none of these.
 */
export function sniffAudioType(bytes: Uint8Array): string | null {
  const at = (i: number, ...b: number[]) => b.every((v, j) => bytes[i + j] === v);
  const ascii = (i: number, s: string) => at(i, ...[...s].map((c) => c.charCodeAt(0)));
  if (bytes.length < 4) return null;
  if (at(0, 0x1a, 0x45, 0xdf, 0xa3)) return "audio/webm";
  if (bytes.length >= 8 && ascii(4, "ftyp")) return "audio/mp4";
  if (ascii(0, "OggS")) return "audio/ogg";
  if (bytes.length >= 12 && ascii(0, "RIFF") && ascii(8, "WAVE")) return "audio/wav";
  if (ascii(0, "ID3")) return "audio/mpeg";
  if (bytes[0] === 0xff && (bytes[1]! & 0xf6) === 0xf0) return "audio/aac"; // ADTS: FF F1 / F9
  if (bytes[0] === 0xff && (bytes[1]! & 0xe0) === 0xe0) return "audio/mpeg"; // MPEG audio frame
  return null;
}
