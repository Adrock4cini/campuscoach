export const CAPTURE_IMAGE_LIMITS = {
  maxFiles: 4,
  maxFileBytes: 8_000_000,
  maxTotalBytes: 24_000_000,
} as const;

const SUPPORTED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);

export interface CaptureImageValidation {
  ok: boolean;
  message: string | null;
}

export function validateCaptureImages(files: readonly File[]): CaptureImageValidation {
  if (files.length === 0) {
    return { ok: false, message: "Add at least one photo." };
  }
  if (files.length > CAPTURE_IMAGE_LIMITS.maxFiles) {
    return {
      ok: false,
      message: `Add no more than ${CAPTURE_IMAGE_LIMITS.maxFiles} photos at a time.`,
    };
  }
  if (files.some((file) => !SUPPORTED_IMAGE_TYPES.has(file.type.toLowerCase()))) {
    return { ok: false, message: "Use a JPG, PNG, WebP, HEIC, or HEIF image." };
  }
  if (files.some((file) => file.size > CAPTURE_IMAGE_LIMITS.maxFileBytes)) {
    return { ok: false, message: "Each photo must be 8 MB or smaller." };
  }
  if (files.reduce((total, file) => total + file.size, 0) > CAPTURE_IMAGE_LIMITS.maxTotalBytes) {
    return { ok: false, message: "This capture is too large. Keep the photos under 24 MB total." };
  }
  return { ok: true, message: null };
}

function extensionFor(file: File): string {
  switch (file.type.toLowerCase()) {
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    case "image/heic":
      return "heic";
    case "image/heif":
      return "heif";
    default:
      return "jpg";
  }
}

export function buildCaptureStoragePath(
  userId: string,
  captureId: string,
  file: File,
  contentHash: string,
): string {
  const safeHash = contentHash.toLowerCase().replace(/[^a-f0-9]/g, "").slice(0, 64);
  if (!safeHash) throw new Error("A valid image hash is required.");
  return `${userId}/${captureId}/${safeHash}.${extensionFor(file)}`;
}

export async function hashCaptureImage(file: File): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

interface ClassBoundTarget {
  id: string;
  client_class_id: string | null;
}

export function filterCaptureTargets<
  TAssignment extends ClassBoundTarget,
  TExam extends ClassBoundTarget,
>(
  clientClassId: string,
  assignments: readonly TAssignment[],
  exams: readonly TExam[],
): { assignments: TAssignment[]; exams: TExam[] } {
  return {
    assignments: assignments.filter((item) => item.client_class_id === clientClassId),
    exams: exams.filter((item) => item.client_class_id === clientClassId),
  };
}
