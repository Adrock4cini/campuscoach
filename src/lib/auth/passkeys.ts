import { supabase } from "@/integrations/supabase/client";

const OFFER_KEY = "cc_passkey_offer_v1";

/** True when this browser can run WebAuthn (Face ID / Touch ID / Windows Hello). */
export function isPasskeySupported(): boolean {
  if (typeof window === "undefined") return false;
  return (
    typeof window.PublicKeyCredential !== "undefined" &&
    typeof navigator.credentials?.create === "function" &&
    typeof navigator.credentials?.get === "function"
  );
}

/** Sign in with a saved passkey (Face ID / Touch ID on supported devices). */
export async function signInWithPasskey() {
  return supabase.auth.signInWithPasskey();
}

/** Register a passkey for the currently signed-in user. */
export async function registerPasskey(friendlyName?: string) {
  return supabase.auth.registerPasskey(
    friendlyName ? { friendlyName } : undefined,
  );
}

export async function listPasskeys() {
  return supabase.auth.passkey.list();
}

export async function deletePasskey(passkeyId: string) {
  return supabase.auth.passkey.delete({ passkeyId });
}

/** Whether we should gently offer "Save Face ID" after a normal sign-in. */
export function shouldOfferPasskeySetup(): boolean {
  if (!isPasskeySupported()) return false;
  try {
    return localStorage.getItem(OFFER_KEY) !== "dismissed";
  } catch {
    return true;
  }
}

export function dismissPasskeyOffer() {
  try {
    localStorage.setItem(OFFER_KEY, "dismissed");
  } catch {
    /* ignore */
  }
}

export function markPasskeyOfferPending() {
  try {
    if (localStorage.getItem(OFFER_KEY) !== "dismissed") {
      localStorage.setItem(OFFER_KEY, "pending");
    }
  } catch {
    /* ignore */
  }
}

export function consumePasskeyOfferPending(): boolean {
  try {
    if (localStorage.getItem(OFFER_KEY) === "pending") {
      localStorage.setItem(OFFER_KEY, "shown");
      return true;
    }
  } catch {
    /* ignore */
  }
  return false;
}

export function humanizePasskeyError(error: unknown): string {
  const message =
    error && typeof error === "object" && "message" in error
      ? String((error as { message: string }).message)
      : String(error ?? "Something went wrong");

  const lower = message.toLowerCase();
  if (lower.includes("passkey_disabled") || lower.includes("not enabled")) {
    return "Face ID sign-in isn't enabled on the server yet. Turn on Passkeys in the Supabase dashboard.";
  }
  if (lower.includes("not allowed") || lower.includes("abort")) {
    return "Face ID was cancelled.";
  }
  if (lower.includes("credential_not_found") || lower.includes("not found")) {
    return "No Face ID passkey saved for this account yet. Sign in once, then tap Save Face ID.";
  }
  if (lower.includes("credential_exists")) {
    return "This device already has Face ID saved for your account.";
  }
  return message;
}
