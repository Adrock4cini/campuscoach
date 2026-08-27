/**
 * Canvas Connect is withheld from public builds until an institution's
 * Developer Key, redirect URI, scopes, and server-side secrets are verified.
 * Any missing, misspelled, or differently-cased value fails closed.
 */
export function isCanvasConnectEnabled(
  value: unknown = import.meta.env.VITE_CANVAS_CONNECT_ENABLED,
): boolean {
  return value === "true";
}
