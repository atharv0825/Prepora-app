import { describe, expect, it } from "vitest";
import { manualPlanFromForm } from "./admin-billing";

const form = (fields: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
};
const user = "0b6a4c1e-2f5d-4a8b-9c3e-1d2f3a4b5c6d";

describe("manualPlanFromForm", () => {
  it("reads a paid plan with days, credits and a note", () => {
    const r = manualPlanFromForm(form({ user_id: user, plan: "gold", days: "30", grant_credits: "on", note: " ticket 12 " }));
    expect(r.success && r.data).toEqual({ user_id: user, plan: "gold", days: 30, grant_credits: true, note: "ticket 12" });
  });
  it("free needs no days", () => {
    expect(manualPlanFromForm(form({ user_id: user, plan: "free", days: "", note: "ended" })).success).toBe(true);
  });
  it.each([
    ["no days for a paid plan", { plan: "gold", days: "", note: "ticket" }, "days"],
    ["too many days", { plan: "gold", days: "400", note: "ticket" }, "days"],
    ["no note", { plan: "gold", days: "30", note: " " }, "note"],
  ])("rejects %s", (_l, fields, path) => {
    const r = manualPlanFromForm(form({ user_id: user, ...fields }));
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.path[0]).toBe(path);
  });
});
