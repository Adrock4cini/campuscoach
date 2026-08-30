import { beforeEach, describe, expect, it, vi } from "vitest";
import { FAMILY_BETA_AGREEMENT_VERSION } from "./familyBeta";

const rpc = vi.hoisted(() => vi.fn());

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc },
}));

import {
  acceptCurrentFamilyBetaAgreement,
  FamilyBetaAgreementBackendMissingError,
  getFamilyBetaAgreementStatus,
} from "./familyBetaAgreementService";

const OWNER_ID = "8250a79c-5706-478f-bf4d-69c9a94190e3";

describe("family beta agreement service", () => {
  beforeEach(() => vi.clearAllMocks());

  it("reads an owner-bound current receipt from the server RPC", async () => {
    rpc.mockResolvedValueOnce({
      data: {
        accepted: true,
        agreementVersion: FAMILY_BETA_AGREEMENT_VERSION,
        acceptedAt: "2026-08-27T12:00:00.000Z",
        ownerId: OWNER_ID,
      },
      error: null,
    });

    await expect(getFamilyBetaAgreementStatus()).resolves.toMatchObject({
      accepted: true,
      ownerId: OWNER_ID,
    });
    expect(rpc).toHaveBeenCalledWith("get_family_beta_agreement_status");
  });

  it("accepts only through the current-version authenticated RPC", async () => {
    rpc.mockResolvedValueOnce({
      data: {
        accepted: true,
        agreementVersion: FAMILY_BETA_AGREEMENT_VERSION,
        acceptedAt: "2026-08-27T12:00:00.000Z",
        ownerId: OWNER_ID,
      },
      error: null,
    });

    await expect(acceptCurrentFamilyBetaAgreement()).resolves.toMatchObject({ accepted: true });
    expect(rpc).toHaveBeenCalledWith("accept_family_beta_agreement", {
      p_agreement_version: FAMILY_BETA_AGREEMENT_VERSION,
    });
  });

  it("fails closed for stale, malformed, or failed service responses", async () => {
    rpc
      .mockResolvedValueOnce({
        data: {
          accepted: true,
          agreementVersion: "2026-01-01",
          acceptedAt: "2026-08-27T12:00:00.000Z",
          ownerId: OWNER_ID,
        },
        error: null,
      })
      .mockResolvedValueOnce({ data: null, error: new Error("offline") });

    await expect(getFamilyBetaAgreementStatus()).rejects.toThrow("agreement status invalid");
    await expect(getFamilyBetaAgreementStatus()).rejects.toThrow("agreement status unavailable");
  });
});

describe("backends without an agreement surface", () => {
  beforeEach(() => vi.clearAllMocks());

  it("distinguishes an undeployed status RPC from a failed check", async () => {
    rpc.mockResolvedValueOnce({
      data: null,
      error: { code: "PGRST202", message: "Could not find the function public.get_family_beta_agreement_status" },
    });

    await expect(getFamilyBetaAgreementStatus())
      .rejects.toBeInstanceOf(FamilyBetaAgreementBackendMissingError);
  });

  it("distinguishes an undeployed acceptance RPC from a failed acceptance", async () => {
    rpc.mockResolvedValueOnce({
      data: null,
      error: { code: "PGRST202", message: "Could not find the function public.accept_family_beta_agreement" },
    });

    await expect(acceptCurrentFamilyBetaAgreement())
      .rejects.toBeInstanceOf(FamilyBetaAgreementBackendMissingError);
  });

  it("still fails closed on a transport or permission error", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: "42501", message: "permission denied" } });
    await expect(getFamilyBetaAgreementStatus()).rejects.toThrow("agreement status unavailable");
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("still fails closed when the payload is malformed rather than absent", async () => {
    rpc.mockResolvedValueOnce({ data: { accepted: true }, error: null });
    await expect(getFamilyBetaAgreementStatus()).rejects.toThrow("agreement status invalid");
  });
});
