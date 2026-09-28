import { describe, expect, it } from "vitest";
import { groupRows } from "./grouping";
import { summarizeValidation, validateGroups } from "./validation";
import { quoteRow } from "../../tests/fixtures/synthetic";
import type { Issue } from "./types";

function rowError(message: string): Issue {
  return { code: "missing_item", severity: "error", message };
}

describe("validation", () => {
  it("computes an exact subtotal for a ready group", () => {
    const rows = [
      quoteRow({ rowNumber: 2, quoteId: "Q-001", item: "Desk", quantity: 10, unitPriceMinor: 10000 }),
      quoteRow({ rowNumber: 3, quoteId: "Q-001", item: "Chair", quantity: 20, unitPriceMinor: 4000 }),
    ];
    const [group] = validateGroups(groupRows(rows).groups);
    expect(group!.status).toBe("ready");
    expect(group!.subtotalMinor).toBe(180000);
    expect(group!.itemCount).toBe(2);
  });

  it("blocks a quote whose rows disagree on customer and names the rows", () => {
    const rows = [
      quoteRow({ rowNumber: 2, quoteId: "Q-1", item: "A", customer: "Alpha" }),
      quoteRow({ rowNumber: 5, quoteId: "Q-1", item: "B", customer: "Beta" }),
    ];
    const [group] = validateGroups(groupRows(rows).groups);
    expect(group!.status).toBe("blocked");
    const conflict = group!.issues.find((entry) => entry.code === "conflicting_customer");
    expect(conflict?.message).toContain("2");
    expect(conflict?.message).toContain("5");
    expect(group!.subtotalMinor).toBe(0);
  });

  it("blocks a quote whose rows disagree on currency", () => {
    const rows = [
      quoteRow({ rowNumber: 2, quoteId: "Q-1", item: "A", currency: "USD" }),
      quoteRow({ rowNumber: 3, quoteId: "Q-1", item: "B", currency: "EUR" }),
    ];
    const [group] = validateGroups(groupRows(rows).groups);
    expect(group!.status).toBe("blocked");
    expect(group!.issues.some((entry) => entry.code === "conflicting_currency")).toBe(true);
  });

  it("blocks the whole quote when one row has an error", () => {
    const rows = [
      quoteRow({ rowNumber: 2, quoteId: "Q-1", item: "A" }),
      quoteRow({ rowNumber: 3, quoteId: "Q-1", item: "B", issues: [rowError("boom")] }),
    ];
    const [group] = validateGroups(groupRows(rows).groups);
    expect(group!.status).toBe("blocked");
    expect(group!.blockReasons.length).toBeGreaterThan(0);
  });

  it("warns on duplicate item rows without deleting them", () => {
    const rows = [
      quoteRow({ rowNumber: 2, quoteId: "Q-1", item: "Bolt", quantity: 4, unitPriceMinor: 250 }),
      quoteRow({ rowNumber: 3, quoteId: "Q-1", item: "Bolt", quantity: 4, unitPriceMinor: 250 }),
    ];
    const [group] = validateGroups(groupRows(rows).groups);
    expect(group!.status).toBe("ready");
    expect(group!.rows).toHaveLength(2);
    const warning = group!.warnings.find((entry) => entry.code === "duplicate_item_row");
    expect(warning?.message).toContain("row 2");
  });

  it("summarizes ready, blocked and warning counts", () => {
    const ready = quoteRow({ rowNumber: 2, quoteId: "Q-1", item: "A" });
    const bad = quoteRow({ rowNumber: 3, quoteId: "Q-2", item: "B", issues: [rowError("x")] });
    const dup1 = quoteRow({ rowNumber: 4, quoteId: "Q-3", item: "C" });
    const dup2 = quoteRow({ rowNumber: 5, quoteId: "Q-3", item: "C" });
    const summary = summarizeValidation(validateGroups(groupRows([ready, bad, dup1, dup2]).groups));
    expect(summary.total).toBe(3);
    expect(summary.ready).toBe(2);
    expect(summary.blocked).toBe(1);
    expect(summary.warnings).toBe(1);
  });
});
