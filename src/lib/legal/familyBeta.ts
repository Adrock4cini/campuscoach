import { projectRefFromSupabaseUrl } from "@/integrations/supabase/browserConfig";

export const FAMILY_BETA_AGREEMENT_VERSION = "2026-08-17";
export const PENDING_FAMILY_BETA_AGREEMENT_KEY = "cc_family_beta_oauth_agreement";

export function publicSupportEmail() {
  const value = import.meta.env.VITE_PUBLIC_SUPPORT_EMAIL?.trim();
  return value || null;
}

/**
 * The private family-beta staging backend. Self-serve account creation is
 * unlocked only when the bundle is pointed at the separately configured new
 * staging project and the flag is explicitly true. Missing, malformed, or
 * protected configuration must fail closed; the flag must never open another
 * backend.
 * Production account creation remains an Auth-admin invitation operation even
 * if a release environment accidentally sets the public-signups flag.
 */
export const PROTECTED_FAMILY_BETA_PROJECT_REFS = Object.freeze([
  "norsaaoyppctrvxxgjtg", // production
  "dfpgnmldxphkfmobjbvr", // previous Family Beta
  "lzwaiobgrhwmywugsgjo", // abandoned remixed staging
  "mviunlhhtcjuuburjxbf", // quarantined staging
]);

const PROJECT_REF_PATTERN = /^[a-z0-9]{20}$/u;

function configuredFamilyBetaStagingProjectRef() {
  const configured = import.meta.env.VITE_FAMILY_BETA_STAGING_PROJECT_ID;
  if (
    typeof configured !== "string"
    || !PROJECT_REF_PATTERN.test(configured)
    || PROTECTED_FAMILY_BETA_PROJECT_REFS.includes(configured)
  ) {
    return null;
  }
  return configured;
}

/**
 * Compatibility export for callers that display or test the configured ref.
 * It is empty when staging authority has not been explicitly and safely set.
 */
export const FAMILY_BETA_STAGING_PROJECT_REF = configuredFamilyBetaStagingProjectRef() ?? "";

export function isFamilyBetaStaging() {
  const stagingProjectRef = configuredFamilyBetaStagingProjectRef();
  return (
    stagingProjectRef !== null
    && projectRefFromSupabaseUrl(import.meta.env.VITE_SUPABASE_URL ?? "")
      === stagingProjectRef
    && import.meta.env.VITE_SUPABASE_PROJECT_ID === stagingProjectRef
  );
}

export function publicSignupsEnabled() {
  return isFamilyBetaStaging() && import.meta.env.VITE_PUBLIC_SIGNUPS_ENABLED === "true";
}

/**
 * The sample tour is a development/staging affordance, not an alternate
 * authentication path for the closed production beta. Production can expose
 * it only on the reviewed staging backend while self-serve beta access is
 * explicitly enabled there. Local development keeps the existing demo flow.
 */
export function demoModeEnabled() {
  return import.meta.env.DEV || publicSignupsEnabled();
}

export function rememberPendingFamilyBetaAgreement() {
  if (typeof window !== "undefined") {
    sessionStorage.setItem(PENDING_FAMILY_BETA_AGREEMENT_KEY, FAMILY_BETA_AGREEMENT_VERSION);
  }
}

export function clearPendingFamilyBetaAgreement() {
  if (typeof window !== "undefined") {
    sessionStorage.removeItem(PENDING_FAMILY_BETA_AGREEMENT_KEY);
  }
}

export function consumePendingFamilyBetaAgreement() {
  if (typeof window === "undefined") return false;
  const accepted = sessionStorage.getItem(PENDING_FAMILY_BETA_AGREEMENT_KEY) === FAMILY_BETA_AGREEMENT_VERSION;
  sessionStorage.removeItem(PENDING_FAMILY_BETA_AGREEMENT_KEY);
  return accepted;
}
