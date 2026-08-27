import { supabase } from "@/integrations/supabase/client";
import { FAMILY_BETA_AGREEMENT_VERSION } from "@/lib/legal/familyBeta";

export type FamilyBetaAgreementReceipt = {
  accepted: true;
  agreementVersion: string;
  acceptedAt: string;
  ownerId: string;
};

export type FamilyBetaAgreementCheck =
  | FamilyBetaAgreementReceipt
  | {
      accepted: false;
      agreementVersion: string;
      acceptedAt: null;
      ownerId: string;
    };

function parseAgreementCheck(value: unknown): FamilyBetaAgreementCheck | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  if (
    candidate.agreementVersion !== FAMILY_BETA_AGREEMENT_VERSION
    || typeof candidate.ownerId !== "string"
    || candidate.ownerId.length === 0
  ) return null;

  if (candidate.accepted === false && candidate.acceptedAt === null) {
    return {
      accepted: false,
      agreementVersion: FAMILY_BETA_AGREEMENT_VERSION,
      acceptedAt: null,
      ownerId: candidate.ownerId,
    };
  }

  if (
    candidate.accepted === true
    && typeof candidate.acceptedAt === "string"
    && Number.isFinite(Date.parse(candidate.acceptedAt))
  ) {
    return {
      accepted: true,
      agreementVersion: FAMILY_BETA_AGREEMENT_VERSION,
      acceptedAt: candidate.acceptedAt,
      ownerId: candidate.ownerId,
    };
  }

  return null;
}

export async function getFamilyBetaAgreementStatus(): Promise<FamilyBetaAgreementCheck> {
  const { data, error } = await supabase.rpc("get_family_beta_agreement_status");
  if (error) throw new Error("agreement status unavailable");
  const receipt = parseAgreementCheck(data);
  if (!receipt) throw new Error("agreement status invalid");
  return receipt;
}

export async function acceptCurrentFamilyBetaAgreement(): Promise<FamilyBetaAgreementReceipt> {
  const { data, error } = await supabase.rpc("accept_family_beta_agreement", {
    p_agreement_version: FAMILY_BETA_AGREEMENT_VERSION,
  });
  if (error) throw new Error("agreement acceptance unavailable");
  const receipt = parseAgreementCheck(data);
  if (!receipt?.accepted) throw new Error("agreement acceptance invalid");
  return receipt;
}
