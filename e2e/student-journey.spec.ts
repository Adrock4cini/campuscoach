import { expect, test } from "../playwright-fixture";

async function expectNoHorizontalOverflow(page: import("@playwright/test").Page) {
  await expect.poll(() => page.evaluate(() => ({
    viewport: window.innerWidth,
    content: document.documentElement.scrollWidth,
  }))).toEqual(expect.objectContaining({
    viewport: expect.any(Number),
    content: expect.any(Number),
  }));

  const dimensions = await page.evaluate(() => ({
    viewport: window.innerWidth,
    content: document.documentElement.scrollWidth,
  }));
  expect(dimensions.content).toBeLessThanOrEqual(dimensions.viewport);
}

test("a student can enter the demo, open capture, and reach Study Lab", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();

  await page.getByRole("button", { name: /Continue as demo/i }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByText("Your classes", { exact: true })).toBeVisible();
  await expectNoHorizontalOverflow(page);

  await page.getByRole("button", { name: "Quick Capture" })
    .or(page.getByRole("button", { name: "Capture", exact: true }))
    .click();
  await expect(page.getByRole("heading", { name: "What are you capturing?" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Quick Note Save a typed note" })).toBeVisible();
  await expectNoHorizontalOverflow(page);

  await page.getByRole("button", { name: /Scan Assignment/i }).click();
  await expect(page.getByRole("heading", { name: "Scan Assignment" })).toBeVisible();
  await expectNoHorizontalOverflow(page);
  const captureMetrics = await page.evaluate(() => {
    const sheet = document.querySelector('[data-testid="capture-sheet"]');
    const controls = Array.from(
      sheet?.querySelectorAll('select, input:not([type="file"]), textarea') ?? [],
    );
    return {
      sheetWidth: sheet?.getBoundingClientRect().width ?? 0,
      viewportWidth: window.innerWidth,
      smallestControlFont: Math.min(
        ...controls.map((control) => Number.parseFloat(getComputedStyle(control).fontSize)),
      ),
    };
  });
  expect(captureMetrics.sheetWidth).toBeLessThanOrEqual(captureMetrics.viewportWidth);
  expect(captureMetrics.smallestControlFont).toBeGreaterThanOrEqual(16);

  await page.getByRole("button", { name: "Close" }).click();

  await page.goto("/study-lab");
  await expect(page.getByRole("heading", { name: "What do you want to study?" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Flashcards" }).or(page.getByRole("heading", { name: "Flashcards" }))).toBeVisible();
  await expectNoHorizontalOverflow(page);
});
