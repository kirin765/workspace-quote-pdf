import {
  applyResults,
  allowanceIssue,
  decideAllowance,
  type AllowanceDecision,
  type EntitlementState,
} from "./entitlements";
import {
  createJob,
  nextStatus,
  planGeneration,
  recordResult,
  type GenerationJob,
  type QuoteJobResult,
} from "./jobs";
import { buildRenderModel } from "./render-model";
import { buildResultRows } from "./results";
import type { GenerationPorts, RenderedFile } from "./ports";
import type { QuoteSnapshot } from "./snapshot";
import type { UsageEvent, UsageReason } from "./usage";

/** Quotes processed in one execution before the sidebar asks for the next batch. */
export const DEFAULT_BATCH_SIZE = 5;

export interface GenerationRequest {
  spreadsheetId: string;
  sheetName: string;
  rangeA1: string | null;
  snapshots: readonly QuoteSnapshot[];
  outputFolderId: string | null;
}

export interface GenerationOutcome {
  job: GenerationJob;
  /** Results produced or refreshed during this call. */
  results: QuoteJobResult[];
  allowance: AllowanceDecision;
  entitlement: EntitlementState;
  generatedThisBatch: number;
  remainingToGenerate: number;
}

function describeError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/\s+/g, " ").slice(0, 200);
}

function reasonForError(error: unknown): UsageReason {
  const code = error && typeof error === "object" && "code" in error ? String((error as { code: unknown }).code) : "";
  if (code === "output_folder_unavailable") return "output_folder_unavailable";
  return "render_failed";
}

/**
 * Runs one bounded batch of a generation job.
 *
 * Reused results are reported as `existing`; newly rendered files as `created`;
 * failures as `failed` without aborting the rest of the batch. Blocked quotes
 * (allowance exhausted) are recorded as `skipped` so the UI can explain them.
 * The job is checkpointed after every quote, so a later call resumes rather
 * than restarts.
 */
export function runGenerationBatch(
  request: GenerationRequest,
  ports: GenerationPorts,
  batchSize: number = DEFAULT_BATCH_SIZE,
): GenerationOutcome {
  const now = ports.clock.nowIso();
  const today = ports.clock.todayIso();

  let entitlement = ports.entitlements.load();

  let job = ports.jobs.load();
  if (!job || job.spreadsheetId !== request.spreadsheetId || job.sheetName !== request.sheetName) {
    job = createJob({
      spreadsheetId: request.spreadsheetId,
      sheetName: request.sheetName,
      rangeA1: request.rangeA1,
      requestedQuoteIds: request.snapshots.map((snapshot) => snapshot.quoteId),
      now,
    });
  } else {
    job = {
      ...job,
      rangeA1: request.rangeA1,
      requestedQuoteIds: request.snapshots.map((snapshot) => snapshot.quoteId),
      updatedAt: now,
    };
  }

  const record = (event: Omit<UsageEvent, "at" | "plan">) =>
    ports.usage.record({ ...event, at: now, plan: entitlement.plan });

  record({ name: "generation_started", count: request.snapshots.length, reason: null });

  // Split reusable results from work that actually needs generation BEFORE
  // charging the allowance, so reused files never consume the free budget.
  const plan = planGeneration(job, request.snapshots);
  const allowance = decideAllowance(entitlement, plan.generate.length, today);
  const toGenerate = plan.generate.slice(0, allowance.allowedCount);
  const blocked = plan.generate.slice(allowance.allowedCount);

  const results: QuoteJobResult[] = [];
  const snapshotByQuoteId = new Map<string, QuoteSnapshot>();
  for (const snapshot of request.snapshots) snapshotByQuoteId.set(snapshot.quoteId, snapshot);

  for (const existing of plan.reuse) {
    const result: QuoteJobResult = { ...existing, status: "existing", at: now };
    job = recordResult(job, result);
    results.push(result);
    record({ name: "quote_existing", count: 1, reason: null });
  }

  const chunk = toGenerate.slice(0, Math.max(1, Math.trunc(batchSize)));
  let generatedThisBatch = 0;

  for (const snapshot of chunk) {
    const model = buildRenderModel(snapshot);
    let result: QuoteJobResult;
    try {
      const file: RenderedFile = ports.render.render(snapshot, model, request.outputFolderId);
      result = {
        quoteId: snapshot.quoteId,
        status: "created",
        contentHash: snapshot.contentHash,
        templateVersion: snapshot.templateVersion,
        fileId: file.fileId,
        fileUrl: file.fileUrl,
        name: file.name,
        message: null,
        at: now,
      };
      generatedThisBatch += 1;
      record({ name: "quote_created", count: 1, reason: null });
    } catch (error) {
      result = {
        quoteId: snapshot.quoteId,
        status: "failed",
        contentHash: snapshot.contentHash,
        templateVersion: snapshot.templateVersion,
        fileId: null,
        fileUrl: null,
        name: null,
        message: describeError(error),
        at: now,
      };
      record({ name: "quote_failed", count: 1, reason: reasonForError(error) });
    }
    job = recordResult(job, result);
    results.push(result);
  }

  if (blocked.length > 0) {
    // A partial free allowance reports reason "ok" but still blocks the tail;
    // record those quotes as skipped so they are never silently dropped.
    const blockedReason: UsageReason =
      allowance.reason === "ok" ? "free_allowance_exhausted" : allowance.reason;
    const message =
      allowanceIssue(allowance.reason, blocked.length)?.message ??
      `Free allowance reached. ${blocked.length} quote(s) were not generated.`;
    for (const snapshot of blocked) {
      const result: QuoteJobResult = {
        quoteId: snapshot.quoteId,
        status: "skipped",
        contentHash: snapshot.contentHash,
        templateVersion: snapshot.templateVersion,
        fileId: null,
        fileUrl: null,
        name: null,
        message,
        at: now,
      };
      job = recordResult(job, result);
      results.push(result);
    }
    record({ name: "allowance_blocked", count: blocked.length, reason: blockedReason });
  }

  entitlement = applyResults(entitlement, results);
  job = { ...job, status: nextStatus(job, job.requestedQuoteIds), updatedAt: now };
  ports.entitlements.save(entitlement);
  ports.jobs.save(job);

  const remainingToGenerate = Math.max(0, toGenerate.length - chunk.length);
  if (remainingToGenerate === 0) {
    record({ name: "generation_completed", count: results.length, reason: null });
  }

  if (ports.results) {
    const rows = buildResultRows(
      results
        .map((result) => {
          const snapshot = snapshotByQuoteId.get(result.quoteId);
          return snapshot ? { snapshot, result } : null;
        })
        .filter((entry): entry is { snapshot: QuoteSnapshot; result: QuoteJobResult } => entry !== null),
    );
    if (rows.length > 0) ports.results.write(rows);
  }

  return {
    job,
    results,
    allowance,
    entitlement,
    generatedThisBatch,
    remainingToGenerate,
  };
}
