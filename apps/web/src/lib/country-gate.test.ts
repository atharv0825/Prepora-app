import { describe, expect, it } from "vitest";
import { gateInput, gateRedirect, isGatedPath, launchStatusOrFallback } from "./country-gate";

const headers = (country?: string) => new Headers(country === undefined ? {} : { "CF-IPCountry": country });

describe("gateInput", () => {
  it("skips the gate off Cloudflare (no header, no request.cf): local dev and tests", () => {
    expect(gateInput(headers())).toEqual({ kind: "skip" });
    expect(gateInput(headers(), null)).toEqual({ kind: "skip" });
  });

  it("checks the header's country", () => {
    expect(gateInput(headers("vn"))).toEqual({ kind: "check", country: "VN" });
  });

  it("falls back to request.cf.country", () => {
    expect(gateInput(headers(), { country: "IN" })).toEqual({ kind: "check", country: "IN" });
  });

  it("still checks when Cloudflare doesn't know the country (XX, Tor): it gets the waitlist", () => {
    expect(gateInput(headers("XX"))).toEqual({ kind: "check", country: null });
    expect(gateInput(headers("T1"), { country: "T1" })).toEqual({ kind: "check", country: null });
    // A header that's there decides, even if request.cf says otherwise (next dev's cached guess).
    expect(gateInput(headers("XX"), { country: "IN" })).toEqual({ kind: "check", country: null });
    expect(gateInput(headers(), {})).toEqual({ kind: "check", country: null });
  });
});

describe("isGatedPath", () => {
  it("gates only /signup", () => {
    expect(isGatedPath("/signup")).toBe(true);
    for (const p of ["/login", "/waitlist", "/app", "/signup/extra", "/"]) expect(isGatedPath(p)).toBe(false);
  });
});

describe("launchStatusOrFallback", () => {
  it("uses the RPC's answer", () => {
    expect(launchStatusOrFallback("enabled", false)).toBe("enabled");
    expect(launchStatusOrFallback("waitlist", false)).toBe("waitlist");
  });

  it("falls back to the waitlist on errors or odd answers", () => {
    expect(launchStatusOrFallback("enabled", true)).toBe("waitlist");
    expect(launchStatusOrFallback(null, false)).toBe("waitlist");
    expect(launchStatusOrFallback("open", false)).toBe("waitlist");
  });
});

describe("gateRedirect", () => {
  it("lets enabled countries through and sends the rest to /waitlist", () => {
    expect(gateRedirect("enabled")).toBeNull();
    expect(gateRedirect("waitlist")).toBe("/waitlist");
  });
});
