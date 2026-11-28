// M8.7 study plans and "Pick for me" (web side). The picking happens in the database
// (pick_next, assign_my_study_plan, get_my_study_plan); this maps a picked item to its page and
// loads the plan, checked against the shared contract.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@prepora/shared/db";
import { MyStudyPlan, NextPick, type StudyItemKind } from "@prepora/shared/api/study-plan";
import { listeningTestPath, readingTestPath, speakingExaminerPath, speakingTopicPath, writingTaskPath } from "./routes";

const str = (v: unknown) => (typeof v === "string" ? v : undefined);

/** The page that starts a picked item. */
export function studyItemHref(kind: StudyItemKind, itemId: string, extra: Record<string, unknown> | null | undefined): string {
  switch (kind) {
    case "reading_test":
      return readingTestPath(itemId);
    case "listening_test":
      return listeningTestPath(itemId);
    case "writing_t1":
    case "writing_t2":
      return writingTaskPath(itemId);
    case "speaking_p1":
      return speakingExaminerPath(itemId);
    case "speaking_p2":
      return speakingTopicPath(itemId);
    case "speaking_full":
      // No Speaking full test any more: an older plan's item opens its cue card.
      return speakingTopicPath(str(extra?.card) ?? itemId);
  }
}

/** The signed-in student's plan; null on any error. */
export async function fetchMyStudyPlan(supabase: SupabaseClient<Database>): Promise<MyStudyPlan | null> {
  const { data, error } = await supabase.rpc("get_my_study_plan");
  if (error) return null;
  const parsed = MyStudyPlan.safeParse(data);
  return parsed.success ? parsed.data : null;
}

/** One pick for "Pick for me"; null when there's nothing of that kind (or on error). */
export async function fetchPick(supabase: SupabaseClient<Database>, kind: StudyItemKind, exclude: string[]): Promise<NextPick> {
  const { data, error } = await supabase.rpc("pick_next", { p_kind: kind, p_exclude: exclude });
  if (error) return null;
  const parsed = NextPick.safeParse(data);
  return parsed.success ? parsed.data : null;
}
