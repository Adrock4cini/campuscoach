import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  canUsePasskeys: vi.fn(),
  shouldOfferPasskeySetup: vi.fn(),
  consumePasskeyOfferPending: vi.fn(),
  dismissPasskeyOffer: vi.fn(),
  registerPasskey: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { id: "student-1" }, isDemoMode: false }),
}));

vi.mock("@/lib/auth/passkeys", () => ({
  canUsePasskeys: mocks.canUsePasskeys,
  shouldOfferPasskeySetup: mocks.shouldOfferPasskeySetup,
  consumePasskeyOfferPending: mocks.consumePasskeyOfferPending,
  dismissPasskeyOffer: mocks.dismissPasskeyOffer,
  registerPasskey: mocks.registerPasskey,
  humanizePasskeyError: () => "Use Google or your password instead.",
}));

vi.mock("sonner", () => ({
  toast: { error: mocks.toastError, success: mocks.toastSuccess },
}));

import { SavePasskeyBanner } from "./SavePasskeyBanner";

describe("SavePasskeyBanner", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.canUsePasskeys.mockReturnValue(false);
    mocks.shouldOfferPasskeySetup.mockReturnValue(false);
    mocks.consumePasskeyOfferPending.mockReturnValue(false);
  });

  it("stays hidden while passkeys are dormant on the temporary domain", () => {
    render(<SavePasskeyBanner />);

    expect(screen.queryByText("Set up faster sign-in")).not.toBeInTheDocument();
  });

  it("releases its busy state when browser enrollment throws", async () => {
    mocks.canUsePasskeys.mockReturnValue(true);
    mocks.shouldOfferPasskeySetup.mockReturnValue(true);
    mocks.consumePasskeyOfferPending.mockReturnValue(true);
    mocks.registerPasskey.mockRejectedValue(new Error("cancelled"));
    render(<SavePasskeyBanner />);

    const setup = await screen.findByRole("button", { name: "Set up" });
    fireEvent.click(setup);

    await waitFor(() => expect(screen.getByRole("button", { name: "Set up" })).toBeEnabled());
    expect(mocks.toastError).toHaveBeenCalledWith(
      "Couldn't set up faster sign-in",
      expect.objectContaining({ description: expect.stringMatching(/Google or your password/i) }),
    );
  });
});
