import { test, expect } from "@playwright/test";

test("real browser controls a rehearsal and viewer/OBS pages follow through SSE", async ({
  page,
  context,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/studio");
  await page.getByRole("button", { name: "Rehearse locally" }).click();
  await page.getByLabel("Name your kingdom").fill("Browser Kingdom");
  await page.getByRole("button", { name: "Create world" }).click();
  await expect(page).toHaveURL(/\/studio\/[^/]+$/);
  const worldId = new URL(page.url()).pathname.split("/").at(-1)!;
  await page
    .getByRole("button", { name: "Start episode 1", exact: true })
    .click();
  const viewers = page.locator(".viewer");
  await viewers
    .nth(0)
    .getByRole("button", { name: "!join red", exact: true })
    .click();
  await viewers
    .nth(1)
    .getByRole("button", { name: "!join blue", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Prepare dilemma", exact: true })
    .click();
  await page.getByRole("button", { name: /Open voting/ }).click();
  const viewer = await context.newPage();
  const overlay = await context.newPage();
  await overlay.setViewportSize({ width: 1920, height: 1080 });
  await viewer.goto(`/world/${worldId}`);
  await overlay.goto(`/overlay/${worldId}`);
  await expect(viewer.getByRole("timer")).toBeVisible();
  await viewers
    .nth(0)
    .getByRole("button", { name: "!vote 2", exact: true })
    .click();
  await viewers
    .nth(1)
    .getByRole("button", { name: "!vote 2", exact: true })
    .click();
  await expect(viewer.getByLabel("2 votes, 100%")).toBeVisible();
  await page.getByRole("button", { name: /Close voting early/ }).click();
  await expect(
    overlay.getByText("The community chose: Break the treaty"),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "End episode 1", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Yes, end episode", exact: true })
    .click();
  await expect
    .poll(async () => {
      const response = await page.request.get(`/api/worlds/${worldId}`);
      return (await response.json()).recentEvents.some(
        (e: { kind: string }) => e.kind === "offline_development",
      );
    })
    .toBe(true);
  await page
    .getByRole("button", { name: "Start episode 2", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Prepare dilemma", exact: true })
    .click();
  await expect(
    viewer.getByRole("heading", { name: "Blue demands an answer" }),
  ).toBeVisible();
  await viewer.reload();
  await expect(viewer.getByText("Unresolved grievance")).toBeVisible();
  await expect(
    viewer.getByRole("complementary", { name: "The world remembers" }),
  ).toContainText("treaty");
  await page.screenshot({
    path: "test-results/studio-connected.png",
    fullPage: true,
  });
  await overlay.screenshot({ path: "test-results/overlay-connected.png" });
  expect(errors).toEqual([]);
});

test("mobile viewer is readable and browser routes survive direct navigation", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/world/preview?fixture=returning");
  await expect(
    page.getByRole("heading", { name: "Blue demands an answer" }),
  ).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    )
    .toBe(true);
  await page.screenshot({
    path: "test-results/mobile-returning.png",
    fullPage: true,
  });
  const api = await page.request.get("/api/nonexistent");
  expect(api.status()).toBe(404);
  expect(api.headers()["content-type"]).toContain("application/json");
});
