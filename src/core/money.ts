import type { Issue, NumberFormat, SheetCell } from "./types";

/**
 * Decimal-safe money handling for the Apps Script runtime.
 *
 * The V8 runtime used by Apps Script rejects BigInt literals, so amounts are
 * stored as integer minor units in a `number` (cents for scale 2, whole units
 * for scale 0). All arithmetic is integer-only and bounded by
 * `Number.MAX_SAFE_INTEGER`, so quantity × unit price and totals are exact and
 * never go through fractional float math. Parsing preserves the raw text and
 * never silently coerces a malformed value to zero.
 */

export interface CurrencyInfo {
  code: string;
  scale: number;
  symbol: string;
}

/** Documented currency precision table. Unknown codes default to scale 2. */
export const CURRENCIES: Record<string, CurrencyInfo> = {
  USD: { code: "USD", scale: 2, symbol: "$" },
  EUR: { code: "EUR", scale: 2, symbol: "€" },
  GBP: { code: "GBP", scale: 2, symbol: "£" },
  AUD: { code: "AUD", scale: 2, symbol: "A$" },
  CAD: { code: "CAD", scale: 2, symbol: "C$" },
  SGD: { code: "SGD", scale: 2, symbol: "S$" },
  HKD: { code: "HKD", scale: 2, symbol: "HK$" },
  CNY: { code: "CNY", scale: 2, symbol: "¥" },
  JPY: { code: "JPY", scale: 0, symbol: "¥" },
  KRW: { code: "KRW", scale: 0, symbol: "₩" },
  VND: { code: "VND", scale: 0, symbol: "₫" },
  CHF: { code: "CHF", scale: 2, symbol: "CHF" },
  SEK: { code: "SEK", scale: 2, symbol: "kr" },
  NOK: { code: "NOK", scale: 2, symbol: "kr" },
  DKK: { code: "DKK", scale: 2, symbol: "kr" },
  INR: { code: "INR", scale: 2, symbol: "₹" },
  BRL: { code: "BRL", scale: 2, symbol: "R$" },
  MXN: { code: "MXN", scale: 2, symbol: "MX$" },
  ZAR: { code: "ZAR", scale: 2, symbol: "R" },
  TRY: { code: "TRY", scale: 2, symbol: "₺" },
  PLN: { code: "PLN", scale: 2, symbol: "zł" },
  TWD: { code: "TWD", scale: 2, symbol: "NT$" },
  THB: { code: "THB", scale: 2, symbol: "฿" },
  MYR: { code: "MYR", scale: 2, symbol: "RM" },
  IDR: { code: "IDR", scale: 0, symbol: "Rp" },
  PHP: { code: "PHP", scale: 2, symbol: "₱" },
  NZD: { code: "NZD", scale: 2, symbol: "NZ$" },
};

export const DEFAULT_CURRENCY_CODE = "USD";

/**
 * Largest single amount in minor units. 1,000,000,000 minor units is
 * 10,000,000.00 at scale 2, and leaves room for quantity × price and totals to
 * stay inside Number.MAX_SAFE_INTEGER.
 */
export const MAX_AMOUNT_MINOR = 1_000_000_000;
export const MAX_QUANTITY = 1_000_000;

export function normalizeCurrencyCode(raw: string): string {
  return raw.trim().toUpperCase();
}

export function isKnownCurrency(code: string): boolean {
  return Object.prototype.hasOwnProperty.call(CURRENCIES, normalizeCurrencyCode(code));
}

export function resolveCurrency(code: string | undefined): CurrencyInfo {
  const normalized = normalizeCurrencyCode(code ?? "");
  if (normalized === "") return CURRENCIES[DEFAULT_CURRENCY_CODE]!;
  return CURRENCIES[normalized] ?? { code: normalized, scale: 2, symbol: normalized };
}

export type RoundingMode = "reject" | "round" | "truncate";

export interface AmountParseOptions {
  scale: number;
  numberFormat: NumberFormat;
  rounding?: RoundingMode;
}

export type AmountParseKind =
  | "ok"
  | "missing"
  | "formula_error"
  | "invalid_format"
  | "ambiguous"
  | "too_large"
  | "too_precise";

