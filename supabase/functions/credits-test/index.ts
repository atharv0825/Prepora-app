// POST /functions/v1/credits-test   body: { "fail"?: boolean }
// M3-I1: a dummy "AI action" that goes through withCredits exactly as the real ones will (M6+):
// it spends Writing Task 2's credits (4), "calls the AI" (nothing), and logs ai_usage with the
// model "dummy-test". With { fail: true } the AI call fails, so withCredits refunds the credits.
//
// For tests and staging checks only: in production (APP_ENV=production) it answers 404, so it
// can never take real users' credits. Locally APP_ENV is unset.

import { z } from "../_shared/deps.ts";
import { AiCallError, withCredits } from "../_shared/credits.ts";
import { errors } from "../_shared/errors.ts";
import { createHandler } from "../_shared/handler.ts";

const Input = z.object({ fail: z.boolean().optional() });

export type CreditsTestResponse = {
  ok: true;
  action_key: "writing_t2";
  credits: number;
  balance_after: number;
  reservation_id: string;
};

/** The dummy model name in ai_usage, so cost reports can leave these rows out. */
export const DUMMY_MODEL = "dummy-test";

export function testFunctionEnabled(appEnv: string | undefined): boolean {
  return (appEnv ?? "local") !== "production";
}

Deno.serve(
  createHandler(
    { name: "credits-test", methods: ["POST"], auth: "required", input: Input },
    async (ctx): Promise<CreditsTestResponse> => {
      if (!testFunctionEnabled(Deno.env.get("APP_ENV"))) throw errors.notFound();

      try {
        const out = await withCredits(ctx, "writing_t2", async () => {
          if (ctx.input.fail) throw new AiCallError("dummy AI call failed (requested)", { model: DUMMY_MODEL });
          return { result: null, usage: { model: DUMMY_MODEL } };
        });
        return {
          ok: true,
          action_key: "writing_t2",
          credits: out.credits,
          balance_after: out.balanceAfter,
          reservation_id: out.reservationId,
        };
      } catch (err) {
        // withCredits has refunded the credits; say so (credit refusals pass through as they are).
        if (err instanceof AiCallError) throw errors.internal("The AI call failed. Your credits were refunded.");
        throw err;
      }
    },
  ),
);
