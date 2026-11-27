"use server";

import { revalidatePath } from "next/cache";
import { routes } from "./routes";
import { createClient } from "./supabase/server";

// M8.7-F2: get a study plan, or swap it for a new one. The server picks the template at random
// (assign_my_study_plan) and never tells the browser which one.

export async function assignStudyPlan(restart: boolean): Promise<{ ok: boolean; message: string }> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("assign_my_study_plan", { p_restart: restart });
  if (error) {
    console.error("assign study plan failed", error.code, error.message);
    if (error.code === "P0002") return { ok: false, message: "No study plans are available yet. Please try again later." };
    return { ok: false, message: "Couldn't set up your plan. Please try again." };
  }
  revalidatePath(routes.plan);
  revalidatePath(routes.app);
  return { ok: true, message: restart ? "You have a new study plan." : "Your study plan is ready." };
}
