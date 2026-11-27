import { NextResponse, type NextRequest } from "next/server";
import { StudyItemKind } from "@prepora/shared/api/study-plan";
import { routes, speakingPartPath, writingTaskListPath } from "@/lib/routes";
import { fetchPick, studyItemHref } from "@/lib/study";
import { createClient } from "@/lib/supabase/server";

// M8.7-F1 "Pick for me": a random item of this kind the student hasn't done (pick_next), then
// straight to its page. The last pick per kind is remembered in a cookie so pressing it again
// gives something else. With nothing to pick, back to the module's list.

const fallback: Record<StudyItemKind, string> = {
  reading_test: routes.reading,
  listening_test: routes.listening,
  writing_t1: writingTaskListPath(1),
  writing_t2: writingTaskListPath(2),
  speaking_p1: speakingPartPath(1),
  speaking_p2: speakingPartPath(2),
  speaking_full: routes.speaking,
};

export async function GET(request: NextRequest, { params }: RouteContext<"/app/pick/[kind]">) {
  const kind = StudyItemKind.safeParse((await params).kind);
  if (!kind.success) return NextResponse.redirect(new URL(routes.app, request.url));

  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return NextResponse.redirect(new URL(routes.login, request.url));

  const cookie = `prepora_pick_${kind.data}`;
  const last = request.cookies.get(cookie)?.value;
  const pick = await fetchPick(supabase, kind.data, last ? [last] : []);
  if (!pick) return NextResponse.redirect(new URL(fallback[kind.data], request.url));

  const response = NextResponse.redirect(new URL(studyItemHref(pick.kind, pick.item_id, pick.extra), request.url));
  response.cookies.set(cookie, pick.item_id, { path: "/app", httpOnly: true, sameSite: "lax", maxAge: 60 * 60 * 24 });
  return response;
}
