import {
  PAGE_SIZES,
  TEMPLATE_VERSION,
  issue,
  type Issue,
  type NumberFormat,
  type PageSize,
} from "./types";

/**
 * Mapping and branding settings, scoped to one user in one spreadsheet.
 * Persisted as JSON in Apps Script UserProperties (see the adapter layer).
 */

export const SETTINGS_VERSION = 1;

/** Column indexes are 0-based offsets within the selected range, or null. */
export interface ColumnMapping {
  quoteId: number | null;
  customer: number | null;
  item: number | null;
  quantity: number | null;
  unitPrice: number | null;
  currency: number | null;
  itemCode: number | null;
  description: number | null;
}

export const REQUIRED_COLUMN_KEYS = [
  "quoteId",
  "customer",
  "item",
  "quantity",
  "unitPrice",
  "currency",
] as const satisfies readonly (keyof ColumnMapping)[];

export const OPTIONAL_COLUMN_KEYS = ["itemCode", "description"] as const satisfies readonly (keyof ColumnMapping)[];

export const ALL_COLUMN_KEYS = [...REQUIRED_COLUMN_KEYS, ...OPTIONAL_COLUMN_KEYS] as const;

export type RequiredColumnKey = (typeof REQUIRED_COLUMN_KEYS)[number];
export type OptionalColumnKey = (typeof OPTIONAL_COLUMN_KEYS)[number];
export type ColumnKey = RequiredColumnKey | OptionalColumnKey;

export const COLUMN_LABELS: Record<ColumnKey, string> = {
  quoteId: "Quote ID",
  customer: "Customer",
  item: "Item",
  quantity: "Quantity",
  unitPrice: "Unit price",
  currency: "Currency",
  itemCode: "Item code (optional)",
  description: "Description (optional)",
};

export interface BusinessProfile {
  displayName: string;
  addressLines: string[];
  contactLines: string[];
  logoUrl: string | null;
  /** Days after issue date that the quote stays valid. 0 means no expiry printed. */
  defaultValidityDays: number;
  terms: string;
  pageSize: PageSize;
  numberFormat: NumberFormat;
}

export interface SourceSelection {
  sheetName: string | null;
  /** 1-based header row within the tab. */
  headerRow: number;
}

export interface AppSettings {
  version: number;
  templateVersion: string;
  mapping: ColumnMapping;
  business: BusinessProfile;
  source: SourceSelection;
  outputFolderId: string | null;
}

export const MAX_TERMS_LENGTH = 4000;
export const MAX_VALIDITY_DAYS = 3650;

export function emptyMapping(): ColumnMapping {
  return {
    quoteId: null,
    customer: null,
    item: null,
    quantity: null,
    unitPrice: null,
    currency: null,
    itemCode: null,
    description: null,
  };
}

export function defaultSettings(): AppSettings {
  return {
    version: SETTINGS_VERSION,
    templateVersion: TEMPLATE_VERSION,
    mapping: emptyMapping(),
    business: {
      displayName: "",
      addressLines: [],
      contactLines: [],
      logoUrl: null,
      defaultValidityDays: 30,
      terms: "",
      pageSize: "A4",
      numberFormat: "dot-decimal",
    },
    source: {
      sheetName: null,
      headerRow: 1,
    },
    outputFolderId: null,
  };
}

function isColumnIndex(value: unknown): value is number | null {
  return value === null || (typeof value === "number" && Number.isInteger(value) && value >= 0);
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string").map((entry) => entry.trim());
}

