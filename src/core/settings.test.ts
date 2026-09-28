import { describe, expect, it } from "vitest";
import {
  MAX_TERMS_LENGTH,
  coerceSettings,
  defaultSettings,
  parseStoredSettings,
  serializeSettings,
  validateSettings,
} from "./settings";

function mappedSettings() {
  const settings = defaultSettings();
  settings.mapping = {
    quoteId: 0,
    customer: 1,
    item: 2,
    quantity: 3,
    unitPrice: 4,
    currency: 5,
    itemCode: null,
    description: null,
  };
  settings.business.displayName = "Alpha Trading Co.";
  return settings;
}

describe("settings", () => {
  it("defaults are valid-shaped but unmapped", () => {
    const defaults = defaultSettings();
    expect(defaults.mapping.quoteId).toBeNull();
    expect(defaults.business.pageSize).toBe("A4");
    expect(defaults.business.numberFormat).toBe("dot-decimal");
    expect(validateSettings(defaults).some((entry) => entry.code === "missing_column_mapping")).toBe(true);
  });

  it("coerces untrusted JSON without throwing", () => {
    expect(coerceSettings(null).mapping.quoteId).toBeNull();
    const coerced = coerceSettings({
      mapping: { quoteId: 0, customer: -1, item: "x", quantity: 3.5, unitPrice: 4, currency: 5 },
      business: {
        displayName: "  ",
        addressLines: ["a", 5, "b"],
        pageSize: "A9",
        numberFormat: "weird",
        defaultValidityDays: 12.9,
      },
      outputFolderId: "  folder-1  ",
    });
    expect(coerced.mapping.quoteId).toBe(0);
    expect(coerced.mapping.customer).toBeNull();
    expect(coerced.mapping.item).toBeNull();
    expect(coerced.mapping.quantity).toBeNull();
    expect(coerced.business.addressLines).toEqual(["a", "b"]);
    expect(coerced.business.pageSize).toBe("A4");
    expect(coerced.business.numberFormat).toBe("dot-decimal");
    expect(coerced.business.defaultValidityDays).toBe(12);
    expect(coerced.outputFolderId).toBe("folder-1");
  });

  it("treats corrupt stored JSON as defaults", () => {
    expect(parseStoredSettings("{not json").mapping.quoteId).toBeNull();
    expect(parseStoredSettings(null).business.pageSize).toBe("A4");
  });

  it("round-trips through serialization", () => {
    const settings = mappedSettings();
    settings.business.terms = "50% deposit";
    expect(parseStoredSettings(serializeSettings(settings))).toEqual(settings);
  });

  it("accepts a fully mapped, named configuration", () => {
    expect(validateSettings(mappedSettings())).toEqual([]);
  });

  it("flags duplicate column mappings", () => {
    const settings = mappedSettings();
    settings.mapping.currency = 1;
    const issues = validateSettings(settings);
    expect(issues.some((entry) => entry.code === "duplicate_column_mapping")).toBe(true);
  });

  it("rejects an empty business name and out-of-range validity", () => {
    const settings = mappedSettings();
    settings.business.displayName = "   ";
    settings.business.defaultValidityDays = -1;
    const codes = validateSettings(settings).map((entry) => entry.code);
    expect(codes).toContain("missing_business_name");
    expect(codes).toContain("invalid_validity_days");
  });

  it("rejects terms beyond the length limit", () => {
    const settings = mappedSettings();
    settings.business.terms = "x".repeat(MAX_TERMS_LENGTH + 1);
    expect(validateSettings(settings).some((entry) => entry.code === "invalid_terms_length")).toBe(true);
  });
});
