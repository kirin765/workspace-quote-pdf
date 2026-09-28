import {
  RESULTS_TAB_HEADERS,
  collisionSafeTabName,
  type ResultRow,
  type ResultSinkPort,
} from "../core";
import { getActiveSpreadsheet, loadResultsTabName, saveResultsTabName } from "./stores";

/** Writes result links to a dedicated tab without ever touching the source tab. */
export class ResultsTabSink implements ResultSinkPort {
  write(rows: ResultRow[]): void {
    if (rows.length === 0) return;
    const spreadsheet = getActiveSpreadsheet();
    const sheet = ensureResultsTab(spreadsheet);
    upsertRows(sheet, rows);
  }
}

export function ensureResultsTab(
  spreadsheet: GoogleAppsScript.Spreadsheet.Spreadsheet,
): GoogleAppsScript.Spreadsheet.Sheet {
  const spreadsheetId = spreadsheet.getId();
  // Reuse the tab this add-on previously created (tracked by name). A tab with a
  // matching name that we did not create is never reused, so user tabs are safe.
  const trackedName = loadResultsTabName(spreadsheetId);
  if (trackedName) {
    const tracked = spreadsheet.getSheetByName(trackedName);
    if (tracked) return tracked;
  }

  const existingTitles = spreadsheet.getSheets().map((sheet) => sheet.getName());
  const name = collisionSafeTabName(existingTitles);
  const sheet = spreadsheet.insertSheet(name);
  sheet
    .getRange(1, 1, 1, RESULTS_TAB_HEADERS.length)
    .setValues([[...RESULTS_TAB_HEADERS]])
    .setFontWeight("bold");
  sheet.setFrozenRows(1);
  saveResultsTabName(spreadsheetId, name);
  return sheet;
}

function upsertRows(
  sheet: GoogleAppsScript.Spreadsheet.Sheet,
  rows: readonly ResultRow[],
): void {
  const lastRow = sheet.getLastRow();
  const indexById = new Map<string, number>();
  if (lastRow >= 2) {
    const ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
    ids.forEach((entry, index) => {
      const value = entry[0];
      if (typeof value === "string" && value !== "") indexById.set(value, index + 2);
    });
  }

  for (const row of rows) {
    const values = [
      [
        row.quoteId,
        row.customer,
        row.itemCount,
        row.generatedAt,
        row.status,
        row.fileUrl ?? "",
        row.message ?? "",
      ],
    ];
    const existingRow = indexById.get(row.quoteId);
    if (existingRow) {
      sheet.getRange(existingRow, 1, 1, RESULTS_TAB_HEADERS.length).setValues(values);
    } else {
      const target = sheet.getLastRow() + 1;
      sheet.getRange(target, 1, 1, RESULTS_TAB_HEADERS.length).setValues(values);
      indexById.set(row.quoteId, target);
    }
  }
}
