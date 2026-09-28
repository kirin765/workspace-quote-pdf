import { formatMinor, formatMoney } from "./money";
import type { QuoteSnapshot } from "./snapshot";
import type { PageSize } from "./types";

/**
 * Layout model shared by the sidebar preview and the PDF renderer.
 *
 * Both consumers render this exact structure, which is how the requirement
 * "preview the exact document data" and "preview/PDF totals agree" is enforced
 * in code rather than by convention.
 */

export interface RenderItem {
  index: number;
  itemCode: string;
  name: string;
  description: string;
  quantity: string;
  unitPrice: string;
  amount: string;
}

export interface RenderField {
  label: string;
  value: string;
}

export interface QuoteRenderModel {
  pageSize: PageSize;
  documentTitle: string;
  quoteRef: string;
  business: {
    displayName: string;
    detailLines: string[];
    logoUrl: string | null;
  };
  customer: string;
  meta: RenderField[];
  columns: {
    index: string;
    item: string;
    quantity: string;
    unitPrice: string;
    amount: string;
  };
  items: RenderItem[];
  totals: RenderField[];
  terms: string;
  footerNote: string;
  itemCount: number;
  /** True when the terms block should start on a new page to avoid splitting the table. */
  pageBreakBeforeTerms: boolean;
}

export interface RenderLabels {
  documentTitle: string;
  quoteRef: string;
  issueDate: string;
  validUntil: string;
  customer: string;
  item: string;
  quantity: string;
  unitPrice: string;
  amount: string;
  index: string;
  subtotal: string;
  total: string;
  noExpiry: string;
}

export const DEFAULT_LABELS: RenderLabels = {
  documentTitle: "QUOTATION",
  quoteRef: "Quote reference",
  issueDate: "Issue date",
  validUntil: "Valid until",
  customer: "Customer",
  item: "Item",
  quantity: "Qty",
  unitPrice: "Unit price",
  amount: "Amount",
  index: "#",
  subtotal: "Subtotal (sum of validated line amounts)",
  total: "Total",
  noExpiry: "No expiry",
};

/** Rows that comfortably fit before a forced page break, per paper size. */
export const TERMS_BREAK_THRESHOLD: Record<PageSize, number> = {
  A4: 22,
  LETTER: 24,
};

export function shouldPageBreakBeforeTerms(itemCount: number, pageSize: PageSize): boolean {
  return itemCount > TERMS_BREAK_THRESHOLD[pageSize];
}

/** Safe, predictable output file name. Customer names are intentionally excluded. */
export function quotationFileName(quoteId: string): string {
  const safe = quoteId
    .replace(CONTROL_CHARS, "")
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/^\.+/, "")
    .trim()
    .slice(0, 80);
  return `${safe || "quotation"} quotation.pdf`;
}

const CONTROL_CHARS = new RegExp(
  `[${String.fromCharCode(0)}-${String.fromCharCode(31)}${String.fromCharCode(127)}]`,
  "g",
);

export function quotationFooterNote(snapshot: QuoteSnapshot): string {
  const parts = [
    "This document is a quotation and is not proof of payment or a tax invoice.",
    `The ${snapshot.currency} total is the sum of the validated line amounts; no taxes, exchange rates or discounts are applied or inferred.`,
  ];
  if (snapshot.expiryDate === null) {
    parts.push("Prices remain subject to change because no validity period was set.");
  }
  return parts.join(" ");
}

export function buildRenderModel(
  snapshot: QuoteSnapshot,
  labels: RenderLabels = DEFAULT_LABELS,
): QuoteRenderModel {
  const numberFormat = snapshot.business.numberFormat;
  const currency = snapshot.currency;

  const items: RenderItem[] = snapshot.items.map((item) => ({
    index: item.index,
    itemCode: item.itemCode,
    name: item.name,
    description: item.description,
    quantity: String(item.quantity),
    unitPrice: formatMinor(item.unitPriceMinor, snapshot.currencyScale, numberFormat),
    amount: formatMinor(item.lineTotalMinor, snapshot.currencyScale, numberFormat),
  }));

  const subtotalText = formatMoney(
    snapshot.subtotalMinor,
    snapshot.currencyScale,
    currency,
    numberFormat,
  );

  const business = snapshot.business;
  const detailLines = [...business.addressLines, ...business.contactLines].filter(
    (line) => line.trim() !== "",
  );

  return {
    pageSize: snapshot.pageSize,
    documentTitle: labels.documentTitle,
    quoteRef: snapshot.quoteId,
    business: {
      displayName: business.displayName,
      detailLines,
      logoUrl: business.logoUrl,
    },
    customer: snapshot.customer,
    meta: [
      { label: labels.quoteRef, value: snapshot.quoteId },
      { label: labels.issueDate, value: snapshot.issueDate },
      {
        label: labels.validUntil,
        value: snapshot.expiryDate ?? labels.noExpiry,
      },
      { label: labels.customer, value: snapshot.customer },
    ],
    columns: {
      index: labels.index,
      item: labels.item,
      quantity: labels.quantity,
      unitPrice: `${labels.unitPrice} (${currency})`,
      amount: `${labels.amount} (${currency})`,
    },
    items,
    totals: [
      { label: labels.subtotal, value: subtotalText },
      { label: labels.total, value: subtotalText },
    ],
    terms: snapshot.terms,
    footerNote: quotationFooterNote(snapshot),
    itemCount: snapshot.items.length,
    pageBreakBeforeTerms: shouldPageBreakBeforeTerms(snapshot.items.length, snapshot.pageSize),
  };
}
