import type { Page } from "@playwright/test";
import { expect, test } from "../playwright-fixture";

const SUPABASE_DATA_PLANE = /^\/(?:rest|functions|storage)\/v1(?:\/|$)/;
const SUPABASE_REALTIME = /^\/realtime\/v1(?:\/|$)/;

function isSupabaseHost(hostname: string) {
  return hostname === "supabase.co" || hostname.endsWith(".supabase.co");
}

function watchSupabaseDataPlane(page: Page) {
  const requests: string[] = [];
  const webSockets: string[] = [];

  page.on("request", (request) => {
    const url = new URL(request.url());
    if (isSupabaseHost(url.hostname) && SUPABASE_DATA_PLANE.test(url.pathname)) {
      requests.push(`${request.method()} ${url.pathname}`);
    }
  });

  page.on("websocket", (socket) => {
    const url = new URL(socket.url());
    if (isSupabaseHost(url.hostname) && SUPABASE_REALTIME.test(url.pathname)) {
      webSockets.push(url.pathname);
    }
  });

  return { requests, webSockets };
}

async function settleMountEffects() {
  const settledAt = Date.now() + 250;
  await expect.poll(() => Date.now() >= settledAt, { timeout: 750 }).toBe(true);
}

test("anonymous demo surfaces never open the Supabase data plane", async ({ page }) => {
  const traffic = watchSupabaseDataPlane(page);

  await page.goto("/login");
  await page.getByRole("button", { name: /Continue as demo/i }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByText("Your classes", { exact: true })).toBeVisible();
  await settleMountEffects();

  await page.goto("/classes/psych101");
  await expect(page.getByRole("heading", { name: "Intro to Psychology" })).toBeVisible();
  await expect(page.getByRole("button", { name: /invite classmates|invite$/i })).toHaveCount(0);
  await settleMountEffects();

  await page.goto("/course-intelligence");
  await expect(page.getByRole("heading", { name: "Course Intelligence" })).toBeVisible();
  await expect(page.getByText(/Nothing on this page reads from or writes to a student account/i)).toBeVisible();
  await settleMountEffects();

  await page.goto("/exam-debrief");
  await expect(page.getByRole("heading", { name: "Exam Debrief" })).toBeVisible();
  await expect(page.getByText(/not saved or shared/i)).toBeVisible();
  await settleMountEffects();

  // Traffic is retained, so any call fails even if it completed on an earlier page.
  expect(traffic.requests).toEqual([]);
  expect(traffic.webSockets).toEqual([]);
});
