// Contract tests: the frontend copies of shared values must match the Edge Functions (Deno),
// which can't import packages/shared. These read the Deno sources as text and compare.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PINNED_FUNCTION_REGION } from "../packages/shared/src/api/regions";

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

/** String literals of a TS union type: `export type Name = | "a" | "b";` */
function unionMembers(source: string, typeName: string): string[] {
  const m = source.match(new RegExp(`export type ${typeName} =([^;]+);`));
  if (!m?.[1]) throw new Error(`type ${typeName} not found`);
  return [...m[1].matchAll(/"([a-z_]+)"/g)].map((x) => x[1]!).sort();
}

describe("frontend ↔ Edge Function contract", () => {
  it("pinned region matches supabase/functions/_shared/region.ts", () => {
    const region = read("supabase/functions/_shared/region.ts").match(
      /PINNED_REGION = Deno\.env\.get\("PINNED_REGION"\) \?\? "([a-z0-9-]+)"/,
    )?.[1];
    expect(region).toBe(PINNED_FUNCTION_REGION);
  });

  it("API error codes match supabase/functions/_shared/errors.ts", () => {
    const edge = unionMembers(read("supabase/functions/_shared/errors.ts"), "ErrorCode");
    const web = unionMembers(read("packages/shared/src/api/errors.ts"), "ApiErrorCode");
    expect(web).toEqual(edge);
    expect(edge.length).toBeGreaterThan(5);
  });
});
