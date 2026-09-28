import { describe, expect, it } from "vitest";
import { groupRows } from "./grouping";
import { quoteRow } from "../../tests/fixtures/synthetic";
import type { Issue } from "./types";

function errorIssue(message: string): Issue {
  return { code: "missing_customer", severity: "error", message };
}

describe("groupRows", () => {
  it("groups by quote ID in first-seen order, never by customer", () => {
    const rows = [
      quoteRow({ rowNumber: 2, quoteId: "Q-001", item: "Desk" }),
      quoteRow({ rowNumber: 3, quoteId: "Q-002", item: "Cabinet", customer: "Alpha" }),
      quoteRow({ rowNumber: 4, quoteId: "Q-001", item: "Chair" }),
    ];
    const { groups } = groupRows(rows);
    expect(groups.map((group) => group.quoteId)).toEqual(["Q-001", "Q-002"]);
    expect(groups[0]!.rows.map((row) => row.item)).toEqual(["Desk", "Chair"]);
  });

  it("merges non-contiguous rows of the same quote and preserves source order", () => {
    const rows = [
      quoteRow({ rowNumber: 2, quoteId: "Q-9", item: "A" }),
      quoteRow({ rowNumber: 3, quoteId: "Q-1", item: "B" }),
      quoteRow({ rowNumber: 4, quoteId: "Q-9", item: "C" }),
    ];
    const { groups } = groupRows(rows);
    expect(groups.find((group) => group.quoteId === "Q-9")!.rows.map((row) => row.item)).toEqual([
      "A",
      "C",
    ]);
  });

  it("keeps zero-padded IDs distinct from their numeric form", () => {
    const rows = [
      quoteRow({ rowNumber: 2, quoteId: "0012", item: "A" }),
      quoteRow({ rowNumber: 3, quoteId: "12", item: "B" }),
    ];
    expect(groupRows(rows).groups).toHaveLength(2);
  });

  it("separates rows with no quote ID as orphans", () => {
    const rows = [
      quoteRow({ rowNumber: 2, quoteId: "", item: "A", issues: [errorIssue("no id")] }),
      quoteRow({ rowNumber: 3, quoteId: "Q-1", item: "B" }),
    ];
    const result = groupRows(rows);
    expect(result.orphans).toHaveLength(1);
    expect(result.groups).toHaveLength(1);
    expect(result.issues.some((entry) => entry.code === "missing_quote_id")).toBe(true);
  });
});
