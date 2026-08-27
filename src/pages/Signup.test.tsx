import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  FAMILY_BETA_AGREEMENT_VERSION,
  FAMILY_BETA_STAGING_PROJECT_REF,
} from "@/lib/legal/familyBeta";

const mocks = vi.hoisted(() => ({
  signUp: vi.fn(),
  oauth: vi.fn(),
  toastError: vi.fn(),
  auth: {
    user: null as { id: string } | null,
    loading: false,
    recovering: false,
  },
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: { signUp: mocks.signUp } },
}));

vi.mock("@/integrations/lovable", () => ({
  lovable: { auth: { signInWithOAuth: mocks.oauth } },
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => mocks.auth,
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
        <Route path="/" element={<p>Signed in</p>} />
        <Route path="/privacy" element={<p>Privacy</p>} />
        <Route path="/terms" element={<p>Terms</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("family beta signup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("VITE_SUPABASE_PROJECT_ID", FAMILY_BETA_STAGING_PROJECT_REF);
    vi.stubEnv("VITE_SUPABASE_URL", `https://${FAMILY_BETA_STAGING_PROJECT_REF}.supabase.co`);
    vi.stubEnv("VITE_PUBLIC_SIGNUPS_ENABLED", "true");
    sessionStorage.clear();
    mocks.auth.user = null;
    mocks.auth.loading = false;
    mocks.auth.recovering = false;
    mocks.signUp.mockResolvedValue({ data: { session: { user: { id: "student" } } }, error: null });
    mocks.oauth.mockResolvedValue({ error: null, redirected: false });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("keeps public self-registration closed by default", () => {
    vi.stubEnv("VITE_PUBLIC_SIGNUPS_ENABLED", "false");
    vi.stubEnv("VITE_SUPABASE_PROJECT_ID", "norsaaoyppctrvxxgjtg");
    renderSignup();

    expect(screen.getByRole("heading", { name: "New accounts are created by invitation" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Create account" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/login");
  });

  it("redirects an already signed-in account instead of offering another signup", async () => {
    mocks.auth.user = { id: "student" };
    renderSignup();

    expect(await screen.findByText("Signed in")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Create account" })).not.toBeInTheDocument();
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

  it("sends confirmation-required accounts to sign in with the exact release origin", async () => {
    mocks.signUp.mockResolvedValueOnce({
      data: { user: { id: "student" }, session: null },
      error: null,
    });
    renderSignup();

    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "family@example.com" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "safe-password" } });
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));

    expect(await screen.findByText("Login")).toBeInTheDocument();
    expect(mocks.signUp).toHaveBeenCalledWith(expect.objectContaining({
      options: expect.objectContaining({
        emailRedirectTo: window.location.origin,
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

  it("continues after an in-place Google session is established", async () => {
    renderSignup();
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Continue with Google" }));

    expect(await screen.findByText("Signed in")).toBeInTheDocument();
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
