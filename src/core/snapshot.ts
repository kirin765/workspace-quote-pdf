import { addDaysIso } from "./dates";
import { hashObject } from "./hash";
import { multiplyByInteger, sumMinor } from "./money";
import type { BusinessProfile, AppSettings } from "./settings";
import type { QuoteGroupValidation } from "./validation";
import type { PageSize } from "./types";

/**
 * Immutable document snapshots.
 *
 * A snapshot is built once from a validated group and never mutated. The same
 * snapshot feeds both the sidebar preview and the PDF renderer, so the preview
 * and the exported document cannot disagree. `contentHash` makes generation
 * idempotent: retrying the same snapshot returns the existing file, while any
 * change to the visible document produces a new version.
 */

export interface SnapshotItem {
  index: number;
  rowNumber: number;
  itemCode: string;
  name: string;
  description: string;
  quantity: number;
  unitPriceMinor: number;
  lineTotalMinor: number;
}

export interface SnapshotSource {
  sheetName: string;
  headerRow: number;
  rangeA1: string | null;
}

export interface QuoteSnapshot {
  templateVersion: string;
  quoteId: string;
  customer: string;
  currency: string;
  currencyScale: number;
  issueDate: string;
  expiryDate: string | null;
  items: SnapshotItem[];
  subtotalMinor: number;
  terms: string;
  pageSize: PageSize;
  business: BusinessProfile;
  source: SnapshotSource;
  contentHash: string;
}

export interface SnapshotContext {
  issueDate: string;
  source: SnapshotSource;
}

export function buildSnapshot(
  group: QuoteGroupValidation,
  settings: AppSettings,
  context: SnapshotContext,
): QuoteSnapshot | null {
  if (group.status !== "ready") return null;

  const items: SnapshotItem[] = group.rows.map((row, index) => {
    const quantity = row.quantity ?? 0;
    const unitPriceMinor = row.unitPriceMinor ?? 0;
    return {
      index: index + 1,
      rowNumber: row.rowNumber,
      itemCode: row.itemCode,
      name: row.item,
      description: row.description,
      quantity,
      unitPriceMinor,
      lineTotalMinor: multiplyByInteger(unitPriceMinor, quantity),
    };
  });

  const subtotalMinor = sumMinor(items.map((item) => item.lineTotalMinor));
  const validityDays = settings.business.defaultValidityDays;
  const expiryDate = validityDays > 0 ? addDaysIso(context.issueDate, validityDays) : null;

  const business: BusinessProfile = {
    ...settings.business,
    addressLines: [...settings.business.addressLines],
    contactLines: [...settings.business.contactLines],
  };

  const contentHash = hashObject({
    templateVersion: settings.templateVersion,
    quoteId: group.quoteId,
    customer: group.customer,
    currency: group.currency,
    currencyScale: group.currencyScale,
    issueDate: context.issueDate,
    expiryDate,
    items: items.map((item) => ({
      name: item.name,
      itemCode: item.itemCode,
      description: item.description,
      quantity: item.quantity,
      unitPriceMinor: item.unitPriceMinor.toString(),
    })),
    subtotalMinor: subtotalMinor.toString(),
    terms: settings.business.terms,
    pageSize: settings.business.pageSize,
    business: {
      displayName: business.displayName,
      addressLines: business.addressLines,
      contactLines: business.contactLines,
      logoUrl: business.logoUrl,
    },
  });

  return {
    templateVersion: settings.templateVersion,
    quoteId: group.quoteId,
    customer: group.customer,
    currency: group.currency,
    currencyScale: group.currencyScale,
    issueDate: context.issueDate,
    expiryDate,
    items,
    subtotalMinor,
    terms: settings.business.terms,
    pageSize: settings.business.pageSize,
    business,
    source: context.source,
    contentHash,
  };
}

export function buildSnapshots(
  groups: readonly QuoteGroupValidation[],
  settings: AppSettings,
  context: SnapshotContext,
): QuoteSnapshot[] {
  const snapshots: QuoteSnapshot[] = [];
  for (const group of groups) {
    const snapshot = buildSnapshot(group, settings, context);
    if (snapshot) snapshots.push(snapshot);
  }
  return snapshots;
}
