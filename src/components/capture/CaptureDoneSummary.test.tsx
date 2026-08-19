import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CaptureDoneSummary } from "./CaptureFlow";
import type { CaptureResult } from "@/lib/capture/types";

function result(overrides: Partial<CaptureResult> = {}): CaptureResult {
  return {
    id: "capture-1",
    kind: "note",
    context: { classId: "class-1", date: "2026-01-05" },
    summary: "Saved your note.",
    keyConcepts: [],
    flashcardCount: 0,
    ...overrides,
  } as CaptureResult;
}

describe("capture done summary", () => {
  it("never promises practice while Campus Brain is still reading the capture", () => {
    render(
      <CaptureDoneSummary
        result={result({ processingStatus: "processing" })}
        sample={false}
        className="Algebra II"
        onClose={vi.fn()}
        onOpenClass={vi.fn()}
      />,
    );

    expect(screen.queryByRole("button", { name: /practice this now/i })).not.toBeInTheDocument();
    expect(screen.getByText(/still reading this/i)).toBeInTheDocument();
  });

  it("offers the one practice action once the capture is ready", () => {
    render(
      <CaptureDoneSummary
        result={result({ processingStatus: "ready" })}
        sample={false}
        className="Algebra II"
        onClose={vi.fn()}
        onOpenClass={vi.fn()}
        onPractice={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: /practice this now/i })).toBeInTheDocument();
    expect(screen.queryByText(/still reading this/i)).not.toBeInTheDocument();
  });
});
