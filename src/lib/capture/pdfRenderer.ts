import { PDF_MAX_BYTES, PDF_MAX_PAGES, type PdfBatch } from "./pdfImport";

export interface OpenPdf {
  sourceKind?: "pdf" | "slides";
  fileName: string;
  fileHash: string;
  pages: number;
  render: (batch: Pick<PdfBatch, "first" | "last">) => Promise<File[]>;
  destroy: () => Promise<void>;
}

export async function openPdf(file: File): Promise<OpenPdf> {
  if (!/\.pdf$/i.test(file.name) || !file.size || file.size > PDF_MAX_BYTES) {
    throw new Error("Choose a PDF up to 25 MB. Other document formats are not supported yet.");
  }
  const bytes = await file.arrayBuffer();
  if (!new TextDecoder().decode(bytes.slice(0, 1024)).includes("%PDF-")) {
    throw new Error("This file is not a readable PDF. Export it as a PDF and try again.");
  }
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const fileHash = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, "0")).join("");
  // Lazy, self-hosted worker: no document bytes are sent to a PDF vendor/CDN.
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const { default: workerUrl } = await import("pdfjs-dist/legacy/build/pdf.worker.min.mjs?url");
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  const assetRoot = `${import.meta.env.BASE_URL}pdfjs/${pdfjs.version}/`;
  const task = pdfjs.getDocument({ data: bytes, stopAtErrors: true,
    cMapUrl: `${assetRoot}cmaps/`, standardFontDataUrl: `${assetRoot}standard_fonts/`,
    wasmUrl: `${assetRoot}wasm/`, iccUrl: `${assetRoot}iccs/`,
    canvasMaxAreaInBytes: 16 * 1024 * 1024,
  });
  let pdf: Awaited<typeof task.promise>;
  try {
    pdf = await task.promise;
    if (pdf.numPages > PDF_MAX_PAGES) throw new Error(`PDFs can contain up to ${PDF_MAX_PAGES} pages. Export a smaller section.`);
  } catch (error) {
    await task.destroy();
    if (error instanceof Error && error.name === "PasswordException") throw new Error("This PDF is password-protected. Export an unlocked copy first.");
    throw error;
  }
  const documentPdf = pdf;
  return {
    fileName: file.name.slice(0, 255), fileHash, pages: pdf.numPages,
    destroy: () => task.destroy(),
    async render(batch) {
      const files: File[] = [];
      for (let number = batch.first; number <= batch.last; number++) {
        const page = await documentPdf.getPage(number);
        const canvas = document.createElement("canvas");
        try {
          const natural = page.getViewport({ scale: 1 });
          const viewport = page.getViewport({ scale: Math.min(1800 / natural.width, 1800 / natural.height) });
          canvas.width = Math.ceil(viewport.width);
          canvas.height = Math.ceil(viewport.height);
          await page.render({ canvas, viewport, background: "rgb(255,255,255)" }).promise;
          const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error(`Could not render PDF page ${number}.`)), "image/jpeg", 0.9));
          files.push(new File([blob], `${file.name.replace(/\.pdf$/i, "").slice(0, 180)} - PDF page ${number}.jpg`, { type: "image/jpeg", lastModified: 0 }));
        } finally {
          canvas.width = 0;
          canvas.height = 0;
          page.cleanup();
        }
      }
      return files;
    },
  };
}
