import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  channel: vi.fn(),
  removeChannel: vi.fn(),
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

import CourseIntelligencePage from "./CourseIntelligencePage";

describe("CourseIntelligencePage demo data", () => {
  it("renders a clearly labeled, realistic fixture without Supabase activity", () => {
    render(
      <MemoryRouter>
        <CourseIntelligencePage />
      </MemoryRouter>,
    );

    expect(screen.getByText(/community counts and trends are realistic sample data/i)).toBeInTheDocument();
    expect(screen.getByText("24", { selector: "strong" })).toBeInTheDocument();
    expect(screen.getAllByText("Memory models").length).toBeGreaterThan(0);
    expect(screen.getByText(/practice the lecture examples/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try a Debrief" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Submit Debrief" })).not.toBeInTheDocument();
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.channel).not.toHaveBeenCalled();
    expect(mocks.removeChannel).not.toHaveBeenCalled();
  });
});
