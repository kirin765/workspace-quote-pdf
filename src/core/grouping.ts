import { issue, type Issue } from "./types";
import type { QuoteRow } from "./mapping";

/**
 * Grouping by quote ID, preserving spreadsheet order and leading zeros.
 *
 * Grouping is always by the exact Quote ID string. Customer name is never used
 * as a grouping key: two quotes can share a customer, and distinct customers
 * must never be merged.
 */

export interface QuoteGroup {
  quoteId: string;
  rows: QuoteRow[];
  firstRowNumber: number;
}

export interface GroupResult {
  groups: QuoteGroup[];
  orphans: QuoteRow[];
  issues: Issue[];
}

export function groupRows(rows: readonly QuoteRow[]): GroupResult {
  const byId = new Map<string, QuoteGroup>();
  const orphans: QuoteRow[] = [];
  const issues: Issue[] = [];

  for (const row of rows) {
    if (row.quoteId === "") {
      orphans.push(row);
      continue;
    }
    const existing = byId.get(row.quoteId);
    if (existing) {
      existing.rows.push(row);
    } else {
      byId.set(row.quoteId, {
        quoteId: row.quoteId,
        rows: [row],
        firstRowNumber: row.rowNumber,
      });
    }
  }

  if (orphans.length > 0) {
    issues.push(
      issue(
        "missing_quote_id",
        "error",
        `${orphans.length} row(s) have no Quote ID and cannot be grouped (rows ${orphans
          .map((row) => row.rowNumber)
          .join(", ")}).`,
      ),
    );
  }

  return { groups: [...byId.values()], orphans, issues };
}
