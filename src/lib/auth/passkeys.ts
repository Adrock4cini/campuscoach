import { supabase } from "@/integrations/supabase/client";
import { isPasskeyReleaseConfigured } from "@/lib/auth/passkeyConfig";

const OFFER_KEY_PREFIX = "cc_passkey_offer_v1";
const OAUTH_OFFER_INTENT_KEY = "cc_passkey_oauth_offer_v1";

function offerKey(userId: string): string {
  return `${OFFER_KEY_PREFIX}:${userId}`;
}

/** True when this browser can run WebAuthn (Face ID / Touch ID / Windows Hello). */
export function isPasskeySupported(): boolean {
  if (typeof window === "undefined") return false;
  return (
    typeof window.PublicKeyCredential !== "undefined" &&
    typeof navigator.credentials?.create === "function" &&
    typeof navigator.credentials?.get === "function"
  );
}

/** Passkeys are usable only after both browser and permanent-domain checks pass. */
export function canUsePasskeys(): boolean {
  return isPasskeyReleaseConfigured() && isPasskeySupported();
}

/** Sign in with a saved passkey (Face ID / Touch ID on supported devices). */
export async function signInWithPasskey() {
  if (!canUsePasskeys()) throw new Error("Passkey sign-in is unavailable.");
  return supabase.auth.signInWithPasskey();
}

/** Register a passkey for the currently signed-in user. */
export async function registerPasskey() {
  if (!canUsePasskeys()) throw new Error("Passkey setup is unavailable.");
  return supabase.auth.registerPasskey();
}

export async function listPasskeys() {
  if (!canUsePasskeys()) throw new Error("Passkey management is unavailable.");
  return supabase.auth.passkey.list();
}

export async function deletePasskey(passkeyId: string) {
  if (!canUsePasskeys()) throw new Error("Passkey management is unavailable.");
  return supabase.auth.passkey.delete({ passkeyId });
}

/** Whether we should gently offer faster sign-in after a normal sign-in. */
export function shouldOfferPasskeySetup(userId: string): boolean {
  if (!userId || !canUsePasskeys()) return false;
  try {
    return localStorage.getItem(offerKey(userId)) !== "dismissed";
  } catch {
    return false;
  }
}

export function dismissPasskeyOffer(userId: string) {
  if (!userId) return;
  try {
    localStorage.setItem(offerKey(userId), "dismissed");
  } catch {
    /* ignore */
  }
}

export function markPasskeyOfferPending(userId: string) {
  if (!userId || !canUsePasskeys()) return;
  try {
    const key = offerKey(userId);
    if (localStorage.getItem(key) !== "dismissed") {
      localStorage.setItem(key, "pending");
    }
  } catch {
    /* ignore */
  }
}

export function consumePasskeyOfferPending(userId: string): boolean {
  if (!userId || !canUsePasskeys()) return false;
  try {
    const key = offerKey(userId);
    if (localStorage.getItem(key) === "pending") {
      localStorage.setItem(key, "shown");
      return true;
    }
  } catch {
    /* ignore */
  }
  return false;
}

/** Remember that an OAuth flow started without treating it as a successful sign-in. */
export function armOAuthPasskeyOffer() {
  if (!canUsePasskeys()) return;
  try {
    sessionStorage.setItem(OAUTH_OFFER_INTENT_KEY, "1");
  } catch {
    /* ignore */
  }
}

export function clearOAuthPasskeyOffer() {
  try {
    sessionStorage.removeItem(OAUTH_OFFER_INTENT_KEY);
  } catch {
    /* ignore */
  }
}

/** Convert a completed OAuth flow into an offer scoped to the signed-in user. */
export function completeOAuthPasskeyOffer(userId: string) {
  if (!userId || !canUsePasskeys()) return;
  try {
    if (sessionStorage.getItem(OAUTH_OFFER_INTENT_KEY) !== "1") return;
    sessionStorage.removeItem(OAUTH_OFFER_INTENT_KEY);
    markPasskeyOfferPending(userId);
  } catch {
    /* ignore */
  }
}

export function humanizePasskeyError(error: unknown): string {
  const code =
    error && typeof error === "object" && "code" in error
      ? String((error as { code: string }).code).toLowerCase()
      : "";
  const message =
    error && typeof error === "object" && "message" in error
      ? String((error as { message: string }).message)
      : String(error ?? "Something went wrong");

  const lower = message.toLowerCase();
  if (
    code.includes("not_allowed") ||
    code.includes("abort") ||
    lower.includes("not allowed") ||
    lower.includes("abort")
  ) {
    return "Passkey sign-in was cancelled.";
  }
  if (
    code.includes("credential_not_found") ||
    lower.includes("credential_not_found") ||
    lower.includes("not found")
  ) {
    return "No Campus Companion passkey was found. Use Google or your password instead.";
  }
  if (code.includes("credential_exists") || lower.includes("credential_exists")) {
    return "A passkey is already connected to this account.";
  }
  return "Passkey sign-in didn't work. Try again, or use Google or your password.";
}
