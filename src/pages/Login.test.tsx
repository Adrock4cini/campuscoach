import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  signInWithPassword: vi.fn(),
  signInWithOAuth: vi.fn(),
  canUsePasskeys: vi.fn(),
  signInWithPasskey: vi.fn(),
  markPasskeyOfferPending: vi.fn(),
  armOAuthPasskeyOffer: vi.fn(),
  clearOAuthPasskeyOffer: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: { signInWithPassword: mocks.signInWithPassword } },
}));

vi.mock("@/integrations/lovable", () => ({
  lovable: { auth: { signInWithOAuth: mocks.signInWithOAuth } },
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ enableDemoMode: vi.fn() }),
}));

vi.mock("@/lib/auth/passkeys", () => ({
  armOAuthPasskeyOffer: mocks.armOAuthPasskeyOffer,
  canUsePasskeys: mocks.canUsePasskeys,
  clearOAuthPasskeyOffer: mocks.clearOAuthPasskeyOffer,
  humanizePasskeyError: () => "Use Google or your password instead.",
  markPasskeyOfferPending: mocks.markPasskeyOfferPending,
  signInWithPasskey: mocks.signInWithPasskey,
}));

vi.mock("sonner", () => ({
  toast: { error: mocks.toastError },
}));

import Login from "./Login";

function renderLogin() {
  return render(
    <MemoryRouter initialEntries={["/login"]}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<div>Signed in</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("Login authentication choices", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.canUsePasskeys.mockReturnValue(false);
    mocks.signInWithOAuth.mockResolvedValue({ error: null, redirected: false });
  });

  it("keeps ordinary sign-in obvious while passkeys are dormant", () => {
    renderLogin();

    expect(screen.getByRole("button", { name: "Continue with Google" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Sign in with password" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: /passkey|Face ID/i })).not.toBeInTheDocument();
  });

  it("re-enables every sign-in choice after a passkey exception", async () => {
    mocks.canUsePasskeys.mockReturnValue(true);
    mocks.signInWithPasskey.mockRejectedValue(new Error("browser cancelled"));
    renderLogin();

    fireEvent.click(screen.getByRole("button", { name: "Use Face ID or a passkey" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Use Face ID or a passkey" })).toBeEnabled();
    });
    expect(screen.getByRole("button", { name: "Continue with Google" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Sign in with password" })).toBeEnabled();
    expect(mocks.toastError).toHaveBeenCalledWith(
      "Passkey sign-in failed",
      expect.objectContaining({ description: expect.stringMatching(/Google or your password/i) }),
    );
  });

  it("clears the OAuth setup intent when Google sign-in fails", async () => {
    mocks.signInWithOAuth.mockResolvedValue({ error: new Error("popup failed") });
    renderLogin();

    fireEvent.click(screen.getByRole("button", { name: "Continue with Google" }));

    await waitFor(() => expect(mocks.clearOAuthPasskeyOffer).toHaveBeenCalledTimes(1));
    expect(mocks.armOAuthPasskeyOffer).toHaveBeenCalledTimes(1);
    expect(mocks.markPasskeyOfferPending).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Continue with Google" })).toBeEnabled();
  });

  it("scopes a password setup offer to the returned student", async () => {
    mocks.signInWithPassword.mockResolvedValue({
      data: { user: { id: "student-password" } },
      error: null,
    });
    renderLogin();

    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "student@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "safe-password" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Sign in with password" }));

    expect(await screen.findByText("Signed in")).toBeInTheDocument();
    expect(mocks.markPasskeyOfferPending).toHaveBeenCalledWith("student-password");
  });
});
