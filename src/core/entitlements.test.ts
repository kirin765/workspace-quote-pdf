import { describe, expect, it } from "vitest";
import {
  FREE_ALLOWANCE,
  applyResults,
  coerceEntitlement,
  decideAllowance,
  isSubscriptionActive,
  remainingFree,
  type EntitlementState,
} from "./entitlements";

function state(overrides: Partial<EntitlementState> = {}): EntitlementState {
  return {
    plan: "free",
    freeUsed: 0,
    licenseKey: null,
    subscriptionExpiresAt: null,
    lastVerifiedAt: null,
    ...overrides,
  };
}

describe("entitlements", () => {
  it("allows the free allowance and reports the remainder", () => {
    expect(remainingFree(state())).toBe(FREE_ALLOWANCE);
    const decision = decideAllowance(state(), 3, "2026-09-25");
    expect(decision).toMatchObject({ allowed: true, allowedCount: 3, blockedCount: 0, remainingFree: 5 });
  });

  it("allows a partial batch and blocks the rest when the allowance runs low", () => {
    const decision = decideAllowance(state({ freeUsed: 3 }), 5, "2026-09-25");
    expect(decision.allowed).toBe(true);
    expect(decision.allowedCount).toBe(2);
    expect(decision.blockedCount).toBe(3);
    expect(decision.reason).toBe("ok");
  });

  it("blocks explicitly when the free allowance is exhausted", () => {
    const decision = decideAllowance(state({ freeUsed: 5 }), 2, "2026-09-25");
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe("free_allowance_exhausted");
    expect(decision.blockedCount).toBe(2);
  });

  it("only consumes allowance for newly created PDFs", () => {
    const afterRun = applyResults(state(), [
      { quoteId: "Q-1", status: "created" },
      { quoteId: "Q-2", status: "existing" },
      { quoteId: "Q-3", status: "failed" },
      { quoteId: "Q-4", status: "skipped" },
    ]);
    expect(afterRun.freeUsed).toBe(1);
  });

  it("treats an active paid subscription as unlimited", () => {
    const paid = state({ plan: "paid", subscriptionExpiresAt: "2027-01-01" });
    expect(isSubscriptionActive(paid, "2026-09-25")).toBe(true);
    const decision = decideAllowance(paid, 100, "2026-09-25");
    expect(decision.allowedCount).toBe(100);
    expect(applyResults(paid, [{ quoteId: "Q-1", status: "created" }]).freeUsed).toBe(0);
  });

  it("blocks an expired paid subscription with an explicit reason", () => {
    const paid = state({ plan: "paid", subscriptionExpiresAt: "2026-01-01" });
    const decision = decideAllowance(paid, 1, "2026-09-25");
    expect(decision.reason).toBe("subscription_expired");
    expect(decision.allowed).toBe(false);
  });

  it("coerces untrusted stored state safely", () => {
    expect(coerceEntitlement(null)).toMatchObject({ plan: "free", freeUsed: 0 });
    expect(coerceEntitlement({ plan: "paid", freeUsed: -3, licenseKey: "  " })).toMatchObject({
      plan: "paid",
      freeUsed: 0,
      licenseKey: null,
    });
  });
});
