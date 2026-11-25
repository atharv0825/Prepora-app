import "server-only";
import { createClient } from "@/lib/supabase/server";

// Shared by the content builders' Server Functions (Reading M4-A1, Listening M5-A1).

export type BuilderState = {
  ok: boolean;
  message: string;
  fieldErrors?: Record<string, string>;
  savedAt?: number;
  /** A new question's id, so the editor can close. */
  id?: string;
};

export const SESSION_ENDED: BuilderState = { ok: false, message: "Your session has ended. Sign in again." };

export function fieldErrors(issues: readonly { path: PropertyKey[]; message: string }[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const i of issues) out[String(i.path[0] ?? "form")] ??= i.message;
  return out;
}

/** Database errors in words; details go to the server log only. */
export function failure(context: string, error: { code?: string; message: string }): BuilderState {
  console.error(`${context} failed`, error.code, error.message);
  if (error.code === "42501") return { ok: false, message: "Only admins and content editors can do this." };
  if (error.code === "23514") return { ok: false, message: `Not saved: ${error.message}.` };
  if (error.code === "23505") return { ok: false, message: "That number is taken. Reload the page and try again." };
  if (error.code === "P0002") return { ok: false, message: "This test no longer exists." };
  if (error.code === "22023") return { ok: false, message: `Not saved: ${error.message}.` };
  return { ok: false, message: "Couldn't save. Please try again." };
}

export async function signedIn() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  return data.user ? { supabase, userId: data.user.id } : null;
}

export type Supabase = Awaited<ReturnType<typeof createClient>>;
