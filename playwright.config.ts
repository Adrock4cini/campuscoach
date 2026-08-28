import { defineConfig, devices } from "@playwright/test";

const E2E_FAKE_SUPABASE_PROJECT_REF = "abcdefghijklmnopqrst";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: "http://127.0.0.1:4173",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "desktop-chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "mobile-chromium",
      use: { ...devices["Pixel 7"] },
    },
    {
      name: "mobile-webkit",
      use: { ...devices["iPhone 13"] },
    },
  ],
  webServer: {
    // Exercise the same optimized bundle we publish. A dev-server-only smoke
    // test can miss production chunking, environment, and service-worker bugs.
    command: "npm run build && npm run preview -- --host 127.0.0.1 --port 4173",
    url: "http://127.0.0.1:4173/login",
    // Browser journeys intentionally exercise the anonymous demo using a
    // synthetic staging identity and fake key. Keeping the complete test-only
    // authority here makes `npm run e2e` self-contained while staging and
    // production retain the fail-closed invite-only defaults.
    env: {
      ...process.env,
      VITE_FAMILY_BETA_STAGING_PROJECT_ID: E2E_FAKE_SUPABASE_PROJECT_REF,
      VITE_SUPABASE_PROJECT_ID: E2E_FAKE_SUPABASE_PROJECT_REF,
      VITE_SUPABASE_URL: `https://${E2E_FAKE_SUPABASE_PROJECT_REF}.supabase.co`,
      VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_e2e-placeholder",
      VITE_PUBLIC_SIGNUPS_ENABLED: "true",
    },
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
