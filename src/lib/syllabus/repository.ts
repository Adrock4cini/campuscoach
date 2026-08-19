import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import {
  MAX_SYLLABUS_BYTES,
  SYLLABUS_BUCKET,
  SYLLABUS_MIME_TYPES,
  parseParsedSyllabus,
  validateSyllabusReviewDraft,
  type ParsedSyllabus,
  type SyllabusReviewDraft,
  type TargetClassContext,
} from "./schema";

export interface UploadedSyllabusSource {
  requestId: string;
  storagePath: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  contentHash: string;
}

export interface ClassSyllabus {
  id: string;
  userId: string;
  classId: string;
  clientClassId: string;
  revision: number;
  storagePath: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  contentHash: string;
  parsedData: ParsedSyllabus;
  reviewedData: SyllabusReviewDraft;
  requestId: string;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
}

export interface CommitClassSyllabusInput {
  classUuid: string;
  clientClassId: string;
  requestId: string;
  source: UploadedSyllabusSource;
  parsed: ParsedSyllabus;
  review: SyllabusReviewDraft;
}

export interface CommitClassSyllabusResult {
  syllabusId: string;
  revision: number;
  noOp: boolean;
  retry: boolean;
  cleanupPath: string | null;
}

export interface ClassSyllabusRequest {
  requestId: string;
  classId: string;
  clientClassId: string;
  storagePath: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  contentHash: string;
  parsedData: ParsedSyllabus;
  reviewedData: SyllabusReviewDraft;
  syllabusId: string | null;
  result: CommitClassSyllabusResult;
  createdAt: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function parseClassSyllabus(
  file: File,
  targetClass: TargetClassContext,
): Promise<ParsedSyllabus> {
  const mimeType = validateSyllabusFile(file);
  const fileDataUrl = await fileToDataUrl(file);
  const { data, error } = await supabase.functions.invoke("parse-syllabus", {
    body: {
      fileDataUrl,
      filename: file.name,
      mimeType,
      targetClass: {
        id: targetClass.id,
        clientClassId: targetClass.clientClassId,
        name: targetClass.name,
        code: targetClass.code ?? "",
        term: targetClass.term ?? "",
      },
    },
  });
  if (error) throw new Error(await describeSyllabusFunctionError(error));
  return parseParsedSyllabus(data);
}

async function describeSyllabusFunctionError(error: unknown) {
  const value = error as { message?: unknown; context?: unknown };
  const response = value.context instanceof Response ? value.context : null;
  let serverMessage = "";
  if (response) {
    try {
      const body = await response.clone().json() as { error?: unknown; details?: unknown };
      serverMessage = typeof body.error === "string"
        ? body.error.trim()
        : typeof body.details === "string" ? body.details.trim() : "";
    } catch {
      serverMessage = "";
    }
  }
  if (response?.status === 401) return "Your session expired. Sign in again, then retry the syllabus.";
  if (response?.status === 429) return "Too many syllabus scans are running right now. Wait a moment and try again.";
  if (response && response.status >= 500) {
    return serverMessage
      ? `The syllabus reader could not finish: ${serverMessage}. Try again shortly.`
      : "The syllabus reader is temporarily unavailable. Try again shortly.";
  }
  return serverMessage || (typeof value.message === "string" ? value.message : "") || "We couldn’t read that syllabus.";
}

export async function getClassSyllabus(classUuid: string): Promise<ClassSyllabus | null> {
  assertUuid(classUuid, "class UUID");
  const { data, error } = await supabase
    .from("class_syllabi")
    .select("*")
    .eq("class_id", classUuid)
    .is("archived_at", null)
    .maybeSingle();
  if (error) throw error;
  return data ? mapClassSyllabus(data) : null;
}

export async function getClassSyllabusRequest(
  requestId: string,
): Promise<ClassSyllabusRequest | null> {
  assertUuid(requestId, "request ID");
  const { data, error } = await supabase
    .from("class_syllabus_requests")
    .select("*")
    .eq("request_id", requestId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    requestId: data.request_id,
    classId: data.class_id,
    clientClassId: data.client_class_id,
    storagePath: data.storage_path,
    originalName: data.original_name,
    mimeType: data.mime_type,
    sizeBytes: data.size_bytes,
    contentHash: data.content_hash,
    parsedData: parseParsedSyllabus(data.parsed_data),
    reviewedData: validateSyllabusReviewDraft(data.reviewed_data),
    syllabusId: data.syllabus_id,
    result: parseCommitResult(data.result),
    createdAt: data.created_at,
  };
}

export async function uploadSyllabusSource(input: {
  classUuid: string;
  file: File;
  requestId?: string;
}): Promise<UploadedSyllabusSource> {
  assertUuid(input.classUuid, "class UUID");
  const requestId = input.requestId ?? crypto.randomUUID();
  assertUuid(requestId, "request ID");
  const mimeType = validateSyllabusFile(input.file);
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError) throw authError;
  if (!authData.user) throw new Error("Sign in before uploading a syllabus");

  const contentHash = await sha256(input.file);
  const extension = extensionForMimeType(mimeType);
  const storagePath = `${authData.user.id}/${input.classUuid}/${requestId}/source.${extension}`;
  const { error } = await supabase.storage.from(SYLLABUS_BUCKET).upload(storagePath, input.file, {
    cacheControl: "3600",
    contentType: mimeType,
    upsert: false,
  });
  if (error) {
    const storageError = error as unknown as { message?: unknown; status?: unknown; statusCode?: unknown };
    const message = typeof storageError.message === "string" ? storageError.message : "";
    const status = String(storageError.statusCode ?? storageError.status ?? "");
    if (status === "403" || /row-level security/i.test(message)) {
      throw new Error(
        "This class already has several unfinished syllabus uploads. Retry a pending save, or try again after cleanup runs.",
      );
    }
    throw error;
  }
  return {
    requestId,
    storagePath,
    originalName: safeOriginalName(input.file.name),
    mimeType,
    sizeBytes: input.file.size,
    contentHash,
  };
}

