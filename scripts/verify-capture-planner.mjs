// Isolated browser check of the real review/parser/persistence modules.
// Supabase is replaced at the module boundary; no account or remote DB is used.
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { createServer } from "vite";
import { chromium, webkit } from "playwright";

const fixtureClient = `
const seed = { captures: [{ id: 'capture', user_id: 'student', class_id: 'uuid', client_class_id: 'psych', kind: 'scan-material', captured_on: '2026-09-09', processing_status: 'ready', topic: 'Lecture.pptx · Slides 1–4', raw_text: 'Assignment due Fri September 12\\nQuiz 1 Fri September 19' }], assignments: [], exams: [] };
export const supabase = { from(table) {
  const filters = {}; let payload;
  const q = {
    select() { return q; }, eq(k, v) { filters[k] = v; return q; }, in(k, v) { filters[k] = v; return q; },
    order() { return q; }, limit() { return q; }, maybeSingle() { return q; }, insert(value) { payload = value; return q; },
    then(resolve) {
      const db = JSON.parse(localStorage.getItem('planner-browser-fixture') || 'null') || seed;
      let result;
      if (payload) {
        if (db[table].some(row => row.id === payload.id)) result = { data: null, error: { code: '23505' } };
        else { db[table].push({ ...payload, source_archived_at: null }); localStorage.setItem('planner-browser-fixture', JSON.stringify(db)); result = { data: { id: payload.id }, error: null }; }
      } else { window.plannerFixtureReads = (window.plannerFixtureReads || 0) + 1; result = { data: db[table].filter(row => Object.entries(filters).every(([k, v]) => Array.isArray(v) ? v.includes(row[k]) : row[k] === v)), error: null }; }
      return Promise.resolve(result).then(resolve);
    }
  }; return q;
} };
`;
const server = await createServer({
  optimizeDeps: { entries: [], include: ["react", "react-dom/client", "react/jsx-runtime"] },
  plugins: [{ name: "isolated-planner-fixture", enforce: "pre", load(id) {
    if (id.endsWith("/src/integrations/supabase/client.ts")) return fixtureClient;
    if (id.endsWith("/src/hooks/useClassIntelligence.ts")) return "export const getAuthenticatedUserId = () => 'student';";
  } }],
  server: { host: "127.0.0.1", port: 4176, strictPort: true },
});
await server.listen();
const origin = "http://127.0.0.1:4176";
await mkdir("test-results/capture-planner", { recursive: true });
try {
  for (const browserType of [chromium, webkit]) {
    const browser = await browserType.launch();
    try {
      const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
      const errors = []; const external = [];
      page.on("pageerror", error => errors.push(error.message));
      await page.route("**/*", route => {
        const url = route.request().url();
        if (url.startsWith(origin) || url.startsWith("data:") || url.startsWith(`blob:${origin}`)) return route.continue();
        // External font styling is not part of the data-path test.
        if (!url.includes("fonts.googleapis.com") && !url.includes("fonts.gstatic.com")) external.push(url);
        return route.abort();
      });
      await page.route(`${origin}/planner-check`, route => route.fulfill({ contentType: "text/html", body: `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Planner review check</title></head><body><main id="root" style="padding:16px;max-width:600px;margin:auto"></main><script type="module">
        import RefreshRuntime from '/@react-refresh'; RefreshRuntime.injectIntoGlobalHook(window); window.$RefreshReg$ = () => {}; window.$RefreshSig$ = () => type => type; window.__vite_plugin_react_preamble_installed__ = true;
        const React = await import('/node_modules/.vite/deps/react.js');
        const { createRoot } = await import('/node_modules/.vite/deps/react-dom_client.js');
        await import('/src/index.css');
        const { CapturePlannerReview } = await import('/src/components/capture/CapturePlannerReview.tsx');
        createRoot(document.getElementById('root')).render(React.createElement(CapturePlannerReview, { classId: 'psych', className: 'Psychology', captureIds: ['capture'] }));
      </script></body></html>` }));
      await page.goto(`${origin}/planner-check`);
      await page.getByRole("button", { name: "Review dates for planner" }).click();
      assert.equal(await page.getByRole("button", { name: "Add 0 checked dates" }).isDisabled(), true);
      await page.getByLabel("Date 1", { exact: true }).fill("2026-09-11");
      await page.getByLabel("Date 2", { exact: true }).fill("2026-09-18");
      assert.equal(await page.getByText(/written weekday does not match/).count(), 0);
      await page.screenshot({ path: `test-results/capture-planner/${browserType.name()}-review.png`, fullPage: true });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "No phone-width horizontal overflow");
      for (const checkbox of await page.getByRole("checkbox").all()) await checkbox.check();
      await page.getByRole("button", { name: "Add 2 checked dates" }).click();
      await page.getByText(/2 added to your planner/).waitFor();
      const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("planner-browser-fixture")));
      assert.equal(saved.assignments.length, 1); assert.equal(saved.exams.length, 1);
      assert.equal(saved.assignments[0].due_date, "2026-09-11"); assert.equal(saved.exams[0].exam_date, "2026-09-18");
      assert.equal(saved.assignments[0].client_class_id, "psych"); assert.equal(saved.exams[0].readiness, 0);
      await page.reload();
      await page.waitForFunction(() => window.plannerFixtureReads >= 3);
      await page.getByText("Checking saved material for dates…").waitFor({ state: "hidden" });
      assert.equal(await page.getByRole("button", { name: "Review dates for planner" }).count(), 0);
      assert.deepEqual(errors, []); assert.deepEqual(external, []);
      console.log(`${browserType.name()}: phone-width review, explicit confirmation, correct persisted dates, refresh dedupe; no remote requests`);
    } finally { await browser.close(); }
  }
} finally { await server.close(); }
