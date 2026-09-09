import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { openPdf } from "./pdfRenderer";
const mocks = vi.hoisted(() => ({ pages: 2, getDocument: vi.fn(), destroy: vi.fn(), render: vi.fn(), cleanup: vi.fn() }));
vi.mock("pdfjs-dist/legacy/build/pdf.mjs", () => ({ getDocument: mocks.getDocument, version: "6.3.289", GlobalWorkerOptions: { workerSrc: "" } }));
vi.mock("pdfjs-dist/legacy/build/pdf.worker.min.mjs?url", () => ({ default: "/self-hosted-worker.mjs" }));
function file(name = "Test.pdf", text = "%PDF-1.7\n") {
  return Object.assign(new File([text], name), { arrayBuffer: async () => new TextEncoder().encode(text).buffer });
}
beforeEach(() => {
  vi.clearAllMocks(); mocks.pages = 2; mocks.destroy.mockResolvedValue(undefined); mocks.render.mockReturnValue({ promise: Promise.resolve() });
  vi.stubGlobal("crypto", { subtle: { digest: async () => new ArrayBuffer(32) } });
  mocks.getDocument.mockImplementation(() => ({ destroy: mocks.destroy, promise: Promise.resolve({ numPages: mocks.pages,
    getPage: async () => ({ getViewport: ({ scale }: { scale: number }) => ({ width: 612 * scale, height: 792 * scale }), render: mocks.render, cleanup: mocks.cleanup }),
  }) }));
  vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(callback => callback(new Blob(["image"], { type: "image/jpeg" })));
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
describe("PDF page renderer", () => {
  it("uses a local worker/assets and disposes the loading task (PDF.js v6 API)", async () => {
    const pdf = await openPdf(file());
    expect(mocks.getDocument).toHaveBeenCalledWith(expect.objectContaining({ stopAtErrors: true, cMapUrl: "/pdfjs/6.3.289/cmaps/", wasmUrl: "/pdfjs/6.3.289/wasm/" }));
    expect(pdf.pages).toBe(2); expect(pdf.fileHash).toHaveLength(64);
    await pdf.destroy(); expect(mocks.destroy).toHaveBeenCalledTimes(1);
  });
  it("renders ordered JPEGs with stable page names and bounded canvas size", async () => {
    const pdf = await openPdf(file()); const images = await pdf.render({ first: 1, last: 2 });
    expect(images.map(f => f.name)).toEqual(["Test - PDF page 1.jpg", "Test - PDF page 2.jpg"]);
    expect(images.every(f => f.type === "image/jpeg" && f.lastModified === 0)).toBe(true);
    expect(mocks.cleanup).toHaveBeenCalledTimes(2);
    expect(mocks.render.mock.calls[0][0].viewport.height).toBeCloseTo(1800, 6);
  });
  it("cleans up canvas/page resources on a rendering failure", async () => {
    mocks.render.mockImplementation(() => ({ promise: Promise.reject(new Error("Broken page")) }));
    const pdf = await openPdf(file()); await expect(pdf.render({ first: 1, last: 1 })).rejects.toThrow("Broken page");
    expect(mocks.cleanup).toHaveBeenCalledTimes(1);
    expect(mocks.render.mock.calls[0][0].canvas.width).toBe(0);
  });
  it.each([["Test.docx", "%PDF-1.7"], ["Test.pdf", "not a pdf"], ["Test.pdf", ""]])("rejects an invalid source before parsing: %s", async (name, text) => {
    await expect(openPdf(file(name, text))).rejects.toThrow(); expect(mocks.getDocument).not.toHaveBeenCalled();
  });
  it("rejects oversized PDFs before reading them", async () => {
    const large = file(); Object.defineProperty(large, "size", { value: 26 * 1024 * 1024 });
    await expect(openPdf(large)).rejects.toThrow(/25 MB/); expect(mocks.getDocument).not.toHaveBeenCalled();
  });
  it("destroys too-large and encrypted documents without uploading", async () => {
    mocks.pages = 301; await expect(openPdf(file())).rejects.toThrow(/300 pages/); expect(mocks.destroy).toHaveBeenCalledTimes(1);
    mocks.getDocument.mockImplementation(() => ({ destroy: mocks.destroy, promise: Promise.reject(Object.assign(new Error("password"), { name: "PasswordException" })) }));
    await expect(openPdf(file())).rejects.toThrow(/password-protected/); expect(mocks.destroy).toHaveBeenCalledTimes(2);
  });
});
