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

export function publicSignupsEnabled() {
  return import.meta.env.VITE_PUBLIC_SIGNUPS_ENABLED === "true";
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
