import { describe, expect, it } from "vitest";
import { describeFunctionError } from "./functionError";

describe("describeFunctionError", () => {
  it("reads the edge-function response body instead of showing non-2xx", async () => {
    const context = new Response(
      JSON.stringify({ error: "No concepts found for this request" }),
      { status: 404, headers: { "Content-Type": "application/json" } },
    );

    await expect(describeFunctionError({ message: "Edge Function returned a non-2xx status code", context }))
      .resolves.toContain("Add a quick note or professor hint");
  });

  it("preserves an existing set when a server error occurs", async () => {
    const context = new Response(
      JSON.stringify({ error: "generation failed" }),
      { status: 502, headers: { "Content-Type": "application/json" } },
    );

    await expect(describeFunctionError({ context }))
      .resolves.toContain("existing study set is still safe");
  });
});
