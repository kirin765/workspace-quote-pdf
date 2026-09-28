import { describe, expect, it } from "vitest";
import { buildRenderModel, shouldPageBreakBeforeTerms } from "./render-model";
import { buildSnapshots } from "./snapshot";
import { buildSynthetic, syntheticSettings } from "../../tests/fixtures/synthetic";

const CONTEXT = {
  issueDate: "2026-09-25",
  source: { sheetName: "Sheet1", headerRow: 1, rangeA1: "A1:F4" },
};

describe("buildRenderModel", () => {
  it("formats items and totals identically to the snapshot's validated amounts", () => {
    const { groups } = buildSynthetic();
    const [q1] = buildSnapshots(groups, syntheticSettings(), CONTEXT);
    const model = buildRenderModel(q1!);

    expect(model.items).toHaveLength(2);
    expect(model.items[0]!.unitPrice).toBe("100.00");
    expect(model.items[0]!.amount).toBe("1,000.00");
    expect(model.items[1]!.amount).toBe("800.00");
    expect(model.totals.map((entry) => entry.value)).toEqual([
      "USD 1,800.00",
      "USD 1,800.00",
    ]);
  });

  it("states the quotation and no-tax assumptions in the footer", () => {
    const { groups } = buildSynthetic();
    const [q1] = buildSnapshots(groups, syntheticSettings(), CONTEXT);
    const model = buildRenderModel(q1!);
    expect(model.footerNote).toMatch(/not proof of payment or a tax invoice/i);
    expect(model.footerNote).toMatch(/no taxes/i);
  });

  it("puts the currency in the price column headers", () => {
    const { groups } = buildSynthetic();
    const [q1] = buildSnapshots(groups, syntheticSettings(), CONTEXT);
    const model = buildRenderModel(q1!);
    expect(model.columns.unitPrice).toBe("Unit price (USD)");
    expect(model.columns.amount).toBe("Amount (USD)");
  });

  it("decides a page break before terms from item count and paper size", () => {
    expect(shouldPageBreakBeforeTerms(3, "A4")).toBe(false);
    expect(shouldPageBreakBeforeTerms(23, "A4")).toBe(true);
    expect(shouldPageBreakBeforeTerms(23, "LETTER")).toBe(false);
    expect(shouldPageBreakBeforeTerms(25, "LETTER")).toBe(true);
  });
});
