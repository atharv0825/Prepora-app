// Unit tests for the Writing eval (M6-B5): the set itself and the summary maths. No network.
// Run (Deno 2, from supabase/functions): deno test --frozen _eval/
import { countEssayWords } from "../_shared/writing.ts";
import { checkSet, summarise } from "./writing_eval.ts";
import { ESSAYS } from "./writing_essays.ts";

function assertEquals(actual: unknown, expected: unknown, msg = "") {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${msg}\n  actual:   ${a}\n  expected: ${e}`);
}

Deno.test("the set: 20 valid answers across the three task types and bands 4–8.5", () => {
  assertEquals(ESSAYS.length, 20);
  assertEquals(checkSet(ESSAYS), []);
  const kinds = ESSAYS.reduce<Record<string, number>>((m, e) => ({ ...m, [e.kind]: (m[e.kind] ?? 0) + 1 }), {});
  assertEquals(kinds, { t2: 10, t1_general: 5, t1_academic: 5 });
  const bands = ESSAYS.map((e) => e.expected_band);
  assertEquals([Math.min(...bands), Math.max(...bands)], [4, 8.5]);
  // Only the deliberately short low-band answers are under length.
  const short = ESSAYS.filter((e) => countEssayWords(e.essay) < (e.kind === "t2" ? 250 : 150)).map((e) => e.id);
  for (const id of short) {
    const band = ESSAYS.find((e) => e.id === id)!.expected_band;
    if (band > 5) throw new Error(`${id} is under length but targets band ${band}`);
  }
});

Deno.test("checkSet reports duplicates, bad bands and unknown kinds", () => {
  const e = ESSAYS[0];
  const problems = checkSet([e, { ...e }, { ...e, id: "x", expected_band: 6.3 }, { ...e, id: "y", kind: "t3" as never }]);
  assertEquals(problems, [`${e.id}: duplicate id`, "x: expected_band 6.3 isn't a band", "y: unknown kind t3"]);
});

Deno.test("summarise: within ±0.5, MAE, bias, worst, cost; errors counted apart", () => {
  const row = (id: string, expected: number, ai?: number, cost = 0.03) => ({
    id, kind: "t2", words: 300, expected, cost, ...(ai === undefined ? { error: "boom" } : { ai, diff: ai - expected }),
  });
  const s = summarise([row("a", 6, 6), row("b", 6, 6.5), row("c", 7, 6), row("d", 5, 6.5), row("e", 6)]);
  assertEquals(s.scored, 4);
  assertEquals(s.errors, 1);
  assertEquals(s.within_half_band, 2);
  assertEquals(s.within_rate, 0.5);
  assertEquals(s.exact, 1);
  assertEquals(s.mean_abs_error, 0.75); // (0 + 0.5 + 1 + 1.5) / 4
  assertEquals(s.bias, 0.25); // (0 + 0.5 − 1 + 1.5) / 4
  assertEquals(s.worst, ["d (+1.5)", "c (-1)", "b (+0.5)"]);
  assertEquals(s.cost_usd, 0.15);
});
