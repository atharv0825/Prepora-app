// Writing prompt evaluation (M6-B5): scores the answers in writing_essays.ts (plus the optional,
// gitignored writing_essays.local.json) with the CURRENT production prompts and settings
// (_shared/prompts/writing.ts, the same code score-writing runs) and compares the AI band with the
// target band. Target: most answers (≥ 75%) within ±0.5.
//
// Run from supabase/functions with Deno 2 (DeepSeek: about US$0.005 per answer, ≈ $0.10 for the set):
//
//   deno run --frozen --env-file=.env --allow-env --allow-net=api.deepseek.com,generativelanguage.googleapis.com \
//     --allow-read=_eval --allow-write=_eval/results \
//     _eval/writing_eval.ts [--only t2|t1_general|t1_academic] [--limit N] [--concurrency N]
//                           [--provider deepseek|gemini] [--thinking off|low|high]
//
//   --dry-run   check the set and build every request, without calling the model (no key needed)
//
// Writes a JSON report to _eval/results/ (gitignored) and exits 1 when under the target, so a
// prompt change can be compared with the previous version before it's released.
import { aiModel, type AiProvider, generateJson, type Thinking } from "../_shared/ai.ts";
import { buildScoringRequest, SCORING_PROMPTS, SCORING_SETTINGS, type WritingTaskKind } from "../_shared/prompts/writing.ts";
import { countEssayWords, isHalfBand, writingTaskBand, type WritingScores } from "../_shared/writing.ts";
import { ScoredWriting } from "../_shared/writing_schemas.ts";
import { ESSAYS, type EvalEssay } from "./writing_essays.ts";

const TARGET_WITHIN = 0.75;

function arg(name: string): string | undefined {
  const i = Deno.args.indexOf(`--${name}`);
  return i >= 0 ? Deno.args[i + 1] : undefined;
}
const dryRun = Deno.args.includes("--dry-run");
const only = arg("only") as WritingTaskKind | undefined;
const limit = Number(arg("limit") ?? Infinity);
const concurrency = Math.max(1, Number(arg("concurrency") ?? 2));
const model = aiModel("scoring", arg("provider") as AiProvider | undefined);
const thinking = (arg("thinking") as Thinking | undefined) ?? SCORING_SETTINGS.thinking;

async function loadEssays(): Promise<EvalEssay[]> {
  let local: EvalEssay[] = [];
  try {
    local = JSON.parse(await Deno.readTextFile(new URL("./writing_essays.local.json", import.meta.url)));
    console.log(`+ ${local.length} local essays (writing_essays.local.json)`);
  } catch (err) {
    if (!(err instanceof Deno.errors.NotFound)) throw err;
  }
  return [...ESSAYS, ...local].filter((e) => !only || e.kind === only).slice(0, limit);
}

/** The set must be usable: unique ids, real bands, kinds the prompts know, non-empty answers. */
export function checkSet(essays: EvalEssay[]): string[] {
  const problems: string[] = [];
  const ids = new Set<string>();
  for (const e of essays) {
    if (ids.has(e.id)) problems.push(`${e.id}: duplicate id`);
    ids.add(e.id);
    if (!(e.kind in SCORING_PROMPTS)) problems.push(`${e.id}: unknown kind ${e.kind}`);
    if (!isHalfBand(e.expected_band)) problems.push(`${e.id}: expected_band ${e.expected_band} isn't a band`);
    if (!e.prompt.trim() || !e.essay.trim()) problems.push(`${e.id}: empty prompt or essay`);
  }
  return problems;
}

type Row = { id: string; kind: string; words: number; expected: number; ai?: number; diff?: number; scores?: WritingScores; error?: string; cost: number };

