import {
  quotationFileName,
  type PageSize,
  type QuoteRenderModel,
  type QuoteSnapshot,
  type RenderPort,
  type RenderedFile,
} from "../core";
import { exportDocAsPdf, savePdfToFolder, trashFileQuietly } from "./drive-output";

/**
 * PDF renderer: a fixed-layout Google Doc exported to PDF through `DriveApp`.
 *
 * Chosen so the add-on needs only the `drive.file` scope (no advanced Drive
 * API, no external request). Layout rules are encoded in `core/render-model` so
 * the preview and the PDF share one source of truth. Header rows are repeated
 * manually per page chunk because Google Docs tables do not repeat table
 * headers automatically. Repeating headers, page breaks, fonts and
 * non-Latin text must be confirmed against a live document in Phase A.
 */

const PAGE_SIZE_PT: Record<PageSize, { width: number; height: number }> = {
  A4: { width: 595.28, height: 841.89 },
  LETTER: { width: 612, height: 792 },
};

const MARGIN_PT = 36;
const ITEMS_PER_PAGE = 18;
const HEADER_BACKGROUND = "#EFEFEF";

export class GoogleDocsRenderer implements RenderPort {
  constructor(private readonly folderId: string) {}

  render(snapshot: QuoteSnapshot, model: QuoteRenderModel): RenderedFile {
    const fileName = quotationFileName(snapshot.quoteId);
    // Create the temp Doc through the Drive API so the app owns it under the
    // `drive.file` scope; a DocumentApp-created file is not covered by that
    // grant and cannot be exported through the Drive API.
    const created = Drive.Files.create({
      name: `${snapshot.quoteId} quotation (temp)`,
      mimeType: MimeType.GOOGLE_DOCS,
    });
    const docId = created.id;
    if (!docId) throw new Error("Could not create the temporary document.");
    try {
      const doc = DocumentApp.openById(docId);
      writeDocument(doc, model);
      doc.saveAndClose();
      const pdf = exportDocAsPdf(docId, fileName);
      return savePdfToFolder(pdf, this.folderId);
    } finally {
      trashFileQuietly(docId);
    }
  }
}

function writeDocument(doc: GoogleAppsScript.Document.Document, model: QuoteRenderModel): void {
  const body = doc.getBody();
  const size = PAGE_SIZE_PT[model.pageSize];
  body.setPageWidth(size.width);
  body.setPageHeight(size.height);
  body.setMarginTop(MARGIN_PT);
  body.setMarginBottom(MARGIN_PT);
  body.setMarginLeft(MARGIN_PT);
  body.setMarginRight(MARGIN_PT);

  const title = body.appendParagraph(model.documentTitle);
  title.setHeading(DocumentApp.ParagraphHeading.TITLE);
  title.setAlignment(DocumentApp.HorizontalAlignment.CENTER);

  const businessName = body.appendParagraph(model.business.displayName);
  businessName.setHeading(DocumentApp.ParagraphHeading.HEADING2);
  if (model.business.detailLines.length > 0) {
    body.appendParagraph(model.business.detailLines.join("\n"));
  }

  body.appendParagraph(model.meta.map((field) => `${field.label}: ${field.value}`).join("\n"));

  const itemChunks = chunk(model.items, ITEMS_PER_PAGE);
  itemChunks.forEach((items, pageIndex) => {
    if (pageIndex > 0) body.appendPageBreak();
    appendItemsTable(body, model, items);
  });

  body.appendParagraph("");
  model.totals.forEach((total, index) => {
    const paragraph = body.appendParagraph(`${total.label}    ${total.value}`);
    paragraph.setAlignment(DocumentApp.HorizontalAlignment.RIGHT);
    if (index === model.totals.length - 1) paragraph.editAsText().setBold(true);
  });

  if (model.terms.trim() !== "") {
    if (model.pageBreakBeforeTerms) body.appendPageBreak();
    const termsHeading = body.appendParagraph("Terms");
    termsHeading.setHeading(DocumentApp.ParagraphHeading.HEADING3);
    body.appendParagraph(model.terms);
  }

  const footer = doc.addFooter();
  const footerParagraph = footer.appendParagraph(model.footerNote);
  footerParagraph.editAsText().setItalic(true).setFontSize(8);
}

function appendItemsTable(
  body: GoogleAppsScript.Document.Body,
  model: QuoteRenderModel,
  items: QuoteRenderModel["items"],
): void {
  const table = body.appendTable();
  const headerRow = table.appendTableRow();
  const headers = [
    model.columns.index,
    model.columns.item,
    model.columns.quantity,
    model.columns.unitPrice,
    model.columns.amount,
  ];
  headers.forEach((label) => {
    const cell = headerRow.appendTableCell(label);
    cell.setBackgroundColor(HEADER_BACKGROUND);
    const paragraph = cell.getChild(0).asParagraph();
    paragraph.editAsText().setBold(true);
  });

  for (const item of items) {
    const row = table.appendTableRow();
    row.appendTableCell(String(item.index));
    const itemCell = row.appendTableCell(item.name);
    const extra = [item.itemCode, item.description]
      .map((line) => line.trim())
      .filter((line) => line !== "")
      .join("\n");
    if (extra !== "") itemCell.appendParagraph(extra).editAsText().setFontSize(8);
    row.appendTableCell(item.quantity);
    row.appendTableCell(item.unitPrice);
    row.appendTableCell(item.amount);
    for (const columnIndex of [2, 3, 4]) {
      row
        .getCell(columnIndex)
        .getChild(0)
        .asParagraph()
        .setAlignment(DocumentApp.HorizontalAlignment.RIGHT);
    }
  }
}

export function chunk<T>(items: readonly T[], size: number): T[][] {
  if (size <= 0) return [items.slice()];
  const out: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    out.push(items.slice(index, index + size));
  }
  return out.length > 0 ? out : [[]];
}
