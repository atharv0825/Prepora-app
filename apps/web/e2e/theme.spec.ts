import { expect, test, type Page } from "@playwright/test";
import { ONBOARDED, createTestUser, deleteTestUser, type TestUser } from "./support/local-supabase";

// Dark mode in the signed-in app: light by default (even on a dark device); Appearance
// (System / Light / Dark) in the account menu, kept on this device, applied before the page
// paints, following the device on "System", and only in the app (the marketing site stays light).

let user: TestUser | undefined;
test.afterEach(async () => {
  await deleteTestUser(user);
  user = undefined;
});

const isDark = (page: Page) => page.evaluate(() => document.documentElement.classList.contains("dark"));
const pageBackground = (page: Page) => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
const DARK_BG = "rgb(8, 34, 43)"; // #08222B
const LIGHT_BG = "rgb(255, 255, 255)";

async function choose(page: Page, theme: "System" | "Light" | "Dark") {
  await page.getByRole("button", { name: /^Account menu/ }).click();
  const item = page.getByRole("menuitemradio", { name: theme });
  await item.click();
  await expect(item).toHaveAttribute("aria-checked", "true");
  await page.keyboard.press("Escape");
}

test("Appearance: dark is applied, kept across reloads before paint, and stays inside the app", async ({ page, context, baseURL }) => {
  await page.emulateMedia({ colorScheme: "light" });
  user = await createTestUser("Dara Dark", "user", { ...ONBOARDED, timezone: "UTC" });
  await context.addCookies(user.cookies.map((c) => ({ ...c, url: baseURL! })));
  await page.goto("/app");
  expect(await isDark(page)).toBe(false);
  expect(await pageBackground(page)).toBe(LIGHT_BG);

  // The menu shows the three choices, Light by default.
  await page.getByRole("button", { name: /^Account menu/ }).click();
  await expect(page.getByRole("group", { name: "Appearance" }).getByRole("menuitemradio")).toHaveText(["System", "Light", "Dark"]);
  await expect(page.getByRole("menuitemradio", { name: "Light" })).toHaveAttribute("aria-checked", "true");
  await page.keyboard.press("Escape");

  await choose(page, "Dark");
  expect(await isDark(page)).toBe(true);
  await expect.poll(() => pageBackground(page)).toBe(DARK_BG);

  // A reload is dark from the first paint: the class is there when the HTML has been parsed.
  await page.goto("/app/reading", { waitUntil: "domcontentloaded" });
  expect(await isDark(page)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.style.colorScheme)).toBe("dark");
  // …and it stays dark once the app has hydrated and settled.
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(500);
  expect(await isDark(page)).toBe(true);
  await expect.poll(() => pageBackground(page)).toBe(DARK_BG);
  expect(await page.evaluate(() => getComputedStyle(document.querySelector("h1")!).color)).toBe("rgb(234, 250, 240)"); // #EAFAF0
  await page.screenshot({ path: test.info().outputPath("reading-list-dark.png"), fullPage: true });
  await page.goto("/app");
  await page.waitForLoadState("networkidle");
  expect(await isDark(page)).toBe(true);
  await page.screenshot({ path: test.info().outputPath("dashboard-dark.png"), fullPage: true });
  await page.goto("/app/credits");
  await page.screenshot({ path: test.info().outputPath("credits-dark.png"), fullPage: true });
  await page.goto("/app/listening");
  await page.screenshot({ path: test.info().outputPath("listening-dark.png"), fullPage: true });

  // The marketing site keeps its light design.
  await page.goto("/");
  expect(await isDark(page)).toBe(false);

  // Light wins over a dark device.
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/app");
  await choose(page, "Light");
  expect(await isDark(page)).toBe(false);
  await page.reload();
  expect(await isDark(page)).toBe(false);
});

test("Appearance: light by default even on a dark device; System follows the device, also when it changes", async ({
  page,
  context,
  baseURL,
  isMobile,
}) => {
  user = await createTestUser("Sol System", "user", { ...ONBOARDED, timezone: "UTC" });
  await context.addCookies(user.cookies.map((c) => ({ ...c, url: baseURL! })));
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/app");
  await page.waitForLoadState("networkidle");
  expect(await isDark(page)).toBe(false); // nothing chosen yet: light, whatever the device
  expect(await pageBackground(page)).toBe(LIGHT_BG);

  await choose(page, "System");
  expect(await isDark(page)).toBe(true); // the device is dark
  await page.emulateMedia({ colorScheme: "light" });
  await expect.poll(() => isDark(page)).toBe(false);
  await page.emulateMedia({ colorScheme: "dark" });
  await expect.poll(() => isDark(page)).toBe(true);

  // The Reading player in dark, on the start screen and during the test.
  await page.goto("/app/reading/5eed0000-0000-4000-8000-00000000000a");
  await page.getByRole("button", { name: "Start the test" }).click();
  if (isMobile) await page.getByRole("button", { name: "questions" }).click();
  await page.getByTestId("questions-pane").locator("label").first().click();
  await page.screenshot({ path: test.info().outputPath("reading-player-dark.png") });
});