async function scoreOne(e: EvalEssay): Promise<Row> {
  const taskNo = e.kind === "t2" ? 2 : 1;
  const testType = e.kind === "t1_academic" ? "academic" : e.kind === "t1_general" ? "general" : null;
  const req = buildScoringRequest({ taskNo, testType, prompt: e.prompt }, e.essay);
  const base = { id: e.id, kind: e.kind, words: countEssayWords(e.essay), expected: e.expected_band, cost: 0 };
  if (dryRun) return base;
  try {
    const out = await generateJson({ model, system: req.system, parts: req.parts, schema: ScoredWriting, ...SCORING_SETTINGS, thinking });
    const ai = writingTaskBand(out.data.scores);
    return { ...base, ai, diff: ai - e.expected_band, scores: out.data.scores, cost: out.usage.cost_usd };
  } catch (err) {
    const cost = (err as { usage?: { cost_usd?: number } }).usage?.cost_usd ?? 0;
    return { ...base, error: err instanceof Error ? err.message : String(err), cost };
  }
}

async function pool<T, R>(items: T[], n: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
      const r = out[i] as unknown as Row;
      console.log(`  ${r.id.padEnd(8)} expected ${r.expected.toFixed(1)}  ai ${r.ai?.toFixed(1) ?? (dryRun ? "(dry)" : "ERR")}${r.error ? `  ${r.error}` : ""}`);
    }
  }));
  return out;
}

/** Summary numbers for a set of scored rows. */
export function summarise(rows: Row[]) {
  const scored = rows.filter((r) => r.diff !== undefined);
  const n = scored.length;
  const within = scored.filter((r) => Math.abs(r.diff!) <= 0.5).length;
  const mae = n ? scored.reduce((s, r) => s + Math.abs(r.diff!), 0) / n : 0;
  const bias = n ? scored.reduce((s, r) => s + r.diff!, 0) / n : 0;
  return {
    scored: n,
    errors: rows.length - n,
    within_half_band: within,
    within_rate: n ? within / n : 0,
    exact: scored.filter((r) => r.diff === 0).length,
    mean_abs_error: Math.round(mae * 100) / 100,
    bias: Math.round(bias * 100) / 100,
    worst: [...scored].sort((a, b) => Math.abs(b.diff!) - Math.abs(a.diff!)).slice(0, 3).map((r) => `${r.id} (${r.diff! > 0 ? "+" : ""}${r.diff})`),
    cost_usd: Math.round(rows.reduce((s, r) => s + r.cost, 0) * 10000) / 10000,
  };
}

if (import.meta.main) {
  const essays = await loadEssays();
  const problems = checkSet(essays);
  if (problems.length) {
    console.error(problems.join("\n"));
    Deno.exit(2);
  }
  const versions = [...new Set(essays.map((e) => SCORING_PROMPTS[e.kind].version))].join(", ");
  console.log(`Writing eval: ${essays.length} answers, prompts ${versions}, model ${model.provider} ${model.model}, thinking ${thinking ?? "default"}${dryRun ? " (dry run)" : ""}`);
  const rows = await pool(essays, concurrency, scoreOne);
  if (dryRun) {
    console.log(`Dry run OK: ${rows.length} requests built.`);
    Deno.exit(0);
  }

  const summary = summarise(rows);
  const byKind = Object.fromEntries(
    (["t2", "t1_general", "t1_academic"] as const).map((k) => [k, summarise(rows.filter((r) => r.kind === k))]),
  );
  console.log("\nSummary", JSON.stringify(summary, null, 2));
  for (const [k, s] of Object.entries(byKind)) {
    if (s.scored) console.log(`  ${k.padEnd(12)} within ±0.5: ${s.within_half_band}/${s.scored}  MAE ${s.mean_abs_error}  bias ${s.bias}`);
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  await Deno.mkdir(new URL("./results/", import.meta.url), { recursive: true });
  const file = new URL(`./results/writing-${stamp}.json`, import.meta.url);
  await Deno.writeTextFile(file, JSON.stringify({ at: new Date().toISOString(), model, thinking, versions, summary, byKind, rows }, null, 2));
  console.log(`\nReport: ${file.pathname}`);

  const pass = summary.errors === 0 && summary.within_rate >= TARGET_WITHIN;
  console.log(pass ? `PASS: ${Math.round(summary.within_rate * 100)}% within ±0.5 (target ${TARGET_WITHIN * 100}%)` : `BELOW TARGET (${TARGET_WITHIN * 100}% within ±0.5)`);
  Deno.exit(pass ? 0 : 1);
}
