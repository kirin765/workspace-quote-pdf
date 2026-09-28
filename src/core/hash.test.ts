import { describe, expect, it } from "vitest";
import { hashObject, hashText, stableStringify } from "./hash";

describe("hash", () => {
  it("is deterministic and returns 16 hex characters", () => {
    const a = hashText("Q-001");
    const b = hashText("Q-001");
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{16}$/);
  });

  it("changes for different inputs", () => {
    expect(hashText("Q-001")).not.toBe(hashText("Q-002"));
    expect(hashText("quote-layout-v1")).not.toBe(hashText("quote-layout-v2"));
  });

  it("does not use BigInt literals (Apps Script runtime constraint)", () => {
    expect(/[0-9]n/.test(hashText("x"))).toBe(false);
  });

  it("stable-stringifies regardless of key order", () => {
    expect(stableStringify({ b: 1, a: 2 })).toBe(stableStringify({ a: 2, b: 1 }));
    expect(hashObject({ b: 1, a: 2 })).toBe(hashObject({ a: 2, b: 1 }));
    expect(hashObject({ a: [1, { d: 4, c: 3 }] })).toBe(hashObject({ a: [1, { c: 3, d: 4 }] }));
  });

  it("still distinguishes different values", () => {
    expect(hashObject({ a: 1 })).not.toBe(hashObject({ a: 2 }));
  });
});
