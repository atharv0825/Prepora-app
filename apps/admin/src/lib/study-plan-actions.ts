"use server";

import { revalidatePath } from "next/cache";
import { ContentId } from "@prepora/shared/api/admin-reading";
import { TemplateForm } from "@prepora/shared/api/admin-study-plans";
import { type BuilderState, failure, fieldErrors, SESSION_ENDED, signedIn } from "./builder-server";

// M8.7-A1: study plan templates. The database does the work (admin_save_study_template and
// admin_set_study_template_active, staff only): editing a template students follow creates a new
// version, so their plans keep the template they started.

type Saved = BuilderState & { id?: string; newVersion?: boolean };

function notFound(error: { code?: string }): BuilderState | null {
  return error.code === "P0002" ? { ok: false, message: "This study plan no longer exists." } : null;
}

export async function saveStudyTemplate(id: string | null, input: unknown): Promise<Saved> {
  if (id !== null && !ContentId.safeParse(id).success) return { ok: false, message: "Invalid request." };
  const form = TemplateForm.safeParse(input);
  if (!form.success) return { ok: false, message: form.error.issues[0]?.message ?? "Check the highlighted fields.", fieldErrors: fieldErrors(form.error.issues) };
  const session = await signedIn();
  if (!session) return SESSION_ENDED;
  const { data, error } = await session.supabase.rpc("admin_save_study_template", {
    // The generated types mark every argument as non-null, but the function takes null for both:
    // no id = a new template, no test type = for Academic and General students.
    p_id: id as string,
    p_name: form.data.name,
    p_days: form.data.days,
    p_test_type: form.data.test_type as "academic" | "general",
    p_items: form.data.items,
  });
  if (error) return notFound(error) ?? failure("save study plan", error);
  const newVersion = id !== null && data !== id;
  revalidatePath("/study-plans");
  if (id) revalidatePath(`/study-plans/${id}`);
  revalidatePath(`/study-plans/${data}`);
  return {
    ok: true,
    id: data,
    newVersion,
    savedAt: Date.now(),
    message: !id ? "Created. It's inactive until you activate it." : newVersion ? "Saved as a new version. Students already on this plan keep the old one." : "Saved.",
  };
}

export async function setStudyTemplateActive(id: string, active: boolean): Promise<BuilderState> {
  if (!ContentId.safeParse(id).success) return { ok: false, message: "Invalid request." };
  const session = await signedIn();
  if (!session) return SESSION_ENDED;
  const { error } = await session.supabase.rpc("admin_set_study_template_active", { p_id: id, p_active: active });
  if (error) return notFound(error) ?? failure(active ? "activate study plan" : "deactivate study plan", error);
  revalidatePath("/study-plans");
  revalidatePath(`/study-plans/${id}`);
  return { ok: true, message: active ? "Activated: new students can get this plan." : "Deactivated: no new students get it. Students on it keep it." };
}
