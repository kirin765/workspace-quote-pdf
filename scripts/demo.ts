import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildRenderModel,
  buildSnapshots,
  groupRows,
  mapSheetToRows,
  validateGroups,
  type QuoteRenderModel,
} from "../src/core";
import {
  DEFAULT_MAPPING_OPTIONS,
  SYNTHETIC_ROWS,
  syntheticMapping,
  syntheticSettings,
} from "../tests/fixtures/synthetic";

/**
 * Local verification harness for Phase A.
 *
 * Runs the exact plan example (three rows -> Q-001 and Q-002) through the pure
 * pipeline and writes a printable preview. This proves grouping, validation,
 * totals and the shared render model on Node. It does not prove live Google
 * Docs PDF rendering; that requires deploying the add-on.
 */

const context = {
  issueDate: "2026-09-25",
  source: { sheetName: "Sheet1", headerRow: 1, rangeA1: "A1:F4" },
};

const mapped = mapSheetToRows(SYNTHETIC_ROWS, syntheticMapping(), DEFAULT_MAPPING_OPTIONS);
const validated = validateGroups(groupRows(mapped.rows).groups);
const snapshots = buildSnapshots(validated, syntheticSettings(), context);
const models = snapshots.map((snapshot) => buildRenderModel(snapshot));

const expected: Record<string, { items: number; total: string }> = {
  "Q-001": { items: 2, total: "USD 1,800.00" },
  "Q-002": { items: 1, total: "USD 750.00" },
};

let failures = 0;
for (const model of models) {
  const expectation = expected[model.quoteRef];
  const total = model.totals[model.totals.length - 1]?.value ?? "";
  const rowTotal = model.items.length;
  const matches = expectation && expectation.items === rowTotal && expectation.total === total;
  if (!matches) failures += 1;
  console.log(
    `${model.quoteRef}: ${rowTotal} item line(s), total ${total} ${matches ? "OK" : "MISMATCH"}`,
  );
}
if (models.length !== 2) {
  failures += 1;
  console.log(`Expected 2 quote documents, got ${models.length}`);
}

const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Phase A preview</title>
<style>
body{font-family:Arial,sans-serif;background:#eef1f4;margin:0;padding:24px}
.sheet{background:#fff;max-width:820px;margin:0 auto 24px;padding:32px;box-shadow:0 1px 3px rgba(0,0,0,.15)}
h1{font-size:20px;letter-spacing:.2em;border-bottom:2px solid #222;padding-bottom:8px}
table{width:100%;border-collapse:collapse;font-size:12px;margin-top:16px}
th,td{border:1px solid #ccc;padding:4px 6px;text-align:left}
th{background:#f2f2f2}.right{text-align:right}
.total{font-weight:bold}.muted{color:#666;font-size:11px}
</style></head><body>
${models.map(renderModelHtml).join("\n")}
</body></html>`;

const outPath = join(dirname(fileURLToPath(import.meta.url)), "..", "demo-preview.html");
writeFileSync(outPath, html);
console.log(`Wrote ${outPath}`);
console.log(failures === 0 ? "PHASE A LOGIC: PASS" : `PHASE A LOGIC: ${failures} FAILURE(S)`);
process.exitCode = failures === 0 ? 0 : 1;

function renderModelHtml(model: QuoteRenderModel): string {
  const rows = model.items
    .map(
      (item) =>
        `<tr><td>${item.index}</td><td>${escapeHtml(item.name)}</td><td class="right">${item.quantity}</td><td class="right">${item.unitPrice}</td><td class="right">${item.amount}</td></tr>`,
    )
    .join("");
  const totals = model.totals
    .map(
      (total) =>
        `<tr><td colspan="4" class="right total">${escapeHtml(total.label)}</td><td class="right total">${escapeHtml(total.value)}</td></tr>`,
    )
    .join("");
  return `<section class="sheet">
  <h1>${escapeHtml(model.documentTitle)} — ${escapeHtml(model.quoteRef)}</h1>
  <div class="muted">${escapeHtml(model.business.displayName)} · ${model.meta.map((field) => `${escapeHtml(field.label)}: ${escapeHtml(field.value)}`).join(" · ")}</div>
  <table>
    <thead><tr><th>${escapeHtml(model.columns.index)}</th><th>${escapeHtml(model.columns.item)}</th><th class="right">${escapeHtml(model.columns.quantity)}</th><th class="right">${escapeHtml(model.columns.unitPrice)}</th><th class="right">${escapeHtml(model.columns.amount)}</th></tr></thead>
    <tbody>${rows}${totals}</tbody>
  </table>
  ${model.terms ? `<p>${escapeHtml(model.terms)}</p>` : ""}
  <p class="muted">${escapeHtml(model.footerNote)}</p>
</section>`;
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
