import { describe, expect, it } from "vitest";
import { ProfileUpdate, editableProfileFields, isAdmin, isStaff, plans, roles } from "./profile";

describe("roles and plans", () => {
  it("come from the database enums", () => {
    expect(roles).toEqual(["user", "admin", "content_editor"]);
    expect(plans).toEqual(["free", "gold", "platinum"]);
  });

  it("isStaff / isAdmin", () => {
    expect(isStaff("admin")).toBe(true);
    expect(isStaff("content_editor")).toBe(true);
    expect(isStaff("user")).toBe(false);
    expect(isStaff(null)).toBe(false);
    expect(isAdmin("admin")).toBe(true);
    expect(isAdmin("content_editor")).toBe(false);
    expect(isAdmin(undefined)).toBe(false);
  });
});

describe("ProfileUpdate", () => {
  it("accepts and normalises the editable fields", () => {
    expect(
      ProfileUpdate.parse({ full_name: "  Asha Rao ", country_code: "in", timezone: "Asia/Kolkata" }),
    ).toEqual({ full_name: "Asha Rao", country_code: "IN", timezone: "Asia/Kolkata" });
  });

  it("allows partial updates and clearing with null", () => {
    expect(ProfileUpdate.parse({ timezone: null })).toEqual({ timezone: null });
    expect(ProfileUpdate.parse({})).toEqual({});
  });

  it.each([
    [{ role: "admin" }, "role"],
    [{ plan: "platinum" }, "plan"],
    [{ id: "x" }, "id"],
  ])("rejects non-editable field %o", (input, key) => {
    const r = ProfileUpdate.safeParse(input);
    expect(r.success).toBe(false);
    expect(JSON.stringify(r.error?.issues)).toContain(key);
  });

  it.each([
    { full_name: "   " },
    { full_name: "x".repeat(101) },
    { country_code: "IND" },
    { country_code: "1N" },
    { timezone: "Mars/Olympus" },
  ])("rejects invalid value %o", (input) => {
    expect(ProfileUpdate.safeParse(input).success).toBe(false);
  });

  it("covers exactly the editable fields", () => {
    expect(Object.keys(ProfileUpdate.shape).sort()).toEqual([...editableProfileFields].sort());
  });
});
