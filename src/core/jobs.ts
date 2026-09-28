import { hashObject } from "./hash";
import type { QuoteSnapshot } from "./snapshot";
import type { QuoteOutcome } from "./entitlements";

/**
 * Generation job bookkeeping.
 *
 * A job records one outcome per quote keyed by quote ID. A later run reuses a
 * result only when the quote's `contentHash` and `templateVersion` still match,
 * so a routine retry returns the existing PDF while a changed quote becomes a
 * clearly identified new version. Results are checkpointed before the next
 * batch so an interrupted run can resume.
 */

export type JobStatus = "running" | "partial" | "completed" | "failed";

export interface QuoteJobResult {
  quoteId: string;
  status: QuoteOutcome;
  contentHash: string;
  templateVersion: string;
  fileId: string | null;
  fileUrl: string | null;
  name: string | null;
  message: string | null;
  at: string;
}

export interface GenerationJob {
  id: string;
  spreadsheetId: string;
  sheetName: string;
  rangeA1: string | null;
  status: JobStatus;
  startedAt: string;
  updatedAt: string;
  /** Last processed batch index, for resumable chunking. */
  cursor: number;
  results: QuoteJobResult[];
  requestedQuoteIds: string[];
}

export function jobId(spreadsheetId: string, sheetName: string, rangeA1: string | null): string {
  return hashObject({ spreadsheetId, sheetName, rangeA1 });
}

export function createJob(args: {
  spreadsheetId: string;
  sheetName: string;
  rangeA1: string | null;
  requestedQuoteIds: readonly string[];
  now: string;
}): GenerationJob {
  return {
    id: jobId(args.spreadsheetId, args.sheetName, args.rangeA1),
    spreadsheetId: args.spreadsheetId,
    sheetName: args.sheetName,
    rangeA1: args.rangeA1,
    status: "running",
    startedAt: args.now,
    updatedAt: args.now,
    cursor: 0,
    results: [],
    requestedQuoteIds: [...args.requestedQuoteIds],
  };
}

export function findResult(job: GenerationJob | null, quoteId: string): QuoteJobResult | null {
  if (!job) return null;
  return job.results.find((result) => result.quoteId === quoteId) ?? null;
}

export function isResultReusable(result: QuoteJobResult | null, snapshot: QuoteSnapshot): boolean {
  if (!result) return false;
  if (result.status !== "created" && result.status !== "existing") return false;
  return (
    result.contentHash === snapshot.contentHash &&
    result.templateVersion === snapshot.templateVersion &&
    result.fileId !== null
  );
}

export interface GenerationPlan {
  generate: QuoteSnapshot[];
  reuse: QuoteJobResult[];
}

/** Splits snapshots into work to do and results that can be reused as-is. */
export function planGeneration(
  job: GenerationJob | null,
  snapshots: readonly QuoteSnapshot[],
): GenerationPlan {
  const generate: QuoteSnapshot[] = [];
  const reuse: QuoteJobResult[] = [];
  for (const snapshot of snapshots) {
    const existing = findResult(job, snapshot.quoteId);
    if (isResultReusable(existing, snapshot)) {
      reuse.push(existing!);
    } else {
      generate.push(snapshot);
    }
  }
  return { generate, reuse };
}

export function recordResult(job: GenerationJob, result: QuoteJobResult): GenerationJob {
  const others = job.results.filter((entry) => entry.quoteId !== result.quoteId);
  return {
    ...job,
    updatedAt: result.at,
    results: [...others, result],
  };
}

export function progressOf(
  job: GenerationJob | null,
  requestedQuoteIds: readonly string[],
): { done: number; total: number; created: number; existing: number; failed: number } {
  const total = requestedQuoteIds.length;
  let created = 0;
  let existing = 0;
  let failed = 0;
  let done = 0;
  if (job) {
    for (const quoteId of requestedQuoteIds) {
      const result = findResult(job, quoteId);
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
  }
  return { done, total, created, existing, failed };
}

export function nextStatus(job: GenerationJob, requestedQuoteIds: readonly string[]): JobStatus {
  const progress = progressOf(job, requestedQuoteIds);
  if (progress.done < progress.total) return "running";
  if (progress.failed === 0) return "completed";
  if (progress.failed === progress.total) return "failed";
  return "partial";
}

export function advanceCursor(job: GenerationJob, batchSize: number): GenerationJob {
  return { ...job, cursor: job.cursor + Math.max(0, batchSize) };
}

export function remainingSnapshots(job: GenerationJob, snapshots: readonly QuoteSnapshot[]): QuoteSnapshot[] {
  const start = Math.min(Math.max(0, job.cursor), snapshots.length);
  return snapshots.slice(start);
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

export function coerceJob(raw: unknown): GenerationJob | null {
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  const id = str(record.id);
  const spreadsheetId = str(record.spreadsheetId);
  const sheetName = str(record.sheetName);
  if (!id || !spreadsheetId || !sheetName) return null;
  const status: JobStatus =
    record.status === "partial" || record.status === "completed" || record.status === "failed"
      ? record.status
      : "running";
  const results: QuoteJobResult[] = Array.isArray(record.results)
    ? record.results
        .map(coerceResult)
        .filter((entry): entry is QuoteJobResult => entry !== null)
    : [];
  const requestedQuoteIds = Array.isArray(record.requestedQuoteIds)
    ? record.requestedQuoteIds.filter((entry): entry is string => typeof entry === "string")
    : [];
  return {
    id,
    spreadsheetId,
    sheetName,
    rangeA1: str(record.rangeA1),
    status,
    startedAt: str(record.startedAt) ?? "",
    updatedAt: str(record.updatedAt) ?? "",
    cursor: typeof record.cursor === "number" && record.cursor >= 0 ? Math.trunc(record.cursor) : 0,
    results,
    requestedQuoteIds,
  };
}

function coerceResult(raw: unknown): QuoteJobResult | null {
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  const quoteId = str(record.quoteId);
  if (!quoteId) return null;
  const status: QuoteOutcome =
    record.status === "created" ||
    record.status === "existing" ||
    record.status === "failed" ||
    record.status === "skipped"
      ? record.status
      : "failed";
  return {
    quoteId,
    status,
    contentHash: str(record.contentHash) ?? "",
    templateVersion: str(record.templateVersion) ?? "",
    fileId: str(record.fileId),
    fileUrl: str(record.fileUrl),
    name: str(record.name),
    message: str(record.message),
    at: str(record.at) ?? "",
  };
}

export function parseStoredJob(json: string | null | undefined): GenerationJob | null {
  if (!json) return null;
  try {
    return coerceJob(JSON.parse(json));
  } catch {
    return null;
  }
}

export function serializeJob(job: GenerationJob): string {
  return JSON.stringify(job);
}
