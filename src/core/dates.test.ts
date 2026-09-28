import { describe, expect, it } from "vitest";
import { addDaysIso, isValidIsoDate, isoDateFromParts } from "./dates";

describe("dates", () => {
  it("validates real calendar dates", () => {
    expect(isValidIsoDate("2026-09-25")).toBe(true);
    expect(isValidIsoDate("2024-02-29")).toBe(true);
    expect(isValidIsoDate("2026-02-29")).toBe(false);
    expect(isValidIsoDate("2026-13-01")).toBe(false);
    expect(isValidIsoDate("2026-00-10")).toBe(false);
    expect(isValidIsoDate("25-09-2026")).toBe(false);
    expect(isValidIsoDate("not a date")).toBe(false);
  });

  it("adds days across month and year boundaries", () => {
    expect(addDaysIso("2026-09-25", 30)).toBe("2026-10-25");
    expect(addDaysIso("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDaysIso("2026-01-01", -1)).toBe("2025-12-31");
    expect(addDaysIso("2024-02-28", 1)).toBe("2024-02-29");
    expect(addDaysIso("2026-02-28", 1)).toBe("2026-03-01");
    expect(addDaysIso("2026-09-25", 0)).toBe("2026-09-25");
  });

  it("keeps day arithmetic timezone-safe (no DST shift)", () => {
    expect(addDaysIso("2026-03-08", 1)).toBe("2026-03-09");
    expect(addDaysIso("2026-11-01", 1)).toBe("2026-11-02");
  });

  it("builds an ISO date from parts with padding", () => {
    expect(isoDateFromParts(2026, 9, 5)).toBe("2026-09-05");
  });
});
