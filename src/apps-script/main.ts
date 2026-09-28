/**
 * Apps Script entry points (triggers, menu and HtmlService).
 * The build shim exposes these as globals named `onOpen`, `onInstall`, etc.
 */

export function onOpen(): void {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu("Quote PDFs")
    .addItem("Open sidebar", "showSidebar")
    .addSeparator()
    .addItem("About", "showAbout")
    .addToUi();
}

export function onInstall(): void {
  onOpen();
}

export function showSidebar(): void {
  SpreadsheetApp.getUi().showSidebar(buildSidebar());
}

export function buildSidebar(): GoogleAppsScript.HTML.HtmlOutput {
  return HtmlService.createTemplateFromFile("Index")
    .evaluate()
    .setTitle("Workspace Quote PDF")
    .setWidth(400)
    .setHeight(660);
}

/**
 * Editor add-on homepage trigger. Opens the sidebar when the container allows
 * it and otherwise returns a short instruction card.
 */
export function onHomepage(): GoogleAppsScript.HTML.HtmlOutput {
  try {
    SpreadsheetApp.getUi().showSidebar(buildSidebar());
  } catch {
    // Some containers do not allow showSidebar from the homepage trigger.
  }
  return HtmlService.createHtmlOutput(
    "<p>Open <b>Quote PDFs → Open sidebar</b> to map columns and generate quotation PDFs.</p>",
  ).setTitle("Workspace Quote PDF");
}

/** Server-side include used by the sidebar template (`<?!= include('Styles') ?>`). */
export function include(filename: string): string {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

export function showAbout(): void {
  const ui = SpreadsheetApp.getUi();
  ui.alert(
    "Workspace Quote PDF",
    "Group rows by Quote ID in the selected range and create one branded quotation PDF per quote. The source sheet is never modified.",
    ui.ButtonSet.OK,
  );
}
