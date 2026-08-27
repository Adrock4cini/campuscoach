/**
 * Serialize JSON values with recursively sorted object keys.
 *
 * PostgreSQL jsonb does not preserve insertion order, so security checks must
 * compare structure instead of relying on JavaScript object key order.
 */
export function canonicalJsonStringify(value: unknown): string {
  return JSON.stringify(sortJsonValue(value));
}

function sortJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJsonValue);
  if (!value || typeof value !== "object") return value;

  const record = value as Record<string, unknown>;
  return Object.fromEntries(
    Object.keys(record)
      .sort()
      .map((key) => [key, sortJsonValue(record[key])]),
  );
}
