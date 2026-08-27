import { pathToFileURL } from "node:url";

const FAMILY_BETA_STAGING_PROJECT_REF = "dfpgnmldxphkfmobjbvr";
const PRODUCTION_SUPABASE_PROJECT_REF = "norsaaoyppctrvxxgjtg";
const SUPABASE_HOST_PATTERN = /^([a-z0-9-]+)\.supabase\.co$/u;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;

function issue(code, variable, message) {
  return { code, variable, message };
}

function normalizedString(environment, variable, issues) {
  const rawValue = environment[variable];
  if (typeof rawValue !== "string" || rawValue.trim().length === 0) {
    issues.push(issue("required", variable, `${variable} is required.`));
    return null;
  }

  const value = rawValue.trim();
  if (value !== rawValue) {
    issues.push(
      issue(
        "surrounding_whitespace",
        variable,
        `${variable} must not contain surrounding whitespace.`,
      ),
    );
    return null;
  }

  return value;
}

function parseHttpsOrigin(value, variable, issues) {
  let url;
  try {
    url = new URL(value);
  } catch {
    issues.push(issue("invalid_url", variable, `${variable} must be a valid HTTPS URL.`));
    return null;
  }

  if (url.protocol !== "https:") {
    issues.push(issue("https_required", variable, `${variable} must use HTTPS.`));
    return null;
  }

  if (
    url.username ||
    url.password ||
    url.port ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    issues.push(
      issue(
        "origin_required",
        variable,
        `${variable} must be an HTTPS origin without credentials, a port, a path, a query, or a fragment.`,
      ),
    );
    return null;
  }

  return url;
}

function isPlaceholderEmail(email) {
  const domain = email.toLowerCase().split("@").at(-1) ?? "";
  return (
    domain === "example.com" ||
    domain === "example.org" ||
    domain === "example.net" ||
    domain === "localhost" ||
    domain === "invalid" ||
    domain.endsWith(".example") ||
    domain.endsWith(".invalid") ||
    domain.endsWith(".test")
  );
}

function legacyJwtRole(key) {
  const payload = key.split(".")[1];
  if (!payload) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return typeof parsed?.role === "string" ? parsed.role : null;
  } catch {
    return null;
  }
}

/**
 * Validate public release configuration. The returned issues intentionally
 * contain variable names and fixed guidance, never environment values.
 *
 * @param {Record<string, string | undefined>} environment
 * @returns {{ ok: boolean, issues: Array<{ code: string, variable: string, message: string }> }}
 */
