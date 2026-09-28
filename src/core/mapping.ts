import {
  amountIssue,
  isKnownCurrency,
  normalizeCurrencyCode,
  parseAmountCell,
  resolveCurrency,
  type RoundingMode,
} from "./money";
import { issue, type Issue, type NumberFormat, type SheetRow } from "./types";
import {
  ALL_COLUMN_KEYS,
  REQUIRED_COLUMN_KEYS,
  type ColumnKey,
  type ColumnMapping,
} from "./settings";

export interface QuoteRow {
  rowNumber: number;
  quoteId: string;
  customer: string;
  item: string;
  quantity: number | null;
  unitPriceMinor: number | null;
  currency: string;
  currencyScale: number;
  itemCode: string;
  description: string;
  issues: Issue[];
}

export function hasRowError(row: QuoteRow): boolean {
  return row.issues.some((entry) => entry.severity === "error");
}

export interface MappingOptions {
  numberFormat: NumberFormat;
  defaultCurrency: string;
  rounding: RoundingMode;
}

export interface MapResult {
  header: string[];
  rows: QuoteRow[];
  issues: Issue[];
}

function cellAt(row: SheetRow, index: number | null) {
  if (index === null) return null;
  return row.cells[index] ?? null;
}

function displayAt(row: SheetRow, index: number | null): string {
  return cellAt(row, index)?.display?.trim() ?? "";
}

/** Reads the header row and returns a display string per selected column. */
export function readHeader(row: SheetRow): string[] {
  const width = row.cells.length;
  const header: string[] = [];
  for (let i = 0; i < width; i += 1) {
    const cell = row.cells[i];
    header[i] = cell?.display?.trim() ?? "";
  }
  return header.length > 0 ? header : [""];
}

export function describeMappingAgainstHeader(mapping: ColumnMapping, header: string[]): Issue[] {
  const issues: Issue[] = [];
  for (const key of ALL_COLUMN_KEYS) {
    const index = mapping[key];
    if (index === null) continue;
    if (index >= header.length) {
      issues.push(
        issue(
          "missing_column_mapping",
          "error",
          `${key} is mapped to column ${index + 1}, but the header row only has ${header.length} column(s).`,
          { field: key },
        ),
      );
    }
  }
  return issues;
}

function allMappedCellsEmpty(row: SheetRow, mapping: ColumnMapping): boolean {
  for (const key of ALL_COLUMN_KEYS) {
    const index = mapping[key];
    if (index === null) continue;
    const cell = row.cells[index];
    if (!cell) continue;
    const hasValue = cell.value !== null && cell.value !== undefined && String(cell.value).trim() !== "";
    const hasDisplay = cell.display.trim() !== "";
    if (hasValue || hasDisplay) return false;
  }
  return true;
}

/**
 * Maps sheet rows to typed quote rows, validating each row independently.
 * Rows with errors are kept (so the user can see the offending row number);
 * grouping later treats them as blocked.
 */
