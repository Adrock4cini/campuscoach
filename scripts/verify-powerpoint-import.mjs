// Real browser rendering check. No student account or remote service is used.
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer } from "vite";
import { chromium, webkit } from "playwright";

const server = await createServer({ server: { host: "127.0.0.1", port: 4175, strictPort: true } });
await server.listen();
const origin = "http://127.0.0.1:4175";
const fixture = Array.from(await readFile("e2e/fixtures/lecture-slides.pptx"));
await mkdir("test-results/slides", { recursive: true });
try {
  for (const browserType of [chromium, webkit]) {
    const browser = await browserType.launch();
    try {
      const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
      const external = [];
      await page.route("**/*", route => {
        const url = route.request().url();
        // WebKit reports requests for browser-created blob images; these are
        // local resources, not external fetches.
        if (url.startsWith(origin) || url.startsWith(`blob:${origin}/`) || url.startsWith("data:")) return route.continue();
        external.push(route.request().url());
        return route.abort();
      });
      await page.route(`${origin}/slides-render-check`, route => route.fulfill({ contentType: "text/html", body: "<!doctype html><html><head><title>Slide rendering check</title></head><body></body></html>" }));
      await page.goto(`${origin}/slides-render-check`);
      page.on("pageerror", error => console.error(`${browserType.name()}: ${error.message}`));
      page.on("requestfailed", request => console.error(`${browserType.name()} request failed: ${request.url().split(":")[0]} ${request.failure()?.errorText}`));
      const result = await page.evaluate(async bytes => {
        const { openStudyDocument } = await import("/src/lib/capture/studyDocument.ts");
        const deck = await openStudyDocument(new File([new Uint8Array(bytes)], "Lecture.pptx"));
        try {
          const files = await deck.render({ first: 1, last: 2 });
          const images = [];
          for (const file of files) {
            const url = URL.createObjectURL(file);
            const image = new Image(); image.src = url; await image.decode();
            const canvas = document.createElement("canvas"); canvas.width = image.width; canvas.height = image.height;
            const ctx = canvas.getContext("2d"); ctx.drawImage(image, 0, 0);
            const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
            let green = 0, ink = 0;
            for (let i = 0; i < pixels.length; i += 4) {
              if (pixels[i] < 60 && pixels[i + 1] > 130 && pixels[i + 2] > 80 && pixels[i + 2] < 180) green++;
              if (pixels[i] < 80 && pixels[i + 1] < 80 && pixels[i + 2] < 100) ink++;
            }
            images.push({ name: file.name, width: image.width, height: image.height, green, ink, bytes: Array.from(new Uint8Array(await file.arrayBuffer())) });
            URL.revokeObjectURL(url);
          }
          return { pages: deck.pages, kind: deck.sourceKind, images };
        } finally { await deck.destroy(); }
      }, fixture);
      assert.equal(result.pages, 2); assert.equal(result.kind, "slides");
      assert.equal(external.length, 0, "Slide rendering must not fetch external content");
      for (const [index, image] of result.images.entries()) {
        await writeFile(`test-results/slides/${browserType.name()}-${index + 1}.jpg`, new Uint8Array(image.bytes));
        assert.equal(image.name, `Lecture - Slide ${index + 1}.jpg`);
        assert.equal(image.width, 1800);
        assert.ok(image.green > 50000, "Slide diagram must be visible");
        assert.ok(image.ink > 1000, "Slide text must be visible");
      }
      console.log(`${browserType.name()}: 2 slides rendered with text and diagram; no external requests`);
    } finally { await browser.close(); }
  }
} finally { await server.close(); }
