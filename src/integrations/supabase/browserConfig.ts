export interface BrowserSupabaseConfig {
  url: string;
  publishableKey: string;
  projectId: string;
}

/** Hosted project ref encoded in a standard Supabase URL. */
export function projectRefFromSupabaseUrl(rawUrl: string): string | null {
  try {
    const candidate = rawUrl.trim();
    const url = new URL(candidate);
    // A browser credential may only be sent to the exact hosted project
    // origin. Reject lookalike hosts and otherwise-valid URLs with credentials,
    // ports, paths, query parameters, or fragments.
    if (url.protocol !== "https:" || url.port || candidate !== url.origin) return null;
    const match = url.hostname.match(/^([a-z0-9-]+)\.supabase\.co$/);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

function legacyJwtRole(key: string): string | null {
  const payload = key.split(".")[1];
  if (!payload) return null;
  try {
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    const parsed = JSON.parse(atob(padded)) as { role?: unknown };
    return typeof parsed.role === "string" ? parsed.role : null;
  } catch {
    return null;
  }
}

/**
 * Browser bundles may contain only Supabase anon/publishable credentials.
 * Failing at startup is safer than quietly forwarding an accidentally exposed
 * service credential with every request.
 */
export function validateBrowserSupabaseConfig(input: {
  url: unknown;
  publishableKey: unknown;
  projectId: unknown;
}): BrowserSupabaseConfig {
  const url = typeof input.url === "string" ? input.url.trim() : "";
  const publishableKey = typeof input.publishableKey === "string"
    ? input.publishableKey.trim()
    : "";
  const projectId = typeof input.projectId === "string" ? input.projectId.trim() : "";
  if (!url || !publishableKey || !projectId) {
    throw new Error("Supabase browser configuration is incomplete");
  }
  if (
    publishableKey.startsWith("sb_secret_")
    || legacyJwtRole(publishableKey) === "service_role"
  ) {
    throw new Error("A Supabase secret/service-role key must never be shipped to the browser");
  }
  const isPublishableKey = publishableKey.startsWith("sb_publishable_");
  const isLegacyAnonKey = legacyJwtRole(publishableKey) === "anon";
  if (!isPublishableKey && !isLegacyAnonKey) {
    throw new Error("The Supabase browser key must be publishable or legacy anon");
  }
  const urlProjectId = projectRefFromSupabaseUrl(url);
  if (!urlProjectId) {
    throw new Error("The Supabase browser URL must be an exact hosted HTTPS project origin");
  }
  if (urlProjectId !== projectId) {
    throw new Error("Supabase URL and project ID do not match");
  }
  return { url, publishableKey, projectId };
}
