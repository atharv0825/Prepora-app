import { type BrowserContext, expect, test } from "@playwright/test";
import { adminClient, createTestUser, deleteTestUser, ONBOARDED, type TestUser } from "./support/local-supabase";

// M9-F1…F3 without the payment providers: prices per country, the success page waiting for the
// webhook (the webhook is played by applying the normalised event in the database, exactly what
// billing-webhook does after verifying a signature), and Manage subscription in Settings.
// Opening Razorpay / Paddle needs their test keys: M9-I1.

const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
let users: TestUser[] = [];
const eventIds: string[] = [];

async function student(name: string, country: string, context: BrowserContext, baseURL: string) {
  const u = await createTestUser(name, "user", { ...ONBOARDED, timezone: "UTC" });
  users.push(u);
  const { error } = await adminClient().from("profiles").update({ country_code: country }).eq("id", u.id);
  if (error) throw error;
  await context.addCookies(u.cookies.map((c) => ({ ...c, url: baseURL })));
  return u;
}

/** What billing-webhook does with a verified event: store it, then apply the normalised form. */
async function webhook(provider: "razorpay" | "paddle", event: Record<string, string>) {
  const db = adminClient();
  const eventId = `e2e-${stamp}-${eventIds.length}`;
  eventIds.push(eventId);
  const { data: stored, error } = await db.rpc("billing_record_event", { p_provider: provider, p_event_id: eventId, p_event_type: "e2e", p_payload: {} });
  if (error) throw error;
  const { error: applyError } = await db.rpc("billing_apply_event", { p_id: (stored as { id: number }).id, p_event: event });
  if (applyError) throw applyError;
}

const goldMonthly = (u: TestUser, n: number) =>
  webhook("razorpay", { action: "payment_completed", user_id: u.id, price_id: "in_gold_month", subscription_id: `sub_e2e${n}${stamp.replace(/\W/g, "")}`, payment_id: `pay_e2e${n}${stamp.replace(/\W/g, "")}` });

test.afterAll(async () => {
  for (const u of users) await deleteTestUser(u);
  users = [];
  if (eventIds.length) await adminClient().from("payment_events").delete().in("event_id", eventIds);
});

test("India: plans in rupees, monthly or exam pack, and top-ups", async ({ page, context, baseURL }) => {
  await student("Inika Rupee", "IN", context, baseURL!);
  await page.goto("/app/plans");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Plans & top-ups");
  await expect(page.getByRole("main")).toContainText("UPI");

  const gold = page.getByTestId("plan-gold");
  await expect(gold).toContainText("₹299");
  await expect(gold).toContainText("/ month");
  await expect(gold.getByTestId("buy-in_gold_month")).toBeVisible();
  await expect(page.getByTestId("plan-platinum")).toContainText("₹599");
  await expect(page.getByTestId("plan-free").getByRole("button")).toHaveCount(0);

  await page.getByTestId("term-pack").click();
  await expect(gold).toContainText("₹799");
  await expect(gold).toContainText("300 AI credits included");
  await expect(page.getByTestId("plan-platinum")).toContainText("₹1,699");
  await expect(page.getByTestId("buy-in_platinum_exam_pack")).toBeVisible();

  const topups = page.getByTestId("topups");
  await expect(topups).toContainText("50 credits");
  await expect(topups).toContainText("₹149");
  await expect(topups).toContainText("₹399");
  await expect(topups.getByRole("button", { name: "Buy" })).toHaveCount(2);
});

test("a country not open yet sees prices but can't buy", async ({ page, context, baseURL }) => {
  await student("Paolo Waits", "PH", context, baseURL!);
  await page.goto("/app/plans");
  await expect(page.getByTestId("not-on-sale")).toContainText("aren't open in your country");
  await expect(page.getByTestId("plan-gold")).toContainText("$5");
  await expect(page.getByRole("main").getByRole("button", { name: /^(Get|Buy)/ })).toHaveCount(0);
});

test("the success page waits for the webhook: a top-up, then a plan", async ({ page, context, baseURL }) => {
  const u = await student("Sana Waits", "IN", context, baseURL!);

  await page.goto(`/app/plans/success?price=in_topup_50&since=${Date.now() - 60_000}`);
  await expect(page.getByTestId("checkout-waiting")).toBeVisible();
  await webhook("razorpay", { action: "payment_completed", user_id: u.id, price_id: "in_topup_50", order_id: `order_${stamp.replace(/\W/g, "")}`, payment_id: `pay_t${stamp.replace(/\W/g, "")}` });
  await expect(page.getByTestId("checkout-done")).toContainText("50 credits added");

  await page.goto(`/app/plans/success?price=in_gold_month&since=${Date.now()}`);
  await expect(page.getByTestId("checkout-waiting")).toBeVisible();
  await goldMonthly(u, 1);
  await expect(page.getByTestId("checkout-done")).toContainText("You're on Gold");
});

test("Settings: a running monthly plan can be changed or cancelled; Plans points there", async ({ page, context, baseURL }) => {
  const u = await student("Mohan Manage", "IN", context, baseURL!);
  await page.goto("/app/profile");
  await expect(page.getByTestId("see-plans")).toBeVisible();

  await goldMonthly(u, 2);
  await page.reload();
  const status = page.getByTestId("subscription-status");
  await expect(status).toContainText("Gold");
  await expect(status).toContainText("₹299 a month");
  await expect(status).toContainText("Renews on");
  await expect(page.getByTestId("change-to-platinum")).toHaveText("Upgrade to Platinum");
  await page.getByTestId("cancel-subscription").click();
  await expect(page.getByRole("dialog")).toContainText("You keep Gold and your credits until");
  await page.getByRole("button", { name: "Keep my plan" }).click();

  await page.goto("/app/plans");
  await expect(page.getByTestId("current-subscription")).toContainText("then it renews");
  await expect(page.getByTestId("plan-gold")).toContainText("Your plan");
  await expect(page.getByTestId("plan-platinum").getByRole("link", { name: "Change plan in Settings" })).toHaveAttribute("href", "/app/profile#subscription");
});

test("Settings: an exam pack just shows when it ends", async ({ page, context, baseURL }) => {
  const u = await student("Esha Pack", "NP", context, baseURL!);
  await webhook("paddle", { action: "payment_completed", user_id: u.id, price_id: "sa_platinum_exam_pack", payment_id: `txn_${stamp.replace(/\W/g, "")}` });
  await page.goto("/app/profile");
  const status = page.getByTestId("subscription-status");
  await expect(status).toContainText("Platinum");
  await expect(status).toContainText("3-month exam pack");
  await expect(status).toContainText("It won't renew");
  await expect(page.getByTestId("cancel-subscription")).toHaveCount(0);
});