/** Coerces untrusted stored JSON into a valid-shaped AppSettings without throwing. */
export function coerceSettings(raw: unknown): AppSettings {
  const base = defaultSettings();
  if (!raw || typeof raw !== "object") return base;
  const record = raw as Record<string, unknown>;

  const mappingRaw = (record.mapping ?? {}) as Record<string, unknown>;
  for (const key of ALL_COLUMN_KEYS) {
    const value = mappingRaw[key];
    if (isColumnIndex(value)) base.mapping[key] = value;
  }

  const businessRaw = (record.business ?? {}) as Record<string, unknown>;
  if (typeof businessRaw.displayName === "string") base.business.displayName = businessRaw.displayName;
  base.business.addressLines = asStringArray(businessRaw.addressLines);
  base.business.contactLines = asStringArray(businessRaw.contactLines);
  if (typeof businessRaw.logoUrl === "string" && businessRaw.logoUrl.trim() !== "") {
    base.business.logoUrl = businessRaw.logoUrl.trim();
  }
  if (typeof businessRaw.defaultValidityDays === "number" && Number.isFinite(businessRaw.defaultValidityDays)) {
    base.business.defaultValidityDays = Math.trunc(businessRaw.defaultValidityDays);
  }
  if (typeof businessRaw.terms === "string") base.business.terms = businessRaw.terms;
  if (PAGE_SIZES.includes(businessRaw.pageSize as PageSize)) {
    base.business.pageSize = businessRaw.pageSize as PageSize;
  }
  if (businessRaw.numberFormat === "comma-decimal" || businessRaw.numberFormat === "dot-decimal") {
    base.business.numberFormat = businessRaw.numberFormat;
  }

  const sourceRaw = (record.source ?? {}) as Record<string, unknown>;
  if (typeof sourceRaw.sheetName === "string" && sourceRaw.sheetName.trim() !== "") {
    base.source.sheetName = sourceRaw.sheetName;
  }
  if (typeof sourceRaw.headerRow === "number" && Number.isInteger(sourceRaw.headerRow) && sourceRaw.headerRow >= 1) {
    base.source.headerRow = sourceRaw.headerRow;
  }

  if (typeof record.outputFolderId === "string" && record.outputFolderId.trim() !== "") {
    base.outputFolderId = record.outputFolderId.trim();
  }
  if (typeof record.templateVersion === "string" && record.templateVersion.trim() !== "") {
    base.templateVersion = record.templateVersion;
  }

  return base;
}

export function serializeSettings(settings: AppSettings): string {
  return JSON.stringify(settings);
}

export function parseStoredSettings(json: string | null | undefined): AppSettings {
  if (!json) return defaultSettings();
  try {
    return coerceSettings(JSON.parse(json));
  } catch {
    return defaultSettings();
  }
}

export function validateSettings(settings: AppSettings): Issue[] {
  const issues: Issue[] = [];

  const used = new Map<number, string>();
  for (const key of ALL_COLUMN_KEYS) {
    const index = settings.mapping[key];
    if (index === null) continue;
    const existing = used.get(index);
    if (existing) {
      issues.push(
        issue(
          "duplicate_column_mapping",
          "error",
          `Column ${index + 1} is mapped to both ${COLUMN_LABELS[existing as ColumnKey]} and ${COLUMN_LABELS[key]}.`,
          { field: key },
        ),
      );
    } else {
      used.set(index, key);
    }
  }

  for (const key of REQUIRED_COLUMN_KEYS) {
    if (settings.mapping[key] === null) {
      issues.push(
        issue("missing_column_mapping", "error", `${COLUMN_LABELS[key]} must be mapped.`, { field: key }),
      );
    }
  }

  if (settings.business.displayName.trim() === "") {
    issues.push(issue("missing_business_name", "error", "Business display name is required.", { field: "displayName" }));
  }

  const days = settings.business.defaultValidityDays;
  if (!Number.isInteger(days) || days < 0 || days > MAX_VALIDITY_DAYS) {
    issues.push(
      issue("invalid_validity_days", "error", `Validity days must be between 0 and ${MAX_VALIDITY_DAYS}.`, {
        field: "defaultValidityDays",
      }),
    );
  }

  if (settings.business.terms.length > MAX_TERMS_LENGTH) {
    issues.push(
      issue("invalid_terms_length", "error", `Terms must be ${MAX_TERMS_LENGTH} characters or fewer.`, {
        field: "terms",
      }),
    );
  }

  return issues;
}
