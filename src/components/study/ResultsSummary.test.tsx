import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ResultsSummary from "./ResultsSummary";

const mocks = vi.hoisted(() => ({
  contributeStudySignal: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock("@/hooks/useClassIntelligence", () => ({
  contributeStudySignal: mocks.contributeStudySignal,
}));

vi.mock("sonner", () => ({
  toast: { success: mocks.toastSuccess },
}));

vi.mock("@/components/ui/select", () => ({
  Select: ({ children, onValueChange }: {
    children: React.ReactNode;
    onValueChange: (value: string) => void;
  }) => (
    <div>
      {children}
      <button type="button" onClick={() => onValueChange("4")}>Set confidence to 4</button>
    </div>
  ),
  SelectContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelectItem: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
  SelectTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectValue: ({ placeholder }: { placeholder: string }) => <span>{placeholder}</span>,
}));

const baseProps = {
  classId: "psych101",
  topic: "Memory Models",
  mode: "flashcards" as const,
  correct: 4,
  incorrect: 1,
  skipped: 0,
  elapsed: 300,
  onRetryMissed: vi.fn(),
  onReplay: vi.fn(),
  onSwitchMode: vi.fn(),
  onBackToLab: vi.fn(),
};

describe("ResultsSummary persistence boundary", () => {
  beforeEach(() => {
    mocks.contributeStudySignal.mockReset().mockResolvedValue({ error: null });
    mocks.toastSuccess.mockReset();
  });

  it("keeps demo results and confidence local", async () => {
    render(<ResultsSummary {...baseProps} persistence="local-only" />);

    fireEvent.click(screen.getByRole("button", { name: "Set confidence to 4" }));

    await waitFor(() => {
      expect(mocks.contributeStudySignal).not.toHaveBeenCalled();
    });
    expect(mocks.toastSuccess).toHaveBeenCalledWith("Saved for this demo session.");
    expect(screen.queryByText(/whole class/i)).not.toBeInTheDocument();
    expect(screen.getByText("Demo practice estimate: 80%")).toBeInTheDocument();
    expect(screen.getByText(/does not update an account/i)).toBeInTheDocument();
    expect(screen.queryByText(/readiness:/i)).not.toBeInTheDocument();
  });

  it("preserves remote session and confidence contributions", async () => {
    render(<ResultsSummary {...baseProps} persistence="remote" />);

    await waitFor(() => {
      expect(mocks.contributeStudySignal).toHaveBeenCalledWith(
        expect.objectContaining({
          classId: "psych101",
          topicName: "Memory Models",
          sourceType: "study-session",
        }),
      );
    });

    fireEvent.click(screen.getByRole("button", { name: "Set confidence to 4" }));
    await waitFor(() => {
      expect(mocks.contributeStudySignal).toHaveBeenCalledWith(
        expect.objectContaining({
          confidence: 4,
          sourceType: "confidence-checkin",
        }),
      );
    });
  });
});
