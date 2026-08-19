import type { User } from "@supabase/supabase-js";

export const FAMILY_BETA_AGREEMENT_VERSION = "2026-08-17";
export const PENDING_OAUTH_AGREEMENT_KEY = "cc_family_beta_oauth_agreement";

export function hasFamilyBetaAgreement(user: User | null | undefined) {
  return user?.user_metadata?.family_beta_agreement_version === FAMILY_BETA_AGREEMENT_VERSION;
}

export function familyBetaMetadata() {
  return { family_beta_agreement_version: FAMILY_BETA_AGREEMENT_VERSION };
}

export function publicSupportEmail() {
  const value = import.meta.env.VITE_PUBLIC_SUPPORT_EMAIL?.trim();
  return value || null;
}

/**
 * The private family-beta staging backend. Self-serve account creation is
 * unlocked only when the bundle is pointed at this exact project, so the
 * production deployment can never be opened by this code path.
 */
export const FAMILY_BETA_STAGING_PROJECT_REF = "dfpgnmldxphkfmobjbvr";

export function isFamilyBetaStaging() {
  return import.meta.env.VITE_SUPABASE_PROJECT_ID === FAMILY_BETA_STAGING_PROJECT_REF;
}

export function publicSignupsEnabled() {
  return import.meta.env.VITE_PUBLIC_SIGNUPS_ENABLED === "true" || isFamilyBetaStaging();
}

export function rememberPendingOAuthAgreement() {
  if (typeof window !== "undefined") {
    sessionStorage.setItem(PENDING_OAUTH_AGREEMENT_KEY, FAMILY_BETA_AGREEMENT_VERSION);
  }
}

export function clearPendingOAuthAgreement() {
  if (typeof window !== "undefined") {
    sessionStorage.removeItem(PENDING_OAUTH_AGREEMENT_KEY);
  }
}

export function consumePendingOAuthAgreement() {
  if (typeof window === "undefined") return false;
  const accepted = sessionStorage.getItem(PENDING_OAUTH_AGREEMENT_KEY) === FAMILY_BETA_AGREEMENT_VERSION;
  sessionStorage.removeItem(PENDING_OAUTH_AGREEMENT_KEY);
  return accepted;
}
