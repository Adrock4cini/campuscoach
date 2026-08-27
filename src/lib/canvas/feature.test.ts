import { describe, expect, it } from "vitest";
import { isCanvasConnectEnabled } from "./feature";

describe("Canvas Connect public build flag", () => {
  it.each([undefined, null, "", "false", "TRUE", "1", true])(
    "fails closed for %j",
    (value) => {
      expect(isCanvasConnectEnabled(value)).toBe(false);
    },
  );

  it("enables Canvas only for the exact reviewed value", () => {
    expect(isCanvasConnectEnabled("true")).toBe(true);
  });
});
