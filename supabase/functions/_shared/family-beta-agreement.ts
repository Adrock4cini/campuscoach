export const CURRENT_FAMILY_BETA_AGREEMENT_VERSION = "2026-08-17";

export const FAMILY_BETA_AGREEMENT_REQUIRED_RESPONSE = {
  error: "Accept the current family beta agreement before continuing.",
  reason: "family_beta_agreement_required",
  retryable: false,
} as const;

export const FAMILY_BETA_AGREEMENT_UNAVAILABLE_RESPONSE = {
  error: "Agreement verification is temporarily unavailable. Please try again shortly.",
  reason: "family_beta_agreement_check_unavailable",
  retryable: true,
} as const;

interface AgreementLookupResult {
  data: unknown;
  error: unknown;
}

export type FamilyBetaAgreementGate =
  | { allowed: true; required: false; lookupFailed: false }
  | { allowed: false; required: true; lookupFailed: false }
  | { allowed: false; required: false; lookupFailed: true };

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

/**
 * Verify the current subject's durable agreement receipt using a service-role
 * lookup. Missing receipts are a 403 boundary; lookup errors and malformed
 * results fail closed as a retryable 503. Auth user_metadata is never read.
 */
export async function checkCurrentFamilyBetaAgreement(
  userId: string,
  invoke: () => PromiseLike<AgreementLookupResult>,
): Promise<FamilyBetaAgreementGate> {
  try {
    const { data, error } = await invoke();
    if (error) return { allowed: false, required: false, lookupFailed: true };
    if (data === null) return { allowed: false, required: true, lookupFailed: false };
    if (!isRecord(data)) return { allowed: false, required: false, lookupFailed: true };

    const allowed = data.user_id === userId
      && data.accepted_by === userId
      && data.agreement_version === CURRENT_FAMILY_BETA_AGREEMENT_VERSION
      && typeof data.accepted_at === "string"
      && Number.isFinite(Date.parse(data.accepted_at));

    return allowed
      ? { allowed: true, required: false, lookupFailed: false }
      : { allowed: false, required: false, lookupFailed: true };
  } catch {
    return { allowed: false, required: false, lookupFailed: true };
  }
}
