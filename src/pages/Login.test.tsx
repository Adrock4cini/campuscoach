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
  publicSignupsEnabled: true,
  stagingBeta: true,
  toastError: vi.fn(),
  authUser: null as { id: string } | null,
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: { signInWithPassword: mocks.signInWithPassword } },
}));

vi.mock("@/integrations/lovable", () => ({
  lovable: { auth: { signInWithOAuth: mocks.signInWithOAuth } },
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: mocks.authUser, enableDemoMode: vi.fn() }),
}));

vi.mock("@/lib/auth/passkeys", () => ({
  armOAuthPasskeyOffer: mocks.armOAuthPasskeyOffer,
  canUsePasskeys: mocks.canUsePasskeys,
  clearOAuthPasskeyOffer: mocks.clearOAuthPasskeyOffer,
  humanizePasskeyError: () => "Use Google or your password instead.",
  markPasskeyOfferPending: mocks.markPasskeyOfferPending,
  signInWithPasskey: mocks.signInWithPasskey,
}));

vi.mock("@/lib/legal/familyBeta", () => ({
  publicSignupsEnabled: () => mocks.publicSignupsEnabled,
  isFamilyBetaStaging: () => mocks.stagingBeta,
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
    mocks.publicSignupsEnabled = true;
    mocks.stagingBeta = true;
    mocks.authUser = null;
  });

  it("redirects an already signed-in student instead of offering demo mode", async () => {
    mocks.authUser = { id: "student-1" };
    renderLogin();

    expect(await screen.findByText("Signed in")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Continue as demo" })).not.toBeInTheDocument();
  });

  it("keeps ordinary sign-in obvious while passkeys are dormant", () => {
    renderLogin();

    expect(screen.getByRole("button", { name: "Continue with Google" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Sign in with password" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: /passkey|Face ID/i })).not.toBeInTheDocument();
  });

  it("does not offer account-creating OAuth or demo entry during the closed beta", () => {
    mocks.publicSignupsEnabled = false;
    mocks.stagingBeta = false;
    renderLogin();

    // Launch copy regression: production is invite-managed, but students must
    // never see internal "family beta" / invitation wording on Campus Coach Pro.
    expect(document.body.textContent).not.toMatch(/family beta/i);
    expect(document.body.textContent).not.toMatch(/invit/i);
    expect(screen.getByText("Sign in to Campus Companion")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sign in with password" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Continue with Google" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Continue as demo" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Need an account?" })).toHaveAttribute("href", "/signup");
    expect(screen.queryByRole("link", { name: "Create family beta account" })).not.toBeInTheDocument();
  });

  it("offers family beta account creation on the staging build", () => {
    renderLogin();

    expect(screen.getByText(/Family Beta . staging/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Create family beta account" })).toHaveAttribute("href", "/signup");
    expect(screen.getByText(/real school work/i)).toBeInTheDocument();
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
