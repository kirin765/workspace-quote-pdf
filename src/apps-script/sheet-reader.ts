import type { SheetCell, SheetRow } from "../core";
import { fingerprintRows } from "./serialize";
import { getActiveSpreadsheet } from "./stores";

/** Bound on a single selection so one execution cannot exceed Apps Script limits. */
export const MAX_SELECTION_ROWS = 2000;
export const MAX_SELECTION_COLUMNS = 100;

export interface SelectionRead {
  spreadsheetId: string;
  spreadsheetName: string;
  sheetName: string;
  rangeA1: string;
  rows: SheetRow[];
  truncated: boolean;
}

export function readActiveSelection(): SelectionRead {
  const spreadsheet = getActiveSpreadsheet();
  const sheet = spreadsheet.getActiveSheet();
  const range = sheet.getActiveRange();
  if (!range) {
    throw new Error("Select the range that contains your header row and quote lines, then try again.");
  }
  return readRange(sheet, range);
}

export function selectionFingerprint(read: SelectionRead): string {
  return fingerprintRows(read.rows);
}

function readRange(
  sheet: GoogleAppsScript.Spreadsheet.Sheet,
  range: GoogleAppsScript.Spreadsheet.Range,
): SelectionRead {
  const spreadsheet = getActiveSpreadsheet();
  const numRows = range.getNumRows();
  const numColumns = range.getNumColumns();
  const truncated = numRows > MAX_SELECTION_ROWS || numColumns > MAX_SELECTION_COLUMNS;
  const rowsToRead = Math.min(numRows, MAX_SELECTION_ROWS);
  const columnsToRead = Math.min(numColumns, MAX_SELECTION_COLUMNS);

  const bounded = range.getCell(1, 1).offset(0, 0, rowsToRead, columnsToRead);
  const values = bounded.getValues();
  const display = bounded.getDisplayValues();
  const formulas = bounded.getFormulas();
  const startRow = bounded.getRow();

  const rows: SheetRow[] = values.map((valueRow, rowIndex) => {
    const cells: SheetCell[] = valueRow.map((value, columnIndex) => ({
      value,
      display: display[rowIndex]?.[columnIndex] ?? "",
      formula: formulas[rowIndex]?.[columnIndex] ?? "",
    }));
    return { rowNumber: startRow + rowIndex, cells };
  });

  return {
    spreadsheetId: spreadsheet.getId(),
    spreadsheetName: spreadsheet.getName(),
    sheetName: sheet.getName(),
    rangeA1: bounded.getA1Notation(),
    rows,
    truncated,
  };
}

export function listSheetNames(): string[] {
  return getActiveSpreadsheet()
    .getSheets()
    .map((sheet) => sheet.getName());
}
