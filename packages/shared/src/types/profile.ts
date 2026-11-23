// Profile contract (M1-C2). Types come from the generated DB types (packages/shared/src/db.ts), so
// they follow the profiles migration (M1-C1) automatically.
import { z } from "zod";
import { Constants, type Database, type Tables } from "../db";

/** A row of public.profiles, as returned by `select * from profiles`. */
export type Profile = Tables<"profiles">;

/** public.app_role */
export type Role = Database["public"]["Enums"]["app_role"];
/** public.plan_tier */
export type Plan = Database["public"]["Enums"]["plan_tier"];

export const roles = Constants.public.Enums.app_role satisfies readonly Role[];
export const plans = Constants.public.Enums.plan_tier satisfies readonly Plan[];

/** Roles allowed into the admin panel (M1-A1). */
export const staffRoles = ["admin", "content_editor"] as const satisfies readonly Role[];
export type StaffRole = (typeof staffRoles)[number];

export function isStaff(role: Role | null | undefined): role is StaffRole {
  return role === "admin" || role === "content_editor";
}

export function isAdmin(role: Role | null | undefined): role is "admin" {
  return role === "admin";
}

/**
 * The only columns a user may update on their own profile. Must match the column grant in the
 * migration (`grant update (...) on public.profiles to authenticated`); tests/contract.test.ts
 * checks that. role and plan are never user-editable.
 */
export const editableProfileFields = [
  "full_name",
  "country_code",
  "timezone",
  // Onboarding answers (M2-C1).
  "test_type",
  "target_band",
  "exam_date",
] as const;

/** public.ielts_test_type */
export type TestType = Database["public"]["Enums"]["ielts_test_type"];
export const testTypes = Constants.public.Enums.ielts_test_type satisfies readonly TestType[];

/** Target band range accepted by the database (1.0–9.0 in half steps). */
export const TARGET_BAND_MIN = 1;
export const TARGET_BAND_MAX = 9;
export type EditableProfileField = (typeof editableProfileFields)[number];

function isTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

/**
 * Profile update from the account page. Mirrors the DB checks so the form can show errors
 * first; the database still validates on its own. Unknown keys (role, plan, …) are rejected.
 */
export const ProfileUpdate = z
  .object({
    full_name: z
      .string()
      .trim()
      .min(1, "Enter your name.")
      .max(100, "Use 100 characters or fewer.")
      .nullable(),
    country_code: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z]{2}$/, "Choose a country.")
      .nullable(),
    timezone: z
      .string()
      .trim()
      .min(1)
      .max(64)
      .refine(isTimeZone, "Choose a valid time zone.")
      .nullable(),
    test_type: z.enum(testTypes, "Choose Academic or General Training.").nullable(),
    target_band: z
      .number("Choose a target band.")
      .min(TARGET_BAND_MIN, "Choose a band from 1.0 to 9.0.")
      .max(TARGET_BAND_MAX, "Choose a band from 1.0 to 9.0.")
      .multipleOf(0.5, "Bands go in half steps (for example 6.5).")
      .nullable(),
    // ISO date (YYYY-MM-DD), same bounds as the database check.
    exam_date: z
      .iso.date("Choose a valid date.")
      .refine((d) => d >= "2020-01-01" && d <= "2100-12-31", "Choose a valid date.")
      .nullable(),
  })
  .partial()
  .strict() satisfies z.ZodType<Partial<Pick<Profile, EditableProfileField>>>;

export type ProfileUpdate = z.infer<typeof ProfileUpdate>;
