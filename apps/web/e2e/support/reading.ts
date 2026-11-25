// Shared by the Reading browser specs (reading-ui, reading-seed): the answer key and answering a
// question through the player, whatever its control.
import { expect, type Page } from "@playwright/test";
import { adminClient } from "./local-supabase";

/** The right answer for each question, as the student would give it (read with the service role). */
export async function key(testId: string): Promise<Map<number, string | string[]>> {
  const { data } = await adminClient().from("reading_questions").select("q_no, answer").eq("test_id", testId);
  return new Map(
    (data ?? []).map((q) => {
      const a = q.answer as { labels?: string[]; value?: string; label?: string; accept?: string[] };
      return [q.q_no, a.labels ?? a.value ?? a.label ?? a.accept![0]!];
    }),
  );
}

/** Answer question n through the UI, whatever its control. */
export async function answer(page: Page, n: number, value: string | string[]) {
  await page.getByRole("navigation", { name: "Questions" }).getByRole("button", { name: new RegExp(`^Question ${n}(,|$)`) }).click();
  const box = page.getByTestId("questions-pane").locator(`[data-q="${n}"]`);
  await expect(box).toBeVisible();
  const field = box.locator(`#q${n}`);
  if (await field.count()) {
    if ((await field.evaluate((el) => el.tagName)) === "SELECT") await field.selectOption(value as string);
    else await field.fill(value as string);
    return;
  }
  // The inputs are visually hidden: click their labels, as a student would.
  for (const v of Array.isArray(value) ? value : [value]) {
    await box.locator("label", { has: page.locator(`input[value="${v}"]`) }).click();
    await expect(box.locator(`input[value="${v}"]`)).toBeChecked();
  }
}
