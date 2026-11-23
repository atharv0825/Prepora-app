import { describe, expect, it } from "vitest";
import { isApiErrorBody } from "./errors";

describe("isApiErrorBody", () => {
  it("accepts the Edge Function error shape", () => {
    expect(isApiErrorBody({ error: { code: "unauthorized", message: "Authentication required" } })).toBe(true);
    expect(
      isApiErrorBody({ error: { code: "validation_failed", message: "x", details: [{ path: "email" }] } }),
    ).toBe(true);
  });

  it.each([null, undefined, "error", 42, {}, { error: null }, { error: "boom" }, { error: { code: 1, message: "x" } }, { error: { code: "x" } }])(
    "rejects %j",
    (value) => {
      expect(isApiErrorBody(value)).toBe(false);
    },
  );
});
