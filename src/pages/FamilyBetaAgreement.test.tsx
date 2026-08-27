import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FAMILY_BETA_AGREEMENT_VERSION } from "@/lib/legal/familyBeta";

const mocks = vi.hoisted(() => ({
  updateUser: vi.fn(),
  signOut: vi.fn(),
  toastError: vi.fn(),
  recovering: false,
  user: { id: "student", user_metadata: {} } as { id: string; user_metadata: Record<string, unknown> } | null,
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: mocks.user, loading: false, recovering: mocks.recovering, signOut: mocks.signOut }),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: { updateUser: mocks.updateUser } },
}));

vi.mock("sonner", () => ({ toast: { error: mocks.toastError } }));

import FamilyBetaAgreement from "./FamilyBetaAgreement";

describe("family beta agreement", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    mocks.recovering = false;
    mocks.user = { id: "student", user_metadata: {} };
    mocks.updateUser.mockResolvedValue({ data: { user: mocks.user }, error: null });
    mocks.signOut.mockResolvedValue(undefined);
  });

  it("keeps the account blocked until the safety agreement is saved", async () => {
    render(
      <MemoryRouter initialEntries={[{ pathname: "/family-beta-agreement", state: { next: "/onboarding" } }]}>
        <Routes>
          <Route path="/family-beta-agreement" element={<FamilyBetaAgreement />} />
          <Route path="/onboarding" element={<p>Start classes</p>} />
          <Route path="/terms" element={<p>Terms</p>} />
          <Route path="/privacy" element={<p>Privacy</p>} />
          <Route path="/login" element={<p>Login</p>} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByRole("button", { name: "Agree and continue" })).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Agree and continue" }));

    await waitFor(() => expect(mocks.updateUser).toHaveBeenCalledWith({
      data: { family_beta_agreement_version: FAMILY_BETA_AGREEMENT_VERSION },
    }));
    expect(await screen.findByText("Start classes")).toBeInTheDocument();
  });

  it("recovers from a rejected agreement save", async () => {
    mocks.updateUser.mockRejectedValueOnce(new Error("offline"));
    renderAgreement();
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Agree and continue" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "Agree and continue" })).toBeEnabled());
    expect(mocks.toastError).toHaveBeenCalledWith(
      "Couldn’t save your agreement",
      expect.objectContaining({ description: expect.stringMatching(/connection/i) }),
    );
  });

  it("allows a signed-in person to leave without agreeing", async () => {
    renderAgreement();
    fireEvent.click(screen.getByRole("button", { name: "Sign out without agreeing" }));

    await waitFor(() => expect(mocks.signOut).toHaveBeenCalledTimes(1));
    expect(await screen.findByText("Login")).toBeInTheDocument();
  });

  it("does not send a temporarily unreadable account to signup", () => {
    mocks.user = null;
    mocks.recovering = true;
    renderAgreement();

    expect(screen.getByRole("status")).toHaveTextContent("Reconnecting to your account");
    expect(screen.queryByText("Login")).not.toBeInTheDocument();
  });
});

function renderAgreement() {
  return render(
    <MemoryRouter initialEntries={[{ pathname: "/family-beta-agreement", state: { next: "/onboarding" } }]}>
      <Routes>
        <Route path="/family-beta-agreement" element={<FamilyBetaAgreement />} />
        <Route path="/onboarding" element={<p>Start classes</p>} />
        <Route path="/terms" element={<p>Terms</p>} />
        <Route path="/privacy" element={<p>Privacy</p>} />
        <Route path="/login" element={<p>Login</p>} />
      </Routes>
    </MemoryRouter>,
  );
}
