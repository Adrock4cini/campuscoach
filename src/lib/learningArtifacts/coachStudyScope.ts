import type { StudyScope } from "./types";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function parseCoachConceptIds(value: string | null) {
  if (!value) return [];

  return [...new Set(
    value
      .split(",")
      .map((id) => id.trim())
      .filter((id) => UUID_PATTERN.test(id)),
  )].slice(0, 8);
}

export function buildCoachStudyScope(conceptIds: string[]): StudyScope | null {
  if (!conceptIds.length) return null;

  const fingerprint = hashConceptIds(conceptIds);
  return {
    type: "class",
    id: `coach-${fingerprint}`,
    label: "Coach picks",
  };
}

function hashConceptIds(conceptIds: string[]) {
  const value = [...conceptIds].sort().join(":");
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}
