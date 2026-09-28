import { describe, expect, it } from "vitest";
import {
  formatMinor,
  formatMoney,
  multiplyByInteger,
  parseAmountText,
  sumMinor,
} from "./money";

const DOT = { scale: 2, numberFormat: "dot-decimal" as const };
const COMMA = { scale: 2, numberFormat: "comma-decimal" as const };

describe("parseAmountText", () => {
  it("parses plain decimals into minor units", () => {
    expect(parseAmountText("100.00", DOT)).toMatchObject({ kind: "ok", minor: 10000 });
    expect(parseAmountText("100", DOT)).toMatchObject({ kind: "ok", minor: 10000 });
    expect(parseAmountText("0.1", DOT)).toMatchObject({ kind: "ok", minor: 10 });
  });

  it("accepts well-formed thousands grouping", () => {
    expect(parseAmountText("1,234.56", DOT)).toMatchObject({ kind: "ok", minor: 123456 });
    expect(parseAmountText("1,234", DOT)).toMatchObject({ kind: "ok", minor: 123400 });
  });

  it("honours comma-decimal locales", () => {
    expect(parseAmountText("1.234,56", COMMA)).toMatchObject({ kind: "ok", minor: 123456 });
    expect(parseAmountText("1,5", COMMA)).toMatchObject({ kind: "ok", minor: 150 });
  });

  it("reports separator ambiguity instead of guessing", () => {
    expect(parseAmountText("1,5", DOT).kind).toBe("ambiguous");
    expect(parseAmountText("1.234", DOT).kind).toBe("too_precise");
  });

  it("rejects or rounds excess precision explicitly", () => {
    expect(parseAmountText("1.235", DOT).kind).toBe("too_precise");
    expect(parseAmountText("1.235", { ...DOT, rounding: "round" })).toMatchObject({
      kind: "ok",
      minor: 124,
    });
    expect(parseAmountText("1.239", { ...DOT, rounding: "truncate" })).toMatchObject({
      kind: "ok",
      minor: 123,
    });
  });

  it("flags formula errors, gaps and bad formats without coercing to zero", () => {
    expect(parseAmountText("#DIV/0!", DOT).kind).toBe("formula_error");
    expect(parseAmountText("", DOT).kind).toBe("missing");
    expect(parseAmountText("   ", DOT).kind).toBe("missing");
    expect(parseAmountText("$5.00", DOT).kind).toBe("invalid_format");
    expect(parseAmountText("1e3", DOT).kind).toBe("invalid_format");
    expect(parseAmountText("1.2.3", DOT).kind).toBe("invalid_format");
    expect(parseAmountText("12,34", DOT).kind).toBe("ambiguous");
    expect(parseAmountText("abc", DOT).kind).toBe("invalid_format");
  });

  it("keeps the sign and rejects unsafe magnitudes", () => {
    expect(parseAmountText("-5.00", DOT)).toMatchObject({ kind: "ok", minor: -500 });
    expect(parseAmountText("99999999999999999999", DOT).kind).toBe("too_large");
  });

  it("never loses value to floating point", () => {
    const tenth = parseAmountText("0.1", DOT);
    expect(tenth.minor).toBe(10);
    expect(multiplyByInteger(tenth.minor!, 3)).toBe(30);
    expect(formatMinor(multiplyByInteger(tenth.minor!, 3), 2)).toBe("0.30");
  });
});

describe("formatting", () => {
  it("formats minor units with grouping and locale separator", () => {
    expect(formatMinor(123456, 2, "dot-decimal")).toBe("1,234.56");
    expect(formatMinor(123456, 2, "comma-decimal")).toBe("1.234,56");
    expect(formatMinor(123456, 0, "dot-decimal")).toBe("123,456");
    expect(formatMinor(-500, 2, "dot-decimal")).toBe("-5.00");
    expect(formatMoney(180000, 2, "usd")).toBe("USD 1,800.00");
  });

  it("sums without drift", () => {
    expect(sumMinor([10, 20, 30])).toBe(60);
    expect(sumMinor([])).toBe(0);
  });
});
