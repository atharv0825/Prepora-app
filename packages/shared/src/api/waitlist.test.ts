import { describe, expect, it } from "vitest";
import { WaitlistInput } from "./waitlist";

describe("WaitlistInput", () => {
  it("trims and lowercases the email", () => {
    const r = WaitlistInput.parse({ email: "  Asha.Rao@Example.COM " });
    expect(r.email).toBe("asha.rao@example.com");
  });

  it.each(["", "not-an-email", "a@b", "spaces in@x.com", "@example.com"])(
    "rejects %j",
    (email) => {
      expect(WaitlistInput.safeParse({ email }).success).toBe(false);
    },
  );

  it("rejects emails longer than 254 characters (same limit as the database)", () => {
    const email = `${"a".repeat(250)}@x.com`;
    expect(WaitlistInput.safeParse({ email }).success).toBe(false);
  });

  it("keeps an optional source up to 64 characters", () => {
    expect(WaitlistInput.parse({ email: "a@b.co", source: "utm:telegram" }).source).toBe("utm:telegram");
    expect(WaitlistInput.safeParse({ email: "a@b.co", source: "x".repeat(65) }).success).toBe(false);
  });
});
