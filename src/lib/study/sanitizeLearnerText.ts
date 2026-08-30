/**
 * Learner-facing sanitation.
 *
 * QA/import fixtures leak operational prefixes ("DUPLICATE TEST:", "QA —")
 * into concept names, which then surface inside prompts, options and titles.
 * The source records stay untouched: this is a render-time cleanup only.
 */

const PREFIX_PATTERNS: RegExp[] = [
  /^\s*duplicate\s+test\s*[:\-–—]\s*/i,
  /^\s*duplicate\s*[:\-–—]\s*/i,
  /^\s*test\s+fixture\s*[:\-–—]\s*/i,
  /^\s*fixture\s*[:\-–—]\s*/i,
  /^\s*qa\s*[:\-–—]\s*/i,
  /^\s*sample\s+data\s*[:\-–—]\s*/i,
  /^\s*seed\s*[:\-–—]\s*/i,
];

export function sanitizeLearnerText(value: string): string {
  let next = value;
  let changed = true;
  while (changed) {
    changed = false;
    for (const pattern of PREFIX_PATTERNS) {
      const stripped = next.replace(pattern, "");
      if (stripped !== next) {
        next = stripped;
        changed = true;
      }
    }
  }
  const trimmed = next.trim();
  // Never render an empty string just because the whole value was a prefix.
  return trimmed || value.trim();
}

/** Deeply sanitize every string in an artifact payload (arrays and objects). */
export function sanitizeLearnerContent<T>(value: T): T {
  if (typeof value === "string") return sanitizeLearnerText(value) as unknown as T;
  if (Array.isArray(value)) return value.map((item) => sanitizeLearnerContent(item)) as unknown as T;
  if (value && typeof value === "object") {
    const source = value as Record<string, unknown>;
    const next: Record<string, unknown> = {};
    for (const key of Object.keys(source)) next[key] = sanitizeLearnerContent(source[key]);
    return next as unknown as T;
  }
  return value;
}
