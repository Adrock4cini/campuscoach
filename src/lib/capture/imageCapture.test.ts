import { describe, expect, it } from "vitest";
import {
  appendCaptureImages,
  buildCaptureStoragePath,
  filterCaptureTargets,
  validateCaptureImages,
} from "./imageCapture";

function image(name: string, size: number, type = "image/jpeg") {
  return new File([new Uint8Array(size)], name, { type });
}

describe("assignment image capture guardrails", () => {
  it("keeps only the first four photos from an oversized selection", () => {
    const selected = Array.from({ length: 6 }, (_, index) => image(`page-${index + 1}.jpg`, 1));

    const result = appendCaptureImages([], selected);

    expect(result.files.map((file) => file.name)).toEqual([
      "page-1.jpg",
      "page-2.jpg",
      "page-3.jpg",
      "page-4.jpg",
    ]);
    expect(result.rejectedCount).toBe(2);
  });

  it("fills only the remaining slots when photos are added in more than one step", () => {
    const current = [
      image("page-1.jpg", 1),
      image("page-2.jpg", 1),
      image("page-3.jpg", 1),
    ];
    const incoming = [
      image("page-4.jpg", 1),
      image("page-5.jpg", 1),
      image("page-6.jpg", 1),
    ];

    const result = appendCaptureImages(current, incoming);

    expect(result.files.map((file) => file.name)).toEqual([
      "page-1.jpg",
      "page-2.jpg",
      "page-3.jpg",
      "page-4.jpg",
    ]);
    expect(result.rejectedCount).toBe(2);
  });

  it("rejects another camera photo after the capture reaches four", () => {
    const current = Array.from({ length: 4 }, (_, index) => image(`page-${index + 1}.jpg`, 1));

    const result = appendCaptureImages(current, [image("page-5.jpg", 1)]);

    expect(result.files).toEqual(current);
    expect(result.rejectedCount).toBe(1);
  });

  it("accepts up to four supported images within the release cost budget", () => {
    const result = validateCaptureImages([
      image("page-1.jpg", 2_000_000),
      image("page-2.png", 2_000_000, "image/png"),
      image("page-3.webp", 2_000_000, "image/webp"),
      image("page-4.heic", 2_000_000, "image/heic"),
    ]);

    expect(result).toEqual({ ok: true, message: null });
  });

  it("rejects empty, oversized, unsupported, or too many image submissions", () => {
    expect(validateCaptureImages([]).ok).toBe(false);
    expect(validateCaptureImages(Array.from({ length: 5 }, (_, i) => image(`${i}.jpg`, 1))).ok).toBe(false);
    expect(validateCaptureImages([image("huge.jpg", 8_000_001)]).ok).toBe(false);
    expect(validateCaptureImages([image("homework.pdf", 100, "application/pdf")]).ok).toBe(false);
    expect(validateCaptureImages([
      image("one.jpg", 7_000_000),
      image("two.jpg", 7_000_000),
      image("three.jpg", 7_000_000),
      image("four.jpg", 4_000_001),
    ]).ok).toBe(false);
  });

  it("builds a private owner-scoped path without trusting the original filename", () => {
    const ownerId = "11111111-1111-4111-8111-111111111111";
    const captureId = "22222222-2222-4222-8222-222222222222";
    const hash = "abcdef0123456789".repeat(4);
    expect(
      buildCaptureStoragePath(
        ownerId,
        captureId,
        image("../../Final Exam Answers.JPG", 10),
        hash,
      ),
    ).toBe(`${ownerId}/${captureId}/${hash}.jpg`);
  });

  it("rejects partial hashes and non-canonical owner or capture IDs", () => {
    const photo = image("page.jpg", 10);
    const ownerId = "11111111-1111-4111-8111-111111111111";
    const captureId = "22222222-2222-4222-8222-222222222222";
    expect(() => buildCaptureStoragePath(ownerId, captureId, photo, "a".repeat(63)))
      .toThrow(/complete SHA-256/i);
    expect(() => buildCaptureStoragePath("student-1", captureId, photo, "a".repeat(64)))
      .toThrow(/valid capture owner/i);
    expect(() => buildCaptureStoragePath(ownerId, "capture-1", photo, "a".repeat(64)))
      .toThrow(/valid capture owner/i);
  });

  it("only offers assignments and exams from the selected class", () => {
    const targets = filterCaptureTargets(
      "math",
      [
        { id: "assignment-math", client_class_id: "math" },
        { id: "assignment-science", client_class_id: "science" },
        { id: "assignment-unscoped", client_class_id: null },
      ],
      [
        { id: "exam-math", client_class_id: "math" },
        { id: "exam-science", client_class_id: "science" },
      ],
    );

    expect(targets.assignments.map((item) => item.id)).toEqual(["assignment-math"]);
    expect(targets.exams.map((item) => item.id)).toEqual(["exam-math"]);
  });
});
