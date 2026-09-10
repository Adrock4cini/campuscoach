import { readFileSync } from "node:fs";
import { webcrypto } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { parseZip, RECOMMENDED_ZIP_LIMITS } from "@aiden0z/pptx-renderer";
import { checkPowerPointContent, openPowerPoint } from "./powerPointRenderer";
import { openStudyDocument } from "./studyDocument";

const bytes = new Uint8Array(readFileSync("e2e/fixtures/lecture-slides.pptx")).buffer;
const file = () => Object.assign(new File([bytes], "Lecture.pptx"), { arrayBuffer: async () => bytes });
afterEach(() => vi.unstubAllGlobals());

describe("PowerPoint source import", () => {
  it("opens a real deck locally with slide identity and disposes its offscreen renderer", async () => {
    vi.stubGlobal("crypto", webcrypto);
    const before = document.body.childElementCount;
    const deck = await openStudyDocument(file());
    expect(deck).toMatchObject({ pages: 2, sourceKind: "slides", fileName: "Lecture.pptx" });
    expect(deck.fileHash).toMatch(/^[a-f0-9]{64}$/);
    await expect(deck.render({ first: 3, last: 4 })).rejects.toThrow(/within this presentation/);
    await deck.destroy();
    expect(document.body.childElementCount).toBe(before);
    await expect(deck.render({ first: 1, last: 1 })).rejects.toThrow(/Reopen/);
  });
  it("rejects oversized, renamed and legacy files with an actionable path", async () => {
    const big = file(); Object.defineProperty(big, "size", { value: 26 * 1024 * 1024 });
    await expect(openPowerPoint(big)).rejects.toThrow(/25 MB/);
    const invalid = Object.assign(new File(["bad"], "bad.pptx"), { arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer });
    await expect(openPowerPoint(invalid)).rejects.toThrow(/not an unlocked PowerPoint/);
    await expect(openStudyDocument(new File(["old"], "old.ppt"))).rejects.toThrow(/save as .pptx or export as PDF/);
  });
  it("requires PDF export for linked media instead of fetching private third-party resources", async () => {
    const parts = await parseZip(bytes, RECOMMENDED_ZIP_LIMITS);
    parts.slideRels.set("ppt/slides/_rels/slide1.xml.rels", '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" TargetMode="External" Target="https://example.com/private.png"/></Relationships>');
    expect(() => checkPowerPointContent(parts)).toThrow(/linked content/);
  });
  it("does not silently drop equations or legacy vector diagrams", async () => {
    const parts = await parseZip(bytes, RECOMMENDED_ZIP_LIMITS);
    parts.slides.set("ppt/slides/slide1.xml", '<m:oMath xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"/>');
    expect(() => checkPowerPointContent(parts)).toThrow(/equations/);
    parts.slides.clear(); parts.media.set("ppt/media/diagram.emf", new Uint8Array());
    expect(() => checkPowerPointContent(parts)).toThrow(/legacy vector/);
  });
});
