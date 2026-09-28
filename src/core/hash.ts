/**
 * Deterministic, platform-independent hashing used for idempotency keys.
 *
 * Apps Script's V8 runtime rejects BigInt literals, so this uses two
 * independent 32-bit hashes (FNV-1a and djb2) combined into 16 hex characters.
 * It is a change-detection hash, not a cryptographic digest — never use it to
 * protect secrets.
 */

const FNV_OFFSET = 2166136261;
const FNV_PRIME = 16777619;
const DJB2_OFFSET = 5381;

function fnv1a32(input: string): number {
  let hash = FNV_OFFSET;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, FNV_PRIME) >>> 0;
  }
  return hash >>> 0;
}

function djb2_32(input: string): number {
  let hash = DJB2_OFFSET;
  for (let i = 0; i < input.length; i += 1) {
    hash = (Math.imul(hash, 33) + input.charCodeAt(i)) >>> 0;
  }
  return hash >>> 0;
}

export function hashText(input: string): string {
  const a = fnv1a32(input).toString(16).padStart(8, "0");
  const b = djb2_32(input).toString(16).padStart(8, "0");
  return a + b;
}

/** Stable stringify: object keys sorted, values encoded without ambiguity. */
export function stableStringify(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(record).sort()) {
      sorted[key] = sortValue(record[key]);
    }
    return sorted;
  }
  return value;
}

export function hashObject(value: unknown): string {
  return hashText(stableStringify(value));
}
