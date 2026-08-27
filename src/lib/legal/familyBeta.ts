import { projectRefFromSupabaseUrl } from "@/integrations/supabase/browserConfig";

export const FAMILY_BETA_AGREEMENT_VERSION = "2026-08-17";
export const PENDING_FAMILY_BETA_AGREEMENT_KEY = "cc_family_beta_oauth_agreement";

export function publicSupportEmail() {
  const value = import.meta.env.VITE_PUBLIC_SUPPORT_EMAIL?.trim();
  return value || null;
}

/**
 * The private family-beta staging backend. Self-serve account creation is
 * unlocked only when the bundle is pointed at this exact project. The optional
 * flag is an emergency staging kill switch; it must never open another backend.
 * Production account creation remains an Auth-admin invitation operation even
 * if a release environment accidentally sets the public-signups flag.
 */
export const FAMILY_BETA_STAGING_PROJECT_REF = "dfpgnmldxphkfmobjbvr";

export function isFamilyBetaStaging() {
  return (
    projectRefFromSupabaseUrl(import.meta.env.VITE_SUPABASE_URL ?? "")
      === FAMILY_BETA_STAGING_PROJECT_REF
    && import.meta.env.VITE_SUPABASE_PROJECT_ID === FAMILY_BETA_STAGING_PROJECT_REF
  );
}

export function publicSignupsEnabled() {
  return isFamilyBetaStaging() && import.meta.env.VITE_PUBLIC_SIGNUPS_ENABLED !== "false";
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