export function mapSheetToRows(
  rows: SheetRow[],
  mapping: ColumnMapping,
  opts: MappingOptions,
): MapResult {
  const headerRow = rows[0] ?? null;
  const header = headerRow ? readHeader(headerRow) : [];
  const issues: Issue[] = [];

  for (const key of REQUIRED_COLUMN_KEYS) {
    if (mapping[key] === null) {
      issues.push(
        issue("missing_column_mapping", "error", `${key} is not mapped.`, { field: key }),
      );
    }
  }
  if (headerRow) {
    issues.push(...describeMappingAgainstHeader(mapping, header));
  }

  const dataRows = rows.slice(1);
  const mapped: QuoteRow[] = [];

  for (const row of dataRows) {
    if (allMappedCellsEmpty(row, mapping)) {
      issues.push(
        issue("empty_row", "warning", `Row ${row.rowNumber} is empty and was skipped.`, {
          rowNumber: row.rowNumber,
        }),
      );
      continue;
    }

    const rowIssues: Issue[] = [];
    const rowNumber = row.rowNumber;

    const rawQuoteId = displayAt(row, mapping.quoteId);
    const rawCustomer = displayAt(row, mapping.customer);
    const rawItem = displayAt(row, mapping.item);

    if (rawQuoteId === "") {
      rowIssues.push(
        issue("missing_quote_id", "error", "Quote ID is empty; the row cannot be grouped.", { rowNumber, field: "quoteId" }),
      );
    }
    if (rawCustomer === "") {
      rowIssues.push(issue("missing_customer", "error", "Customer is empty.", { rowNumber, field: "customer" }));
    }
    if (rawItem === "") {
      rowIssues.push(issue("missing_item", "error", "Item is empty.", { rowNumber, field: "item" }));
    }

    const rawCurrency = normalizeCurrencyCode(displayAt(row, mapping.currency));
    let currency = rawCurrency;
    let currencyScale = resolveCurrency(rawCurrency).scale;
    if (rawCurrency === "") {
      currency = normalizeCurrencyCode(opts.defaultCurrency);
      currencyScale = resolveCurrency(currency).scale;
      rowIssues.push(
        issue("missing_currency", "error", "Currency is empty.", { rowNumber, field: "currency" }),
      );
    } else if (!/^[A-Z]{3}$/.test(rawCurrency)) {
      rowIssues.push(
        issue(
          "unsupported_currency",
          "error",
          `Currency "${rawCurrency}" is not a 3-letter ISO code.`,
          { rowNumber, field: "currency" },
        ),
      );
      currencyScale = resolveCurrency(rawCurrency).scale;
    } else if (!isKnownCurrency(rawCurrency)) {
      rowIssues.push(
        issue(
          "unknown_currency_scale",
          "warning",
          `Currency ${rawCurrency} is not in the precision table; assuming 2 decimals.`,
          { rowNumber, field: "currency" },
        ),
      );
    }

    let quantity: number | null = null;
    const quantityCell = cellAt(row, mapping.quantity);
    if (quantityCell) {
      const parsed = parseAmountCell(quantityCell, {
        scale: 0,
        numberFormat: opts.numberFormat,
        rounding: opts.rounding,
      });
      if (parsed.kind !== "ok") {
        rowIssues.push(amountIssue(parsed, "quantity", "Quantity", rowNumber));
      } else if (parsed.minor === null || parsed.minor <= 0 || parsed.minor > 1_000_000) {
        rowIssues.push(
          issue("invalid_quantity", "error", "Quantity must be a whole number between 1 and 1,000,000.", {
            rowNumber,
            field: "quantity",
          }),
        );
      } else {
        quantity = parsed.minor;
      }
    } else {
      rowIssues.push(
        issue("missing_quantity", "error", "Quantity cell is missing.", { rowNumber, field: "quantity" }),
      );
    }

    let unitPriceMinor: number | null = null;
    const priceCell = cellAt(row, mapping.unitPrice);
    if (priceCell) {
      const parsed = parseAmountCell(priceCell, {
        scale: currencyScale,
        numberFormat: opts.numberFormat,
        rounding: opts.rounding,
      });
      if (parsed.kind !== "ok") {
        rowIssues.push(amountIssue(parsed, "unitPrice", "Unit price", rowNumber));
      } else if (parsed.minor === null) {
        rowIssues.push(
          issue("invalid_unit_price", "error", "Unit price could not be read.", { rowNumber, field: "unitPrice" }),
        );
      } else if (parsed.minor < 0) {
        rowIssues.push(
          issue("negative_unit_price", "error", "Unit price cannot be negative.", { rowNumber, field: "unitPrice" }),
        );
      } else {
        unitPriceMinor = parsed.minor;
        if (parsed.minor === 0) {
          rowIssues.push(
            issue("zero_unit_price", "warning", "Unit price is explicitly zero.", { rowNumber, field: "unitPrice" }),
          );
        }
      }
    } else {
      rowIssues.push(
        issue("missing_unit_price", "error", "Unit price cell is missing.", { rowNumber, field: "unitPrice" }),
      );
    }

    mapped.push({
      rowNumber,
      quoteId: rawQuoteId,
      customer: rawCustomer,
      item: rawItem,
      quantity,
      unitPriceMinor,
      currency,
      currencyScale,
      itemCode: displayAt(row, mapping.itemCode),
      description: displayAt(row, mapping.description),
      issues: rowIssues,
    });
  }

  return { header, rows: mapped, issues };
}

export function requiredColumnKeys(): readonly ColumnKey[] {
  return REQUIRED_COLUMN_KEYS;
}
