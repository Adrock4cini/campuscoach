import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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

describe("failed capture recovery", () => {
  it("warns before a wrong-subject photo can enter the study set", async () => {
    const onConfirmClassMismatch = vi.fn().mockResolvedValue(undefined);
    render(
      <CaptureDoneSummary
        result={result({
          processingStatus: "failed",
          captureId: "db-capture-1",
          classMismatch: {
            detectedSubject: "Accounting, business & economics",
            detectedSubjectId: "business_accounting",
            selectedClassName: "BIOL",
          },
        })}
        sample={false}
        className="BIOL"
        onClose={vi.fn()}
        onOpenClass={vi.fn()}
        onConfirmClassMismatch={onConfirmClassMismatch}
      />,
    );

    expect(screen.getByText("Looks like Accounting, business & economics")).toBeInTheDocument();
    expect(screen.getByText(/nothing was added to its study set/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /retry processing/i })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Keep it in BIOL" }));
    await waitFor(() => expect(onConfirmClassMismatch).toHaveBeenCalledTimes(1));
  });

  it("retries processing in place instead of sending the student to the class page", async () => {
    const onRetryProcessing = vi.fn().mockResolvedValue(undefined);
    render(
      <CaptureDoneSummary
        result={result({ processingStatus: "failed", captureId: "db-capture-1" })}
        sample={false}
        className="Algebra II"
        onClose={vi.fn()}
        onOpenClass={vi.fn()}
        onRetryProcessing={onRetryProcessing}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /retry processing/i }));
    await waitFor(() => expect(onRetryProcessing).toHaveBeenCalledTimes(1));
  });

  it("keeps the capture safe and explains a failed retry", async () => {
    const onRetryProcessing = vi.fn().mockRejectedValue(new Error("Campus Brain is busy."));
    render(
      <CaptureDoneSummary
        result={result({ processingStatus: "failed", captureId: "db-capture-1" })}
        sample={false}
        className="Algebra II"
        onClose={vi.fn()}
        onOpenClass={vi.fn()}
        onRetryProcessing={onRetryProcessing}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /retry processing/i }));
    await waitFor(() => expect(screen.getByText("Campus Brain is busy.")).toBeInTheDocument());
  });
});