export interface AmountParseResult {
  kind: AmountParseKind;
  minor: number | null;
  /** Raw text that was inspected, already trimmed (kept for error messages). */
  text: string;
  detail?: string;
}

const FORMULA_ERRORS = [
  "#NULL!",
  "#DIV/0!",
  "#VALUE!",
  "#REF!",
  "#NAME?",
  "#NUM!",
  "#N/A",
  "#ERROR!",
  "#GETTING_DATA",
];

const GROUPING_CHARS = /[\s\u00a0']/;

function isFormulaError(display: string): boolean {
  const upper = display.trim().toUpperCase();
  return FORMULA_ERRORS.some((error) => upper.startsWith(error));
}

/** Extracts the text form of a cell without losing strings such as `Q-001`. */
export function cellText(cell: SheetCell): string {
  const { value, display } = cell;
  if (typeof value === "string") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return display || "NaN";
    return String(value);
  }
  if (typeof value === "boolean") return String(value);
  if (value === null || value === undefined) return display ?? "";
  return display ?? String(value);
}

type MinorBuild =
  | { ok: true; minor: number }
  | { ok: false; kind: "too_precise" | "too_large" };

function buildMinorFromDigits(
  negative: boolean,
  integerDigits: string,
  fractionDigits: string,
  scale: number,
  rounding: RoundingMode,
): MinorBuild {
  let fraction = fractionDigits;
  let roundUp = false;
  if (fraction.length > scale) {
    if (rounding === "reject") return { ok: false, kind: "too_precise" };
    if (rounding === "round") {
      roundUp = fraction.charCodeAt(scale) - 48 >= 5;
    }
    fraction = fraction.slice(0, scale);
  }
  const padded = fraction.padEnd(scale, "0");
  const digits = (integerDigits === "" ? "0" : integerDigits) + padded;
  const normalized = digits.replace(/^0+(?=\d)/, "");
  if (normalized.length > 10) return { ok: false, kind: "too_large" };
  let combined = Number(normalized);
  if (roundUp) combined += 1;
  if (!Number.isSafeInteger(combined) || combined > MAX_AMOUNT_MINOR) {
    return { ok: false, kind: "too_large" };
  }
  return { ok: true, minor: negative ? -combined : combined };
}

function validateGrouping(parts: string[]): boolean {
  if (parts.length <= 1) return true;
  if (parts[0] === "" || parts[0]!.length > 3) return false;
  return parts.slice(1).every((part) => part.length === 3);
}

/**
 * Parses a numeric text into minor units.
 *
 * Strict by design: grouping separators must be well-formed, and a separator
 * that could be read as either decimal or grouping under the configured locale
 * is reported as `ambiguous` rather than guessed.
 */
