// Metrics for the Speaking eval (M7-B5). Pure, no imports: unit-tested in speaking_eval_test.ts.

/** Lower-case words without punctuation, for comparing transcripts. */
export function normaliseWords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}'\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
}

/** Word error rate: word-level edit distance / reference length (0 = identical). */
export function wordErrorRate(reference: string, hypothesis: string): number {
  const r = normaliseWords(reference);
  const h = normaliseWords(hypothesis);
  if (r.length === 0) return h.length === 0 ? 0 : 1;
  let prev = Array.from({ length: h.length + 1 }, (_, j) => j);
  for (let i = 1; i <= r.length; i++) {
    const cur = [i];
    for (let j = 1; j <= h.length; j++) {
      cur[j] = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + (r[i - 1] === h[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return Math.round((prev[h.length]! / r.length) * 1000) / 1000;
}

export type EvalRow = {
  id: string;
  accent: string;
  wer: number | null;
  /** Fillers in the reference transcript, and how many the transcript kept. */
  fillers_ref: number | null;
  fillers_kept: number | null;
  expected_band: number | null;
  ai_band: number | null;
  expected_pron: number | null;
  ai_pron: number | null;
  error?: string;
  cost: number;
};

const mean = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 100) / 100 : null);

/** Per-group numbers. */
export function summariseGroup(rows: readonly EvalRow[]) {
  const ok = rows.filter((r) => !r.error);
  const banded = ok.filter((r) => r.expected_band !== null && r.ai_band !== null);
  const pron = ok.filter((r) => r.expected_pron !== null && r.ai_pron !== null);
  const withFillers = ok.filter((r) => r.fillers_ref !== null && r.fillers_ref > 0);
  return {
    n: rows.length,
    errors: rows.length - ok.length,
    mean_wer: mean(ok.flatMap((r) => (r.wer === null ? [] : [r.wer]))),
    band_within_half: banded.length ? banded.filter((r) => Math.abs(r.ai_band! - r.expected_band!) <= 0.5).length / banded.length : null,
    band_mae: mean(banded.map((r) => Math.abs(r.ai_band! - r.expected_band!))),
    /** AI − expected Pronunciation: negative means scored lower than a human would. */
    pron_bias: mean(pron.map((r) => r.ai_pron! - r.expected_pron!)),
    filler_retention: withFillers.length
      ? Math.round((withFillers.reduce((a, r) => a + Math.min(r.fillers_kept!, r.fillers_ref!), 0) / withFillers.reduce((a, r) => a + r.fillers_ref!, 0)) * 100) / 100
      : null,
    cost_usd: Math.round(rows.reduce((a, r) => a + r.cost, 0) * 10000) / 10000,
  };
}

/**
 * Accent fairness checks (plan §5.1): a group whose Pronunciation bias is 0.5 band or more below
 * the overall bias, or whose transcription error rate is 10 points or more above the overall,
 * is flagged: the system may be penalising that accent.
 */
export function accentFlags(rows: readonly EvalRow[]): string[] {
  const overall = summariseGroup(rows);
  const flags: string[] = [];
  for (const accent of [...new Set(rows.map((r) => r.accent))].sort()) {
    const g = summariseGroup(rows.filter((r) => r.accent === accent));
    if (g.pron_bias !== null && overall.pron_bias !== null && g.pron_bias - overall.pron_bias <= -0.5) {
      flags.push(`${accent}: Pronunciation scored ${(overall.pron_bias - g.pron_bias).toFixed(2)} band lower than other accents`);
    }
    if (g.mean_wer !== null && overall.mean_wer !== null && g.mean_wer - overall.mean_wer >= 0.1) {
      flags.push(`${accent}: transcription error rate ${(g.mean_wer * 100).toFixed(0)}% vs ${(overall.mean_wer * 100).toFixed(0)}% overall`);
    }
  }
  return flags;
}
