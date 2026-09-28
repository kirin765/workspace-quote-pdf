import { describe, expect, it } from "vitest";
import {
  emptyCounters,
  incrementCounters,
  isSafeUsageEvent,
  sanitizeUsageEvent,
  summarizeUsage,
  type UsageEvent,
} from "./usage";

const event: UsageEvent = {
  name: "quote_created",
  at: "2026-09-25T00:00:00.000Z",
  plan: "free",
  count: 1,
  reason: null,
};

describe("usage", () => {
  it("strips keys that could carry content", () => {
    const unsafe = { ...event, customer: "Alpha", quoteId: "Q-001", spreadsheet: "secret" };
    const safe = sanitizeUsageEvent(unsafe as unknown as UsageEvent);
    expect(Object.keys(safe).sort()).toEqual(["at", "count", "name", "plan", "reason"]);
    expect(isSafeUsageEvent(safe)).toBe(true);
    expect(isSafeUsageEvent(unsafe)).toBe(false);
  });

  it("drops unbounded reason strings", () => {
    const withUnknownReason = sanitizeUsageEvent({
      ...event,
      reason: "customer Alpha rejected" as never,
    });
    expect(withUnknownReason.reason).toBeNull();
  });

  it("counts events by name", () => {
    const counters = summarizeUsage([
      event,
      { ...event, name: "quote_created" },
      { ...event, name: "quote_failed", reason: "render_failed" },
    ]);
    expect(counters.quote_created).toBe(2);
    expect(counters.quote_failed).toBe(1);
    expect(counters.sidebar_opened).toBe(0);
  });

  it("increments immutably", () => {
    const base = emptyCounters();
    const next = incrementCounters(base, event);
    expect(base.quote_created).toBe(0);
    expect(next.quote_created).toBe(1);
  });
});