export function parseAmountText(rawInput: string, opts: AmountParseOptions): AmountParseResult {
  const rounding = opts.rounding ?? "reject";
  const text = rawInput.trim();
  if (text === "") return { kind: "missing", minor: null, text };

  if (isFormulaError(text)) {
    return { kind: "formula_error", minor: null, text, detail: text };
  }

  let body = text;
  let negative = false;
  if (body.startsWith("-")) {
    negative = true;
    body = body.slice(1);
  } else if (body.startsWith("+")) {
    body = body.slice(1);
  }

  if (/[₩$€¥£₹₺₫฿]/.test(body)) {
    return {
      kind: "invalid_format",
      minor: null,
      text,
      detail: "Currency symbols are not allowed in the amount column.",
    };
  }
  if (body.includes("%")) {
    return {
      kind: "invalid_format",
      minor: null,
      text,
      detail: "Percentages are not valid amounts.",
    };
  }
  if (/[eE]/.test(body)) {
    return {
      kind: "invalid_format",
      minor: null,
      text,
      detail: "Scientific notation is not accepted; enter a plain decimal.",
    };
  }
  if (/[a-zA-Z]/.test(body)) {
    return {
      kind: "invalid_format",
      minor: null,
      text,
      detail: "Amounts may contain digits and separators only.",
    };
  }

  // Normalise non-breaking/regular spaces and apostrophes away (always grouping).
  body = body.replace(new RegExp(GROUPING_CHARS, "g"), "");

  const commaCount = (body.match(/,/g) ?? []).length;
  const dotCount = (body.match(/\./g) ?? []).length;
  if (commaCount > 1 || dotCount > 1) {
    return {
      kind: "invalid_format",
      minor: null,
      text,
      detail: "Too many separators for a single number.",
    };
  }

  const decimalSeparator = opts.numberFormat === "comma-decimal" ? "," : ".";
  const groupingSeparator = opts.numberFormat === "comma-decimal" ? "." : ",";

  if (body.includes(decimalSeparator) && body.includes(groupingSeparator)) {
    const groupingIsBeforeDecimal =
      body.indexOf(groupingSeparator) < body.indexOf(decimalSeparator);
    if (!groupingIsBeforeDecimal) {
      return {
        kind: "ambiguous",
        minor: null,
        text,
        detail: `Separators do not match the configured ${opts.numberFormat} format.`,
      };
    }
    const [intPart = "", ...rest] = body.split(decimalSeparator);
    if (!validateGrouping(intPart.split(groupingSeparator))) {
      return {
        kind: "invalid_format",
        minor: null,
        text,
        detail: "Thousands separators are not in groups of three.",
      };
    }
    const fraction = rest.join("");
    if (!/^\d*$/.test(intPart.replace(new RegExp(escapeRegExp(groupingSeparator), "g"), "")))
      return { kind: "invalid_format", minor: null, text };
    if (!/^\d*$/.test(fraction)) return { kind: "invalid_format", minor: null, text };
    const integerDigits = intPart.replace(new RegExp(escapeRegExp(groupingSeparator), "g"), "");
    const built = buildMinorFromDigits(negative, integerDigits, fraction, opts.scale, rounding);
    if (!built.ok) return { kind: built.kind, minor: null, text };
    return { kind: "ok", minor: built.minor, text };
  }

  if (body.includes(groupingSeparator)) {
    // Only grouping char present. Under dot-decimal, "1,5" is ambiguous because
    // some locales use comma as the decimal separator.
    if (opts.numberFormat === "dot-decimal") {
      const parts = body.split(",");
      if (validateGrouping(parts) && parts.slice(1).every((part) => part.length === 3)) {
        const integerDigits = body.replace(/,/g, "");
        const built = buildMinorFromDigits(negative, integerDigits, "", opts.scale, rounding);
        if (!built.ok) return { kind: built.kind, minor: null, text };
        return { kind: "ok", minor: built.minor, text };
      }
      return {
        kind: "ambiguous",
        minor: null,
        text,
        detail: `"${text}" could be a decimal comma. Set the number format to comma-decimal or remove the separator.`,
      };
    }
    // comma-decimal locale: dot is grouping, e.g. 1.234 or 1.234.567
    if (validateGrouping(body.split("."))) {
      const integerDigits = body.replace(/\./g, "");
      const built = buildMinorFromDigits(negative, integerDigits, "", opts.scale, rounding);
      if (!built.ok) return { kind: built.kind, minor: null, text };
      return { kind: "ok", minor: built.minor, text };
    }
    return {
      kind: "invalid_format",
      minor: null,
      text,
      detail: "Thousands separators are not in groups of three.",
    };
  }

  if (body.includes(decimalSeparator)) {
    const [intPart = "", ...rest] = body.split(decimalSeparator);
    const fraction = rest.join("");
    if (!/^\d*$/.test(intPart) || !/^\d*$/.test(fraction) || (intPart === "" && fraction === "")) {
      return { kind: "invalid_format", minor: null, text };
    }
    const built = buildMinorFromDigits(negative, intPart, fraction, opts.scale, rounding);
    if (!built.ok) return { kind: built.kind, minor: null, text };
    return { kind: "ok", minor: built.minor, text };
  }

  if (!/^\d+$/.test(body)) {
    return { kind: "invalid_format", minor: null, text };
  }
  const built = buildMinorFromDigits(negative, body, "", opts.scale, rounding);
  if (!built.ok) return { kind: built.kind, minor: null, text };
  return { kind: "ok", minor: built.minor, text };
}

