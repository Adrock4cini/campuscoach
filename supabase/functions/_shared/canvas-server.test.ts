import { canvasAppUrl, safeAppRedirect } from "./canvas-server.ts";

function withCanvasAppUrl(value: string | null, callback: () => void) {
  const previous = Deno.env.get("CANVAS_APP_URL");
  try {
    if (value === null) Deno.env.delete("CANVAS_APP_URL");
    else Deno.env.set("CANVAS_APP_URL", value);
    callback();
  } finally {
    if (previous === undefined) Deno.env.delete("CANVAS_APP_URL");
    else Deno.env.set("CANVAS_APP_URL", previous);
  }
}

function assertEquals(actual: unknown, expected: unknown) {
  if (actual !== expected) {
    throw new Error(`Expected ${String(expected)}, received ${String(actual)}`);
  }
}

function assertThrows(callback: () => unknown, message: string) {
  try {
    callback();
  } catch (error) {
    assertEquals(
      error instanceof Error ? error.message : String(error),
      message,
    );
    return;
  }
  throw new Error("Expected callback to throw");
}

Deno.test(
  "Canvas app redirects fail closed without an explicit canonical origin",
  () => {
    withCanvasAppUrl(null, () => {
      assertThrows(canvasAppUrl, "CANVAS_APP_URL is not configured");
    });
  },
);

Deno.test(
  "Canvas app redirects reject non-origin and non-HTTPS configuration",
  () => {
    for (const value of [
      "http://app.example.edu",
      "https://app.example.edu/path",
      "https://user:password@app.example.edu",
      "https://app.example.edu:8443",
    ]) {
      withCanvasAppUrl(value, () => {
        assertThrows(canvasAppUrl, "CANVAS_APP_URL must be an HTTPS origin");
      });
    }
  },
);

Deno.test(
  "Canvas app redirects stay on the exact configured HTTPS origin",
  () => {
    withCanvasAppUrl("https://app.example.edu", () => {
      assertEquals(canvasAppUrl(), "https://app.example.edu");
      assertEquals(
        safeAppRedirect("/integrations/canvas"),
        "https://app.example.edu/integrations/canvas",
      );
    });
  },
);
