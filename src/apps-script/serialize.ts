import {
  formatMoney,
  hashObject,
  type AllowanceDecision,
  type GenerationJob,
  type Issue,
  type JobStatus,
  type QuoteGroupValidation,
  type QuoteRenderModel,
  type SheetRow,
} from "../core";

/** JSON-safe shapes returned to the sidebar. BigInt never crosses the RPC boundary. */

export interface QuoteSummaryDto {
  quoteId: string;
  customer: string;
  currency: string;
  itemCount: number;
  subtotal: string;
  status: "ready" | "blocked";
  firstRowNumber: number;
  errors: Issue[];
  warnings: Issue[];
}

export function groupToSummaryDto(group: QuoteGroupValidation): QuoteSummaryDto {
  return {
    quoteId: group.quoteId,
    customer: group.customer,
    currency: group.currency,
    itemCount: group.itemCount,
    subtotal: formatMoney(group.subtotalMinor, group.currencyScale, group.currency),
    status: group.status,
    firstRowNumber: group.firstRowNumber,
    errors: group.issues.filter((entry) => entry.severity === "error"),
    warnings: group.warnings,
  };
}

export interface SelectionDto {
  spreadsheetId: string;
  spreadsheetName: string;
  sheetName: string;
  rangeA1: string;
  header: string[];
  rowCount: number;
  truncated: boolean;
}

/** Detects source changes between preview and generation. */
export function fingerprintRows(rows: readonly SheetRow[]): string {
  return hashObject(
    rows.map((row) => ({
      rowNumber: row.rowNumber,
      cells: row.cells.map((cell) => [cell.value, cell.display, cell.formula]),
    })),
  );
}

export interface ResultRowDto {
  quoteId: string;
  status: string;
  fileUrl: string | null;
  name: string | null;
  message: string | null;
}

export interface GenerationProgressDto {
  jobId: string;
  status: JobStatus;
  total: number;
  done: number;
  created: number;
  existing: number;
  failed: number;
  remainingToGenerate: number;
  allowance: AllowanceDecision;
  results: ResultRowDto[];
  messages: string[];
}

export function progressFromJob(
  job: GenerationJob,
  requestedQuoteIds: readonly string[],
  remainingToGenerate: number,
  allowance: AllowanceDecision,
  latest: readonly { quoteId: string; status: string; fileUrl: string | null; name: string | null; message: string | null }[],
): GenerationProgressDto {
  let done = 0;
  let created = 0;
  let existing = 0;
  let failed = 0;
  for (const quoteId of requestedQuoteIds) {
    const result = job.results.find((entry) => entry.quoteId === quoteId);
    if (!result) continue;
    if (result.status === "created") {
      created += 1;
      done += 1;
    } else if (result.status === "existing") {
      existing += 1;
      done += 1;
    } else if (result.status === "failed") {
      failed += 1;
      done += 1;
    } else if (result.status === "skipped") {
      done += 1;
    }
  }
  const messages = latest
    .filter((result) => result.message)
    .map((result) => `${result.quoteId}: ${result.message}`);
  return {
    jobId: job.id,
    status: job.status,
    total: requestedQuoteIds.length,
    done,
    created,
    existing,
    failed,
    remainingToGenerate,
    allowance,
    results: latest.map((result) => ({
      quoteId: result.quoteId,
      status: result.status,
      fileUrl: result.fileUrl,
      name: result.name,
      message: result.message,
    })),
    messages,
  };
}

export interface PreviewDto {
  selection: SelectionDto;
  fingerprint: string;
  summaries: QuoteSummaryDto[];
  /** Index-aligned with `summaries`; null for blocked quotes. */
  renderModels: (QuoteRenderModel | null)[];
  sourceIssues: Issue[];
  ready: number;
  blocked: number;
  warnings: number;
}
