// Waitlist contract (M0-F4). Mirrors the checks in public.join_waitlist() so the form can show
// errors before calling the database; the database still validates on its own.
import { z } from "zod";

export const WaitlistInput = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .min(3)
    .max(254)
    .regex(/^[^@\s]+@[^@\s]+\.[^@\s]+$/, "Enter a valid email address."),
  /** utm_source or the form location ("hero", "final_cta"). */
  source: z.string().trim().max(64).optional(),
});

export type WaitlistInput = z.infer<typeof WaitlistInput>;

/** Result returned to the form. Never says whether the email was already on the list. */
export type WaitlistResult =
  | { status: "idle" }
  | { status: "success" }
  | { status: "error"; message: string; field?: "email" };
