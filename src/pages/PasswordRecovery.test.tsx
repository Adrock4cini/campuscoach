import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  resetPasswordForEmail: vi.fn(),
  updateUser: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: {
    resetPasswordForEmail: mocks.resetPasswordForEmail,
    updateUser: mocks.updateUser,
  } },
}));

vi.mock("sonner", () => ({
  toast: { error: mocks.toastError, success: vi.fn() },
}));

import ForgotPassword from "./ForgotPassword";
import ResetPassword from "./ResetPassword";

describe("password recovery network failures", () => {
  beforeEach(() => vi.clearAllMocks());

  it("re-enables the reset-email form after a rejected request", async () => {
    mocks.resetPasswordForEmail.mockRejectedValueOnce(new Error("offline"));
    render(<MemoryRouter><ForgotPassword /></MemoryRouter>);
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "student@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Send reset link" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "Send reset link" })).toBeEnabled());
    expect(mocks.toastError).toHaveBeenCalledWith(
      "Couldn't send reset email",
      expect.objectContaining({ description: expect.stringMatching(/connection/i) }),
    );
  });

  it("re-enables the new-password form after a rejected request", async () => {
    mocks.updateUser.mockRejectedValueOnce(new Error("offline"));
    render(<MemoryRouter><ResetPassword /></MemoryRouter>);
    fireEvent.change(screen.getByLabelText("New password"), { target: { value: "safe-password" } });
    fireEvent.click(screen.getByRole("button", { name: "Update password" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "Update password" })).toBeEnabled());
    expect(mocks.toastError).toHaveBeenCalledWith(
      "Couldn't update password",
      expect.objectContaining({ description: expect.stringMatching(/connection/i) }),
    );
  });
});
