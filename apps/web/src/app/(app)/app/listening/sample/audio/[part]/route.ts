import { appEnvironment } from "@prepora/shared/observability";
import { SAMPLE_SECTION_COUNT, sampleSeconds } from "@/lib/listening/sample";
import { parseRange, sampleWav } from "@/lib/listening/sample-audio";

// The sample test's stand-in recordings (see ../../page.tsx): GET /app/listening/sample/audio/2?sec=20
// → a WAV of tones. Answers Range requests (206) like a CDN, so seeking works the same way it
// will with R2. 404 in production.
export async function GET(request: Request, { params }: RouteContext<"/app/listening/sample/audio/[part]">) {
  const url = new URL(request.url);
  if (appEnvironment(url.hostname) === "production") return new Response(null, { status: 404 });
  const part = Number((await params).part);
  if (!Number.isInteger(part) || part < 1 || part > SAMPLE_SECTION_COUNT) return new Response(null, { status: 404 });

  const body = sampleWav(part, sampleSeconds(url.searchParams.get("sec") ?? undefined));
  const common = { "content-type": "audio/wav", "accept-ranges": "bytes", "cache-control": "private, max-age=3600" };
  const rangeHeader = request.headers.get("range");
  if (!rangeHeader) return new Response(body, { headers: { ...common, "content-length": String(body.length) } });

  const range = parseRange(rangeHeader, body.length);
  if (!range) return new Response(null, { status: 416, headers: { "content-range": `bytes */${body.length}` } });
  const slice = body.slice(range.start, range.end + 1);
  return new Response(slice, {
    status: 206,
    headers: { ...common, "content-length": String(slice.length), "content-range": `bytes ${range.start}-${range.end}/${body.length}` },
  });
}
