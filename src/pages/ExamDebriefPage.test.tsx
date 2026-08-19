import type { ReactNode } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  channel: vi.fn(),
  removeChannel: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: mocks.from,
    channel: mocks.channel,
    removeChannel: mocks.removeChannel,
  },
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ mode: "demo" }),
}));

vi.mock("sonner", () => ({
  toast: { success: mocks.toastSuccess, error: vi.fn() },
}));

vi.mock("@/components/ui/select", () => ({
  Select: ({
    children,
    value,
    onValueChange,
  }: {
    children: ReactNode;
    value: string;
    onValueChange: (value: string) => void;
  }) => (
    <select value={value} onChange={(event) => onValueChange(event.target.value)}>
      <option value="" />
      {children}
    </select>
  ),
  SelectTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  SelectValue: () => null,
  SelectContent: ({ children }: { children: ReactNode }) => <>{children}</>,
  SelectItem: ({ children, value }: { children: ReactNode; value: string }) => (
    <option value={value}>{children}</option>
  ),
}));

import ExamDebriefPage from "./ExamDebriefPage";

describe("ExamDebriefPage demo submissions", () => {
  beforeEach(() => vi.clearAllMocks());

  it("keeps a reflection in component state and never constructs a Supabase request", async () => {
    render(
      <MemoryRouter>
        <ExamDebriefPage />
      </MemoryRouter>,
    );

    expect(screen.getByText(/peer insights are sample data/i)).toBeInTheDocument();
    fireEvent.change(screen.getAllByRole("combobox")[0], {
      target: { value: "psych101" },
    });
    fireEvent.change(screen.getAllByRole("combobox")[1], {
      target: { value: "e2" },
    });
    fireEvent.change(screen.getByPlaceholderText(/comma-separated/i), {
      target: { value: "Retrieval cues" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add to demo" }));

    await waitFor(() => {
      expect(screen.getByText(/your demo reflection is included/i)).toBeInTheDocument();
    });
    expect(mocks.toastSuccess).toHaveBeenCalledWith(
      "Added to this demo screen",
      expect.objectContaining({
        description: expect.stringMatching(/not saved.*or shared/i),
      }),
    );
    expect(screen.getByText("25", { selector: "strong" })).toBeInTheDocument();
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.channel).not.toHaveBeenCalled();
    expect(mocks.removeChannel).not.toHaveBeenCalled();
  });
});
