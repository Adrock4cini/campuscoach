import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  contributeStudySignal: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ mode: "demo" }),
}));

vi.mock("@/hooks/useClassIntelligence", () => ({
  contributeStudySignal: mocks.contributeStudySignal,
}));

vi.mock("sonner", () => ({
  toast: { success: mocks.toastSuccess, error: vi.fn() },
}));

import { ContributeHub } from "./ContributeHub";

describe("ContributeHub demo submissions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.contributeStudySignal.mockResolvedValue({ error: null });
  });

  it("labels the flow as local and reports that a sample was not shared", async () => {
    render(
      <MemoryRouter>
        <ContributeHub defaultClassId="psych101" />
      </MemoryRouter>,
    );

    expect(screen.getByText(/demo entries stay on this screen and are never shared/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /add teacher hint/i }));
    fireEvent.change(screen.getByPlaceholderText("e.g. Polynomial Roots"), {
      target: { value: "Memory models" },
    });
    fireEvent.change(screen.getByPlaceholderText(/no exact exam content/i), {
      target: { value: "The professor repeated this concept." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add to demo" }));

    await waitFor(() => expect(mocks.contributeStudySignal).toHaveBeenCalledWith(
      expect.objectContaining({
        classId: "psych101",
        topicName: "Memory models",
        sourceType: "professor-hint",
      }),
      "demo",
    ));
    expect(mocks.toastSuccess).toHaveBeenCalledWith(
      "Added to this demo screen",
      expect.objectContaining({
        description: expect.stringMatching(/not saved.*or shared/i),
      }),
    );
    expect(await screen.findByText(/Demo only · Teacher hint: Memory models\. Not saved or shared\./i)).toBeInTheDocument();
  });
});
