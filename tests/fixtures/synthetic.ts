import type {
  AppSettings,
  ColumnMapping,
  QuoteGroupValidation,
  QuoteRow,
  SheetCell,
  SheetRow,
} from "../../src/core";
import { groupRows, mapSheetToRows, validateGroups, type MappingOptions } from "../../src/core";

export const SYNTHETIC_HEADER = [
  "Quote ID",
  "Customer",
  "Item",
  "Quantity",
  "Unit price",
  "Currency",
];

export function textCell(value: string): SheetCell {
  return { value, display: value, formula: "" };
}

export function numCell(value: number, display?: string): SheetCell {
  return { value, display: display ?? String(value), formula: "" };
}

export function emptyCell(): SheetCell {
  return { value: null, display: "", formula: "" };
}

export function formulaErrorCell(error: string): SheetCell {
  return { value: error, display: error, formula: "=1/0" };
}

/** The exact three-row example from the plan: Q-001 (2 lines) and Q-002 (1 line). */
export const SYNTHETIC_ROWS: SheetRow[] = [
  { rowNumber: 1, cells: SYNTHETIC_HEADER.map(textCell) },
  { rowNumber: 2, cells: [textCell("Q-001"), textCell("Alpha"), textCell("Desk"), numCell(10), numCell(100, "100.00"), textCell("USD")] },
  { rowNumber: 3, cells: [textCell("Q-001"), textCell("Alpha"), textCell("Chair"), numCell(20), numCell(40, "40.00"), textCell("USD")] },
  { rowNumber: 4, cells: [textCell("Q-002"), textCell("Beta"), textCell("Cabinet"), numCell(5), numCell(150, "150.00"), textCell("USD")] },
];

export function syntheticMapping(): ColumnMapping {
  return {
    quoteId: 0,
    customer: 1,
    item: 2,
    quantity: 3,
    unitPrice: 4,
    currency: 5,
    itemCode: null,
    description: null,
  };
}

export function syntheticSettings(overrides: Partial<AppSettings> = {}): AppSettings {
  return {
    version: 1,
    templateVersion: "quote-layout-v1",
    mapping: syntheticMapping(),
    business: {
      displayName: "Alpha Trading Co.",
      addressLines: ["1 Example Street", "Springfield"],
      contactLines: ["sales@example.com"],
      logoUrl: null,
      defaultValidityDays: 30,
      terms: "50% deposit on order. Delivery within 14 days.",
      pageSize: "A4",
      numberFormat: "dot-decimal",
    },
    source: { sheetName: "Sheet1", headerRow: 1 },
    outputFolderId: null,
    ...overrides,
  };
}

export const DEFAULT_MAPPING_OPTIONS: MappingOptions = {
  numberFormat: "dot-decimal",
  defaultCurrency: "USD",
  rounding: "reject",
};

export interface BuiltSynthetic {
  rows: QuoteRow[];
  groups: QuoteGroupValidation[];
}

export function quoteRow(
  partial: Partial<QuoteRow> & { rowNumber: number; quoteId: string; item: string },
): QuoteRow {
  return {
    customer: "Alpha",
    quantity: 1,
    unitPriceMinor: 100,
    currency: "USD",
    currencyScale: 2,
    itemCode: "",
    description: "",
    issues: [],
    ...partial,
  };
}

export function buildSynthetic(rows: SheetRow[] = SYNTHETIC_ROWS): BuiltSynthetic {
  const mapped = mapSheetToRows(rows, syntheticMapping(), DEFAULT_MAPPING_OPTIONS);
  const grouped = groupRows(mapped.rows);
  return { rows: mapped.rows, groups: validateGroups(grouped.groups) };
}
