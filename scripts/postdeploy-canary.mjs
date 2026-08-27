import { pathToFileURL } from "node:url";

const REQUIRED_SECURITY_HEADERS = [
  "content-security-policy",
  "permissions-policy",
  "referrer-policy",
  "strict-transport-security",
  "x-content-type-options",
];
const INVALID_BODY_FUNCTIONS = [
  "confirm-assignment-practice-source",
  "extract-concepts",
  "generate-artifact",
  "parse-syllabus",
  "process-capture-images",
  "record-study-result",
];

export class CanaryFailure extends Error {
  constructor(check, reason) {
    super(`${check}: ${reason}`);
    this.name = "CanaryFailure";
    this.check = check;
  }
}

function required(environment, name) {
  const value = environment[name];
  if (typeof value !== "string" || value.trim() === "") {
    throw new CanaryFailure("configuration", `${name} is required`);
  }
  return value.trim();
}

function httpsOrigin(value, name) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new CanaryFailure("configuration", `${name} must be a valid HTTPS origin`);
  }
  if (url.protocol !== "https:" || url.pathname !== "/" || url.search || url.hash) {
    throw new CanaryFailure("configuration", `${name} must be an HTTPS origin`);
  }
  return url.origin;
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

export function readCanaryConfiguration(environment) {
  const release = required(environment, "VITE_RELEASE_SHA");
  if (!/^[0-9a-f]{7,40}$/i.test(release)) {
    throw new CanaryFailure("configuration", "VITE_RELEASE_SHA must be a git commit SHA");
  }
  const publishableKey = required(environment, "VITE_SUPABASE_PUBLISHABLE_KEY");
  if (publishableKey.startsWith("sb_secret_") || legacyJwtRole(publishableKey) === "service_role") {
    throw new CanaryFailure("configuration", "VITE_SUPABASE_PUBLISHABLE_KEY cannot be a secret key");
  }
  if (!publishableKey.startsWith("sb_publishable_") && legacyJwtRole(publishableKey) !== "anon") {
    throw new CanaryFailure("configuration", "VITE_SUPABASE_PUBLISHABLE_KEY must be publishable or legacy anon");
  }
  return {
    origin: httpsOrigin(required(environment, "RELEASE_PRODUCTION_ORIGIN"), "RELEASE_PRODUCTION_ORIGIN"),
    supabaseUrl: httpsOrigin(required(environment, "VITE_SUPABASE_URL"), "VITE_SUPABASE_URL"),
    publishableKey,
    email: required(environment, "CANARY_EMAIL"),
    password: required(environment, "CANARY_PASSWORD"),
    release: release.toLowerCase(),
  };
}

async function fetchWithTimeout(fetchImpl, input, init = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    return await fetchImpl(input, { ...init, signal: controller.signal });
  } catch {
    throw new CanaryFailure("network", "request failed or timed out");
  } finally {
    clearTimeout(timeout);
  }
}

function assertSecurityHeaders(response, check) {
  for (const header of REQUIRED_SECURITY_HEADERS) {
    if (!response.headers.get(header)) {
      throw new CanaryFailure(check, `missing ${header} header`);
    }
  }
  const csp = response.headers.get("content-security-policy") ?? "";
  if (!csp.includes("frame-ancestors 'none'") || !csp.includes("object-src 'none'")) {
    throw new CanaryFailure(check, "content-security-policy is not enforced for frames and objects");
  }
  if (response.headers.get("x-content-type-options")?.toLowerCase() !== "nosniff") {
    throw new CanaryFailure(check, "x-content-type-options must be nosniff");
  }
}

function scriptAssetUrls(html, origin) {
  const urls = [];
  const pattern = /<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi;
  for (const match of html.matchAll(pattern)) {
    urls.push(new URL(match[1], origin).href);
  }
  return urls;
}

