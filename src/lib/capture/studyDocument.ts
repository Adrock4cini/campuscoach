import type { OpenPdf } from "./pdfRenderer";

export async function openStudyDocument(file: File): Promise<OpenPdf> {
  if (/\.pdf$/i.test(file.name)) return (await import("./pdfRenderer")).openPdf(file);
  if (/\.pptx$/i.test(file.name)) return (await import("./powerPointRenderer")).openPowerPoint(file);
  throw new Error("Choose a PDF or PowerPoint (.pptx). For Google Slides, download as PowerPoint or PDF. For older .ppt files, save as .pptx or export as PDF first.");
}