export function validateReleaseEnvironment(environment) {
  const issues = [];

  const supabaseUrlValue = normalizedString(environment, "VITE_SUPABASE_URL", issues);
  const projectId = normalizedString(environment, "VITE_SUPABASE_PROJECT_ID", issues);
  const publishableKey = normalizedString(environment, "VITE_SUPABASE_PUBLISHABLE_KEY", issues);
  const productionOriginValue = normalizedString(environment, "RELEASE_PRODUCTION_ORIGIN", issues);
  const productionOrigin = productionOriginValue
    ? parseHttpsOrigin(productionOriginValue, "RELEASE_PRODUCTION_ORIGIN", issues)
    : null;
  const releaseSha = normalizedString(environment, "VITE_RELEASE_SHA", issues);

  if (
    publishableKey
    && (publishableKey.startsWith("sb_secret_") || legacyJwtRole(publishableKey) === "service_role")
  ) {
    issues.push(
      issue(
        "secret_key_forbidden",
        "VITE_SUPABASE_PUBLISHABLE_KEY",
        "VITE_SUPABASE_PUBLISHABLE_KEY must never contain a secret Supabase key.",
      ),
    );
  } else if (
    publishableKey
    && !publishableKey.startsWith("sb_publishable_")
    && legacyJwtRole(publishableKey) !== "anon"
  ) {
    issues.push(
      issue(
        "unclassified_public_key",
        "VITE_SUPABASE_PUBLISHABLE_KEY",
        "VITE_SUPABASE_PUBLISHABLE_KEY must be a Supabase publishable key or legacy anon key.",
      ),
    );
  }
  if (releaseSha && !/^[0-9a-f]{40}$/iu.test(releaseSha)) {
    issues.push(
      issue(
        "invalid_release_sha",
        "VITE_RELEASE_SHA",
        "VITE_RELEASE_SHA must contain the full 40-character git commit SHA being released.",
      ),
    );
  }

  let urlProjectRef = null;
  if (supabaseUrlValue) {
    const supabaseUrl = parseHttpsOrigin(supabaseUrlValue, "VITE_SUPABASE_URL", issues);
    if (supabaseUrl) {
      const hostnameMatch = SUPABASE_HOST_PATTERN.exec(supabaseUrl.hostname);
      if (!hostnameMatch) {
        issues.push(
          issue(
            "invalid_supabase_host",
            "VITE_SUPABASE_URL",
            "VITE_SUPABASE_URL must use the project's <project-ref>.supabase.co hostname.",
          ),
        );
      } else {
        urlProjectRef = hostnameMatch[1];
      }
    }
  }

  if (urlProjectRef && projectId && urlProjectRef !== projectId) {
    issues.push(
      issue(
        "project_ref_mismatch",
        "VITE_SUPABASE_PROJECT_ID",
        "VITE_SUPABASE_PROJECT_ID must exactly match the project ref in VITE_SUPABASE_URL.",
      ),
    );
  }

  if (
    projectId === FAMILY_BETA_STAGING_PROJECT_REF ||
    urlProjectRef === FAMILY_BETA_STAGING_PROJECT_REF
  ) {
    issues.push(
      issue(
        "staging_project_forbidden",
        "VITE_SUPABASE_PROJECT_ID",
        "The family-beta staging Supabase project cannot be used for a production release.",
      ),
    );
  } else if (
    (projectId && projectId !== PRODUCTION_SUPABASE_PROJECT_REF)
    || (urlProjectRef && urlProjectRef !== PRODUCTION_SUPABASE_PROJECT_REF)
  ) {
    issues.push(
      issue(
        "unexpected_production_project",
        "VITE_SUPABASE_PROJECT_ID",
        "The production release must use the exact reviewed production Supabase project.",
      ),
    );
  }

  const supportEmail = normalizedString(environment, "VITE_PUBLIC_SUPPORT_EMAIL", issues);
  if (supportEmail) {
    if (!EMAIL_PATTERN.test(supportEmail) || isPlaceholderEmail(supportEmail)) {
      issues.push(
        issue(
          "monitored_support_email_required",
          "VITE_PUBLIC_SUPPORT_EMAIL",
          "VITE_PUBLIC_SUPPORT_EMAIL must be a real monitored support address.",
        ),
      );
    }
  }

  if (environment.VITE_PUBLIC_SIGNUPS_ENABLED !== "false") {
    issues.push(
      issue(
        "public_signups_must_be_disabled",
        "VITE_PUBLIC_SIGNUPS_ENABLED",
        "VITE_PUBLIC_SIGNUPS_ENABLED must be explicitly set to false for production.",
      ),
    );
  }

  const canvasConnectEnabled = environment.VITE_CANVAS_CONNECT_ENABLED;
  if (canvasConnectEnabled !== "false") {
    issues.push(
      issue(
        "canvas_connect_must_be_disabled",
        "VITE_CANVAS_CONNECT_ENABLED",
        "VITE_CANVAS_CONNECT_ENABLED must be explicitly set to false for this release.",
      ),
    );
  }

  const passkeysEnabled = environment.VITE_PASSKEYS_ENABLED;
  if (passkeysEnabled !== "false" && passkeysEnabled !== "true") {
    issues.push(
      issue(
        "explicit_passkey_state_required",
        "VITE_PASSKEYS_ENABLED",
        "VITE_PASSKEYS_ENABLED must be explicitly set to false or true.",
      ),
    );
  } else if (passkeysEnabled === "true") {
    const relyingPartyId = normalizedString(environment, "VITE_PASSKEY_RP_ID", issues);

    if (
      relyingPartyId &&
      productionOrigin &&
      relyingPartyId.toLowerCase() !== productionOrigin.hostname.toLowerCase()
    ) {
      issues.push(
        issue(
          "passkey_domain_mismatch",
          "VITE_PASSKEY_RP_ID",
          "VITE_PASSKEY_RP_ID must exactly match the RELEASE_PRODUCTION_ORIGIN hostname.",
        ),
      );
    }
  }

  return { ok: issues.length === 0, issues };
}

export function formatReleaseEnvironmentIssues(issues) {
  return issues.map(({ message }) => `- ${message}`).join("\n");
}

function runCli() {
  const result = validateReleaseEnvironment(process.env);
  if (result.ok) {
    process.stdout.write("Release environment validation passed.\n");
    return;
  }

  process.stderr.write(
    `Release environment validation failed:\n${formatReleaseEnvironmentIssues(result.issues)}\n`,
  );
  process.exitCode = 1;
}

const invokedPath = process.argv[1];
if (invokedPath && import.meta.url === pathToFileURL(invokedPath).href) {
  runCli();
}