async function checkPublishedBundle(config, fetchImpl) {
  const response = await fetchWithTimeout(fetchImpl, config.origin, {
    headers: { Accept: "text/html" },
    redirect: "error",
  });
  if (response.status !== 200) throw new CanaryFailure("published-origin", `returned HTTP ${response.status}`);
  assertSecurityHeaders(response, "published-origin");
  const html = await response.text();
  const assets = scriptAssetUrls(html, config.origin);
  if (assets.length === 0) throw new CanaryFailure("published-bundle", "contains no script asset");

  let releaseFound = false;
  for (const asset of assets.slice(0, 4)) {
    const assetResponse = await fetchWithTimeout(fetchImpl, asset, { redirect: "error" });
    if (assetResponse.status !== 200) {
      throw new CanaryFailure("published-bundle", `script asset returned HTTP ${assetResponse.status}`);
    }
    if ((await assetResponse.text()).includes(config.release)) releaseFound = true;
  }
  if (!releaseFound) throw new CanaryFailure("published-bundle", "does not contain the expected release SHA");
}

async function authenticateCanary(config, fetchImpl) {
  const response = await fetchWithTimeout(
    fetchImpl,
    `${config.supabaseUrl}/auth/v1/token?grant_type=password`,
    {
      method: "POST",
      headers: {
        apikey: config.publishableKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email: config.email, password: config.password }),
    },
  );
  if (response.status !== 200) throw new CanaryFailure("canary-auth", `returned HTTP ${response.status}`);
  let body;
  try {
    body = await response.json();
  } catch {
    throw new CanaryFailure("canary-auth", "returned invalid JSON");
  }
  if (typeof body?.access_token !== "string" || body.access_token.length < 20) {
    throw new CanaryFailure("canary-auth", "did not return an access token");
  }
  return body.access_token;
}

async function invokeFunction(config, fetchImpl, accessToken, name, body, expectedStatus) {
  const response = await fetchWithTimeout(
    fetchImpl,
    `${config.supabaseUrl}/functions/v1/${name}`,
    {
      method: "POST",
      headers: {
        apikey: config.publishableKey,
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    },
  );
  if (response.status !== expectedStatus) {
    throw new CanaryFailure(`function-${name}`, `returned HTTP ${response.status}; expected ${expectedStatus}`);
  }
  if (response.headers.get("cache-control") !== "private, no-store") {
    throw new CanaryFailure(`function-${name}`, "response is not private and non-cacheable");
  }
  if (response.headers.get("x-content-type-options")?.toLowerCase() !== "nosniff") {
    throw new CanaryFailure(`function-${name}`, "response is missing nosniff");
  }
}

async function checkBackend(config, fetchImpl) {
  const accessToken = await authenticateCanary(config, fetchImpl);
  for (const name of INVALID_BODY_FUNCTIONS) {
    await invokeFunction(config, fetchImpl, accessToken, name, {}, 400);
  }
  await invokeFunction(config, fetchImpl, accessToken, "report-client-error", {
    eventId: crypto.randomUUID(),
    eventKind: "render",
    errorName: "Error",
    release: config.release,
    route: "/release-canary",
  }, 202);
}

export async function runPostdeployCanary(environment, fetchImpl = fetch) {
  const config = readCanaryConfiguration(environment);
  await checkPublishedBundle(config, fetchImpl);
  await checkBackend(config, fetchImpl);
  return {
    ok: true,
    checks: ["published-origin", "published-bundle", "canary-auth", "edge-functions", "error-signal"],
  };
}

async function runCli() {
  try {
    const result = await runPostdeployCanary(process.env);
    process.stdout.write(`Post-deploy canary passed: ${result.checks.join(", ")}\n`);
  } catch (error) {
    const safeMessage = error instanceof CanaryFailure ? error.message : "unexpected canary failure";
    process.stderr.write(`Post-deploy canary failed: ${safeMessage}\n`);
    process.exitCode = 1;
  }
}

const invokedPath = process.argv[1];
if (invokedPath && import.meta.url === pathToFileURL(invokedPath).href) {
  await runCli();
}
