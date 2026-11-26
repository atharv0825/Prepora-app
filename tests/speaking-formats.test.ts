// M7-B4: recordings as browsers make them. The fixtures were made from the same synthetic speech
// (espeak-ng) and encoded like each browser's MediaRecorder: Chrome/Edge/Android → Opus in WebM;
// Safari/iOS → AAC in fragmented MP4 (ffmpeg -movflags frag_keyframe+empty_moov+default_base_moof).
// score-speaking reads the container from the first bytes, whatever type the upload was given.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { sniffAudioType } from "../supabase/functions/_shared/audio";

const fixture = (name: string) => new Uint8Array(readFileSync(new URL(`../supabase/functions/_eval/speaking/fixtures/${name}`, import.meta.url)));

describe("browser recordings", () => {
  it("Chrome's WebM/Opus is read as WebM", () => {
    expect(sniffAudioType(fixture("chrome-opus.webm"))).toBe("audio/webm");
  });
  it("Safari's fragmented MP4/AAC is read as MP4 (sent to Gemini as audio/mp4)", () => {
    const mp4 = fixture("safari-aac.mp4");
    expect(sniffAudioType(mp4)).toBe("audio/mp4");
    // Fragmented, as Safari records: a movie fragment box after the header.
    expect(Buffer.from(mp4).includes(Buffer.from("moof"))).toBe(true);
  });
  it("a mislabelled or truncated upload is still read by its bytes, or refused", () => {
    expect(sniffAudioType(fixture("chrome-opus.webm").slice(0, 4))).toBe("audio/webm");
    expect(sniffAudioType(new TextEncoder().encode("not audio at all"))).toBeNull();
  });
});
