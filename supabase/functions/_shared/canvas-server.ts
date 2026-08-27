import { normalizeCanvasBaseUrl } from "./canvas-mapping.ts";

export interface CanvasOAuthClient {
  baseUrl: string;
  institution: string;
  clientId: string;
  clientSecret: string;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function canvasCallbackUrl(): string {
  const url = Deno.env.get("SUPABASE_URL");
  if (!url) throw new Error("SUPABASE_URL is not configured");
  return `${url}/functions/v1/canvas-oauth-callback`;
}

export function canvasAppUrl(): string {
  const configured = Deno.env.get("CANVAS_APP_URL")?.trim();
  if (!configured) throw new Error("CANVAS_APP_URL is not configured");

  const url = new URL(configured);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.port ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new Error("CANVAS_APP_URL must be an HTTPS origin");
  }
  return url.origin;
}

export function getCanvasOAuthClient(
  rawBaseUrl: string,
): CanvasOAuthClient | null {
  const baseUrl = normalizeCanvasBaseUrl(rawBaseUrl);
  const configured = Deno.env.get("CANVAS_OAUTH_CLIENTS");
  if (configured) {
    const clients = JSON.parse(configured) as Array<Partial<CanvasOAuthClient>>;
    const match = clients.find(
      (item) =>
        item.baseUrl && normalizeCanvasBaseUrl(item.baseUrl) === baseUrl,
    );
    if (match?.clientId && match.clientSecret) {
      return {
        baseUrl,
        institution: match.institution || new URL(baseUrl).hostname,
        clientId: match.clientId,
        clientSecret: match.clientSecret,
      };
    }
    return null;
  }
  const fallbackUrl = Deno.env.get("CANVAS_BASE_URL");
  const clientId = Deno.env.get("CANVAS_CLIENT_ID");
  const clientSecret = Deno.env.get("CANVAS_CLIENT_SECRET");
  if (
    !fallbackUrl ||
    !clientId ||
    !clientSecret ||
    normalizeCanvasBaseUrl(fallbackUrl) !== baseUrl
  )
    return null;
  return {
    baseUrl,
    institution:
      Deno.env.get("CANVAS_INSTITUTION_NAME") || new URL(baseUrl).hostname,
    clientId,
    clientSecret,
  };
}

export function randomUrlSafe(bytes = 32): string {
  const values = crypto.getRandomValues(new Uint8Array(bytes));
  return toBase64(values)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return toBase64(new Uint8Array(digest));
}

export async function encryptCanvasToken(value: string): Promise<string> {
  const key = await encryptionKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    encoder.encode(value),
  );
  return `v1.${toBase64(iv)}.${toBase64(new Uint8Array(encrypted))}`;
}

export async function decryptCanvasToken(value: string): Promise<string> {
  const [version, ivText, cipherText] = value.split(".");
  if (version !== "v1" || !ivText || !cipherText) {
    throw new Error("Invalid token envelope");
  }
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: asArrayBuffer(fromBase64(ivText)) },
    await encryptionKey(),
    asArrayBuffer(fromBase64(cipherText)),
  );
  return decoder.decode(decrypted);
}

export function safeAppRedirect(path: string): string {
  const app = new URL(canvasAppUrl());
  app.pathname = path.startsWith("/") ? path : "/integrations/canvas";
  app.search = "";
  app.hash = "";
  return app.toString();
}

async function encryptionKey() {
  const encoded = Deno.env.get("CANVAS_TOKEN_ENCRYPTION_KEY");
  if (!encoded) throw new Error("Canvas encryption is not configured");
  const bytes = fromBase64(encoded);
  if (bytes.byteLength !== 32) {
    throw new Error("Canvas encryption key must be 32 bytes");
  }
  return crypto.subtle.importKey(
    "raw",
    asArrayBuffer(bytes),
    "AES-GCM",
    false,
    ["encrypt", "decrypt"],
  );
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function asArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return Uint8Array.from(bytes).buffer;
}
