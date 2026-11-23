// Contract tests: the frontend copies of shared values must match the Edge Functions (Deno),
// which can't import packages/shared. These read the Deno sources as text and compare.
import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PINNED_FUNCTION_REGION } from "../packages/shared/src/api/regions";
import { editableProfileFields } from "../packages/shared/src/types/profile";
import { AUTH_PROVIDER } from "../packages/shared/src/constants/auth";
import {
  actionKeys,
  allowanceTypes,
  creditErrorCodes,
  creditErrorStatus,
  gatedFeatures,
  planFeatures,
  planLimitCounts,
} from "../packages/shared/src/api/credits";

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

/** All migrations in order, as one string. */
const migrations = () =>
  readdirSync(new URL("../supabase/migrations/", import.meta.url))
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => read(`supabase/migrations/${f}`))
    .join(String.fromCharCode(10));

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

  it("action keys (M3-B6) match supabase/functions/_shared/credits.ts", () => {
    const block = read("supabase/functions/_shared/credits.ts").match(/export const ACTION_KEYS = \[([^\]]+)\]/)?.[1] ?? "";
    const edge = [...block.matchAll(/"([a-z0-9_]+)"/g)].map((m) => m[1]);
    expect(edge).toEqual([...actionKeys]);
  });

  it("credit error statuses (M3-C3) match the errors.* helpers", () => {
    const edge = read("supabase/functions/_shared/errors.ts");
    for (const code of creditErrorCodes) {
      const status = edge.match(new RegExp(`new HttpError\\((\\d{3}), "${code}"`))?.[1];
      expect(Number(status), code).toBe(creditErrorStatus[code]);
    }
  });
});

describe("credits contract (M3-C3) ↔ database", () => {
  it("plan limit keys match plan_limits_valid()", () => {
    const fn = migrations().match(/create function public\.plan_limits_valid[\s\S]+?\$\$;/)?.[0] ?? "";
    const arrays = [...fn.matchAll(/unnest\(array\[([^\]]+)\]\)/g)].map((m) =>
      [...m[1]!.matchAll(/'([a-z_]+)'/g)].map((x) => x[1]!),
    );
    expect(arrays).toEqual([[...planLimitCounts], [...planFeatures]]);
  });

  it("action keys and their required features match the credit_costs seed", () => {
    const seed = migrations().match(/insert into public\.credit_costs[\s\S]+?on conflict/)?.[0] ?? "";
    const rows = [...seed.matchAll(/\('([a-z0-9_]+)',\s*'[^']*',\s*\d+,\s*(?:null|'([a-z_]+)')/g)];
    expect(rows.map((r) => r[1]).sort()).toEqual([...actionKeys].sort());
    const features = [...new Set(rows.map((r) => r[2]).filter(Boolean))].sort();
    expect(features).toEqual([...gatedFeatures].sort());
  });

  it("allowance types match the usage_allowance columns and plans.limits counts", () => {
    const table = migrations().match(/create table public\.usage_allowance \(([\s\S]+?)\n\);/)?.[1] ?? "";
    const used = [...table.matchAll(/^\s+([a-z_]+)_used integer/gm)].map((m) => m[1]);
    expect(used).toEqual([...allowanceTypes]);
    for (const type of allowanceTypes) expect(planLimitCounts).toContain(type);
  });
});

describe("frontend ↔ database contract", () => {
  it("editable profile fields match the column grants across all migrations", () => {
    const sql = readdirSync(new URL("../supabase/migrations/", import.meta.url))
      .filter((f) => f.endsWith(".sql"))
      .sort()
      .map((f) => read(`supabase/migrations/${f}`))
      .join(String.fromCharCode(10));
    // Grants add up (M1-C1: name/country/timezone, M2-C1: onboarding fields). A column-level
    // revoke would need real tracking here, so fail loudly if one ever appears.
    expect(sql).not.toMatch(/revoke update \([^)]*\) on table public\.profiles/i);
    const grants = [
      ...sql.matchAll(/grant update \(([^)]+)\) on table public\.profiles to authenticated/gi),
    ];
    expect(grants.length).toBeGreaterThan(0);
    const granted = [...new Set(grants.flatMap((g) => g[1]!.split(",").map((c) => c.trim())))].sort();
    expect(granted).toEqual([...editableProfileFields].sort());
    expect(granted).not.toContain("role");
    expect(granted).not.toContain("plan");
  });
});

describe("frontend ↔ Supabase Auth config", () => {
  const toml = read("supabase/config.toml").replace(/\r\n/g, String.fromCharCode(10));
  /** Body of a `[table]` in config.toml, up to the next table. */
  const table = (name: string) =>
    toml.split(new RegExp(`^\\[${name.replace(/\./g, "\\.")}\\]$`, "m"))[1]?.split(/^\[/m)[0] ?? "";

  it("sign-up is open (Google creates accounts)", () => {
    expect(table("auth")).toMatch(/^enable_signup = true$/m);
  });

  it("the email provider is off: no OTP, magic link or password sign-in", () => {
    expect(table("auth.email")).toMatch(/^enable_signup = false$/m);
    expect(toml).not.toMatch(/^\[auth\.email\.template\./m);
  });

  it(`${AUTH_PROVIDER} is enabled and its secret comes from the environment`, () => {
    const google = table(`auth.external.${AUTH_PROVIDER}`);
    expect(google).toMatch(/^enabled = true$/m);
    expect(google).toMatch(/^secret = "env\(SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET\)"$/m);
  });

  it("no other sign-in method is enabled", () => {
    const enabled = [...toml.matchAll(/^\[auth\.(external\.[a-z_]+|web3\.[a-z]+|sms)\]$/gm)]
      .filter((m) => /^enabled = true$/m.test(table(`auth.${m[1]}`)))
      .map((m) => m[1]);
    expect(enabled).toEqual([`external.${AUTH_PROVIDER}`]);
    expect(toml).toMatch(/^enable_anonymous_sign_ins = false$/m);
  });
});
