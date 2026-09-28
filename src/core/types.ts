/**
 * Shared domain types for the Workspace Quote PDF add-on.
 *
 * Everything in `src/core` is pure: no Apps Script, DOM or Node globals. The
 * Apps Script adapters in `src/apps-script` inject platform services and reuse
 * this logic unchanged, which is what makes the workflow testable on Node.
 */

export const ISSUE_SEVERITIES = ["error", "warning"] as const;
export type IssueSeverity = (typeof ISSUE_SEVERITIES)[number];

export const ISSUE_CODES = [
  // Selection / source shape
  "missing_header",
  "empty_selection",
  "missing_column_mapping",
  "duplicate_column_mapping",
  // Row shape
  "empty_row",
  "formula_error",
  "missing_quote_id",
  "missing_customer",
  "missing_item",
  "missing_currency",
  "missing_quantity",
  "missing_unit_price",
  "invalid_quantity",
  "invalid_unit_price",
  "negative_unit_price",
  "ambiguous_number",
  "amount_too_large",
  "unsupported_currency",
  "unknown_currency_scale",
  // Group consistency
  "conflicting_customer",
  "conflicting_currency",
  "group_blocked",
  // Warnings
  "zero_unit_price",
  "duplicate_item_row",
  // Settings / branding
  "missing_business_name",
  "invalid_validity_days",
  "invalid_terms_length",
  // Entitlements
  "free_allowance_exhausted",
  "subscription_expired",
  // Generation
  "source_changed",
  "output_folder_unavailable",
  "render_failed",
  "save_failed",
] as const;
export type IssueCode = (typeof ISSUE_CODES)[number];

export interface Issue {
  code: IssueCode;
  severity: IssueSeverity;
  message: string;
  /** 1-based spreadsheet row number when the issue belongs to a row. */
  rowNumber?: number;
  /** Column key or document field when the issue is field-specific. */
  field?: string;
}

export function issue(
  code: IssueCode,
  severity: IssueSeverity,
  message: string,
  extra: { rowNumber?: number; field?: string } = {},
): Issue {
  return { code, severity, message, ...extra };
}

export function hasError(issues: readonly Issue[]): boolean {
  return issues.some((entry) => entry.severity === "error");
}

export function errorsOnly(issues: readonly Issue[]): Issue[] {
  return issues.filter((entry) => entry.severity === "error");
}

/** A single cell as read from the spreadsheet, keeping raw and displayed forms. */
export interface SheetCell {
  /** Typed value from `Range.getValues()` (string | number | boolean | Date | null). */
  value: unknown;
  /** Displayed value from `Range.getDisplayValues()`; preserves text such as `Q-001`. */
  display: string;
  /** Formula text from `Range.getFormulas()` when present ("" otherwise). */
  formula: string;
}

export interface SheetRow {
  /** 1-based row number in the source tab. */
  rowNumber: number;
  cells: SheetCell[];
}

export const PAGE_SIZES = ["A4", "LETTER"] as const;
export type PageSize = (typeof PAGE_SIZES)[number];

export const NUMBER_FORMATS = ["dot-decimal", "comma-decimal"] as const;
export type NumberFormat = (typeof NUMBER_FORMATS)[number];

/** Template version is part of the idempotency key: bump when layout changes. */
export const TEMPLATE_VERSION = "quote-layout-v1";
