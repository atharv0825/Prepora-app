// Unit tests for withCredits (M3-B6), with a fake Supabase client.
// Run (Deno 2, from supabase/functions): deno test --frozen _shared/
import { AiCallError, type CreditsContext, withCredits } from "./credits.ts";
import { HttpError } from "./errors.ts";
import type { DbClient } from "./auth.ts";

function assert(cond: unknown, msg = "assertion failed"): asserts cond {
  if (!cond) throw new Error(msg);
}
function assertEquals(actual: unknown, expected: unknown, msg = "") {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${msg}\n  actual:   ${a}\n  expected: ${e}`);
}
async function assertRejects(fn: () => Promise<unknown>): Promise<unknown> {
  try {
    await fn();
  } catch (err) {
    return err;
  }
  throw new Error("expected a rejection");
}

const RES = "3f1c2b9e-8a7d-4c6b-9e2f-1a2b3c4d5e6f";
const SPEND_OK = { ok: true, reservation_id: RES, action_key: "writing_t2", credits: 4, balance_after: 14, spent_today: 4 };

type Call = { kind: "rpc" | "insert"; name: string; args: Record<string, unknown> };

/** Minimal stand-in for the service-role client: records rpc/insert calls, returns canned data. */
function fakeAdmin(opts: {
  spend?: unknown;
  spendError?: { code: string; message: string };
  refundThrows?: boolean;
  insertError?: boolean;
} = {}) {
  const calls: Call[] = [];
  const client = {
    rpc(name: string, args: Record<string, unknown>) {
      calls.push({ kind: "rpc", name, args });
      if (name === "spend_credits") {
        return Promise.resolve({ data: opts.spendError ? null : opts.spend ?? SPEND_OK, error: opts.spendError ?? null });
      }
      if (name === "refund_credits") {
        if (opts.refundThrows) return Promise.reject(new Error("network down"));
        return Promise.resolve({ data: { ok: true, status: "refunded" }, error: null });
      }
      throw new Error(`unexpected rpc ${name}`);
    },
    from(table: string) {
      return {
        insert(row: Record<string, unknown>) {
          calls.push({ kind: "insert", name: table, args: row });
          return Promise.resolve({ error: opts.insertError ? { code: "XX000", message: "boom" } : null });
        },
      };
    },
  };
  return { calls, ctx: (user: { id: string } | null = { id: "u1" }): CreditsContext => ({ user, admin: () => client as unknown as DbClient }) };
}

const usage = { model: "gemini-3.8-flash", input_tokens: 3500, output_tokens: 3500, cost_usd: 0.032 };

Deno.test("reserves, runs and logs a successful call", async () => {
  const f = fakeAdmin();
  let seen: unknown;
  const out = await withCredits(f.ctx(), "writing_t2", (r) => {
    seen = r;
    return Promise.resolve({ result: { band: 7 }, usage });
  }, { refId: "a0000000-0000-0000-0000-000000000001" });

  assertEquals(out, { result: { band: 7 }, reservationId: RES, credits: 4, balanceAfter: 14 });
  assertEquals(seen, { reservationId: RES, credits: 4 }, "fn gets the reservation");
  assertEquals(f.calls[0], {
    kind: "rpc",
    name: "spend_credits",
    args: { p_user_id: "u1", p_action_key: "writing_t2", p_ref_id: "a0000000-0000-0000-0000-000000000001" },
  });
  assertEquals(f.calls.length, 2, "spend + one ai_usage row, no refund");
  const row = f.calls[1]!;
  assertEquals(row.name, "ai_usage");
  assertEquals(
    { ...row.args, latency_ms: 0 },
    {
      user_id: "u1", action_key: "writing_t2", model: "gemini-3.8-flash", input_tokens: 3500, output_tokens: 3500,
      audio_seconds: 0, cost_usd: 0.032, credits_charged: 4, success: true, latency_ms: 0, reservation_id: RES,
    },
  );
});

Deno.test("a refused spend becomes the matching HTTP error and fn never runs", async () => {
  for (const [code, status] of [["insufficient_credits", 402], ["daily_cap_reached", 429], ["feature_not_in_plan", 403]] as const) {
    const f = fakeAdmin({ spend: { ok: false, code, action_key: "ocr", credits: 1, balance: 0 } });
    let ran = false;
    const err = await assertRejects(() =>
      withCredits(f.ctx(), "ocr", () => {
        ran = true;
        return Promise.resolve({ result: null, usage });
      })
    );
    assert(err instanceof HttpError, "HttpError");
    assertEquals([err.status, err.code], [status, code]);
    assertEquals(err.toBody().error.details, { action_key: "ocr", credits: 1, balance: 0 }, "details for the dialog");
    assert(!ran, "fn not called");
    assertEquals(f.calls.length, 1, "no refund, no ai_usage");
  }
});

Deno.test("when fn fails: refund, log the failure, rethrow the same error", async () => {
  const f = fakeAdmin();
  const boom = new Error("Gemini timed out");
  const err = await assertRejects(() => withCredits(f.ctx(), "speaking_p2", () => Promise.reject(boom)));
  assert(err === boom, "the original error is rethrown");
  assertEquals(f.calls.map((c) => `${c.kind}:${c.name}`), ["rpc:spend_credits", "rpc:refund_credits", "insert:ai_usage"]);
  assertEquals(f.calls[1]!.args, { p_reservation_id: RES });
  const row = f.calls[2]!.args;
  assertEquals([row.success, row.credits_charged, row.model, row.input_tokens], [false, 0, "unknown", 0]);
});

Deno.test("an AiCallError's usage is logged with the failure", async () => {
  const f = fakeAdmin();
  await assertRejects(() =>
    withCredits(f.ctx(), "writing_t1", () => Promise.reject(new AiCallError("invalid JSON from model", { model: "gemini-3.8-flash", input_tokens: 4500, output_tokens: 900 })))
  );
  const row = f.calls.find((c) => c.name === "ai_usage")!.args;
  assertEquals([row.success, row.model, row.input_tokens, row.output_tokens], [false, "gemini-3.8-flash", 4500, 900]);
});

Deno.test("a failing refund or log never hides fn's error", async () => {
  const f = fakeAdmin({ refundThrows: true, insertError: true });
  const boom = new Error("model error");
  const err = await assertRejects(() => withCredits(f.ctx(), "ocr", () => Promise.reject(boom)));
  assert(err === boom);
});

Deno.test("a failing ai_usage insert never hides a successful result", async () => {
  const f = fakeAdmin({ insertError: true });
  const out = await withCredits(f.ctx(), "ocr", () => Promise.resolve({ result: "text", usage: { model: "gemini-3.5-flash-lite" } }));
  assertEquals(out.result, "text");
});

Deno.test("usage numbers are cleaned (negative, fractional tokens, NaN)", async () => {
  const f = fakeAdmin();
  await withCredits(f.ctx(), "ocr", () =>
    Promise.resolve({ result: 1, usage: { model: "m", input_tokens: 10.6, output_tokens: -5, audio_seconds: Number.NaN, cost_usd: -1 } }));
  const row = f.calls[1]!.args;
  assertEquals([row.input_tokens, row.output_tokens, row.audio_seconds, row.cost_usd], [11, 0, 0, 0]);
});

Deno.test("no user → 401, nothing reserved", async () => {
  const f = fakeAdmin();
  const err = await assertRejects(() => withCredits(f.ctx(null), "ocr", () => Promise.resolve({ result: 1, usage })));
  assert(err instanceof HttpError && err.status === 401);
  assertEquals(f.calls.length, 0);
});

Deno.test("a database error or malformed spend result fails before fn runs", async () => {
  for (const opts of [{ spendError: { code: "42501", message: "permission denied" } }, { spend: { ok: true } }]) {
    const f = fakeAdmin(opts);
    let ran = false;
    const err = await assertRejects(() =>
      withCredits(f.ctx(), "ocr", () => {
        ran = true;
        return Promise.resolve({ result: 1, usage });
      })
    );
    assert(err instanceof Error && !(err instanceof HttpError), "an internal error (500 via createHandler)");
    assert(!ran);
  }
});
