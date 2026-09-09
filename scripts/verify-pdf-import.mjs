// Offline PDF.js engine check; does NOT certify browser or live AI behavior.
// Usage: node scripts/verify-pdf-import.mjs /absolute/handbook.pdf [output-directory]
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { getDocument, version } from "pdfjs-dist/legacy/build/pdf.mjs";

const require = createRequire(import.meta.url);
const { createCanvas } = require("@napi-rs/canvas"); // PDF.js's optional Node renderer.
const filePath = process.argv[2];
if (!filePath) throw new Error("Provide a PDF path. This script makes no network or database writes.");
const output = process.argv[3];
const root = path.dirname(require.resolve("pdfjs-dist/package.json"));
const asset = folder => `${pathToFileURL(path.join(root, folder))}/`;
const data = new Uint8Array(await readFile(filePath));
const task = getDocument({ data, stopAtErrors: true, disableFontFace: true,
  cMapUrl: asset("cmaps"), standardFontDataUrl: asset("standard_fonts"), wasmUrl: asset("wasm"), iccUrl: asset("iccs"),
});
const pdf = await task.promise;
let maxBytes = 0;
try {
  if (output) await mkdir(output, { recursive: true });
  for (let n = 1; n <= pdf.numPages; n++) {
    const page = await pdf.getPage(n);
    const natural = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: Math.min(1800 / natural.width, 1800 / natural.height) });
    const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
    await page.render({ canvas, canvasContext: canvas.getContext("2d"), viewport, background: "rgb(255,255,255)" }).promise;
    const bytes = canvas.toBuffer("image/jpeg", 90);
    maxBytes = Math.max(maxBytes, bytes.length);
    if (bytes.length >= 8_000_000) throw new Error(`Page ${n} exceeds the capture image size limit.`);
    if (output && [1, 55, 56, 57, 58, pdf.numPages].includes(n)) await writeFile(path.join(output, `page-${n}.jpg`), bytes);
    page.cleanup();
    if (n % 20 === 0) console.log(`Rendered ${n}/${pdf.numPages} pages`);
  }
  console.log(JSON.stringify({ pdfjs: version, pages: pdf.numPages, batches: Math.ceil(pdf.numPages / 4), maxJpegBytes: maxBytes, result: "PASS — offline rendering only" }));
} finally { await task.destroy(); }
