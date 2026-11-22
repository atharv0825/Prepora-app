// Contract tests: the frontend copies of shared values must match the Edge Functions (Deno),
// which can't import packages/shared. These read the Deno sources as text and compare.
import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PINNED_FUNCTION_REGION } from "../packages/shared/src/api/regions";
import { editableProfileFields } from "../packages/shared/src/types/profile";
import {
  OTP_EXPIRY_SECONDS,
  OTP_LENGTH,
  OTP_RESEND_SECONDS,
} from "../packages/shared/src/constants/auth";

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

describe("frontend ↔ database contract", () => {
  it("editable profile fields match the column grant in the profiles migration", () => {
    const sql = readdirSync(new URL("../supabase/migrations/", import.meta.url))
      .filter((f) => f.endsWith(".sql"))
      .map((f) => read(`supabase/migrations/${f}`))
      .join(String.fromCharCode(10));
    const grants = [
      ...sql.matchAll(/grant update \(([^)]+)\) on table public\.profiles to authenticated/gi),
    ];
    expect(grants).toHaveLength(1); // a later migration changing it must update this test
    const granted = grants[0]![1]!.split(",").map((c) => c.trim()).sort();
    expect(granted).toEqual([...editableProfileFields].sort());
    expect(granted).not.toContain("role");
    expect(granted).not.toContain("plan");
  });
});

describe("frontend ↔ Supabase Auth config", () => {
  const toml = read("supabase/config.toml").replace(/\r\n/g, String.fromCharCode(10));
  // Value of `key = ...` inside the [auth.email] table.
  const email = toml.split(/^\[auth\.email\]$/m)[1]?.split(/^\[/m)[0] ?? "";
  const value = (key: string) => email.match(new RegExp(`^${key} = "?([^"\\s]+)"?`, "m"))?.[1];

  it("OTP length, expiry and resend wait match supabase/config.toml", () => {
    expect(Number(value("otp_length"))).toBe(OTP_LENGTH);
    expect(Number(value("otp_expiry"))).toBe(OTP_EXPIRY_SECONDS);
    expect(value("max_frequency")).toBe(`${OTP_RESEND_SECONDS}s`);
  });

  it("Google is enabled and its secret comes from the environment", () => {
    const google = toml.split(/^\[auth\.external\.google\]$/m)[1]?.split(/^\[/m)[0] ?? "";
    expect(google).toMatch(/^enabled = true$/m);
    expect(google).toMatch(/^secret = "env\(SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET\)"$/m);
  });

  it("OTP email templates contain the code", () => {
    for (const t of ["confirmation", "magic_link"]) {
      const block = toml.split(new RegExp(`^\\[auth\\.email\\.template\\.${t}\\]$`, "m"))[1] ?? "";
      const path = block.match(/^content_path = "\.\/(.+)"$/m)?.[1];
      expect(path, t).toBeTruthy();
      expect(read(path!)).toContain("{{ .Token }}");
    }
  });
});
