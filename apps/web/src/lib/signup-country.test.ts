import { describe, expect, it } from "vitest";
import { recordSignupCountry, requestCountry } from "./signup-country";

const headers = (country?: string) => new Headers(country === undefined ? {} : { "CF-IPCountry": country });

describe("requestCountry", () => {
  it("reads Cloudflare's CF-IPCountry header", () => {
    expect(requestCountry(headers("IN"))).toBe("IN");
    expect(requestCountry(headers(" np "))).toBe("NP");
  });

  it("falls back to request.cf.country when the header is missing or unusable", () => {
    expect(requestCountry(headers(), { country: "LK" })).toBe("LK");
    expect(requestCountry(headers("XX"), { country: "BD" })).toBe("BD");
  });

  it("prefers the header over request.cf", () => {
    expect(requestCountry(headers("IN"), { country: "NP" })).toBe("IN");
  });

  it.each([
    ["no header, no cf", headers(), undefined],
    ["unknown (XX)", headers("XX"), { country: "XX" }],
    ["Tor (T1)", headers("T1"), null],
    ["not a code", headers("India"), { country: 42 }],
  ])("%s → null", (_label, h, cf) => {
    expect(requestCountry(h, cf)).toBeNull();
  });
});

describe("recordSignupCountry", () => {
  it("doesn't touch the database when the country is unknown", async () => {
    const supabase = new Proxy({}, { get: () => { throw new Error("no query expected"); } });
    await expect(recordSignupCountry(supabase as never, "user-id", null)).resolves.toBe("unknown");
  });
});
