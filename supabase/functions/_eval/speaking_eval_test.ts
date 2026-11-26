// Unit tests for the Speaking eval (M7-B5): metrics, fairness flags and the manifest check. No network.
// Run (Deno 2, from supabase/functions): deno test --frozen _eval/
import { accentFlags, type EvalRow, normaliseWords, summariseGroup, wordErrorRate } from "./speaking_metrics.ts";
import { checkManifest } from "./speaking_eval.ts";
import fixtures from "./speaking/fixtures.json" with { type: "json" };

function assertEquals(actual: unknown, expected: unknown, msg = "") {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${msg}\n  actual:   ${a}\n  expected: ${e}`);
}

Deno.test("word error rate: substitutions, deletions and insertions over the reference", () => {
  assertEquals(normaliseWords("Um, the BEACH — isn't it?"), ["um", "the", "beach", "isn't", "it"]);
  assertEquals(wordErrorRate("I like the beach", "I like the beach."), 0);
  assertEquals(wordErrorRate("um I like the beach", "I like the beach"), 0.2); // a dropped filler
  assertEquals(wordErrorRate("I like the beach", "I liked a beach"), 0.5);
  assertEquals(wordErrorRate("I like it", "I really like it a lot"), 1);
  assertEquals(wordErrorRate("", ""), 0);
});

const row = (accent: string, over: Partial<EvalRow>): EvalRow => ({
  id: Math.random().toString(36), accent, wer: 0.1, fillers_ref: 4, fillers_kept: 3, expected_band: 6, ai_band: 6, expected_pron: 6.5, ai_pron: 6.5, cost: 0.005, ...over,
});

Deno.test("group summary: error rate, bands within ±0.5, Pronunciation bias, filler retention, cost", () => {
  const g = summariseGroup([row("indian", {}), row("indian", { ai_band: 7, ai_pron: 5.5, wer: 0.2 }), row("indian", { error: "boom" })]);
  assertEquals(g, { n: 3, errors: 1, mean_wer: 0.15, band_within_half: 0.5, band_mae: 0.5, pron_bias: -0.5, filler_retention: 0.75, cost_usd: 0.015 });
});

Deno.test("fairness flags: Pronunciation scored lower, or transcription worse, for one accent", () => {
  const rows = [
    ...[1, 2, 3].map(() => row("filipino", {})),
    ...[1, 2, 3].map(() => row("nepali", {})),
    ...[1, 2, 3].map(() => row("vietnamese", { ai_pron: 5, wer: 0.35 })),
  ];
  assertEquals(accentFlags(rows), [
    "vietnamese: Pronunciation scored 1.00 band lower than other accents",
    "vietnamese: transcription error rate 35% vs 18% overall",
  ]);
  assertEquals(accentFlags(rows.filter((r) => r.accent !== "vietnamese")), []);
});

Deno.test("manifest check; the committed fixtures manifest is valid", () => {
  assertEquals(checkManifest(fixtures as never), []);
  const bad = [{ id: "a", accent: "", file: "x.webm", card: { title: "T", points: ["one"] }, expected_band: 6.3 }];
  assertEquals(checkManifest([...bad, ...bad] as never), [
    "a: accent and file are required",
    "a: the card needs a title and 2+ points",
    "a: 6.3 isn't a band",
    "a: duplicate id",
    "a: accent and file are required",
    "a: the card needs a title and 2+ points",
    "a: 6.3 isn't a band",
  ]);
});
