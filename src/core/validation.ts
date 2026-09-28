import { multiplyByInteger, sumMinor } from "./money";
import { hasRowError, type QuoteRow } from "./mapping";
import { issue, type Issue } from "./types";
import type { QuoteGroup } from "./grouping";

/**
 * Group-level validation.
 *
 * A row-level error blocks its whole quote. Quote-level fields (customer,
 * currency) must agree across all rows; conflicts block the quote and name the
 * rows involved. Nothing is silently coerced or dropped.
 */

export type QuoteGroupStatus = "ready" | "blocked";

export interface QuoteGroupValidation {
  quoteId: string;
  status: QuoteGroupStatus;
  customer: string;
  currency: string;
  currencyScale: number;
  firstRowNumber: number;
  itemCount: number;
  rows: QuoteRow[];
  /** Sum of validated line amounts. Zero when the group is blocked. */
  subtotalMinor: number;
  issues: Issue[];
  blockReasons: string[];
  warnings: Issue[];
}

function distinctWithRows(
  rows: readonly QuoteRow[],
  pick: (row: QuoteRow) => string,
): Map<string, number[]> {
  const map = new Map<string, number[]>();
  for (const row of rows) {
    const value = pick(row);
    const list = map.get(value);
    if (list) list.push(row.rowNumber);
    else map.set(value, [row.rowNumber]);
  }
  return map;
}

function canonicalValue(map: Map<string, number[]>): string {
  const first = map.keys().next();
  return first.done ? "" : first.value;
}

function itemFingerprint(row: QuoteRow): string {
  return [
    row.item.toLowerCase(),
    row.itemCode.toLowerCase(),
    row.quantity ?? "?",
    row.unitPriceMinor ?? "?",
  ].join("\u0000");
}

export function validateGroup(group: QuoteGroup): QuoteGroupValidation {
  const rows = group.rows;
  const issues: Issue[] = [];

  for (const row of rows) {
    for (const rowIssue of row.issues) {
      if (rowIssue.severity === "error") issues.push(rowIssue);
    }
  }

  const customerMap = distinctWithRows(rows, (row) => row.customer);
  const currencyMap = distinctWithRows(rows, (row) => row.currency);
  const customer = canonicalValue(customerMap);
  const currency = canonicalValue(currencyMap);
  const currencyScale = rows[0]?.currencyScale ?? 2;

  if (customer !== "") {
    for (const [value, rowNumbers] of customerMap) {
      if (value === customer || value === "") continue;
      issues.push(
        issue(
          "conflicting_customer",
          "error",
          `Quote ${group.quoteId} has conflicting customers: "${customer}" (rows ${customerMap
            .get(customer)!
            .join(", ")}) vs "${value}" (rows ${rowNumbers.join(", ")}).`,
        ),
      );
    }
  }

  if (currency !== "") {
    for (const [value, rowNumbers] of currencyMap) {
      if (value === currency || value === "") continue;
      issues.push(
        issue(
          "conflicting_currency",
          "error",
          `Quote ${group.quoteId} has conflicting currencies: "${currency}" (rows ${currencyMap
            .get(currency)!
            .join(", ")}) vs "${value}" (rows ${rowNumbers.join(", ")}).`,
        ),
      );
    }
  }

  // Duplicate identical item rows are warned about, never deleted.
  const seen = new Map<string, number>();
  for (const row of rows) {
    if (hasRowError(row)) continue;
    const fingerprint = itemFingerprint(row);
    const first = seen.get(fingerprint);
    if (first !== undefined) {
      issues.push(
        issue(
          "duplicate_item_row",
          "warning",
          `Row ${row.rowNumber} looks identical to row ${first} in quote ${group.quoteId}. Kept as-is; remove it if it is accidental.`,
          { rowNumber: row.rowNumber },
        ),
      );
    } else {
      seen.set(fingerprint, row.rowNumber);
    }
  }

  const errors = issues.filter((entry) => entry.severity === "error");
  let blocked = errors.length > 0;

  let subtotalMinor = 0;
  if (!blocked) {
    try {
      const lineAmounts = rows.map((row) =>
        multiplyByInteger(row.unitPriceMinor ?? 0, row.quantity ?? 0),
      );
      subtotalMinor = sumMinor(lineAmounts);
    } catch {
      issues.push(
        issue(
          "amount_too_large",
          "error",
          `Quote ${group.quoteId} total exceeds the safe calculation range. Split the quote or reduce the amounts.`,
        ),
      );
      blocked = true;
      subtotalMinor = 0;
    }
  }

  const finalErrors = issues.filter((entry) => entry.severity === "error");
  return {
    quoteId: group.quoteId,
    status: blocked ? "blocked" : "ready",
    customer,
    currency,
    currencyScale,
    firstRowNumber: group.firstRowNumber,
    itemCount: rows.length,
    rows,
    subtotalMinor,
    issues,
    blockReasons: finalErrors.map((entry) => entry.message),
    warnings: issues.filter((entry) => entry.severity === "warning"),
  };
}

export function validateGroups(groups: readonly QuoteGroup[]): QuoteGroupValidation[] {
  return groups.map(validateGroup);
}

export interface ValidationSummary {
  total: number;
  ready: number;
  blocked: number;
  itemsReady: number;
  warnings: number;
}

export function summarizeValidation(list: readonly QuoteGroupValidation[]): ValidationSummary {
  let ready = 0;
  let itemsReady = 0;
  let warnings = 0;
  for (const group of list) {
    if (group.status === "ready") {
      ready += 1;
      itemsReady += group.itemCount;
    }
    warnings += group.warnings.length;
  }
  return { total: list.length, ready, blocked: list.length - ready, itemsReady, warnings };
}
