// Speaking prompt evaluation (M7-B5) with accent-diverse recordings: each recording goes through
// exactly what score-speaking does (audio type by its bytes → Gemini speech to text (stt.ts) → signals → the current
// Part 2 prompt and AI, DeepSeek first), and is compared with a human reference:
//   * transcription: word error rate against a verbatim reference transcript, and how many of the
//     reference's fillers ("um", "uh"…) the transcript kept;
//   * scoring: the AI band and Pronunciation band against an IELTS teacher's bands.
// Results are reported per accent, with fairness flags (accentFlags): Pronunciation scored lower,
// or transcription noticeably worse, for one accent than for the others.
//
// Recordings are people's voices: they stay LOCAL and are never committed. Put them in
// _eval/speaking/recordings/ with a manifest _eval/speaking/recordings.local.json (both gitignored;
// format and collection guide: _eval/speaking/README.md). Without it, the two synthetic fixtures
// (fixtures.json) run, which checks the pipeline but says nothing about accents.
//
// Run from supabase/functions with Deno 2 (≈ US$0.005 per recording: Gemini + DeepSeek):
//   deno run --frozen --env-file=.env --allow-env --allow-net=generativelanguage.googleapis.com,api.deepseek.com \
//     --allow-read=_eval --allow-write=_eval/results _eval/speaking_eval.ts [--manifest path] [--dry-run]
import { aiModel, generateJson } from "../_shared/ai.ts";
import { sniffAudioType, transcribe } from "../_shared/stt.ts";
import { buildPart2Request, SPEAKING_SETTINGS } from "../_shared/prompts/speaking.ts";
import { ScoredSpeaking } from "../_shared/speaking_schemas.ts";
import { countFillers, speakingPartBand, speakingSignals } from "../_shared/speaking.ts";
import { accentFlags, type EvalRow, summariseGroup, wordErrorRate } from "./speaking_metrics.ts";

export type Recording = {
  id: string;
  /** e.g. "indian", "nepali", "filipino", "vietnamese" (the plan's set), or any other. */
  accent: string;
  /** Relative to the manifest's folder. */
  file: string;
  card: { title: string; points: string[] };
  /** Verbatim, fillers included, for the error rate and filler retention. */
  reference_transcript?: string;
  /** An IELTS teacher's bands for this answer. */
  expected_band?: number;
  expected_pron?: number;
};

function arg(name: string): string | undefined {
  const i = Deno.args.indexOf(`--${name}`);
  return i >= 0 ? Deno.args[i + 1] : undefined;
}

export function checkManifest(recs: Recording[]): string[] {
  const problems: string[] = [];
  const ids = new Set<string>();
  for (const r of recs) {
    if (ids.has(r.id)) problems.push(`${r.id}: duplicate id`);
    ids.add(r.id);
    if (!r.accent || !r.file) problems.push(`${r.id}: accent and file are required`);
    if (!r.card?.title || !(r.card.points?.length >= 2)) problems.push(`${r.id}: the card needs a title and 2+ points`);
    for (const b of [r.expected_band, r.expected_pron]) {
      if (b !== undefined && !(b >= 0 && b <= 9 && Number.isInteger(b * 2))) problems.push(`${r.id}: ${b} isn't a band`);
    }
  }
  return problems;
}

async function evaluate(r: Recording, dir: URL, dryRun: boolean): Promise<EvalRow> {
  const base: EvalRow = {
    id: r.id, accent: r.accent, wer: null, fillers_ref: r.reference_transcript ? countFillers(r.reference_transcript).reduce((n, f) => n + f.count, 0) : null,
    fillers_kept: null, expected_band: r.expected_band ?? null, ai_band: null, expected_pron: r.expected_pron ?? null, ai_pron: null, cost: 0,
  };
  try {
    const bytes = await Deno.readFile(new URL(r.file, dir));
    const type = sniffAudioType(bytes);
    if (!type) return { ...base, error: "not a recording we can read" };
    if (dryRun) return base;
    const heard = await transcribe({ audio: new Blob([bytes], { type }), mimeType: type });
    const { signals } = speakingSignals({ transcript: heard.text, durationSec: heard.duration_sec, silences: heard.silences });
    const req = buildPart2Request(r.card, heard.text, signals);
    const out = await generateJson({ model: aiModel("scoring"), system: req.system, parts: req.parts, schema: ScoredSpeaking, ...SPEAKING_SETTINGS });
    return {
      ...base,
      wer: r.reference_transcript ? wordErrorRate(r.reference_transcript, heard.text) : null,
      fillers_kept: signals.filler_count,
      ai_band: speakingPartBand(out.data.scores),
      ai_pron: out.data.scores.pron,
      cost: heard.usage.cost_usd + out.usage.cost_usd,
    };
  } catch (err) {
    return { ...base, error: err instanceof Error ? err.message : String(err) };
  }
}

if (import.meta.main) {
  const dryRun = Deno.args.includes("--dry-run");
  const local = new URL("./speaking/recordings.local.json", import.meta.url);
  const fallback = new URL("./speaking/fixtures.json", import.meta.url);
  const given = arg("manifest");
  let manifest = given ? new URL(given, `file://${Deno.cwd()}/`) : local;
  try {
    await Deno.stat(manifest);
  } catch {
    if (given) throw new Error(`No manifest at ${given}`);
    console.log("No recordings.local.json: running the synthetic fixtures (pipeline check only, not accents).");
    manifest = fallback;
  }
  const recs = JSON.parse(await Deno.readTextFile(manifest)) as Recording[];
  const problems = checkManifest(recs);
  if (problems.length) {
    console.error(problems.join("\n"));
    Deno.exit(2);
  }
  const dir = new URL("./", manifest);
  const rows: EvalRow[] = [];
  for (const r of recs) {
    const row = await evaluate(r, dir, dryRun);
    rows.push(row);
    console.log(`  ${row.id.padEnd(14)} ${row.accent.padEnd(12)} ${row.error ? `ERROR ${row.error}` : dryRun ? "ok (dry)" : `band ${row.ai_band?.toFixed(1)} (exp ${row.expected_band ?? "-"}) pron ${row.ai_pron} (exp ${row.expected_pron ?? "-"}) WER ${row.wer ?? "-"}`}`);
  }
  if (dryRun) {
    console.log(`Dry run OK: ${rows.filter((r) => !r.error).length}/${rows.length} recordings readable.`);
    Deno.exit(rows.some((r) => r.error) ? 1 : 0);
  }
  const byAccent = Object.fromEntries([...new Set(rows.map((r) => r.accent))].sort().map((a) => [a, summariseGroup(rows.filter((r) => r.accent === a))]));
  const overall = summariseGroup(rows);
  const flags = accentFlags(rows);
  console.log("\nOverall", JSON.stringify(overall));
  for (const [a, g] of Object.entries(byAccent)) console.log(`  ${a.padEnd(12)} ${JSON.stringify(g)}`);
  console.log(flags.length ? `\nFAIRNESS FLAGS:\n- ${flags.join("\n- ")}` : "\nNo accent flags.");
  await Deno.mkdir(new URL("./results/", import.meta.url), { recursive: true });
  const out = new URL(`./results/speaking-${new Date().toISOString().replace(/[:.]/g, "-")}.json`, import.meta.url);
  await Deno.writeTextFile(out, JSON.stringify({ at: new Date().toISOString(), overall, byAccent, flags, rows }, null, 2));
  console.log(`Report: ${out.pathname}`);
  Deno.exit(flags.length || rows.some((r) => r.error) ? 1 : 0);
}
