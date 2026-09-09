import { buildPresentation, parseZip, renderSlide, RECOMMENDED_ZIP_LIMITS, type PptxFiles } from "@aiden0z/pptx-renderer";
import { toCanvas } from "html-to-image";
import { PDF_MAX_BYTES, PDF_MAX_PAGES } from "./pdfImport";
import type { OpenPdf } from "./pdfRenderer";

const exportHelp = "Export the presentation as a PDF and upload that instead.";

/** Fail visibly for content this static renderer cannot faithfully turn into study sources. */
export function checkPowerPointContent(files: PptxFiles) {
  const rels = [files.presentationRels, ...files.slideRels.values(), ...files.slideLayoutRels.values(),
    ...files.slideMasterRels.values(), ...(files.chartRels?.values() ?? [])];
  for (const xml of rels) {
    const doc = new DOMParser().parseFromString(xml, "application/xml");
    for (const rel of Array.from(doc.getElementsByTagNameNS("*", "Relationship"))) {
      if (rel.getAttribute("TargetMode") === "External" && !rel.getAttribute("Type")?.endsWith("/hyperlink")) {
        throw new Error(`This presentation uses linked content that is not stored in the file. ${exportHelp}`);
      }
    }
  }
  const xml = [...files.slides.values(), ...files.slideLayouts.values(), ...files.slideMasters.values()];
  for (const part of xml) {
    const doc = new DOMParser().parseFromString(part, "application/xml");
    if (doc.querySelector("parsererror") || /<!DOCTYPE|<!ENTITY/i.test(part)) throw new Error(`This PowerPoint file could not be read. ${exportHelp}`);
    for (const node of Array.from(doc.getElementsByTagName("*"))) {
      if (["oMath", "oMathPara", "oleObj", "videoFile", "audioFile"].includes(node.localName)) {
        throw new Error(`This presentation contains equations or embedded objects that need a PDF export to preserve their appearance. ${exportHelp}`);
      }
    }
  }
  if ([...files.media.keys()].some(path => /\.(emf|wmf)$/i.test(path))) {
    throw new Error(`This presentation contains legacy vector artwork. ${exportHelp}`);
  }
}

/** Render on-device, one slide at a time; upload uses the existing private image capture gate. */
export async function openPowerPoint(file: File): Promise<OpenPdf> {
  if (!/\.pptx$/i.test(file.name) || !file.size || file.size > PDF_MAX_BYTES) {
    throw new Error("Choose a PowerPoint (.pptx) up to 25 MB, or export your slides as a PDF.");
  }
  const bytes = await file.arrayBuffer();
  if (bytes.byteLength < 4 || new DataView(bytes).getUint32(0, true) !== 0x04034b50) throw new Error(`This is not an unlocked PowerPoint (.pptx) file. ${exportHelp}`);
  const files = await parseZip(bytes, { ...RECOMMENDED_ZIP_LIMITS,
    maxTotalUncompressedBytes: 128 * 1024 * 1024, maxMediaBytes: 96 * 1024 * 1024, maxConcurrency: 2 });
  if (!files.slides.size || files.slides.size > PDF_MAX_PAGES) throw new Error("Choose a presentation with 1–300 slides. Export a smaller section if needed.");
  checkPowerPointContent(files);
  const presentation = buildPresentation(files, { lazySlides: true });
  if (!presentation.slides.length || presentation.slides.length > PDF_MAX_PAGES
    || !Number.isFinite(presentation.width) || !Number.isFinite(presentation.height)
    || Math.min(presentation.width, presentation.height) < 1 || Math.max(presentation.width, presentation.height) > 10000) {
    throw new Error(`This presentation has an unsupported slide size or count. ${exportHelp}`);
  }
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const fileHash = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, "0")).join("");
  let destroyed = false;
  const host = document.createElement("div");
  host.setAttribute("aria-hidden", "true");
  host.inert = true;
  host.style.cssText = `position:fixed;left:-20000px;top:0;pointer-events:none;color:#000;background:#fff;width:${presentation.width}px;height:${presentation.height}px;`;
  document.body.append(host);
  return {
    sourceKind: "slides", fileName: file.name.slice(0, 255), fileHash, pages: presentation.slides.length,
    async destroy() { destroyed = true; host.remove(); },
    async render(batch) {
      if (destroyed) throw new Error("Reopen the presentation before importing.");
      if (!Number.isInteger(batch.first) || !Number.isInteger(batch.last) || batch.first < 1 || batch.last < batch.first || batch.last > presentation.slides.length) {
        throw new Error("Choose slides within this presentation.");
      }
      const images: File[] = [];
      for (let number = batch.first; number <= batch.last; number++) {
        let failed = false;
        const handle = renderSlide(presentation, presentation.slides[number - 1], { pdfjs: false, onNodeError: () => { failed = true; } });
        host.append(handle.element);
        let canvas: HTMLCanvasElement | undefined;
        try {
          await handle.ready;
          await Promise.all(Array.from(handle.element.querySelectorAll("img")).map(img => img.decode()));
          if (failed || destroyed) throw new Error(`Slide ${number} could not be rendered completely. ${exportHelp}`);
          canvas = await toCanvas(handle.element, { backgroundColor: "#ffffff", skipFonts: true,
            width: presentation.width, height: presentation.height,
            pixelRatio: 1800 / Math.max(presentation.width, presentation.height) });
          const blob = await new Promise<Blob>((resolve, reject) => canvas!.toBlob(
            value => value ? resolve(value) : reject(new Error(`Could not save slide ${number}. ${exportHelp}`)), "image/jpeg", 0.9));
          if (destroyed) throw new Error("Reopen the presentation before importing.");
          images.push(new File([blob], `${file.name.replace(/\.pptx$/i, "").slice(0, 180)} - Slide ${number}.jpg`, { type: "image/jpeg", lastModified: 0 }));
        } finally {
          handle.dispose(); handle.element.remove();
          if (canvas) { canvas.width = 0; canvas.height = 0; }
        }
      }
      return images;
    },
  };
}
