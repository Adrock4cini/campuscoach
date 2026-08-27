import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  acceptAgreement: vi.fn(),
  refreshAgreement: vi.fn(),
  signOut: vi.fn(),
  toastError: vi.fn(),
  recovering: false,
  agreementStatus: "required" as "checking" | "accepted" | "required" | "error",
  user: { id: "student", user_metadata: {} } as { id: string; user_metadata: Record<string, unknown> } | null,
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    user: mocks.user,
    loading: false,
    recovering: mocks.recovering,
    agreementStatus: mocks.agreementStatus,
    acceptAgreement: mocks.acceptAgreement,
    refreshAgreement: mocks.refreshAgreement,
    signOut: mocks.signOut,
  }),
}));

vi.mock("sonner", () => ({ toast: { error: mocks.toastError } }));

import FamilyBetaAgreement from "./FamilyBetaAgreement";

describe("family beta agreement", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    mocks.recovering = false;
    mocks.agreementStatus = "required";
    mocks.user = { id: "student", user_metadata: {} };
    mocks.acceptAgreement.mockResolvedValue(true);
    mocks.refreshAgreement.mockResolvedValue(false);
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

    await waitFor(() => expect(mocks.acceptAgreement).toHaveBeenCalledTimes(1));
    expect(await screen.findByText("Start classes")).toBeInTheDocument();
  });

  it("recovers from a rejected agreement save", async () => {
    mocks.acceptAgreement.mockResolvedValueOnce(false);
    renderAgreement();
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Agree and continue" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "Agree and continue" })).toBeEnabled());
    expect(mocks.toastError).toHaveBeenCalledWith(
      "Couldn’t save your agreement",
      expect.objectContaining({ description: expect.stringMatching(/connection/i) }),
    );
  });

  it("retries a failed server receipt check without trusting Auth metadata", async () => {
    mocks.agreementStatus = "error";
    mocks.user = {
      id: "student",
      user_metadata: { family_beta_agreement_version: "2026-08-17" },
    };
    renderAgreement();

    expect(screen.getByRole("alert")).toHaveTextContent("couldn’t verify");
    expect(screen.getByRole("button", { name: "Agree and continue" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Retry agreement check" }));

    await waitFor(() => expect(mocks.refreshAgreement).toHaveBeenCalledTimes(1));
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
