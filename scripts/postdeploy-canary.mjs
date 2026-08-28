import { pathToFileURL } from "node:url";
import { validateReleaseEnvironment } from "./validate-release-env.mjs";

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
const INTERNAL_DENIAL_FUNCTIONS = [
  "cleanup-abandoned-captures",
  "cleanup-abandoned-syllabi",
];
export const REVIEWED_EDGE_FUNCTIONS = Object.freeze([
  ...INVALID_BODY_FUNCTIONS,
  ...INTERNAL_DENIAL_FUNCTIONS,
  "mcp",
  "report-client-error",
]);
export const FORBIDDEN_EDGE_FUNCTIONS = Object.freeze([
  "seed-beta-user",
  "canvas-connect",
  "canvas-oauth-callback",
  "canvas-sync",
  "canvas-calendar-sync",
]);
const SPA_DEEP_LINK_PATH = "/dashboard";
const RELEASE_MANIFEST_PATH = "/release-manifest.json";
const ROBOTS_PATH = "/robots.txt";
const INVITE_ONLY_ROBOTS_DIRECTIVES = Object.freeze([
  "noarchive",
  "nofollow",
  "noindex",
]);
const CURRENT_FAMILY_BETA_AGREEMENT_VERSION = "2026-08-17";
const LEARNING_EVIDENCE_CONTRACT_STATUS = Object.freeze({
  artifactPromptVersion: "v11-evidence-ladder",
  contractVersion: 2,
  legacyWritesClosed: true,
  readinessScopeVersion: 1,
});
const EVIDENCE_REVISION_PROBE = Object.freeze({ evidenceTier: "transfer" });
const EVIDENCE_REVISION_REJECTION = "evidence classification is server-derived";
const CANARY_EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;

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
  if (
    url.protocol !== "https:"
    || url.username
    || url.password
    || url.port
    || url.pathname !== "/"
    || url.search
    || url.hash
  ) {
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
  const releaseEnvironment = validateReleaseEnvironment(environment);
  if (!releaseEnvironment.ok) {
    throw new CanaryFailure(
      "configuration",
      releaseEnvironment.issues[0]?.message ?? "production release environment validation failed",
    );
  }

  const release = required(environment, "VITE_RELEASE_SHA");
  if (!/^[0-9a-f]{40}$/i.test(release)) {
    throw new CanaryFailure("configuration", "VITE_RELEASE_SHA must be a full 40-character git commit SHA");
  }
  const publishableKey = required(environment, "VITE_SUPABASE_PUBLISHABLE_KEY");
  if (publishableKey.startsWith("sb_secret_") || legacyJwtRole(publishableKey) === "service_role") {
    throw new CanaryFailure("configuration", "VITE_SUPABASE_PUBLISHABLE_KEY cannot be a secret key");
  }
  if (!publishableKey.startsWith("sb_publishable_") && legacyJwtRole(publishableKey) !== "anon") {
    throw new CanaryFailure("configuration", "VITE_SUPABASE_PUBLISHABLE_KEY must be publishable or legacy anon");
  }
  const email = required(environment, "CANARY_EMAIL");
  const unacceptedEmail = required(environment, "UNACCEPTED_CANARY_EMAIL");
  if (!CANARY_EMAIL_PATTERN.test(email) || !CANARY_EMAIL_PATTERN.test(unacceptedEmail)) {
    throw new CanaryFailure("configuration", "canary emails must be valid dedicated account addresses");
  }
  if (email.toLowerCase() === unacceptedEmail.toLowerCase()) {
    throw new CanaryFailure("configuration", "accepted and unaccepted canary accounts must be different");
  }
  const signups = required(environment, "VITE_PUBLIC_SIGNUPS_ENABLED");
  if (signups !== "false") {
    throw new CanaryFailure("configuration", "VITE_PUBLIC_SIGNUPS_ENABLED must be false");
  }
  const passkeys = required(environment, "VITE_PASSKEYS_ENABLED");
  if (passkeys !== "true" && passkeys !== "false") {
    throw new CanaryFailure("configuration", "VITE_PASSKEYS_ENABLED must be true or false");
  }
  const canvasConnect = environment.VITE_CANVAS_CONNECT_ENABLED;
  if (canvasConnect !== "false") {
    throw new CanaryFailure("configuration", "VITE_CANVAS_CONNECT_ENABLED must be false for this release");
  }
  const origin = httpsOrigin(
    required(environment, "RELEASE_PRODUCTION_ORIGIN"),
    "RELEASE_PRODUCTION_ORIGIN",
  );
  const supabaseUrl = httpsOrigin(
    required(environment, "VITE_SUPABASE_URL"),
    "VITE_SUPABASE_URL",
  );
  const supabaseProjectId = required(environment, "VITE_SUPABASE_PROJECT_ID");
  if (new URL(supabaseUrl).hostname !== `${supabaseProjectId}.supabase.co`) {
    throw new CanaryFailure(
      "configuration",
      "VITE_SUPABASE_PROJECT_ID must match VITE_SUPABASE_URL",
    );
  }
  return {
    origin,
    supabaseUrl,
    publishableKey,
    supabaseProjectId,
    publicSupportEmail: required(environment, "VITE_PUBLIC_SUPPORT_EMAIL"),
    publicSignupsEnabled: false,
    canvasConnectEnabled: false,
    passkeysEnabled: passkeys === "true",
    email,
    password: required(environment, "CANARY_PASSWORD"),
    unacceptedEmail,
    unacceptedPassword: required(environment, "UNACCEPTED_CANARY_PASSWORD"),
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
  const cspDirectives = new Map();
  for (const rawDirective of (response.headers.get("content-security-policy") ?? "").split(";")) {
    const tokens = rawDirective.trim().split(/\s+/u).filter(Boolean);
    if (tokens.length === 0) continue;
    const name = tokens[0].toLowerCase();
    if (cspDirectives.has(name)) {
      throw new CanaryFailure(check, `content-security-policy repeats ${name}`);
    }
    cspDirectives.set(name, tokens.slice(1).map((token) => token.toLowerCase()));
  }
  for (const name of ["frame-ancestors", "object-src"]) {
    const sources = cspDirectives.get(name);
    if (!sources || sources.length !== 1 || sources[0] !== "'none'") {
      throw new CanaryFailure(check, `content-security-policy must set ${name} to exactly 'none'`);
    }
  }
  const baseScriptSources = cspDirectives.get("script-src") ?? cspDirectives.get("default-src");
  const scriptElementSources = cspDirectives.get("script-src-elem") ?? baseScriptSources;
  const scriptAttributeSources = cspDirectives.get("script-src-attr") ?? baseScriptSources;
  if (
    !baseScriptSources
    || [baseScriptSources, scriptElementSources, scriptAttributeSources].some((sources) => (
      !sources || sources.length !== 1 || sources[0] !== "'self'"
    ))
  ) {
    throw new CanaryFailure(check, "content-security-policy must restrict scripts to exactly 'self'");
  }
  if (response.headers.get("x-content-type-options")?.toLowerCase() !== "nosniff") {
    throw new CanaryFailure(check, "x-content-type-options must be nosniff");
  }
  const hstsDirectives = (response.headers.get("strict-transport-security") ?? "")
    .split(";")
    .map((directive) => directive.trim().toLowerCase())
    .filter(Boolean);
  const maxAgeDirectives = hstsDirectives.filter((directive) => directive.startsWith("max-age"));
  const maxAge = maxAgeDirectives.length === 1
    ? /^max-age=(\d+)$/u.exec(maxAgeDirectives[0])?.[1]
    : null;
  const includeSubdomains = hstsDirectives.filter((directive) => directive === "includesubdomains");
  if (!maxAge || Number(maxAge) < 31_536_000 || includeSubdomains.length !== 1) {
    throw new CanaryFailure(check, "strict-transport-security must use a one-year max-age and includeSubDomains");
  }
  const permissions = (response.headers.get("permissions-policy") ?? "")
    .toLowerCase()
    .replace(/\s+/gu, "");
  for (const directive of ["camera=()", "microphone=()", "geolocation=()"]) {
    const directiveName = directive.slice(0, directive.indexOf("="));
    const matches = permissions.split(",").filter((candidate) => (
      candidate.slice(0, candidate.indexOf("=")) === directiveName
    ));
    if (matches.length !== 1 || matches[0] !== directive) {
      throw new CanaryFailure(check, `permissions-policy must enforce ${directive}`);
    }
  }
  const referrerPolicy = response.headers.get("referrer-policy")?.trim().toLowerCase() ?? "";
  if (!["no-referrer", "strict-origin", "strict-origin-when-cross-origin"].includes(referrerPolicy)) {
    throw new CanaryFailure(check, "referrer-policy is not strict enough");
  }
}

function hasExactInviteOnlyRobotsDirectives(value) {
  if (typeof value !== "string") return false;
  const directives = value
    .split(",")
    .map((directive) => directive.trim().toLowerCase())
    .filter(Boolean)
    .sort();
  return (
    directives.length === INVITE_ONLY_ROBOTS_DIRECTIVES.length
    && directives.every((directive, index) => directive === INVITE_ONLY_ROBOTS_DIRECTIVES[index])
  );
}

function assertInviteOnlyRobotsHeader(response, check) {
  if (!hasExactInviteOnlyRobotsDirectives(response.headers.get("x-robots-tag"))) {
    throw new CanaryFailure(
      check,
      "x-robots-tag must be exactly noindex, nofollow, noarchive",
    );
  }
}

function htmlAttributes(tag) {
  const attributes = new Map();
  const duplicates = new Set();
  const entries = [];
  const pattern = /\s([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/gu;
  for (const match of tag.matchAll(pattern)) {
    const name = match[1].toLowerCase();
    const value = match[2] ?? match[3] ?? match[4] ?? "";
    if (attributes.has(name)) duplicates.add(name);
    attributes.set(name, value);
    entries.push([name, value]);
  }
  return { attributes, duplicates, entries };
}

function assertInviteOnlyRobotsMeta(html) {
  const withoutComments = html.replace(/<!--[\s\S]*?-->/gu, "");
  const head = /<head\b[^>]*>([\s\S]*?)<\/head>/iu.exec(withoutComments)?.[1] ?? "";
  const robotsMeta = [];
  const hiddenElements = [];
  const tokens = head.matchAll(/<\/?(script|template|noscript|style)\b[^>]*>|<meta\b[^>]*>/giu);

  for (const match of tokens) {
    const tag = match[0];
    const elementMatch = /^<\/?(script|template|noscript|style)\b/iu.exec(tag);
    if (elementMatch) {
      const name = elementMatch[1].toLowerCase();
      if (/^<\//u.test(tag)) {
        const index = hiddenElements.lastIndexOf(name);
        if (index >= 0) hiddenElements.splice(index, 1);
      } else if (!/\/\s*>$/u.test(tag)) {
        hiddenElements.push(name);
      }
      continue;
    }

    const parsed = htmlAttributes(tag);
    const names = parsed.entries
      .filter(([name]) => name === "name")
      .map(([, value]) => value.trim().toLowerCase());
    const isRobotsMeta = names.includes("robots");
    if (hiddenElements.length > 0 && isRobotsMeta) {
      throw new CanaryFailure(
        "invite-only-indexing",
        "robots meta must not appear inside script, template, noscript, or style content",
      );
    }
    if (hiddenElements.length > 0 || !isRobotsMeta) continue;
    if (parsed.duplicates.size > 0) {
      throw new CanaryFailure(
        "invite-only-indexing",
        "robots meta must not contain duplicate attributes",
      );
    }
    robotsMeta.push(parsed.attributes);
  }
  if (
    robotsMeta.length !== 1
    || !hasExactInviteOnlyRobotsDirectives(robotsMeta[0].get("content"))
  ) {
    throw new CanaryFailure(
      "invite-only-indexing",
      "root HTML must contain exactly one noindex, nofollow, noarchive robots meta tag",
    );
  }
}

function robotsTextDisallowsAll(body) {
  const directives = [];
  for (const rawLine of body.split(/\r?\n/u)) {
    const line = rawLine.replace(/#.*$/u, "").trim();
    if (!line) continue;
    const separator = line.indexOf(":");
    if (separator < 0) return false;
    const name = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();
    directives.push([name, value.toLowerCase()]);
  }

  // A crawler-specific group is more specific than `User-agent: *` and may
  // override its blanket denial. Require the reviewed wildcard-only file so a
  // later Allow rule, Sitemap, or named crawler exception cannot create a
  // false-green invite-only canary.
  return directives.length === 2
    && directives[0][0] === "user-agent"
    && directives[0][1] === "*"
    && directives[1][0] === "disallow"
    && directives[1][1] === "/";
}

function scriptAssetUrls(html, origin, check) {
  const urls = [];
  const pattern = /<script\b[^>]*\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'`=<>]+))/giu;
  for (const match of html.matchAll(pattern)) {
    const source = match[1] ?? match[2] ?? match[3];
    const assetUrl = new URL(source, origin);
    if (
      assetUrl.origin !== new URL(origin).origin
      || assetUrl.username !== ""
      || assetUrl.password !== ""
    ) {
      throw new CanaryFailure(check, "contains a cross-origin script asset");
    }
    urls.push(assetUrl.href);
  }
  return urls;
}

async function readPublishedHtml(response, check) {
  if (response.status !== 200) throw new CanaryFailure(check, `returned HTTP ${response.status}`);
  assertSecurityHeaders(response, check);
  assertInviteOnlyRobotsHeader(response, check);
  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.includes("text/html")) {
    throw new CanaryFailure(check, "did not return HTML");
  }
  return await response.text();
}

async function checkPublishedBundle(config, fetchImpl) {
  const response = await fetchWithTimeout(fetchImpl, config.origin, {
    headers: { Accept: "text/html" },
    redirect: "error",
  });
  const html = await readPublishedHtml(response, "published-origin");
  const assets = scriptAssetUrls(html, config.origin, "published-bundle");
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

  const deepLinkUrl = new URL(SPA_DEEP_LINK_PATH, `${config.origin}/`).href;
  const deepLinkResponse = await fetchWithTimeout(fetchImpl, deepLinkUrl, {
    headers: { Accept: "text/html" },
    redirect: "error",
  });
  const deepLinkHtml = await readPublishedHtml(deepLinkResponse, "spa-deep-link");
  const deepLinkAssets = scriptAssetUrls(deepLinkHtml, deepLinkUrl, "spa-deep-link");
  const publishedAssetSet = new Set(assets);
  const deepLinkAssetSet = new Set(deepLinkAssets);
  if (
    deepLinkAssetSet.size === 0
    || deepLinkAssetSet.size !== publishedAssetSet.size
    || [...deepLinkAssetSet].some((asset) => !publishedAssetSet.has(asset))
  ) {
    throw new CanaryFailure("spa-deep-link", "did not return the published SPA bundle");
  }

  return html;
}

async function checkInviteOnlyIndexing(config, fetchImpl, rootHtml) {
  assertInviteOnlyRobotsMeta(rootHtml);

  const robotsUrl = new URL(ROBOTS_PATH, `${config.origin}/`).href;
  const response = await fetchWithTimeout(fetchImpl, robotsUrl, {
    headers: { Accept: "text/plain" },
    redirect: "error",
  });
  if (response.status !== 200) {
    throw new CanaryFailure("invite-only-indexing", `robots.txt returned HTTP ${response.status}`);
  }
  if (!response.headers.get("content-type")?.toLowerCase().includes("text/plain")) {
    throw new CanaryFailure("invite-only-indexing", "robots.txt did not return plain text");
  }
  if (!robotsTextDisallowsAll(await response.text())) {
    throw new CanaryFailure(
      "invite-only-indexing",
      "robots.txt must contain only User-agent: * followed by Disallow: /",
    );
  }
}

async function checkReleaseManifest(config, fetchImpl) {
  const manifestUrl = new URL(RELEASE_MANIFEST_PATH, `${config.origin}/`);
  manifestUrl.searchParams.set("release", config.release);
  const response = await fetchWithTimeout(fetchImpl, manifestUrl.href, {
    headers: { Accept: "application/json", "Cache-Control": "no-cache" },
    redirect: "error",
  });
  if (response.status !== 200) {
    throw new CanaryFailure("release-manifest", `returned HTTP ${response.status}`);
  }
  if (!response.headers.get("content-type")?.toLowerCase().includes("application/json")) {
    throw new CanaryFailure("release-manifest", "did not return JSON");
  }
  if (response.headers.get("cache-control")?.trim().toLowerCase() !== "no-store") {
    throw new CanaryFailure("release-manifest", "cache-control must be exactly no-store");
  }
  let manifest;
  try {
    manifest = await response.json();
  } catch {
    throw new CanaryFailure("release-manifest", "returned invalid JSON");
  }
  const expectedKeys = [
    "canvasConnectEnabled",
    "passkeysEnabled",
    "publicSignupsEnabled",
    "publicSupportEmail",
    "releaseSha",
    "schemaVersion",
    "supabaseProjectId",
  ];
  if (
    !manifest
    || typeof manifest !== "object"
    || Array.isArray(manifest)
    || JSON.stringify(Object.keys(manifest).sort()) !== JSON.stringify(expectedKeys)
    || manifest?.schemaVersion !== 1
    || manifest?.releaseSha !== config.release
    || manifest?.supabaseProjectId !== config.supabaseProjectId
    || manifest?.publicSignupsEnabled !== config.publicSignupsEnabled
    || manifest?.canvasConnectEnabled !== config.canvasConnectEnabled
    || manifest?.passkeysEnabled !== config.passkeysEnabled
    || manifest?.publicSupportEmail !== config.publicSupportEmail
  ) {
    throw new CanaryFailure("release-manifest", "does not match the validated production configuration");
  }
}

async function authenticateCanary(config, fetchImpl, credentials, check) {
  const response = await fetchWithTimeout(
    fetchImpl,
    `${config.supabaseUrl}/auth/v1/token?grant_type=password`,
    {
      method: "POST",
      headers: {
        apikey: config.publishableKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email: credentials.email, password: credentials.password }),
    },
  );
  if (response.status !== 200) throw new CanaryFailure(check, `returned HTTP ${response.status}`);
  let body;
  try {
    body = await response.json();
  } catch {
    throw new CanaryFailure(check, "returned invalid JSON");
  }
  if (typeof body?.access_token !== "string" || body.access_token.length < 20) {
    throw new CanaryFailure(check, "did not return an access token");
  }

  const userResponse = await fetchWithTimeout(fetchImpl, `${config.supabaseUrl}/auth/v1/user`, {
    headers: {
      apikey: config.publishableKey,
      Authorization: `Bearer ${body.access_token}`,
    },
  });
  if (userResponse.status !== 200) {
    throw new CanaryFailure(check, `session verification returned HTTP ${userResponse.status}`);
  }
  let userBody;
  try {
    userBody = await userResponse.json();
  } catch {
    throw new CanaryFailure(check, "session verification returned invalid JSON");
  }
  if (
    typeof userBody?.id !== "string"
    || userBody.id.length < 20
    || typeof userBody?.email !== "string"
    || userBody.email.trim().toLowerCase() !== credentials.email.toLowerCase()
  ) {
    throw new CanaryFailure(check, "session verification did not return the expected user identity");
  }
  return { accessToken: body.access_token, userId: userBody.id };
}

async function readCanaryAgreement(config, fetchImpl, auth, check) {
  const response = await fetchWithTimeout(
    fetchImpl,
    `${config.supabaseUrl}/rest/v1/rpc/get_family_beta_agreement_status`,
    {
      method: "POST",
      headers: {
        apikey: config.publishableKey,
        Authorization: `Bearer ${auth.accessToken}`,
        "Content-Type": "application/json",
      },
      body: "{}",
    },
  );
  if (response.status !== 200) {
    throw new CanaryFailure(check, `status check returned HTTP ${response.status}`);
  }
  let body;
  try {
    body = await response.json();
  } catch {
    throw new CanaryFailure(check, "status check returned invalid JSON");
  }
  return body;
}

async function checkAcceptedCanaryAgreement(config, fetchImpl, auth) {
  const body = await readCanaryAgreement(config, fetchImpl, auth, "canary-agreement");
  if (
    body?.accepted !== true
    || body?.agreementVersion !== CURRENT_FAMILY_BETA_AGREEMENT_VERSION
    || body?.ownerId !== auth.userId
    || typeof body?.acceptedAt !== "string"
    || !Number.isFinite(Date.parse(body.acceptedAt))
  ) {
    throw new CanaryFailure("canary-agreement", "current durable receipt is missing");
  }
}

async function checkUnacceptedCanaryAgreement(config, fetchImpl, auth) {
  const body = await readCanaryAgreement(
    config,
    fetchImpl,
    auth,
    "canary-unaccepted-agreement",
  );
  if (
    body?.accepted !== false
    || body?.agreementVersion !== CURRENT_FAMILY_BETA_AGREEMENT_VERSION
    || body?.ownerId !== auth.userId
    || body?.acceptedAt !== null
  ) {
    throw new CanaryFailure(
      "canary-unaccepted-agreement",
      "dedicated account unexpectedly has a durable current receipt",
    );
  }
}

async function checkLearningEvidenceContract(config, fetchImpl, auth) {
  const response = await fetchWithTimeout(
    fetchImpl,
    `${config.supabaseUrl}/rest/v1/rpc/get_learning_evidence_contract_status`,
    {
      method: "POST",
      headers: {
        apikey: config.publishableKey,
        Authorization: `Bearer ${auth.accessToken}`,
        "Cache-Control": "no-store",
        "Content-Type": "application/json",
      },
      body: "{}",
    },
  );
  if (response.status !== 200) {
    throw new CanaryFailure(
      "learning-evidence-contract",
      `status check returned HTTP ${response.status}`,
    );
  }
  if (!response.headers.get("content-type")?.toLowerCase().includes("application/json")) {
    throw new CanaryFailure("learning-evidence-contract", "status check did not return JSON");
  }
  let body;
  try {
    body = await response.json();
  } catch {
    throw new CanaryFailure("learning-evidence-contract", "status check returned invalid JSON");
  }
  const expectedKeys = Object.keys(LEARNING_EVIDENCE_CONTRACT_STATUS).sort();
  if (
    !body
    || typeof body !== "object"
    || Array.isArray(body)
    || JSON.stringify(Object.keys(body).sort()) !== JSON.stringify(expectedKeys)
    || body.artifactPromptVersion !== LEARNING_EVIDENCE_CONTRACT_STATUS.artifactPromptVersion
    || body.contractVersion !== LEARNING_EVIDENCE_CONTRACT_STATUS.contractVersion
    || body.legacyWritesClosed !== LEARNING_EVIDENCE_CONTRACT_STATUS.legacyWritesClosed
    || body.readinessScopeVersion !== LEARNING_EVIDENCE_CONTRACT_STATUS.readinessScopeVersion
  ) {
    throw new CanaryFailure(
      "learning-evidence-contract",
      "database does not report the exact evidence contract with fresh legacy writes closed",
    );
  }
}

async function invokeFunction(config, fetchImpl, accessToken, name, body, expectedStatus, seenRequestIds) {
  const requestId = crypto.randomUUID();
  const response = await fetchWithTimeout(
    fetchImpl,
    `${config.supabaseUrl}/functions/v1/${name}`,
    {
      method: "POST",
      headers: {
        apikey: config.publishableKey,
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "X-Request-ID": requestId,
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
  if (!response.headers.get("content-type")?.toLowerCase().includes("application/json")) {
    throw new CanaryFailure(`function-${name}`, "response is not JSON");
  }
  const responseRequestId = response.headers.get("x-request-id")?.trim() ?? "";
  if (responseRequestId !== requestId) {
    throw new CanaryFailure(`function-${name}`, "response did not echo the unique request ID");
  }
  if (seenRequestIds.has(responseRequestId)) {
    throw new CanaryFailure(`function-${name}`, "response reused a prior request ID");
  }
  seenRequestIds.add(responseRequestId);
  try {
    const responseBody = await response.clone().json();
    if (
      responseBody
      && typeof responseBody === "object"
      && "requestId" in responseBody
      && responseBody.requestId !== responseRequestId
    ) {
      throw new CanaryFailure(`function-${name}`, "body and header request IDs do not match");
    }
  } catch (error) {
    if (error instanceof CanaryFailure) throw error;
    throw new CanaryFailure(`function-${name}`, "response body is not valid JSON");
  }
  return response;
}

async function requireAgreementDenial(response, name) {
  let body;
  try {
    body = await response.json();
  } catch {
    throw new CanaryFailure(`function-${name}`, "agreement denial returned invalid JSON");
  }
  if (
    body?.reason !== "family_beta_agreement_required"
    || body?.retryable !== false
  ) {
    throw new CanaryFailure(`function-${name}`, "agreement denial reason is not launch-safe");
  }
}

async function requireEvidenceAwareRecordStudyResult(response) {
  let body;
  try {
    body = await response.json();
  } catch {
    throw new CanaryFailure(
      "record-study-result-evidence-revision",
      "revision probe returned invalid JSON",
    );
  }
  if (
    !body
    || typeof body !== "object"
    || Array.isArray(body)
    || JSON.stringify(Object.keys(body).sort()) !== JSON.stringify(["error"])
    || body.error !== EVIDENCE_REVISION_REJECTION
  ) {
    throw new CanaryFailure(
      "record-study-result-evidence-revision",
      "deployed function does not enforce the evidence-aware request contract",
    );
  }
}

async function requireFunctionAbsent(config, fetchImpl, accessToken, name) {
  const response = await fetchWithTimeout(
    fetchImpl,
    `${config.supabaseUrl}/functions/v1/${name}`,
    {
      method: "POST",
      headers: {
        apikey: config.publishableKey,
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      },
      body: "{}",
      redirect: "error",
    },
  );
  if (response.status !== 404) {
    throw new CanaryFailure(
      `function-${name}-absence`,
      `returned HTTP ${response.status}; expected 404`,
    );
  }
}

async function checkBackend(config, fetchImpl) {
  const seenRequestIds = new Set();
  const auth = await authenticateCanary(
    config,
    fetchImpl,
    { email: config.email, password: config.password },
    "canary-auth",
  );
  await checkAcceptedCanaryAgreement(config, fetchImpl, auth);
  await checkLearningEvidenceContract(config, fetchImpl, auth);
  const unacceptedAuth = await authenticateCanary(
    config,
    fetchImpl,
    { email: config.unacceptedEmail, password: config.unacceptedPassword },
    "canary-unaccepted-auth",
  );
  if (auth.userId === unacceptedAuth.userId) {
    throw new CanaryFailure("canary-unaccepted-auth", "resolved to the accepted canary account");
  }
  await checkUnacceptedCanaryAgreement(config, fetchImpl, unacceptedAuth);

  for (const name of FORBIDDEN_EDGE_FUNCTIONS) {
    await requireFunctionAbsent(config, fetchImpl, auth.accessToken, name);
  }

  for (const name of INVALID_BODY_FUNCTIONS) {
    const response = await invokeFunction(
      config,
      fetchImpl,
      unacceptedAuth.accessToken,
      name,
      {},
      403,
      seenRequestIds,
    );
    await requireAgreementDenial(response, name);
  }
  for (const name of INVALID_BODY_FUNCTIONS) {
    await invokeFunction(config, fetchImpl, auth.accessToken, name, {}, 400, seenRequestIds);
  }
  const evidenceRevisionResponse = await invokeFunction(
    config,
    fetchImpl,
    auth.accessToken,
    "record-study-result",
    EVIDENCE_REVISION_PROBE,
    400,
    seenRequestIds,
  );
  await requireEvidenceAwareRecordStudyResult(evidenceRevisionResponse);
  // Prove the internal cleanup route is deployed and denies a normal signed-in
  // browser without its separate Vault-bound scheduler secret. The canary must
  // never perform a cleanup claim.
  for (const name of INTERNAL_DENIAL_FUNCTIONS) {
    await invokeFunction(config, fetchImpl, auth.accessToken, name, {}, 401, seenRequestIds);
  }
  await invokeFunction(config, fetchImpl, auth.accessToken, "mcp", {}, 410, seenRequestIds);
  await invokeFunction(config, fetchImpl, auth.accessToken, "report-client-error", {
    eventId: crypto.randomUUID(),
    eventKind: "render",
    errorName: "Error",
    release: config.release,
    route: "/release-canary",
  }, 202, seenRequestIds);
}

export async function runPostdeployCanary(environment, fetchImpl = fetch) {
  const config = readCanaryConfiguration(environment);
  const rootHtml = await checkPublishedBundle(config, fetchImpl);
  await checkInviteOnlyIndexing(config, fetchImpl, rootHtml);
  await checkReleaseManifest(config, fetchImpl);
  await checkBackend(config, fetchImpl);
  return {
    ok: true,
    checks: [
      "published-origin",
      "published-bundle",
      "spa-deep-link",
      "invite-only-indexing",
      "release-manifest",
      "canary-auth",
      "canary-agreement",
      "learning-evidence-contract",
      "canary-unaccepted-auth",
      "canary-unaccepted-agreement",
      "edge-function-inventory",
      "edge-agreement-contracts",
      "edge-validation-contracts",
      "record-study-result-evidence-revision",
      "cleanup-worker-denials",
      "mcp-retirement",
      "error-report-ingest",
    ],
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
