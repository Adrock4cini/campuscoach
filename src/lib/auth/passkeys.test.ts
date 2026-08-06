import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  registerPasskey: vi.fn(),
  signInWithPasskey: vi.fn(),
  listPasskeys: vi.fn(),
  deletePasskey: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      registerPasskey: mocks.registerPasskey,
      signInWithPasskey: mocks.signInWithPasskey,
      passkey: {
        list: mocks.listPasskeys,
        delete: mocks.deletePasskey,
      },
    },
  },
}));

import {
  armOAuthPasskeyOffer,
  canUsePasskeys,
  completeOAuthPasskeyOffer,
  consumePasskeyOfferPending,
  dismissPasskeyOffer,
  humanizePasskeyError,
  markPasskeyOfferPending,
  registerPasskey,
  shouldOfferPasskeySetup,
} from "./passkeys";

function enablePasskeysForThisOrigin() {
  vi.stubEnv("VITE_PASSKEYS_ENABLED", "true");
  vi.stubEnv("VITE_PASSKEY_RP_ID", window.location.hostname);
  Object.defineProperty(window, "PublicKeyCredential", {
    configurable: true,
    value: class PublicKeyCredential {},
  });
  Object.defineProperty(navigator, "credentials", {
    configurable: true,
    value: { create: vi.fn(), get: vi.fn() },
  });
}

describe("passkey release safety", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    localStorage.clear();
    sessionStorage.clear();
    Object.defineProperty(window, "PublicKeyCredential", {
      configurable: true,
      value: undefined,
    });
    Object.defineProperty(navigator, "credentials", {
      configurable: true,
      value: undefined,
    });
  });

  it("fails closed while the permanent-domain release flag is off", () => {
    vi.stubEnv("VITE_PASSKEYS_ENABLED", "false");
    vi.stubEnv("VITE_PASSKEY_RP_ID", window.location.hostname);

    expect(canUsePasskeys()).toBe(false);
    expect(shouldOfferPasskeySetup("student-1")).toBe(false);
  });

  it("also fails closed when the configured relying-party domain does not match", () => {
    enablePasskeysForThisOrigin();
    vi.stubEnv("VITE_PASSKEY_RP_ID", "future-campus-companion.example");

    expect(canUsePasskeys()).toBe(false);
  });

  it("uses the valid Supabase registration signature", async () => {
    enablePasskeysForThisOrigin();
    mocks.registerPasskey.mockResolvedValue({ data: { id: "passkey-1" }, error: null });

    await registerPasskey();

    expect(mocks.registerPasskey).toHaveBeenCalledTimes(1);
    expect(mocks.registerPasskey).toHaveBeenCalledWith();
  });

  it("keeps setup prompts scoped to the signed-in student", () => {
    enablePasskeysForThisOrigin();

    markPasskeyOfferPending("student-a");

    expect(consumePasskeyOfferPending("student-b")).toBe(false);
    expect(consumePasskeyOfferPending("student-a")).toBe(true);
    dismissPasskeyOffer("student-a");
    expect(shouldOfferPasskeySetup("student-a")).toBe(false);
    expect(shouldOfferPasskeySetup("student-b")).toBe(true);
  });

  it("turns an OAuth intent into one offer only after a student signs in", () => {
    enablePasskeysForThisOrigin();

    armOAuthPasskeyOffer();
    completeOAuthPasskeyOffer("student-a");
    completeOAuthPasskeyOffer("student-b");

    expect(consumePasskeyOfferPending("student-a")).toBe(true);
    expect(consumePasskeyOfferPending("student-b")).toBe(false);
  });

  it("never exposes developer configuration instructions to students", () => {
    const message = humanizePasskeyError({
      code: "passkey_disabled",
      message: "Turn on Passkeys in the Supabase dashboard",
    });

    expect(message).toMatch(/use Google or your password/i);
    expect(message).not.toMatch(/Supabase|dashboard/i);
  });
});