export function parseAmountCell(cell: SheetCell, opts: AmountParseOptions): AmountParseResult {
  if (isFormulaError(cell.display)) {
    return { kind: "formula_error", minor: null, text: cell.display.trim(), detail: cell.display.trim() };
  }
  const raw =
    typeof cell.value === "number" && Number.isFinite(cell.value)
      ? String(cell.value)
      : cellText(cell);
  return parseAmountText(raw, opts);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Integer multiplication with an explicit safe-integer overflow guard. */
export function multiplyByInteger(minor: number, quantity: number): number {
  if (!Number.isSafeInteger(minor) || !Number.isSafeInteger(quantity)) {
    throw new Error("Amounts and quantities must be safe integers.");
  }
  if (quantity !== 0 && Math.abs(minor) > Math.floor(Number.MAX_SAFE_INTEGER / Math.abs(quantity))) {
    throw new Error("amount_too_large");
  }
  return minor * quantity;
}

/** Sums minor units and throws if the running total leaves the safe range. */
export function sumMinor(values: readonly number[]): number {
  let total = 0;
  for (const value of values) {
    total += value;
    if (!Number.isSafeInteger(total)) throw new Error("amount_too_large");
  }
  return total;
}

function groupDigits(digits: string, separator: string): string {
  let out = "";
  for (let i = 0; i < digits.length; i += 1) {
    if (i > 0 && (digits.length - i) % 3 === 0) out += separator;
    out += digits[i];
  }
  return out;
}

export function formatMinor(
  minor: number,
  scale: number,
  numberFormat: NumberFormat = "dot-decimal",
): string {
  const negative = minor < 0;
  const abs = Math.abs(minor);
  const raw = abs.toString().padStart(scale + 1, "0");
  const integerPart = raw.slice(0, raw.length - scale) || "0";
  const fractionPart = scale > 0 ? raw.slice(raw.length - scale) : "";
  const groupingSeparator = numberFormat === "comma-decimal" ? "." : ",";
  const decimalSeparator = numberFormat === "comma-decimal" ? "," : ".";
  const grouped = groupDigits(integerPart, groupingSeparator);
  const formatted = scale > 0 ? `${grouped}${decimalSeparator}${fractionPart}` : grouped;
  return negative ? `-${formatted}` : formatted;
}

export function formatMoney(
  minor: number,
  scale: number,
  code: string,
  numberFormat: NumberFormat = "dot-decimal",
): string {
  return `${normalizeCurrencyCode(code)} ${formatMinor(minor, scale, numberFormat)}`;
}

/** Maps a generic parse failure onto a domain issue for the amount column. */
export function amountIssue(
  result: AmountParseResult,
  field: "quantity" | "unitPrice",
  label: string,
  rowNumber: number,
): Issue {
  const detail = result.detail ? ` (${result.detail})` : "";
  const severity = "error" as const;
  switch (result.kind) {
    case "missing":
      return {
        code: field === "quantity" ? "missing_quantity" : "missing_unit_price",
        severity,
        message: `${label} is empty. It is not treated as zero.`,
        rowNumber,
        field,
      };
    case "formula_error":
      return {
        code: "formula_error",
        severity,
        message: `${label} contains a spreadsheet formula error ${result.text}.`,
        rowNumber,
        field,
      };
    case "ambiguous":
      return {
        code: "ambiguous_number",
        severity,
        message: `Ambiguous number format for ${label}: ${result.text}${detail}.`,
        rowNumber,
        field,
      };
    case "too_precise":
      return {
        code: "invalid_unit_price",
        severity,
        message: `${label} has more decimal places than the currency allows.`,
        rowNumber,
        field,
      };
    case "too_large":
      return {
        code: "amount_too_large",
        severity,
        message: `${label} is too large to calculate safely.`,
        rowNumber,
        field,
      };
    default:
      return {
        code: field === "quantity" ? "invalid_quantity" : "invalid_unit_price",
        severity,
        message: `${label} is not a valid number${detail}.`,
        rowNumber,
        field,
      };
  }
}
