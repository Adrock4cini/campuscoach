import { describe, expect, it } from "vitest";
import { describeStudentFacingFailure, isNetworkFailure } from "./studentFacingError";

describe("truthful failure copy", () => {
  it("never shows the raw edge-function transport string", () => {
    const text = describeStudentFacingFailure(
      new Error("Edge Function returned a non-2xx status code"),
      "We couldn't save your answers",
    );
    expect(text).not.toMatch(/non-2xx/i);
    expect(text).toMatch(/problem on our side/i);
  });

  it("does not blame the connection for a server rejection", () => {
    const text = describeStudentFacingFailure(
      new Error("Edge Function returned a non-2xx status code"),
      "We couldn't save your answers",
    );
    expect(text).not.toMatch(/offline|connection/i);
  });

  it("does blame the network when the request never reached the server", () => {
    expect(isNetworkFailure(new TypeError("Failed to fetch"))).toBe(true);
    expect(describeStudentFacingFailure(new TypeError("Failed to fetch"), "We couldn't save your answers"))
      .toMatch(/offline/i);
  });

  it("keeps a specific server message the student can act on", () => {
    expect(describeStudentFacingFailure(
      new Error("Your session expired. Sign in again, then retry."),
      "We couldn't save your answers",
    )).toMatch(/session expired/i);
  });
});
