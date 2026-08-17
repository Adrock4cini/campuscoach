import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FAMILY_BETA_AGREEMENT_VERSION } from "@/lib/legal/familyBeta";

const mocks = vi.hoisted(() => ({
  signUp: vi.fn(),
  oauth: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: { signUp: mocks.signUp } },
}));

vi.mock("@/integrations/lovable", () => ({
  lovable: { auth: { signInWithOAuth: mocks.oauth } },
}));

vi.mock("sonner", () => ({
  toast: { error: mocks.toastError, success: vi.fn() },
}));

import Signup from "./Signup";

function renderSignup() {
  return render(
    <MemoryRouter initialEntries={["/signup"]}>
      <Routes>
        <Route path="/signup" element={<Signup />} />
        <Route path="/onboarding" element={<p>Onboarding</p>} />
        <Route path="/login" element={<p>Login</p>} />
        <Route path="/privacy" element={<p>Privacy</p>} />
        <Route path="/terms" element={<p>Terms</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("family beta signup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("VITE_PUBLIC_SIGNUPS_ENABLED", "true");
    sessionStorage.clear();
    mocks.signUp.mockResolvedValue({ data: { session: { user: { id: "student" } } }, error: null });
    mocks.oauth.mockResolvedValue({ error: null });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("keeps public self-registration closed by default", () => {
    vi.stubEnv("VITE_PUBLIC_SIGNUPS_ENABLED", "false");
    renderSignup();

    expect(screen.getByRole("heading", { name: "New accounts are created by invitation" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Create account" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/login");
  });

  it("requires the age-13 family agreement and persists its version", async () => {
    renderSignup();

    expect(screen.getByRole("button", { name: "Continue with Google" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Create account" })).toBeDisabled();

    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "family@example.com" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "safe-password" } });
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));

    expect(await screen.findByText("Onboarding")).toBeInTheDocument();
    expect(mocks.signUp).toHaveBeenCalledWith(expect.objectContaining({
      email: "family@example.com",
      options: expect.objectContaining({
        data: { family_beta_agreement_version: FAMILY_BETA_AGREEMENT_VERSION },
      }),
    }));
  });

  it("clears an unfinished agreement when Google sign-in fails", async () => {
    mocks.oauth.mockRejectedValueOnce(new Error("offline"));
    renderSignup();
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Continue with Google" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "Continue with Google" })).toBeEnabled());
    expect(sessionStorage.getItem("cc_family_beta_oauth_agreement")).toBeNull();
  });

  it("recovers from a rejected signup request", async () => {
    mocks.signUp.mockRejectedValueOnce(new Error("offline"));
    renderSignup();
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "family@example.com" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "safe-password" } });
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "Create account" })).toBeEnabled());
    expect(mocks.toastError).toHaveBeenCalledWith(
      "Couldn't create account",
      expect.objectContaining({ description: expect.stringMatching(/connection/i) }),
    );
  });
});
