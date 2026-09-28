import { describe, expect, it } from "vitest";
import { mapSheetToRows, type MappingOptions } from "./mapping";
import type { SheetRow } from "./types";
import type { ColumnMapping } from "./settings";
import { emptyCell, formulaErrorCell, numCell, textCell } from "../../tests/fixtures/synthetic";

const mapping: ColumnMapping = {
  quoteId: 0,
  customer: 1,
  item: 2,
  quantity: 3,
  unitPrice: 4,
  currency: 5,
  itemCode: null,
  description: null,
};

const opts: MappingOptions = {
  numberFormat: "dot-decimal",
  defaultCurrency: "USD",
  rounding: "reject",
};

function row(rowNumber: number, cells: ReturnType<typeof textCell>[]): SheetRow {
  return { rowNumber, cells };
}

const header: SheetRow = row(1, [
  textCell("Quote ID"),
  textCell("Customer"),
  textCell("Item"),
  textCell("Quantity"),
  textCell("Unit price"),
  textCell("Currency"),
]);

describe("mapSheetToRows", () => {
  it("preserves leading-zero quote IDs from display text", () => {
    const result = mapSheetToRows(
      [header, row(2, [textCell("0001"), textCell("Alpha"), textCell("Desk"), numCell(1), numCell(10), textCell("USD")])],
      mapping,
      opts,
    );
    expect(result.rows[0]!.quoteId).toBe("0001");
  });

  it("skips fully empty rows with a warning", () => {
    const result = mapSheetToRows(
      [header, row(2, [emptyCell(), emptyCell(), emptyCell(), emptyCell(), emptyCell(), emptyCell()])],
      mapping,
      opts,
    );
    expect(result.rows).toHaveLength(0);
    expect(result.issues.some((entry) => entry.code === "empty_row")).toBe(true);
  });

  it("warns on explicit zero price but keeps it valid", () => {
    const result = mapSheetToRows(
      [header, row(2, [textCell("Q-1"), textCell("Alpha"), textCell("Sample"), numCell(1), numCell(0, "0.00"), textCell("USD")])],
      mapping,
      opts,
    );
    expect(result.rows[0]!.unitPriceMinor).toBe(0);
    expect(result.rows[0]!.issues.map((entry) => entry.code)).toContain("zero_unit_price");
    expect(result.rows[0]!.issues.some((entry) => entry.severity === "error")).toBe(false);
  });

  it("errors on negative price, formula errors, and zero quantity", () => {
    const result = mapSheetToRows(
      [
        header,
        row(2, [textCell("Q-1"), textCell("Alpha"), textCell("A"), numCell(0), numCell(10), textCell("USD")]),
        row(3, [textCell("Q-2"), textCell("Beta"), textCell("B"), numCell(1), numCell(-5), textCell("USD")]),
        row(4, [textCell("Q-3"), textCell("Gamma"), textCell("C"), numCell(1), formulaErrorCell("#REF!"), textCell("USD")]),
      ],
      mapping,
      opts,
    );
    const codes = result.rows.flatMap((entry) => entry.issues.map((entryIssue) => entryIssue.code));
    expect(codes).toContain("invalid_quantity");
    expect(codes).toContain("negative_unit_price");
    expect(codes).toContain("formula_error");
  });

  it("separates an unknown currency warning from an unsupported currency error", () => {
    const result = mapSheetToRows(
      [
        header,
        row(2, [textCell("Q-1"), textCell("Alpha"), textCell("A"), numCell(1), numCell(10), textCell("XYZ")]),
        row(3, [textCell("Q-2"), textCell("Beta"), textCell("B"), numCell(1), numCell(10), textCell("US1")]),
      ],
      mapping,
      opts,
    );
    expect(result.rows[0]!.issues.map((entry) => entry.code)).toContain("unknown_currency_scale");
    expect(result.rows[1]!.issues.map((entry) => entry.code)).toContain("unsupported_currency");
  });

  it("errors on a missing currency cell and does not silently use a default as valid", () => {
    const result = mapSheetToRows(
      [header, row(2, [textCell("Q-1"), textCell("Alpha"), textCell("A"), numCell(1), numCell(10), emptyCell()])],
      mapping,
      opts,
    );
    expect(result.rows[0]!.issues.map((entry) => entry.code)).toContain("missing_currency");
  });

  it("reports required mappings that point past the header width", () => {
    const shortHeader: SheetRow = row(1, [textCell("Quote ID"), textCell("Customer")]);
    const result = mapSheetToRows([shortHeader], mapping, opts);
    expect(result.issues.some((entry) => entry.code === "missing_column_mapping")).toBe(true);
  });
});
