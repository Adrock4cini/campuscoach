import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { OnboardingDialog } from "./OnboardingDialog";

const mocks = vi.hoisted(() => ({
  auth: {
    mode: "real",
    user: { id: "user-1", user_metadata: {} },
  },
  updateUser: vi.fn().mockResolvedValue({ data: {}, error: null }),
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => mocks.auth,
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: { updateUser: mocks.updateUser } },
}));

describe("product tour", () => {
  beforeEach(() => {
    localStorage.clear();
    mocks.updateUser.mockClear();
    mocks.auth.mode = "real";
    mocks.auth.user = { id: "user-1", user_metadata: {} };
  });

  it("saves dismissal in the browser and on the student's account", () => {
    const { unmount } = render(<OnboardingDialog />);

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Skip" }));

    expect(localStorage.getItem("cc_onboarded_v1:user-1")).toBe("1");
    expect(mocks.updateUser).toHaveBeenCalledWith({
      data: { campus_companion_tour_seen_v1: true },
    });

    unmount();
    render(<OnboardingDialog />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
