import type { QuoteOutcome } from "./entitlements";
import type { QuoteJobResult } from "./jobs";
import type { QuoteSnapshot } from "./snapshot";

/**
 * Results-tab rows.
 *
 * The source sheet is never modified; output is reported in a separate tab
 * whose name is chosen to never collide with an existing user tab.
 */

export const RESULTS_TAB_BASE_NAME = "Quote PDF results";

export const RESULTS_TAB_HEADERS = [
  "Quote ID",
  "Customer",
  "Items",
  "Generated at",
  "Status",
  "PDF link",
  "Message",
] as const;

export interface ResultRow {
  quoteId: string;
  customer: string;
  itemCount: number;
  generatedAt: string;
  status: QuoteOutcome;
  fileUrl: string | null;
  message: string | null;
}

export function buildResultRows(
  entries: readonly { snapshot: QuoteSnapshot; result: QuoteJobResult }[],
): ResultRow[] {
  return entries.map(({ snapshot, result }) => ({
    quoteId: snapshot.quoteId,
    customer: snapshot.customer,
    itemCount: snapshot.items.length,
    generatedAt: result.at,
    status: result.status,
    fileUrl: result.fileUrl,
    message: result.message,
  }));
}

/**
 * Returns a tab name that does not exist among `existingTitles`.
 * Existing tabs are never replaced or renamed.
 */
export function collisionSafeTabName(existingTitles: readonly string[]): string {
  const taken = new Set(existingTitles.map((title) => title.trim().toLowerCase()));
  if (!taken.has(RESULTS_TAB_BASE_NAME.toLowerCase())) return RESULTS_TAB_BASE_NAME;
  for (let index = 2; index < 10_000; index += 1) {
    const candidate = `${RESULTS_TAB_BASE_NAME} (${index})`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
  return `${RESULTS_TAB_BASE_NAME} (${Date.now()})`;
}
