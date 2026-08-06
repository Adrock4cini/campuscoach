/**
 * Passkeys are tied to a relying-party domain. Keep the release disabled until
 * Campus Companion's permanent production domain is selected and configured
 * in Supabase Auth.
 */
export function isPasskeyReleaseConfigured(): boolean {
  if (import.meta.env.VITE_PASSKEYS_ENABLED !== "true") return false;

  const relyingPartyId = import.meta.env.VITE_PASSKEY_RP_ID
    ?.trim()
    .toLowerCase();
  if (!relyingPartyId || typeof window === "undefined") return false;

  const { hostname, protocol } = window.location;
  const normalizedHost = hostname.toLowerCase();
  const secureOrigin =
    protocol === "https:" ||
    normalizedHost === "localhost" ||
    normalizedHost === "127.0.0.1";
  const approvedHost =
    normalizedHost === relyingPartyId ||
    normalizedHost.endsWith(`.${relyingPartyId}`);

  return secureOrigin && approvedHost;
}
