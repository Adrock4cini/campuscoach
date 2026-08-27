import { describe, expect, it, vi } from "vitest";
import {
  checkCurrentFamilyBetaAgreement,
  CURRENT_FAMILY_BETA_AGREEMENT_VERSION,
  FAMILY_BETA_AGREEMENT_REQUIRED_RESPONSE,
  FAMILY_BETA_AGREEMENT_UNAVAILABLE_RESPONSE,
} from "./family-beta-agreement";

const USER_ID = "3e8db0db-381c-4829-a921-615c38e63562";

describe("family beta agreement Edge guard", () => {
  it("allows only a current, owner-matched, timestamped service receipt", async () => {
    const invoke = vi.fn().mockResolvedValue({
      data: {
        user_id: USER_ID,
        accepted_by: USER_ID,
        agreement_version: CURRENT_FAMILY_BETA_AGREEMENT_VERSION,
        accepted_at: "2026-08-27T12:00:00.000Z",
      },
      error: null,
    });

    await expect(checkCurrentFamilyBetaAgreement(USER_ID, invoke)).resolves.toEqual({
      allowed: true,
      required: false,
      lookupFailed: false,
    });
  });

  it("treats an absent receipt as agreement required", async () => {
    await expect(checkCurrentFamilyBetaAgreement(USER_ID, async () => ({ data: null, error: null })))
      .resolves.toEqual({ allowed: false, required: true, lookupFailed: false });
    expect(FAMILY_BETA_AGREEMENT_REQUIRED_RESPONSE.reason).toBe("family_beta_agreement_required");
  });

  it.each([
    ["old version", { user_id: USER_ID, accepted_by: USER_ID, agreement_version: "2026-01-01", accepted_at: "2026-08-27T12:00:00Z" }],
    ["wrong owner", { user_id: USER_ID, accepted_by: "other", agreement_version: CURRENT_FAMILY_BETA_AGREEMENT_VERSION, accepted_at: "2026-08-27T12:00:00Z" }],
    ["bad timestamp", { user_id: USER_ID, accepted_by: USER_ID, agreement_version: CURRENT_FAMILY_BETA_AGREEMENT_VERSION, accepted_at: "not-a-time" }],
  ])("fails closed for a malformed %s receipt", async (_label, data) => {
    await expect(checkCurrentFamilyBetaAgreement(USER_ID, async () => ({ data, error: null })))
      .resolves.toEqual({ allowed: false, required: false, lookupFailed: true });
  });

  it("fails closed when the service lookup errors or rejects", async () => {
    await expect(checkCurrentFamilyBetaAgreement(USER_ID, async () => ({ data: null, error: new Error("db") })))
      .resolves.toEqual({ allowed: false, required: false, lookupFailed: true });
    await expect(checkCurrentFamilyBetaAgreement(USER_ID, async () => { throw new Error("offline"); }))
      .resolves.toEqual({ allowed: false, required: false, lookupFailed: true });
    expect(FAMILY_BETA_AGREEMENT_UNAVAILABLE_RESPONSE.reason)
      .toBe("family_beta_agreement_check_unavailable");
  });
});
