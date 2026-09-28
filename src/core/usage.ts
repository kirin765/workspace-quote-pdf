/**
 * Product-usage counters.
 *
 * Events carry counts, plan labels and a bounded reason string only. Spreadsheet
 * contents, customer names, quote IDs and file IDs never enter an event. The
 * `sanitizeUsageEvent` function strips unknown keys so a caller cannot
 * accidentally widen this contract.
 */

export const USAGE_EVENT_NAMES = [
  "sidebar_opened",
  "preview_built",
  "generation_started",
  "quote_created",
  "quote_existing",
  "quote_failed",
  "quote_skipped",
  "generation_completed",
  "allowance_blocked",
] as const;
export type UsageEventName = (typeof USAGE_EVENT_NAMES)[number];

export const USAGE_REASONS = [
  "free_allowance_exhausted",
  "subscription_expired",
  "render_failed",
  "save_failed",
  "source_changed",
  "output_folder_unavailable",
] as const;
export type UsageReason = (typeof USAGE_REASONS)[number];

export type UsagePlanLabel = "free" | "paid";

export interface UsageEvent {
  name: UsageEventName;
  at: string;
  plan: UsagePlanLabel;
  count: number;
  reason: UsageReason | null;
}

export type UsageCounters = Record<UsageEventName, number>;

export function sanitizeUsageEvent(input: UsageEvent): UsageEvent {
  const reason =
    input.reason && (USAGE_REASONS as readonly string[]).includes(input.reason)
      ? input.reason
      : null;
  return {
    name: input.name,
    at: input.at,
    plan: input.plan === "paid" ? "paid" : "free",
    count: Number.isFinite(input.count) ? Math.max(0, Math.trunc(input.count)) : 0,
    reason,
  };
}

/** Asserts that an event object only contains the allowed, content-free keys. */
export function isSafeUsageEvent(event: object): boolean {
  const allowed = new Set(["name", "at", "plan", "count", "reason"]);
  return Object.keys(event).every((key) => allowed.has(key));
}

export function emptyCounters(): UsageCounters {
  const counters = {} as UsageCounters;
  for (const name of USAGE_EVENT_NAMES) counters[name] = 0;
  return counters;
}

export function incrementCounters(counters: UsageCounters, event: UsageEvent): UsageCounters {
  const next: UsageCounters = { ...counters };
  next[event.name] = (next[event.name] ?? 0) + Math.max(event.count, 1);
  return next;
}

export function summarizeUsage(events: readonly UsageEvent[]): UsageCounters {
  let counters = emptyCounters();
  for (const event of events) {
    counters = incrementCounters(counters, sanitizeUsageEvent(event));
  }
  return counters;
}

const STORED_COUNTER_KEYS = USAGE_EVENT_NAMES;

export function coerceCounters(raw: unknown): UsageCounters {
  const counters = emptyCounters();
  if (!raw || typeof raw !== "object") return counters;
  const record = raw as Record<string, unknown>;
  for (const name of STORED_COUNTER_KEYS) {
    const value = record[name];
    if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
      counters[name] = Math.trunc(value);
    }
  }
  return counters;
}

export function parseStoredCounters(json: string | null | undefined): UsageCounters {
  if (!json) return emptyCounters();
  try {
    return coerceCounters(JSON.parse(json));
  } catch {
    return emptyCounters();
  }
}