export async function commitClassSyllabus(
  input: CommitClassSyllabusInput,
): Promise<CommitClassSyllabusResult> {
  assertUuid(input.classUuid, "class UUID");
  assertUuid(input.requestId, "request ID");
  if (input.source.requestId !== input.requestId) {
    throw new Error("Uploaded syllabus and commit request IDs do not match");
  }
  const parsed = parseParsedSyllabus(input.parsed);
  const review = validateSyllabusReviewDraft(input.review);
  const { data, error } = await supabase.rpc("commit_class_syllabus", {
    p_class_id: input.classUuid,
    p_client_class_id: input.clientClassId,
    p_request_id: input.requestId,
    p_storage_path: input.source.storagePath,
    p_original_name: input.source.originalName,
    p_mime_type: input.source.mimeType,
    p_size_bytes: input.source.sizeBytes,
    p_content_hash: input.source.contentHash,
    p_parsed_data: toJson(parsed),
    p_reviewed_data: toJson(review),
  });
  if (error) throw error;
  return parseCommitResult(data);
}

export async function createSignedSyllabusUrl(
  storagePath: string,
  expiresInSeconds = 300,
): Promise<string> {
  if (!storagePath || expiresInSeconds < 30 || expiresInSeconds > 3600) {
    throw new Error("Invalid syllabus source URL request");
  }
  const { data, error } = await supabase.storage
    .from(SYLLABUS_BUCKET)
    .createSignedUrl(storagePath, expiresInSeconds);
  if (error) throw error;
  return data.signedUrl;
}

export async function deleteUncommittedSyllabusSource(storagePath: string): Promise<void> {
  if (!storagePath) return;
  const { error } = await supabase.storage.from(SYLLABUS_BUCKET).remove([storagePath]);
  if (error) throw error;
}

export function validateSyllabusFile(file: File): string {
  if (file.size < 1 || file.size > MAX_SYLLABUS_BYTES) {
    throw new Error("Choose a syllabus file smaller than 15 MB");
  }
  const mimeType = normalizeMimeType(file);
  if (!(SYLLABUS_MIME_TYPES as readonly string[]).includes(mimeType)) {
    throw new Error("Choose a PDF, JPEG, PNG, WebP, HEIC, or HEIF syllabus file");
  }
  return mimeType;
}

function normalizeMimeType(file: File): string {
  const advertised = file.type.toLowerCase().split(";", 1)[0].trim();
  if ((SYLLABUS_MIME_TYPES as readonly string[]).includes(advertised)) return advertised;
  if (advertised) return advertised;
  const extension = file.name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1];
  const byExtension: Record<string, string> = {
    pdf: "application/pdf", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png",
    webp: "image/webp", heic: "image/heic", heif: "image/heif",
  };
  return extension ? (byExtension[extension] ?? advertised) : advertised;
}

function extensionForMimeType(mimeType: string) {
  const extensions: Record<string, string> = {
    "application/pdf": "pdf",
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/heic": "heic",
    "image/heif": "heif",
  };
  const extension = extensions[mimeType];
  if (!extension) throw new Error("Unsupported syllabus file type");
  return extension;
}

function safeOriginalName(name: string) {
  const normalized = Array.from(name.trim())
    .filter((character) => character.charCodeAt(0) >= 32 && character.charCodeAt(0) !== 127)
    .join("")
    .slice(0, 500);
  return normalized || "syllabus";
}

function assertUuid(value: string, label: string) {
  if (!UUID.test(value)) throw new Error(`Invalid ${label}`);
}

async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("Could not read the syllabus file"));
    reader.readAsDataURL(file);
  });
}

async function sha256(file: File) {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function toJson(value: unknown): Json {
  return JSON.parse(JSON.stringify(value)) as Json;
}

function mapClassSyllabus(row: {
  id: string;
  user_id: string;
  class_id: string;
  client_class_id: string;
  revision: number;
  storage_path: string;
  original_name: string;
  mime_type: string;
  size_bytes: number;
  content_hash: string;
  parsed_data: Json;
  reviewed_data: Json;
  request_id: string;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
}): ClassSyllabus {
  return {
    id: row.id,
    userId: row.user_id,
    classId: row.class_id,
    clientClassId: row.client_class_id,
    revision: row.revision,
    storagePath: row.storage_path,
    originalName: row.original_name,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    contentHash: row.content_hash,
    parsedData: parseParsedSyllabus(row.parsed_data),
    reviewedData: validateSyllabusReviewDraft(row.reviewed_data),
    requestId: row.request_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    archivedAt: row.archived_at,
  };
}

function parseCommitResult(value: unknown): CommitClassSyllabusResult {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("The syllabus commit returned an invalid result");
  }
  const result = value as Record<string, unknown>;
  if (typeof result.syllabusId !== "string" || !UUID.test(result.syllabusId)
      || typeof result.revision !== "number" || !Number.isInteger(result.revision) || result.revision < 1
      || typeof result.noOp !== "boolean" || typeof result.retry !== "boolean"
      || (result.cleanupPath !== null && typeof result.cleanupPath !== "string")) {
    throw new Error("The syllabus commit returned an invalid result");
  }
  return result as unknown as CommitClassSyllabusResult;
}
