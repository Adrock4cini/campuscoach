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

/**
 * Raised only when the backend has no family-beta agreement surface at all
 * (the RPCs are absent). That is not a failed check — there is no agreement to
 * enforce on this backend, so the caller must let the student through instead
 * of parking them on an agreement screen they can never clear.
 *
 * Every other failure (network, RLS, invalid payload) still fails closed.
 */
export class FamilyBetaAgreementBackendMissingError extends Error {
  constructor() {
    super("family beta agreement backend not deployed");
    this.name = "FamilyBetaAgreementBackendMissingError";
  }
}

/** PostgREST reports an undeployed function as PGRST202 / "Could not find the function". */
function isMissingFunctionError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: unknown; message?: unknown };
  if (candidate.code === "PGRST202" || candidate.code === "404") return true;
  return typeof candidate.message === "string"
    && /could not find the function|does not exist/i.test(candidate.message);
}

/**
 * The generated database types are produced from a backend where these RPCs
 * are not deployed. The names are still correct for backends that do have
 * them, so the call is narrowed here rather than by editing generated types.
 */
type AgreementRpc = Parameters<typeof supabase.rpc>[0];

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
  const { data, error } = await supabase.rpc(
    "get_family_beta_agreement_status" as AgreementRpc,
  );
  if (error) {
    if (isMissingFunctionError(error)) throw new FamilyBetaAgreementBackendMissingError();
    throw new Error("agreement status unavailable");
  }
  const receipt = parseAgreementCheck(data);
  if (!receipt) throw new Error("agreement status invalid");
  return receipt;
}

export async function acceptCurrentFamilyBetaAgreement(): Promise<FamilyBetaAgreementReceipt> {
  const { data, error } = await supabase.rpc(
    "accept_family_beta_agreement" as AgreementRpc,
    { p_agreement_version: FAMILY_BETA_AGREEMENT_VERSION } as never,
  );
  if (error) {
    if (isMissingFunctionError(error)) throw new FamilyBetaAgreementBackendMissingError();
    throw new Error("agreement acceptance unavailable");
  }
  const receipt = parseAgreementCheck(data);
  if (!receipt?.accepted) throw new Error("agreement acceptance invalid");
  return receipt;
}
