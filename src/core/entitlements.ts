import type { Issue } from "./types";
import { issue } from "./types";

/**
 * Free allowance and paid-entitlement state machine.
 *
 * The MVP ships the free allowance only. No paid provider is selected by the
 * plan, so there is deliberately no payment integration here: the types exist
 * so the behaviour can be tested, and the adapter layer stores this state
 * locally. A real paid tier must verify a license server-side; a client-side
 * flag alone is not a trustworthy entitlement store.
 */

export const FREE_ALLOWANCE = 5;

export type Plan = "free" | "paid";

export interface EntitlementState {
  plan: Plan;
  /** Successful, non-duplicate generations consumed from the free allowance. */
  freeUsed: number;
  licenseKey: string | null;
  /** ISO `YYYY-MM-DD`; null means no expiry recorded. */
  subscriptionExpiresAt: string | null;
  lastVerifiedAt: string | null;
}

export const DEFAULT_ENTITLEMENT: EntitlementState = {
  plan: "free",
  freeUsed: 0,
  licenseKey: null,
  subscriptionExpiresAt: null,
  lastVerifiedAt: null,
};

export type QuoteOutcome = "created" | "existing" | "failed" | "skipped";

export interface QuoteResultLike {
  quoteId: string;
  status: QuoteOutcome;
}

/** Only a newly created PDF consumes allowance; retries and failures do not. */
export function consumesAllowance(status: QuoteOutcome): boolean {
  return status === "created";
}

export function isSubscriptionActive(state: EntitlementState, todayIso: string): boolean {
  if (state.plan !== "paid") return false;
  if (state.subscriptionExpiresAt === null) return true;
  return state.subscriptionExpiresAt >= todayIso;
}

export function remainingFree(state: EntitlementState): number {
  return Math.max(0, FREE_ALLOWANCE - state.freeUsed);
}

export type AllowanceReason = "ok" | "free_allowance_exhausted" | "subscription_expired";

export interface AllowanceDecision {
  allowed: boolean;
  requested: number;
  allowedCount: number;
  blockedCount: number;
  remainingFree: number;
  reason: AllowanceReason;
}

export function decideAllowance(
  state: EntitlementState,
  requestedCount: number,
  todayIso: string,
): AllowanceDecision {
  const requested = Math.max(0, Math.trunc(requestedCount));

  if (state.plan === "paid") {
    if (isSubscriptionActive(state, todayIso)) {
      return {
        allowed: true,
        requested,
        allowedCount: requested,
        blockedCount: 0,
        remainingFree: remainingFree(state),
        reason: "ok",
      };
    }
    return {
      allowed: false,
      requested,
      allowedCount: 0,
      blockedCount: requested,
      remainingFree: remainingFree(state),
      reason: "subscription_expired",
    };
  }

  const remaining = remainingFree(state);
  if (remaining === 0) {
    return {
      allowed: false,
      requested,
      allowedCount: 0,
      blockedCount: requested,
      remainingFree: 0,
      reason: "free_allowance_exhausted",
    };
  }

  const allowedCount = Math.min(requested, remaining);
  return {
    allowed: allowedCount > 0,
    requested,
    allowedCount,
    blockedCount: requested - allowedCount,
    remainingFree: remaining,
    reason: "ok",
  };
}

export function allowanceIssue(reason: AllowanceReason, blockedCount: number): Issue | null {
  if (reason === "free_allowance_exhausted") {
    return issue(
      "free_allowance_exhausted",
      "error",
      `The free allowance of ${FREE_ALLOWANCE} quotation PDFs is used up. ${blockedCount} quote(s) were not generated.`,
    );
  }
  if (reason === "subscription_expired") {
    return issue(
      "subscription_expired",
      "error",
      `The subscription has expired. ${blockedCount} quote(s) were not generated.`,
    );
  }
  return null;
}

/** Applies generation outcomes to the entitlement state. */
export function applyResults(state: EntitlementState, results: readonly QuoteResultLike[]): EntitlementState {
  if (state.plan === "paid") return state;
  let consumed = 0;
  for (const result of results) {
    if (consumesAllowance(result.status)) consumed += 1;
  }
  if (consumed === 0) return state;
  return { ...state, freeUsed: state.freeUsed + consumed };
}

function nonNegativeInt(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.trunc(value)
    : fallback;
}

function nullableString(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

export function coerceEntitlement(raw: unknown): EntitlementState {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_ENTITLEMENT };
  const record = raw as Record<string, unknown>;
  return {
    plan: record.plan === "paid" ? "paid" : "free",
    freeUsed: nonNegativeInt(record.freeUsed, 0),
    licenseKey: nullableString(record.licenseKey),
    subscriptionExpiresAt: nullableString(record.subscriptionExpiresAt),
    lastVerifiedAt: nullableString(record.lastVerifiedAt),
  };
}

export function parseStoredEntitlement(json: string | null | undefined): EntitlementState {
  if (!json) return { ...DEFAULT_ENTITLEMENT };
  try {
    return coerceEntitlement(JSON.parse(json));
  } catch {
    return { ...DEFAULT_ENTITLEMENT };
  }
}
