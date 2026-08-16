import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getClassSyllabusRequest,
  parseClassSyllabus,
  uploadSyllabusSource,
  validateSyllabusFile,
} from "./repository";

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  from: vi.fn(),
  getUser: vi.fn(),
  storageFrom: vi.fn(),
  upload: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    functions: { invoke: mocks.invoke },
    from: mocks.from,
    auth: { getUser: mocks.getUser },
    rpc: vi.fn(),
    storage: { from: mocks.storageFrom },
  },
}));

describe("class syllabus repository", () => {
  beforeEach(() => {
    mocks.invoke.mockReset();
    mocks.from.mockReset();
    mocks.getUser.mockReset();
    mocks.storageFrom.mockReset();
    mocks.upload.mockReset();
    mocks.getUser.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
    mocks.storageFrom.mockReturnValue({ upload: mocks.upload });
  });

  it("sends immutable target context to parsing and runtime-validates the response", async () => {
    mocks.invoke.mockResolvedValue({
      data: { classes: [{ name: "Biology", assignments: [], examDates: [], schedule: [] }] },
      error: null,
    });
    const file = new File(["syllabus"], "biology.pdf", { type: "application/pdf" });
    await expect(parseClassSyllabus(file, {
      id: "11111111-1111-4111-8111-111111111111",
      clientClassId: "biology",
      name: "Biology 101",
      code: "BIO 101",
      term: "Fall 2026",
    })).resolves.toEqual(expect.objectContaining({ classes: [expect.objectContaining({ name: "Biology" })] }));
    expect(mocks.invoke).toHaveBeenCalledWith("parse-syllabus", expect.objectContaining({
      body: expect.objectContaining({
        targetClass: {
          id: "11111111-1111-4111-8111-111111111111",
          clientClassId: "biology",
          name: "Biology 101",
          code: "BIO 101",
          term: "Fall 2026",
        },
      }),
    }));

    mocks.invoke.mockResolvedValue({ data: { classes: "untrusted" }, error: null });
    await expect(parseClassSyllabus(file, {
      id: "11111111-1111-4111-8111-111111111111",
      clientClassId: "biology",
      name: "Biology 101",
    })).rejects.toThrow();
  });

  it("does not trust a dangerous advertised MIME type just because the filename ends in PDF", () => {
    const disguisedHtml = new File(["<html>"], "syllabus.pdf", { type: "text/html" });
    expect(() => validateSyllabusFile(disguisedHtml)).toThrow(/PDF, JPEG/i);
    const noAdvertisedType = new File(["pdf"], "syllabus.pdf", { type: "" });
    expect(validateSyllabusFile(noAdvertisedType)).toBe("application/pdf");
  });

  it("turns a Storage quota policy denial into a useful retry message", async () => {
    mocks.upload.mockResolvedValue({
      data: null,
      error: { statusCode: "403", message: "new row violates row-level security policy" },
    });
    const file = new File(["syllabus"], "biology.pdf", { type: "application/pdf" });
    Object.defineProperty(file, "arrayBuffer", {
      value: vi.fn().mockResolvedValue(new TextEncoder().encode("syllabus").buffer),
    });

    await expect(uploadSyllabusSource({
      classUuid: "11111111-1111-4111-8111-111111111111",
      requestId: "22222222-2222-4222-8222-222222222222",
      file,
    })).rejects.toThrow(/unfinished syllabus uploads.*pending save.*cleanup/i);
  });

  it("reads the request ledger as the authoritative ambiguous-commit result", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: {
        request_id: "22222222-2222-4222-8222-222222222222",
        class_id: "11111111-1111-4111-8111-111111111111",
        client_class_id: "biology",
        storage_path: "owner/class/request/source.pdf",
        original_name: "biology.pdf",
        mime_type: "application/pdf",
        size_bytes: 123,
        content_hash: "a".repeat(64),
        parsed_data: { classes: [{ name: "Biology" }] },
        reviewed_data: {
          selectedClassIndex: 0,
          sourceClassName: "Biology",
          sourceClassCode: "BIO 101",
          class: { weekdays: [], startTime: "", endTime: "", term: "", semesterStartDate: "", semesterEndDate: "" },
          assignments: [], exams: [], schedule: [],
        },
        syllabus_id: "33333333-3333-4333-8333-333333333333",
        result: { syllabusId: "33333333-3333-4333-8333-333333333333", revision: 1, noOp: false, retry: false, cleanupPath: null },
        created_at: "2026-08-10T12:00:00Z",
      },
      error: null,
    });
    mocks.from.mockReturnValue({ select: () => ({ eq: () => ({ maybeSingle }) }) });
    await expect(getClassSyllabusRequest("22222222-2222-4222-8222-222222222222"))
      .resolves.toEqual(expect.objectContaining({ result: expect.objectContaining({ revision: 1 }) }));
  });
});
