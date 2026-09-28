import { describe, expect, it } from "vitest";
import { buildSnapshots } from "./snapshot";
import { buildSynthetic, syntheticSettings } from "../../tests/fixtures/synthetic";

const CONTEXT = {
  issueDate: "2026-09-25",
  source: { sheetName: "Sheet1", headerRow: 1, rangeA1: "A1:F4" },
};

describe("buildSnapshots", () => {
  it("produces one immutable snapshot per ready quote with exact totals", () => {
    const { groups } = buildSynthetic();
    const snapshots = buildSnapshots(groups, syntheticSettings(), CONTEXT);
    expect(snapshots.map((snapshot) => snapshot.quoteId)).toEqual(["Q-001", "Q-002"]);

    const q1 = snapshots.find((snapshot) => snapshot.quoteId === "Q-001")!;
    expect(q1.items).toHaveLength(2);
    expect(q1.subtotalMinor).toBe(180000);
    expect(q1.currency).toBe("USD");

    const q2 = snapshots.find((snapshot) => snapshot.quoteId === "Q-002")!;
    expect(q2.items).toHaveLength(1);
    expect(q2.subtotalMinor).toBe(75000);
  });

  it("derives the expiry date from the validity period", () => {
    const { groups } = buildSynthetic();
    const [q1] = buildSnapshots(groups, syntheticSettings(), CONTEXT);
    expect(q1!.issueDate).toBe("2026-09-25");
    expect(q1!.expiryDate).toBe("2026-10-25");
  });

  it("omits the expiry date when validity is zero", () => {
    const { groups } = buildSynthetic();
    const settings = syntheticSettings();
    settings.business.defaultValidityDays = 0;
    const [q1] = buildSnapshots(groups, settings, CONTEXT);
    expect(q1!.expiryDate).toBeNull();
  });

  it("is deterministic and changes the content hash when the document changes", () => {
    const { groups } = buildSynthetic();
    const [first] = buildSnapshots(groups, syntheticSettings(), CONTEXT);
    const [again] = buildSnapshots(groups, syntheticSettings(), CONTEXT);
    expect(first!.contentHash).toBe(again!.contentHash);

    const changed = syntheticSettings();
    changed.business.terms = "Different terms";
    const [afterTerms] = buildSnapshots(groups, changed, CONTEXT);
    expect(afterTerms!.contentHash).not.toBe(first!.contentHash);

    const retemplated = syntheticSettings();
    retemplated.templateVersion = "quote-layout-v2";
    const [afterTemplate] = buildSnapshots(groups, retemplated, CONTEXT);
    expect(afterTemplate!.contentHash).not.toBe(first!.contentHash);
  });
});
